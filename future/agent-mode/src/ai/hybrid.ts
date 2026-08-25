/**
 * Hybrid AI Mode - Bridge Server with On-Device Fallback
 * 
 * Provides seamless switching between:
 * 1. PraisonAI Bridge Server (cloud/local LLM)
 * 2. Chrome Built-in AI (Gemini Nano on-device)
 */

import { BridgeClient, getBridgeClient, type ActionMessage } from '../bridge/client';
import { getBuiltInAI, type BuiltInAISession } from './builtin';
import type { CDPClient } from '../cdp/client';

export interface HybridConfig {
    bridgeServerUrl: string;
    preferBridge: boolean;
    fallbackToBuiltIn: boolean;
    maxSteps: number;
    onThought?: (thought: string) => void;
    onAction?: (action: ActionMessage) => void;
    onStatus?: (status: string) => void;
    onError?: (error: string) => void;
}

export type AIMode = 'bridge' | 'builtin' | 'disconnected';

export class HybridAI {
    private bridgeClient: BridgeClient;
    private builtInSession: BuiltInAISession | null = null;
    private config: HybridConfig;
    private currentMode: AIMode = 'disconnected';
    private cdpClient: CDPClient | null = null;

    constructor(config: Partial<HybridConfig> = {}) {
        this.config = {
            bridgeServerUrl: config.bridgeServerUrl || 'ws://localhost:8765/ws',
            preferBridge: config.preferBridge ?? true,
            fallbackToBuiltIn: config.fallbackToBuiltIn ?? true,
            maxSteps: config.maxSteps || 20,
            onThought: config.onThought,
            onAction: config.onAction,
            onStatus: config.onStatus,
            onError: config.onError,
        };

        this.bridgeClient = getBridgeClient({
            serverUrl: this.config.bridgeServerUrl,
        });

        // Wire up callbacks
        this.bridgeClient.onThought = (thought) => {
            this.config.onThought?.(thought);
        };

        this.bridgeClient.onAction = (action) => {
            this.config.onAction?.(action);
        };

        this.bridgeClient.onError = (error) => {
            this.config.onError?.(error);
            // On bridge error, try fallback
            if (this.config.fallbackToBuiltIn && this.currentMode === 'bridge') {
                this.switchToBuiltIn();
            }
        };

        this.bridgeClient.onStateChange = (state) => {
            if (state === 'connected') {
                this.currentMode = 'bridge';
                this.config.onStatus?.('Connected to PraisonAI server');
            } else if (state === 'disconnected' || state === 'error') {
                if (this.config.fallbackToBuiltIn) {
                    this.switchToBuiltIn();
                } else {
                    this.currentMode = 'disconnected';
                    this.config.onStatus?.('Disconnected');
                }
            }
        };
    }

    /**
     * Initialize the hybrid AI system
     */
    async initialize(): Promise<AIMode> {
        // Try bridge first if preferred
        if (this.config.preferBridge) {
            const connected = await this.bridgeClient.connect();
            if (connected) {
                this.currentMode = 'bridge';
                return 'bridge';
            }
        }

        // Fallback to built-in AI
        if (this.config.fallbackToBuiltIn) {
            return this.switchToBuiltIn();
        }

        this.currentMode = 'disconnected';
        return 'disconnected';
    }

    /**
     * Start a new automation session
     */
    async startSession(goal: string, model?: string): Promise<boolean> {
        if (this.currentMode === 'bridge') {
            return this.bridgeClient.startSession(goal, model);
        } else if (this.currentMode === 'builtin') {
            // Built-in AI doesn't need explicit session start
            this.config.onStatus?.('Session started with on-device AI');
            return true;
        }

        return false;
    }

    /**
     * Stop the current session
     */
    async stopSession(): Promise<void> {
        if (this.currentMode === 'bridge') {
            await this.bridgeClient.stopSession();
        }

        if (this.builtInSession) {
            this.builtInSession.destroy();
            this.builtInSession = null;
        }
    }

    /**
     * Process an observation and get the next action
     */
    async processObservation(observation: {
        task: string;
        url: string;
        title: string;
        screenshot?: string;
        elements: Array<{ selector: string; tag: string; text: string }>;
    }): Promise<ActionMessage | null> {
        if (this.currentMode === 'bridge') {
            // Send to bridge server
            await this.bridgeClient.sendObservation({
                task: observation.task,
                url: observation.url,
                title: observation.title,
                screenshot: observation.screenshot || '',
                elements: observation.elements,
                console_logs: [],
                step_number: this.bridgeClient.currentStep,
            });

            // Action will come back via callback
            return null;
        } else if (this.currentMode === 'builtin') {
            // Use built-in AI
            return this.processWithBuiltIn(observation);
        }

        this.config.onError?.('No AI mode available');
        return null;
    }

    /**
     * Execute an action using the CDP client
     */
    async executeAction(action: ActionMessage): Promise<boolean> {
        if (this.currentMode === 'bridge') {
            return this.bridgeClient.executeAction(action);
        } else if (this.cdpClient) {
            // Direct execution for built-in mode
            try {
                switch (action.action) {
                    case 'click':
                        if (action.selector) await this.cdpClient.click(action.selector);
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
                        await new Promise(r => setTimeout(r, 1000));
                        break;
                    case 'done':
                        return true;
                }
                return true;
            } catch (error) {
                this.config.onError?.(`Action failed: ${error}`);
                return false;
            }
        }
        return false;
    }

    /**
     * Set the CDP client
     */
    setCDPClient(client: CDPClient): void {
        this.cdpClient = client;
        this.bridgeClient.setCDPClient(client);
    }

    /**
     * Get current AI mode
     */
    get mode(): AIMode {
        return this.currentMode;
    }

    /**
     * Check if connected to any AI
     */
    get isAvailable(): boolean {
        return this.currentMode !== 'disconnected';
    }

    // Private methods

    private async switchToBuiltIn(): Promise<AIMode> {
        try {
            const builtInAI = await getBuiltInAI();
            if (builtInAI) {
                this.builtInSession = builtInAI;
                this.currentMode = 'builtin';
                this.config.onStatus?.('Using on-device AI (Gemini Nano)');
                return 'builtin';
            }
        } catch (error) {
            console.error('[HybridAI] Built-in AI not available:', error);
        }

        this.currentMode = 'disconnected';
        this.config.onStatus?.('No AI available');
        return 'disconnected';
    }

    private async processWithBuiltIn(observation: {
        task: string;
        url: string;
        title: string;
        elements: Array<{ selector: string; tag: string; text: string }>;
    }): Promise<ActionMessage | null> {
        if (!this.builtInSession) {
            return null;
        }

        // Build prompt for built-in AI
        const prompt = this.buildBuiltInPrompt(observation);

        try {
            const response = await this.builtInSession.prompt(prompt);
            return this.parseBuiltInResponse(response);
        } catch (error) {
            this.config.onError?.(`Built-in AI error: ${error}`);
            return null;
        }
    }

    private buildBuiltInPrompt(observation: {
        task: string;
        url: string;
        title: string;
        elements: Array<{ selector: string; tag: string; text: string }>;
    }): string {
        const elementsText = observation.elements
            .slice(0, 15)
            .map((e, i) => `${i + 1}. [${e.tag}] ${e.selector} - "${e.text.slice(0, 50)}"`)
            .join('\n');

        return `You are a browser automation assistant. Help complete this task.

Task: ${observation.task}
URL: ${observation.url}
Title: ${observation.title}

Available elements:
${elementsText}

What action should I take? Reply with JSON:
{"action": "click|type|scroll|navigate|done", "selector": "...", "text": "...", "thought": "..."}`;
    }

    private parseBuiltInResponse(response: string): ActionMessage | null {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[^}]+\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    type: 'action',
                    action: parsed.action || 'wait',
                    selector: parsed.selector,
                    text: parsed.text,
                    thought: parsed.thought || '',
                    done: parsed.action === 'done',
                };
            }
        } catch {
            console.error('[HybridAI] Failed to parse response');
        }

        return {
            type: 'action',
            action: 'wait',
            thought: 'Could not parse response',
            done: false,
        };
    }
}

// Singleton
let hybridAI: HybridAI | null = null;

export function getHybridAI(config?: Partial<HybridConfig>): HybridAI {
    if (!hybridAI) {
        hybridAI = new HybridAI(config);
    }
    return hybridAI;
}
