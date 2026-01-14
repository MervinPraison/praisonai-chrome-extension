/**
 * Browser Agent - Project Mariner-style AI agent
 * 
 * Takes screenshots, analyzes DOM, decides actions, and executes them.
 * Uses accessibility tree for reliable element targeting.
 */

import { CDPClient, type ElementInfo, type PageState } from '../cdp/client';
import { builtInAI } from './builtin';

export interface AgentAction {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'wait' | 'screenshot' | 'extract';
    selector?: string;
    value?: string;
    x?: number;
    y?: number;
    reason: string;
}

export interface AgentStep {
    action: AgentAction;
    result: {
        success: boolean;
        error?: string;
        screenshot?: string;
    };
    timestamp: number;
}

export interface AgentTask {
    goal: string;
    steps: AgentStep[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
}

export interface AgentObservation {
    pageState: PageState;
    screenshot: string;
    clickableElements: ElementInfo[];
    formElements: ElementInfo[];
}

/**
 * Prompts for the agent to analyze page and decide actions
 */
const SYSTEM_PROMPT = `You are a browser automation agent. Your goal is to help users accomplish tasks on web pages.

When analyzing a page:
1. Look at the screenshot to understand the visual layout
2. Identify interactive elements (buttons, links, inputs, forms)
3. Determine the next action to take toward the goal
4. Explain your reasoning

When deciding actions, you can:
- click: Click on an element (provide selector or coordinates)
- type: Type text into a focused input (provide the text)
- scroll: Scroll the page (provide direction: up/down)
- navigate: Go to a URL
- wait: Wait for page to load
- extract: Extract information from the page

Always respond with a JSON object:
{
  "analysis": "Brief analysis of current page state",
  "nextAction": {
    "type": "click|type|scroll|navigate|wait|extract",
    "selector": "CSS selector if clicking",
    "value": "text to type or URL to navigate",
    "reason": "Why this action helps achieve the goal"
  },
  "isComplete": false,
  "result": "If isComplete is true, the final result"
}`;

/**
 * Browser Agent class
 */
export class BrowserAgent {
    private cdp: CDPClient;
    private currentTask: AgentTask | null = null;
    private maxSteps: number = 50;
    private stepDelay: number = 1000;

    constructor(cdp: CDPClient) {
        this.cdp = cdp;
    }

    /**
     * Observe the current page state
     */
    async observe(): Promise<AgentObservation | null> {
        const pageState = await this.cdp.getPageState();
        if (!pageState.success || !pageState.data) {
            return null;
        }

        const screenshot = await this.cdp.captureScreenshot('png');
        if (!screenshot.success || !screenshot.data) {
            return null;
        }

        const clickable = await this.cdp.getClickableElements();

        return {
            pageState: pageState.data,
            screenshot: screenshot.data.data,
            clickableElements: clickable.data || [],
            formElements: [],
        };
    }

    /**
     * Decide next action using AI
     */
    async decideAction(
        goal: string,
        observation: AgentObservation,
        previousSteps: AgentStep[]
    ): Promise<AgentAction | null> {
        const prompt = this.buildPrompt(goal, observation, previousSteps);

        const result = await builtInAI.prompt(prompt, {
            temperature: 0.3,
            topK: 20,
            systemPrompt: SYSTEM_PROMPT,
        });

        if (!result.success || !result.data) {
            console.error('AI decision failed:', result.error);
            return null;
        }

        try {
            const response = JSON.parse(result.data);
            return response.nextAction as AgentAction;
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return null;
        }
    }

    /**
     * Build prompt for AI decision
     */
    private buildPrompt(
        goal: string,
        observation: AgentObservation,
        previousSteps: AgentStep[]
    ): string {
        const elements = observation.clickableElements
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.tagName}[${e.selector}]: "${e.text.slice(0, 50)}"`)
            .join('\n');

        const history = previousSteps
            .slice(-5)
            .map(
                (s) =>
                    `- ${s.action.type}: ${s.action.reason} → ${s.result.success ? 'success' : 'failed'}`
            )
            .join('\n');

        return `
GOAL: ${goal}

CURRENT PAGE:
- URL: ${observation.pageState.url}
- Title: ${observation.pageState.title}

CLICKABLE ELEMENTS:
${elements || 'None found'}

PREVIOUS ACTIONS:
${history || 'None yet'}

What should be the next action to achieve the goal?`;
    }

    /**
     * Execute an action
     */
    async executeAction(action: AgentAction): Promise<{ success: boolean; error?: string }> {
        switch (action.type) {
            case 'click':
                if (action.selector) {
                    return this.cdp.clickElement(action.selector);
                } else if (action.x !== undefined && action.y !== undefined) {
                    return this.cdp.click(action.x, action.y);
                }
                return { success: false, error: 'Click requires selector or coordinates' };

            case 'type':
                if (action.value) {
                    return this.cdp.type(action.value);
                }
                return { success: false, error: 'Type requires value' };

            case 'scroll':
                const deltaY = action.value === 'up' ? -300 : 300;
                return this.cdp.scroll(0, deltaY);

            case 'navigate':
                if (action.value) {
                    return this.cdp.navigate(action.value);
                }
                return { success: false, error: 'Navigate requires URL' };

            case 'wait':
                await new Promise((resolve) => setTimeout(resolve, 2000));
                return { success: true };

            case 'screenshot':
                const screenshot = await this.cdp.captureScreenshot();
                return { success: screenshot.success, error: screenshot.error };

            case 'extract':
                // Extract is handled in observe
                return { success: true };

            default:
                return { success: false, error: `Unknown action type: ${action.type}` };
        }
    }

    /**
     * Run the agent to complete a task
     */
    async run(goal: string, onStep?: (step: AgentStep) => void): Promise<AgentTask> {
        this.currentTask = {
            goal,
            steps: [],
            status: 'running',
            startTime: Date.now(),
        };

        try {
            for (let i = 0; i < this.maxSteps; i++) {
                // Observe current state
                const observation = await this.observe();
                if (!observation) {
                    throw new Error('Failed to observe page');
                }

                // Decide next action
                const action = await this.decideAction(goal, observation, this.currentTask.steps);
                if (!action) {
                    throw new Error('Failed to decide action');
                }

                // Execute action
                const result = await this.executeAction(action);

                // Record step
                const step: AgentStep = {
                    action,
                    result,
                    timestamp: Date.now(),
                };
                this.currentTask.steps.push(step);

                // Notify callback
                if (onStep) {
                    onStep(step);
                }

                // Check for completion
                if (action.type === 'extract' && result.success) {
                    this.currentTask.status = 'completed';
                    break;
                }

                // Wait between steps
                await new Promise((resolve) => setTimeout(resolve, this.stepDelay));
            }

            if (this.currentTask.status !== 'completed') {
                this.currentTask.status = this.currentTask.steps.length >= this.maxSteps ? 'failed' : 'completed';
            }
        } catch (error) {
            this.currentTask.status = 'failed';
            console.error('Agent failed:', error);
        }

        this.currentTask.endTime = Date.now();
        return this.currentTask;
    }

    /**
     * Stop the current task
     */
    stop(): void {
        if (this.currentTask) {
            this.currentTask.status = 'failed';
            this.currentTask.endTime = Date.now();
        }
    }

    /**
     * Get current task
     */
    getTask(): AgentTask | null {
        return this.currentTask;
    }
}
