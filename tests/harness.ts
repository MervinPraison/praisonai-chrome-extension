/**
 * Shared test harness for the background service worker.
 *
 * The background module registers all of its listeners at import time and keeps
 * its state (clients, consoleLogs, attaching) in module-level Maps. To get a
 * clean worker per test we reset the module registry, install a fresh chrome
 * mock, re-import, and capture the listeners it registers.
 *
 * Nothing in src/ is modified: every action is driven through the real
 * chrome.runtime.onMessage listener, so the tests exercise the shipped routing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the chrome global and DOM handles are deliberately loose in tests. */

import { vi } from 'vitest';

export interface ActionResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

type Listener = (...args: unknown[]) => unknown;

/** Minimal in-memory chrome.storage.* area with a settable failure mode. */
export class FakeStorageArea {
    store = new Map<string, unknown>();
    /** When set, every set() rejects with this error (quota simulation). */
    failSetWith: Error | null = null;
    setCalls: Array<Record<string, unknown>> = [];

    get = vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
        if (keys === undefined || keys === null) {
            return Object.fromEntries(this.store);
        }
        const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out: Record<string, unknown> = {};
        for (const name of names) {
            if (this.store.has(name)) out[name] = this.store.get(name);
        }
        return out;
    });

    set = vi.fn(async (items: Record<string, unknown>) => {
        this.setCalls.push(items);
        if (this.failSetWith) throw this.failSetWith;
        for (const [k, v] of Object.entries(items)) this.store.set(k, v);
    });

    remove = vi.fn(async (keys: string | string[]) => {
        for (const k of typeof keys === 'string' ? [keys] : keys) this.store.delete(k);
    });

    clear = vi.fn(async () => {
        this.store.clear();
    });
}

export interface CdpBehaviour {
    /** Per-method override. Return a value to resolve with, or throw to reject. */
    methods: Record<string, (params: Record<string, unknown> | undefined) => unknown>;
}

export interface Harness {
    chrome: Record<string, any>;
    session: FakeStorageArea;
    local: FakeStorageArea;
    /** Drive the real chrome.runtime.onMessage listener. */
    send(message: Record<string, unknown>): Promise<ActionResult>;
    /** Fire a chrome.debugger.onEvent as Chrome would. */
    emitCdpEvent(tabId: number, method: string, params: unknown): void;
    emitDetach(tabId: number, reason?: string): void;
    emitTabRemoved(tabId: number): void;
    fireInstalled(): void;
    fireContextMenu(info: Record<string, unknown>, tab?: Record<string, unknown>): void;
    fireCommand(command: string, tab?: Record<string, unknown>): Promise<void>;
    /** Record of every CDP command that reached chrome.debugger.sendCommand. */
    cdpCalls: Array<{ tabId: number | undefined; method: string; params: Record<string, unknown> | undefined }>;
    /** Override the response for one CDP method. */
    onCdp(method: string, fn: (params: Record<string, unknown> | undefined) => unknown): void;
    listeners: Record<string, Listener[]>;
}

/**
 * Default CDP responses that make the happy path of every shipped action work.
 * Individual tests narrow these with harness.onCdp().
 */
function defaultCdpResponse(
    method: string,
    params: Record<string, unknown> | undefined
): unknown {
    if (method === 'Page.navigate') return { frameId: 'frame-1' };
    if (method === 'Page.captureScreenshot') return { data: 'iVBORw0KGgoAAAANSUhEUg==' };
    if (method === 'Runtime.evaluate') {
        const expression = String((params as { expression?: string } | undefined)?.expression ?? '');
        if (expression.includes('document.readyState')) {
            return { result: { value: 'complete' } };
        }
        if (expression.includes('getBoundingClientRect')) {
            return { result: { value: { x: 50, y: 60, width: 120, height: 30, found: true } } };
        }
        // typeInElement's post-type verification
        if (expression.includes('indexOf(')) {
            return { result: { value: { ok: true, kind: 'input' } } };
        }
        if (expression.includes('JSON.stringify')) {
            return { result: { value: '{"title":"Example","url":"https://example.com/"}' } };
        }
        return { result: { value: 'ok' } };
    }
    return {};
}

export async function createHarness(options: { tabUrl?: string } = {}): Promise<Harness> {
    vi.resetModules();

    const listeners: Record<string, Listener[]> = {};
    const on = (name: string) => ({
        addListener: vi.fn((fn: Listener) => {
            (listeners[name] ??= []).push(fn);
        }),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
    });

    const session = new FakeStorageArea();
    const local = new FakeStorageArea();
    const cdpCalls: Harness['cdpCalls'] = [];
    const overrides: Record<string, (params: Record<string, unknown> | undefined) => unknown> = {};

    const attachedTabs = new Set<number>();

    const chromeMock: Record<string, any> = {
        runtime: {
            onMessage: on('runtime.onMessage'),
            onInstalled: on('runtime.onInstalled'),
            // The side panel holds a port open so the worker can detach every
            // session when the panel closes.
            onConnect: on('runtime.onConnect'),
            connect: vi.fn((info?: { name?: string }) => ({
                name: info?.name ?? '',
                disconnect: vi.fn(),
                onDisconnect: on('port.onDisconnect'),
                onMessage: on('port.onMessage'),
                postMessage: vi.fn(),
            })),
            lastError: undefined,
            id: 'test-extension-id',
        },
        debugger: {
            attach: vi.fn(async (target: { tabId: number }) => {
                attachedTabs.add(target.tabId);
            }),
            detach: vi.fn(async (target: { tabId: number }) => {
                attachedTabs.delete(target.tabId);
            }),
            sendCommand: vi.fn(
                async (
                    target: { tabId?: number },
                    method: string,
                    params?: Record<string, unknown>
                ) => {
                    cdpCalls.push({ tabId: target.tabId, method, params });
                    const fn = overrides[method];
                    if (fn) return fn(params);
                    return defaultCdpResponse(method, params);
                }
            ),
            onEvent: on('debugger.onEvent'),
            onDetach: on('debugger.onDetach'),
            getTargets: vi.fn(async () => []),
        },
        tabs: {
            get: vi.fn(async (tabId: number) => ({
                id: tabId,
                windowId: 1,
                url: options.tabUrl ?? 'https://example.com/',
                title: 'Example',
            })),
            query: vi.fn(async () => []),
            onRemoved: on('tabs.onRemoved'),
            onActivated: on('tabs.onActivated'),
            onUpdated: on('tabs.onUpdated'),
        },
        storage: { session, local },
        contextMenus: {
            removeAll: vi.fn((cb?: () => void) => cb?.()),
            create: vi.fn(),
            onClicked: on('contextMenus.onClicked'),
        },
        commands: {
            onCommand: on('commands.onCommand'),
        },
        sidePanel: {
            setPanelBehavior: vi.fn(async () => undefined),
            open: vi.fn(async () => undefined),
        },
        notifications: {
            create: vi.fn(),
        },
        windows: {
            getCurrent: vi.fn(async () => ({ id: 1 })),
        },
    };

    // @ts-expect-error - installing the chrome global for the module under test
    globalThis.chrome = chromeMock;

    await import('../src/background/index');

    const fire = (name: string, ...args: unknown[]) => {
        for (const fn of listeners[name] ?? []) fn(...args);
    };

    return {
        chrome: chromeMock,
        session,
        local,
        cdpCalls,
        listeners,
        onCdp(method, fn) {
            overrides[method] = fn;
        },
        send(message) {
            return new Promise<ActionResult>((resolve, reject) => {
                const fns = listeners['runtime.onMessage'];
                if (!fns?.length) {
                    reject(new Error('background registered no onMessage listener'));
                    return;
                }
                const kept = fns[0](message, { id: 'test' }, resolve as Listener);
                if (kept !== true) {
                    reject(
                        new Error(
                            'onMessage listener must return true to keep the response channel open'
                        )
                    );
                }
            });
        },
        emitCdpEvent(tabId, method, params) {
            fire('debugger.onEvent', { tabId }, method, params);
        },
        emitDetach(tabId, reason = 'target_closed') {
            fire('debugger.onDetach', { tabId }, reason);
        },
        emitTabRemoved(tabId) {
            fire('tabs.onRemoved', tabId, { windowId: 1, isWindowClosing: false });
        },
        fireInstalled() {
            fire('runtime.onInstalled', { reason: 'install' });
        },
        fireContextMenu(info, tab) {
            fire('contextMenus.onClicked', info, tab);
        },
        async fireCommand(command, tab) {
            const results = (listeners['commands.onCommand'] ?? []).map((fn) => fn(command, tab));
            await Promise.all(results);
        },
    };
}

/** Wait for the 500ms session-storage flush timer in the background worker. */
export function waitForFlush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 600));
}
