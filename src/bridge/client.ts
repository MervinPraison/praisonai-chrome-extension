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
    action: 'click' | 'type' | 'scroll' | 'navigate' | 'wait' | 'screenshot' | 'done';
    selector?: string;
    text?: string;
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

    public onStateChange: ((state: ConnectionState) => void) | null = null;
    public onAction: ((action: ActionMessage) => void) | null = null;
    public onError: ((error: string) => void) | null = null;
    public onThought: ((thought: string) => void) | null = null;

    constructor(config: Partial<BridgeConfig> = {}) {
        this.config = {
            serverUrl: config.serverUrl || 'ws://localhost:8765/ws',
            reconnectDelay: config.reconnectDelay || 1000,
            maxReconnectAttempts: config.maxReconnectAttempts || 5,
            heartbeatInterval: config.heartbeatInterval || 30000,
        };
    }

    /**
     * Connect to the bridge server
     */
    async connect(): Promise<boolean> {
        if (this.ws?.readyState === WebSocket.OPEN) {
            return true;
        }

        this.onStateChange?.('connecting');

        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket(this.config.serverUrl);

                this.ws.onopen = () => {
                    console.log('[Bridge] Connected to server');
                    this.reconnectAttempts = 0;
                    this.onStateChange?.('connected');
                    this.startHeartbeat();
                    this.flushMessageQueue();
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('[Bridge] WebSocket error:', error);
                    this.onError?.('Connection error');
                };

                this.ws.onclose = () => {
                    console.log('[Bridge] Connection closed');
                    this.stopHeartbeat();
                    this.onStateChange?.('disconnected');
                    this.attemptReconnect();
                };
            } catch (error) {
                console.error('[Bridge] Failed to connect:', error);
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
     * Start a new automation session
     */
    async startSession(goal: string, model?: string): Promise<boolean> {
        this.currentGoal = goal;
        this.stepNumber = 0;

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
        const result = await this.send({
            type: 'stop_session',
            session_id: this.sessionId || '',
        });

        this.sessionId = null;
        this.currentGoal = null;
        this.stepNumber = 0;

        return result;
    }

    /**
     * Send an observation to the server and wait for action
     */
    async sendObservation(observation: Omit<ObservationMessage, 'type' | 'session_id'>): Promise<boolean> {
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
    async executeAction(action: ActionMessage): Promise<boolean> {
        if (!this.cdpClient) {
            console.error('[Bridge] No CDP client set');
            return false;
        }

        try {
            switch (action.action) {
                case 'click':
                    if (action.selector) {
                        await this.cdpClient.click(action.selector);
                    }
                    break;

                case 'type':
                    if (action.selector && action.text) {
                        await this.cdpClient.type(action.selector, action.text);
                    }
                    break;

                case 'scroll':
                    await this.cdpClient.scroll(action.direction === 'down' ? 300 : -300);
                    break;

                case 'navigate':
                    if (action.url) {
                        await this.cdpClient.evaluate(`window.location.href = '${action.url}'`);
                    }
                    break;

                case 'wait':
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    break;

                case 'screenshot':
                    await this.cdpClient.captureScreenshot();
                    break;

                case 'done':
                    console.log('[Bridge] Task completed');
                    return true;

                default:
                    console.warn('[Bridge] Unknown action:', action.action);
            }

            return true;
        } catch (error) {
            console.error('[Bridge] Action execution error:', error);
            return false;
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

    /**
     * Get current step number
     */
    get currentStep(): number {
        return this.stepNumber;
    }

    // Private methods

    private send(message: BridgeMessage): Promise<boolean> {
        return new Promise((resolve) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                this.messageQueue.push(message);
                resolve(false);
                return;
            }

            try {
                this.ws.send(JSON.stringify(message));
                resolve(true);
            } catch (error) {
                console.error('[Bridge] Send error:', error);
                this.messageQueue.push(message);
                resolve(false);
            }
        });
    }

    private handleMessage(data: string): void {
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
