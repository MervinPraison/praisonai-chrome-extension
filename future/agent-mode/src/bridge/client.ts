/**
 * Bridge Server WebSocket Client
 * 
 * Connects the Chrome Extension to the PraisonAI browser server
 * for AI-powered browser automation.
 */

import type { CDPClient } from '../cdp/client';

export interface BridgeConfig {
    serverUrl: string;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    heartbeatInterval: number;
}

export interface BridgeMessage {
    type: string;
    session_id?: string;
    [key: string]: unknown;
}

export interface ActionMessage extends BridgeMessage {
    type: 'action';
    action: string;  // Allow any action type from LLM
    selector?: string;
    text?: string;
    value?: string;  // Alias for text (LLM sometimes returns value instead of text)
    key?: string;    // For pressKey action
    url?: string;
    direction?: 'up' | 'down';
    thought?: string;
    done?: boolean;
    error?: string;
}

export interface ObservationMessage extends BridgeMessage {
    type: 'observation';
    task: string;
    url: string;
    title: string;
    screenshot: string;
    elements: Array<{
        selector: string;
        tag: string;
        text: string;
        role?: string;
    }>;
    console_logs: string[];
    error?: string;
    step_number: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class BridgeClient {
    private ws: WebSocket | null = null;
    private config: BridgeConfig;
    private reconnectAttempts = 0;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private messageQueue: BridgeMessage[] = [];
    private sessionId: string | null = null;
    private currentGoal: string | null = null;
    private stepNumber = 0;
    private cdpClient: CDPClient | null = null;
    private stopped = false;  // Flag to interrupt actions

    public onStateChange: ((state: ConnectionState) => void) | null = null;
    public onAction: ((action: ActionMessage) => void) | null = null;
    public onError: ((error: string) => void) | null = null;
    public onThought: ((thought: string) => void) | null = null;
    public onComplete: ((summary: string) => void) | null = null;  // Task completion callback
    public onStartAutomation: ((goal: string, sessionId: string, hadPreviousSession?: boolean) => void) | null = null;  // Server-triggered start

    constructor(config: Partial<BridgeConfig> = {}) {
        this.config = {
            serverUrl: config.serverUrl || 'ws://localhost:8765/ws',
            reconnectDelay: config.reconnectDelay || 1000,
            maxReconnectAttempts: config.maxReconnectAttempts || 5,
            // Chrome 116+ keeps service workers alive while WebSocket is active
            // Sending messages every 20s resets the idle timer (30s timeout)
            heartbeatInterval: config.heartbeatInterval || 20000,
        };
    }

    /**
     * Connect to the bridge server
     */
    async connect(): Promise<boolean> {
        console.log('[Bridge] connect() called, current state:', this.ws?.readyState);

        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('[Bridge] Already connected');
            return true;
        }

        this.onStateChange?.('connecting');
        console.log('[Bridge] Attempting to connect to:', this.config.serverUrl);

        return new Promise((resolve) => {
            try {
                console.log('[Bridge] Creating WebSocket...');
                this.ws = new WebSocket(this.config.serverUrl);
                console.log('[Bridge] WebSocket created, waiting for events...');

                this.ws.onopen = () => {
                    console.log('[Bridge] ✓ Connected to server');
                    this.reconnectAttempts = 0;
                    this.onStateChange?.('connected');
                    this.startHeartbeat();
                    this.flushMessageQueue();
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    console.log('[Bridge] Message received:', event.data.substring(0, 100));
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('[Bridge] ✗ WebSocket error:', error);
                    this.onError?.('Connection error');
                };

                this.ws.onclose = (event) => {
                    console.log('[Bridge] Connection closed, code:', event.code, 'reason:', event.reason);
                    this.stopHeartbeat();
                    this.onStateChange?.('disconnected');
                    this.attemptReconnect();
                };
            } catch (error) {
                console.error('[Bridge] ✗ Failed to connect:', error);
                this.onStateChange?.('error');
                resolve(false);
            }
        });
    }

    /**
     * Disconnect from the server
     */
    disconnect(): void {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.sessionId = null;
        this.currentGoal = null;
        this.stepNumber = 0;
        this.onStateChange?.('disconnected');
    }

    /**
     * Check if a session is currently active (not stopped)
     */
    isSessionActive(): boolean {
        return this.sessionId !== null && !this.stopped;
    }

    /**
     * Get current step number
     */
    get currentStep(): number {
        return this.stepNumber;
    }

    /**
     * Reset state for a new session after cleanup
     * This must be called after stopSession if a new session is starting
     * @param sessionId The ID of the new session to restore (since stopSession clears it)
     * @param goal The goal of the new session to restore
     */
    resetForNewSession(sessionId: string, goal: string): void {
        this.sessionId = sessionId;
        this.currentGoal = goal;
        this.stopped = false;
        this.stepNumber = 0;
        console.log(`[Bridge] Reset for new session ${sessionId.substring(0, 8)} - sessionId and stopped restored`);
    }

    /**
     * Start a new automation session
     */
    async startSession(goal: string, model?: string): Promise<boolean> {
        this.currentGoal = goal;
        this.stepNumber = 0;
        this.stopped = false;  // Reset stopped flag for new session

        return this.send({
            type: 'start_session',
            goal,
            model: model || 'gpt-4o-mini',
        });
    }

    /**
     * Stop the current session
     */
    async stopSession(): Promise<boolean> {
        // Set stopped flag first to interrupt any ongoing actions
        this.stopped = true;

        // Clean up mouse pointer from page
        if (this.cdpClient) {
            try {
                await this.cdpClient.evaluate(`
                    const pointer = document.getElementById('praisonai-pointer');
                    if (pointer) pointer.remove();
                    const styles = document.getElementById('praisonai-styles');
                    if (styles) styles.remove();
                `);
            } catch {
                // Ignore cleanup errors
            }
        }

        const result = await this.send({
            type: 'stop_session',
            session_id: this.sessionId || '',
        });

        this.sessionId = null;
        this.currentGoal = null;
        this.stepNumber = 0;
        this.onAction = null;  // Clear action handler

        return result;
    }

    /**
     * Send an observation to the server and wait for action
     */
    async sendObservation(observation: Omit<ObservationMessage, 'type' | 'session_id'>): Promise<boolean> {
        // Guard: Don't send if session stopped
        if (this.stopped || !this.sessionId) {
            console.log('[Bridge] Skipping observation - session stopped or no session');
            return false;
        }

        this.stepNumber++;

        return this.send({
            type: 'observation',
            session_id: this.sessionId || '',
            step_number: this.stepNumber,
            ...observation,
        });
    }

    /**
     * Set the CDP client for executing actions
     */
    setCDPClient(client: CDPClient): void {
        this.cdpClient = client;
    }

    /**
     * Execute an action using the CDP client
     */
    async executeAction(action: ActionMessage): Promise<{ success: boolean; error?: string }> {
        // Check if stopped
        if (this.stopped) {
            console.log('[Bridge] Session stopped, skipping action');
            return false;
        }

        if (!this.cdpClient) {
            console.error('[Bridge] No CDP client set');
            return false;
        }

        // Normalize: use 'value' if 'text' is missing
        // Normalize: server may send 'element' or 'selector'
        const selector = action.selector || action.element || '';
        const textValue = action.text || action.value || action.key || action.query || '';

        console.log('[Bridge] Executing action:', action.action, selector || textValue || '');

        // Track success and error for this action
        let actionSuccess = true;
        let actionError: string | undefined;

        try {
            switch (action.action) {
                case 'click':
                case 'confirm': // confirm is a click action
                    if (selector) {
                        const method = action.clickMethod || 'auto';
                        console.log('[Bridge] Clicking element:', selector, 'method:', method);
                        await this.showMousePointer(selector);
                        const clickResult = await this.cdpClient.clickElement(selector, method);
                        if (!clickResult.success) {
                            console.error('[Bridge] Click failed:', clickResult.error);
                            actionSuccess = false;
                            actionError = clickResult.error || `Click failed on ${selector}`;
                        } else {
                            // Wait for potential navigation after click
                            await new Promise(r => setTimeout(r, 200));  // Optimized: was 500ms
                        }
                    }
                    break;

                case 'type':
                case 'input':  // input is alias for type
                    if (selector && textValue) {
                        console.log('[Bridge] Typing in element:', selector, 'text:', textValue);
                        await this.showMousePointer(selector);
                        const typeResult = await this.cdpClient.typeInElement(selector, textValue);
                        if (!typeResult.success) {
                            console.error('[Bridge] Type failed:', typeResult.error);
                            actionSuccess = false;
                            actionError = typeResult.error || `Type failed on ${selector}`;
                        }
                    } else if (textValue) {
                        // Type without selector - just send keystrokes
                        console.log('[Bridge] Typing text (no selector):', textValue);
                        await this.cdpClient.type(textValue);
                    }
                    break;

                case 'search':
                    // Search = type + Enter
                    if (selector && textValue) {
                        console.log('[Bridge] Searching:', textValue, 'in', selector);
                        await this.showMousePointer(selector);
                        await this.cdpClient.typeInElement(selector, textValue);
                    } else if (textValue) {
                        // Try to find a search input
                        console.log('[Bridge] Searching:', textValue);
                        const searchInputs = ['input[name="q"]', 'textarea[name="q"]', '#APjFqb', 'input[type="search"]', 'input[type="text"]'];
                        for (const inputSelector of searchInputs) {
                            const result = await this.cdpClient.typeInElement(inputSelector, textValue);
                            if (result.success) {
                                await this.showMousePointer(inputSelector);
                                break;
                            }
                        }
                    }
                    // Press Enter to submit search
                    await new Promise(r => setTimeout(r, 100));
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyDown', key: 'Enter', code: 'Enter',
                        windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
                    });
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyUp', key: 'Enter', code: 'Enter',
                    });
                    await new Promise(r => setTimeout(r, 400));  // Optimized: was 1000ms
                    break;

                case 'press':  // press Enter, Tab, etc.
                case 'pressKey':
                    const keyToPress = textValue || 'Enter';
                    console.log('[Bridge] Pressing key:', keyToPress);
                    // Dispatch proper key event, not type text
                    const keyCode = keyToPress === 'Enter' ? 13 : keyToPress === 'Tab' ? 9 : 0;
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: keyToPress,
                        code: keyToPress,
                        windowsVirtualKeyCode: keyCode,
                        nativeVirtualKeyCode: keyCode,
                    });
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: keyToPress,
                        code: keyToPress,
                    });
                    await new Promise(r => setTimeout(r, 200));  // Optimized: was 500ms
                    break;

                case 'submit':
                case 'enter':
                    // Press Enter key to submit forms
                    console.log('[Bridge] Pressing Enter to submit');
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyDown',
                        key: 'Enter',
                        code: 'Enter',
                        windowsVirtualKeyCode: 13,
                        nativeVirtualKeyCode: 13,
                    });
                    await this.cdpClient.send('Input.dispatchKeyEvent', {
                        type: 'keyUp',
                        key: 'Enter',
                        code: 'Enter',
                    });
                    // Wait for navigation/response
                    await new Promise(resolve => setTimeout(resolve, 300));  // Optimized: was 500ms
                    break;

                case 'scroll':
                    const deltaY = action.direction === 'down' ? 300 : -300;
                    console.log('[Bridge] Scrolling:', action.direction);
                    await this.cdpClient.scroll(0, deltaY);
                    break;

                case 'navigate':
                    if (action.url) {
                        console.log('[Bridge] Navigating to:', action.url);
                        await this.cdpClient.navigate(action.url);
                    }
                    break;

                case 'wait':
                case 'waitForNavigation':
                case 'waitForElement':
                    console.log('[Bridge] Waiting 500ms');
                    await new Promise(resolve => setTimeout(resolve, 500));  // Optimized: was 1000ms
                    break;

                case 'clear_input':
                    // Clear input field completely - used for fixing garbled/duplicated text
                    if (selector) {
                        console.log('[Bridge] Clearing input field:', selector);

                        // 1. Clear via JavaScript (most reliable)
                        try {
                            const escapedSelector = selector.replace(/'/g, "\\'");
                            await this.cdpClient.send('Runtime.evaluate', {
                                expression: `
                                    (function() {
                                        const el = document.querySelector('${escapedSelector}');
                                        if (el) {
                                            el.value = '';
                                            el.focus();
                                            el.dispatchEvent(new Event('input', { bubbles: true }));
                                            el.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    })()
                                `,
                            });
                            console.log('[Bridge] Input cleared via JavaScript');
                        } catch (e) {
                            console.log('[Bridge] JS clear failed, using keyboard');
                        }

                        // 2. Also click to focus and use keyboard shortcuts as backup
                        await this.cdpClient.clickElement(selector);
                        await new Promise(r => setTimeout(r, 100));

                        // Send Ctrl+A followed by Delete
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2,
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyUp', key: 'a', code: 'KeyA',
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyDown', key: 'Delete', code: 'Delete',
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyUp', key: 'Delete', code: 'Delete',
                        });

                        // Also Cmd+A (macOS)
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4,
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyUp', key: 'a', code: 'KeyA',
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyDown', key: 'Backspace', code: 'Backspace',
                        });
                        await this.cdpClient.send('Input.dispatchKeyEvent', {
                            type: 'keyUp', key: 'Backspace', code: 'Backspace',
                        });

                        console.log('[Bridge] Input field cleared');
                    }
                    break;

                case 'screenshot':
                    console.log('[Bridge] Taking screenshot');
                    await this.cdpClient.captureScreenshot();
                    break;

                case 'done':
                    console.log('[Bridge] Task completed');
                    // Generate completion summary
                    if (this.onComplete) {
                        const thought = action.thought || '';
                        const summary = `✅ Task completed!\n\nGoal: ${this.currentGoal}\nSteps: ${this.stepNumber}\n\n${thought}`;
                        this.onComplete(summary);
                    }
                    // Stop the session
                    this.stopped = true;
                    return true;

                default:
                    console.warn('[Bridge] Unknown action:', action.action, '- treating as wait');
                    await new Promise(resolve => setTimeout(resolve, 500));
            }

            return { success: actionSuccess, error: actionError };
        } catch (error) {
            console.error('[Bridge] Action execution error:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * Show visual mouse pointer at element location
     */
    private async showMousePointer(selector: string): Promise<void> {
        if (!this.cdpClient) return;

        try {
            // Inject green circle mouse pointer at element
            await this.cdpClient.evaluate(`
                (function() {
                    // Add styles if not exists
                    if (!document.getElementById('praisonai-styles')) {
                        const style = document.createElement('style');
                        style.id = 'praisonai-styles';
                        style.textContent = \`
                            @keyframes praisonai-pulse {
                                0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                                50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
                                100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                            }
                            @keyframes praisonai-ripple {
                                0% { width: 20px; height: 20px; opacity: 1; }
                                100% { width: 60px; height: 60px; opacity: 0; }
                            }
                        \`;
                        document.head.appendChild(style);
                    }
                    
                    // Create or get pointer element - green circle with dot
                    let pointer = document.getElementById('praisonai-pointer');
                    if (!pointer) {
                        pointer = document.createElement('div');
                        pointer.id = 'praisonai-pointer';
                        pointer.style.cssText = \`
                            position: fixed;
                            width: 24px;
                            height: 24px;
                            border: 3px solid #4CAF50;
                            border-radius: 50%;
                            z-index: 999999;
                            pointer-events: none;
                            transition: left 0.2s ease, top 0.2s ease;
                            transform: translate(-50%, -50%);
                            box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
                        \`;
                        // Add inner dot
                        const dot = document.createElement('div');
                        dot.style.cssText = \`
                            position: absolute;
                            width: 8px;
                            height: 8px;
                            background: #4CAF50;
                            border-radius: 50%;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                        \`;
                        pointer.appendChild(dot);
                        document.body.appendChild(pointer);
                    }
                    
                    // Find element and get its position
                    const elem = document.querySelector('${selector.replace(/'/g, "\\'")}');
                    if (elem) {
                        const rect = elem.getBoundingClientRect();
                        const x = rect.left + rect.width / 2;
                        const y = rect.top + rect.height / 2;
                        
                        pointer.style.left = x + 'px';
                        pointer.style.top = y + 'px';
                        pointer.style.display = 'block';
                        pointer.style.animation = 'praisonai-pulse 0.5s ease';
                        
                        // Add expanding ripple effect on click
                        const ripple = document.createElement('div');
                        ripple.style.cssText = \`
                            position: fixed;
                            left: \${x}px;
                            top: \${y}px;
                            width: 20px;
                            height: 20px;
                            border: 2px solid #4CAF50;
                            border-radius: 50%;
                            transform: translate(-50%, -50%);
                            animation: praisonai-ripple 0.6s ease-out forwards;
                            z-index: 999998;
                            pointer-events: none;
                        \`;
                        document.body.appendChild(ripple);
                        setTimeout(() => ripple.remove(), 600);
                        
                        // Clear animation after it plays
                        setTimeout(() => {
                            if (pointer) pointer.style.animation = '';
                        }, 500);
                        // Keep pointer visible - will be cleaned up when session ends
                    }
                })();
            `);
        } catch (error) {
            console.warn('[Bridge] Failed to show mouse pointer:', error);
        }
    }

    /**
     * Check if connected
     */
    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Get current session ID
     */
    get currentSessionId(): string | null {
        return this.sessionId;
    }



    // Private methods

    private send(message: BridgeMessage): Promise<boolean> {
        return new Promise((resolve) => {
            // If we have a direct WebSocket connection, use it
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify(message));
                    resolve(true);
                } catch (error) {
                    console.error('[Bridge] Send error:', error);
                    this.messageQueue.push(message);
                    resolve(false);
                }
                return;
            }

            // *** FIX: If no direct WebSocket, forward through offscreen document ***
            // This is the case when offscreen is primary (Layer 1)
            console.log('[Bridge] No direct WebSocket, forwarding via offscreen');
            chrome.runtime.sendMessage({
                type: 'OFFSCREEN_SEND_BRIDGE',
                target: 'offscreen',
                data: JSON.stringify(message),
            }).then(() => {
                console.log('[Bridge] Message forwarded to offscreen');
                resolve(true);
            }).catch((error) => {
                console.error('[Bridge] Failed to forward to offscreen:', error);
                this.messageQueue.push(message);
                resolve(false);
            });
        });
    }


    /**
     * Handle incoming bridge message
     * Public so background can forward messages from offscreen
     */
    public handleMessage(data: string): void {
        try {
            const message = JSON.parse(data) as BridgeMessage;

            switch (message.type) {
                case 'status':
                    if (message.session_id) {
                        this.sessionId = message.session_id as string;
                    }
                    console.log('[Bridge] Status:', message.status, message.message);
                    break;

                case 'action':
                    const action = message as ActionMessage;
                    if (action.thought) {
                        this.onThought?.(action.thought);
                    }
                    this.onAction?.(action);
                    break;

                case 'error':
                    console.error('[Bridge] Server error:', message.error);
                    this.onError?.(message.error as string);
                    break;

                case 'pong':
                    // Heartbeat response
                    break;

                case 'start_automation':
                    // Server triggering automation (from CLI)
                    const startMsg = message as { type: string; goal: string; session_id: string };
                    console.log('[Bridge] Start automation from server:', startMsg.goal);

                    // *** FIX: Save previous session info before overwriting ***
                    const hadPreviousSession = this.sessionId !== null && !this.stopped;
                    const previousSessionId = this.sessionId;
                    if (hadPreviousSession) {
                        console.log(`[Bridge] Previous session ${previousSessionId?.substring(0, 8)} still active - will be cleaned up`);
                    }

                    // Set new session state
                    this.sessionId = startMsg.session_id;
                    this.currentGoal = startMsg.goal;
                    this.stepNumber = 0;
                    this.stopped = false;

                    // Trigger handler with info about whether previous session existed
                    // *** FIX: Properly await and catch errors from async handler ***
                    if (this.onStartAutomation) {
                        (async () => {
                            try {
                                await this.onStartAutomation!(startMsg.goal, startMsg.session_id, hadPreviousSession);
                            } catch (error) {
                                console.error('[Bridge] onStartAutomation handler error:', error);
                                this.onError?.(`Automation start failed: ${error}`);
                            }
                        })();
                    }
                    break;

                case 'reload_extension':
                    // Server requesting extension reload (for hot reload after build)
                    console.log('[Bridge] Reloading extension by server request...');
                    chrome.runtime.reload();
                    break;


                default:
                    console.log('[Bridge] Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('[Bridge] Failed to parse message:', error);
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            this.send({ type: 'ping' });
        }, this.config.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private flushMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
                this.send(message);
            }
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.log('[Bridge] Max reconnect attempts reached');
            this.onStateChange?.('error');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`[Bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }
}

// Singleton instance
let bridgeClient: BridgeClient | null = null;

export function getBridgeClient(config?: Partial<BridgeConfig>): BridgeClient {
    if (!bridgeClient) {
        bridgeClient = new BridgeClient(config);
    }
    return bridgeClient;
}
