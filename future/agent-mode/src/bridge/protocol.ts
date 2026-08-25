/**
 * Protocol type definitions for bridge communication
 */

export interface ActionableElement {
    selector: string;
    tag: string;
    text: string;
    role?: string;
    name?: string;
    description?: string;
    bounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    interactable?: boolean;
}

export type ActionType =
    | 'click'
    | 'type'
    | 'scroll'
    | 'navigate'
    | 'wait'
    | 'screenshot'
    | 'evaluate'
    | 'done';

export interface BrowserObservation {
    sessionId: string;
    task: string;
    url: string;
    title: string;
    screenshot: string;
    elements: ActionableElement[];
    consoleLogs: string[];
    error?: string;
    stepNumber: number;
}

export interface BrowserAction {
    action: ActionType;
    selector?: string;
    text?: string;
    url?: string;
    direction?: 'up' | 'down';
    expression?: string;
    thought: string;
    done: boolean;
    error?: string;
}

// Convert from camelCase to snake_case for wire format
export function toWireObservation(obs: BrowserObservation): Record<string, unknown> {
    return {
        session_id: obs.sessionId,
        task: obs.task,
        url: obs.url,
        title: obs.title,
        screenshot: obs.screenshot,
        elements: obs.elements.map(e => ({
            selector: e.selector,
            tag: e.tag,
            text: e.text,
            role: e.role,
            name: e.name,
            description: e.description,
            bounds: e.bounds,
            interactable: e.interactable,
        })),
        console_logs: obs.consoleLogs,
        error: obs.error,
        step_number: obs.stepNumber,
    };
}

// Convert from snake_case wire format to camelCase
export function fromWireAction(data: Record<string, unknown>): BrowserAction {
    return {
        action: data.action as ActionType,
        selector: data.selector as string | undefined,
        text: data.text as string | undefined,
        url: data.url as string | undefined,
        direction: data.direction as 'up' | 'down' | undefined,
        expression: data.expression as string | undefined,
        thought: (data.thought as string) || '',
        done: (data.done as boolean) || false,
        error: data.error as string | undefined,
    };
}
