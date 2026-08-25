/**
 * PraisonAI Browser Agent - Background Service Worker
 *
 * Every action here runs locally against the tab the user targeted, using the
 * Chrome DevTools Protocol. There is no server, no network call, and no model.
 * If a feature is not reachable from the side panel, it does not belong in this
 * file - see future/agent-mode/RESTORE.md for the code that was parked.
 */

import { CDPClient } from '../cdp/client';

/** Live CDP sessions, keyed by tab. */
const clients = new Map<number, CDPClient>();

/** Console messages captured per tab while a CDP session is attached. */
const consoleLogs = new Map<number, Array<{ level: string; text: string }>>();

const MAX_CONSOLE_LOGS = 200;
/** chrome.storage.session allows 10 MB in total, shared with console buffers. */
const MAX_STORED_SCREENSHOT = 4_000_000;
const MAX_HISTORY = 50;

// ============================================================
// CDP session management
// ============================================================

/**
 * Get an attached CDP client for a tab, attaching if necessary.
 *
 * Returns a descriptive error rather than null so the panel can always show the
 * user why an action did not run.
 */
/** In-flight attaches, so two concurrent actions cannot tear each other down. */
const attaching = new Map<number, Promise<{ client?: CDPClient; error?: string }>>();

async function ensureCDP(tabId: number): Promise<{ client?: CDPClient; error?: string }> {
    const existing = clients.get(tabId);
    if (existing?.isAttached()) {
        return { client: existing };
    }

    const inFlight = attaching.get(tabId);
    if (inFlight) {
        return inFlight;
    }

    const attempt = attachCDP(tabId).finally(() => attaching.delete(tabId));
    attaching.set(tabId, attempt);
    return attempt;
}

async function attachCDP(tabId: number): Promise<{ client?: CDPClient; error?: string }> {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
        return { error: 'That tab is no longer open.' };
    }
    if (isBlankTab(tab.url)) {
        return { error: 'Open a website in this tab first, then try again.' };
    }
    if (isRestrictedUrl(tab.url)) {
        return {
            error: 'Chrome does not allow automation on this page. Open a normal website tab and try again.',
        };
    }

    // Create the buffer first: Log.enable replays stored entries the moment
    // attach() runs, and onEvent drops anything with no buffer to write to.
    setupConsoleCapture(tabId);

    const client = new CDPClient(tabId);
    let result = await client.attach();

    // A Manifest V3 service worker is terminated after roughly 30 seconds idle,
    // which loses `clients` while Chrome keeps the debugger attached. Recover by
    // detaching the orphaned session and attaching again.
    if (!result.success && /already attached/i.test(result.error ?? '')) {
        await chrome.debugger.detach({ tabId }).catch(() => undefined);
        result = await client.attach();
    }

    if (!result.success) {
        return { error: result.error ?? 'Could not attach to this tab.' };
    }

    clients.set(tabId, client);
    await rememberAttached(tabId);
    return { client };
}

/** Chrome's own new-tab surfaces, which cannot be automated but are not errors. */
function isBlankTab(url?: string): boolean {
    return (
        !url ||
        url === 'chrome://newtab/' ||
        url === 'chrome://new-tab-page/' ||
        url === 'chrome://new-tab-page-third-party/'
    );
}

/**
 * Chrome blocks debugger attach on its own pages and the Web Store.
 *
 * `about:blank` is deliberately NOT in this list: Chrome attaches to it happily
 * and navigating away from a blank tab is the first thing most people do.
 */
function isRestrictedUrl(url?: string): boolean {
    if (!url) return true;
    if (url === 'about:blank') return false;
    return (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('devtools://') ||
        url.startsWith('https://chromewebstore.google.com') ||
        url.startsWith('https://chrome.google.com/webstore')
    );
}

/**
 * End the session on a tab and report what actually happened.
 *
 * `clients` lives in memory and is lost when the service worker is recycled,
 * while Chrome keeps the debugger attached - so this must not rely on the map
 * to decide whether there is anything to detach.
 */
async function detachCDP(tabId: number): Promise<ActionResult> {
    // Detaching through the client already releases the debuggee, so the
    // direct call below would then throw "not attached" and we would report
    // "no active session" for a session we had just successfully ended.
    const client = clients.get(tabId);
    const detachedViaClient = client ? (await client.detach()).success : false;

    clients.delete(tabId);
    consoleLogs.delete(tabId);
    await forgetAttached(tabId);
    await chrome.storage.session.remove(consoleKey(tabId)).catch(() => undefined);

    if (detachedViaClient) {
        return { success: true, data: 'Session ended. The debugging banner is gone.' };
    }

    // No live client in memory - the worker may have been recycled while Chrome
    // kept the debugger attached, so try the tab directly.
    try {
        await chrome.debugger.detach({ tabId });
        return { success: true, data: 'Session ended. The debugging banner is gone.' };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/not attached/i.test(message)) {
            return { success: true, data: 'No active session on this tab.' };
        }
        // Pages the debugger can never touch answer with their own wording
        // ("Cannot access a chrome:// URL", "The extensions gallery cannot be
        // scripted."). There is nothing attached on those either, and a raw
        // API string is not something to show the user.
        if (/cannot access|cannot be scripted|chrome:\/\//i.test(message)) {
            return { success: true, data: 'No active session on this tab.' };
        }
        return { success: false, error: message };
    }
}

/**
 * Record console messages for the Console Logs tool.
 *
 * CDPClient.attach() enables the Log and Runtime domains, so both event types
 * arrive here for as long as the session is attached.
 */
function setupConsoleCapture(tabId: number): void {
    if (!consoleLogs.has(tabId)) {
        consoleLogs.set(tabId, []);
    }
}

/** Session-storage key holding a tab's captured console output. */
function consoleKey(tabId: number): string {
    return `console:${tabId}`;
}

/**
 * Tabs this extension has attached the debugger to.
 *
 * Kept in session storage rather than memory: the service worker is recycled
 * after ~30s idle while Chrome keeps the debugger attached, and the panel-close
 * cleanup below has to know about sessions the previous worker generation
 * started - otherwise the debugging banner outlives the panel.
 */
const ATTACHED_KEY = 'attachedTabs';

/**
 * Serialise every update to the attached-tab list.
 *
 * Each update is a read-modify-write on session storage, and `attaching` only
 * serialises per tab - so two tabs attaching at once would both read the same
 * list and the second write would drop the first tab's id. That defeats the
 * whole point of persisting it: a later worker generation would not know the
 * lost tab was ever attached, and its debugging banner would survive.
 */
let attachedWrites: Promise<unknown> = Promise.resolve();

function queueAttachedWrite<T>(fn: () => Promise<T>): Promise<T> {
    const next = attachedWrites.then(fn, fn);
    attachedWrites = next.catch(() => undefined);
    return next;
}

function rememberAttached(tabId: number): Promise<void> {
    return queueAttachedWrite(async () => {
        const ids = await readAttached();
        if (!ids.includes(tabId)) {
            await chrome.storage.session
                .set({ [ATTACHED_KEY]: [...ids, tabId] })
                .catch(() => undefined);
        }
    });
}

function forgetAttached(tabId: number): Promise<void> {
    return queueAttachedWrite(async () => {
        const ids = await readAttached();
        if (ids.includes(tabId)) {
            await chrome.storage.session
                .set({ [ATTACHED_KEY]: ids.filter((id) => id !== tabId) })
                .catch(() => undefined);
        }
    });
}

async function readAttached(): Promise<number[]> {
    const stored = await chrome.storage.session.get(ATTACHED_KEY).catch(() => ({}));
    const ids = (stored as Record<string, unknown>)[ATTACHED_KEY];
    return Array.isArray(ids) ? (ids as number[]) : [];
}

/**
 * Mirror the buffer to session storage.
 *
 * The service worker is recycled after roughly 30 seconds idle, which would
 * otherwise discard everything captured so far - so the Console Logs button
 * would come back empty in the common case.
 */
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const dirtyTabs = new Set<number>();

function scheduleFlush(tabId: number): void {
    // Track every tab with pending writes: a single captured tabId would drop
    // the logs of any other tab that logged inside the same window.
    dirtyTabs.add(tabId);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = undefined;
        const payload: Record<string, unknown> = {};
        for (const id of dirtyTabs) {
            const logs = consoleLogs.get(id);
            if (logs) {
                payload[consoleKey(id)] = logs;
            }
        }
        dirtyTabs.clear();
        if (Object.keys(payload).length) {
            void chrome.storage.session.set(payload).catch(() => undefined);
        }
    }, 500);
}

/** Read a tab's logs, falling back to session storage after a worker restart. */
async function readConsoleLogs(tabId: number): Promise<Array<{ level: string; text: string }>> {
    const live = consoleLogs.get(tabId);
    if (live?.length) {
        return live;
    }
    const stored = await chrome.storage.session.get(consoleKey(tabId)).catch(() => ({}));
    const logs = (stored as Record<string, Array<{ level: string; text: string }>>)[consoleKey(tabId)];
    if (logs?.length) {
        consoleLogs.set(tabId, logs);
        return logs;
    }
    return [];
}

chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === undefined) return;
    const logs = consoleLogs.get(source.tabId);
    if (!logs) return;

    let entry: { level: string; text: string } | null = null;

    if (method === 'Log.entryAdded') {
        const p = params as { entry?: { level?: string; text?: string } };
        if (p.entry) {
            entry = { level: p.entry.level ?? 'log', text: p.entry.text ?? '' };
        }
    } else if (method === 'Runtime.consoleAPICalled') {
        const p = params as {
            type?: string;
            args?: Array<{
                value?: unknown;
                description?: string;
                preview?: { properties?: Array<{ name: string; value?: string }> };
            }>;
        };
        const text = (p.args ?? [])
            .map((arg) => {
                if (arg.value !== undefined) return String(arg.value);
                // Objects and arrays carry no `value`; a preview is the only
                // way to show more than the bare word "Object".
                // Note: Chrome omits `preview` on entries it replays when the
                // debugger attaches, so those legitimately fall back to
                // `description` ("Object").
                if (arg.preview?.properties?.length) {
                    const props = arg.preview.properties;
                    if (arg.description?.startsWith('Array(')) {
                        return `[${props.map((prop) => prop.value ?? '').join(', ')}]`;
                    }
                    return `{ ${props.map((prop) => `${prop.name}: ${prop.value ?? ''}`).join(', ')} }`;
                }
                return arg.description ?? '';
            })
            .join(' ');
        entry = { level: p.type ?? 'log', text };
    } else if (method === 'Runtime.exceptionThrown') {
        const p = params as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
        entry = {
            level: 'error',
            text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'Uncaught exception',
        };
    }

    if (entry) {
        logs.push(entry);
        if (logs.length > MAX_CONSOLE_LOGS) {
            logs.splice(0, logs.length - MAX_CONSOLE_LOGS);
        }
        scheduleFlush(source.tabId);
    }
});

// Chrome detaches on navigation-to-restricted-page, DevTools opening, or tab close.
chrome.debugger.onDetach.addListener((source) => {
    const tabId = source.tabId;
    if (tabId === undefined) return;
    void forgetAttached(tabId);
    // A re-attach in flight will have replaced the client already; deleting
    // here would wipe the session that just replaced this one.
    if (attaching.has(tabId)) return;
    clients.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    clients.delete(tabId);
    consoleLogs.delete(tabId);
    void forgetAttached(tabId);
    void chrome.storage.session.remove(consoleKey(tabId)).catch(() => undefined);
});

// ============================================================
// Actions
// ============================================================

type ActionResult = {
    success: boolean;
    data?: unknown;
    error?: string;
    /** Screenshot only: whether the image was actually held for the panel. */
    stored?: boolean;
};

async function withClient(
    tabId: number,
    fn: (client: CDPClient) => Promise<ActionResult>
): Promise<ActionResult> {
    const { client, error } = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error };
    }
    try {
        return await fn(client);
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}

async function navigate(tabId: number, url: string): Promise<ActionResult> {
    const target = normalizeUrl(url);
    if (!target) {
        return { success: false, error: 'Enter a valid URL, for example https://example.com' };
    }
    return withClient(tabId, async (client) => {
        const result = await client.navigate(target);
        return result.success
            ? { success: true, data: `Navigated to ${target}` }
            : { success: false, error: result.error };
    });
}

/** Accept "example.com" as well as a full URL, but never a javascript: URL. */
function normalizeUrl(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    // Reject any other scheme outright. Prefixing "https://" onto something
    // like "chrome://settings" produced the nonsense "https://chrome//settings"
    // and reported it as a successful navigation.
    // A colon followed by a digit is a port ("localhost:3000"), not a scheme.
    if (/^[a-z][a-z0-9+.-]*:(?![0-9])/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
        return null;
    }
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(withScheme);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
    } catch {
        return null;
    }
}

async function click(tabId: number, selector: string): Promise<ActionResult> {
    if (!selector.trim()) {
        return { success: false, error: 'Enter a CSS selector, for example #submit or .btn-primary' };
    }
    return withClient(tabId, async (client) => {
        const result = await client.clickElement(selector);
        return result.success
            ? { success: true, data: `Clicked ${selector}` }
            : { success: false, error: result.error ?? `No element matched ${selector}` };
    });
}

async function type(tabId: number, selector: string, text: string): Promise<ActionResult> {
    if (!selector.trim()) {
        return { success: false, error: 'Enter a CSS selector for the field you want to type into.' };
    }
    return withClient(tabId, async (client) => {
        const result = await client.typeInElement(selector, text);
        return result.success
            ? { success: true, data: `Typed into ${selector}` }
            : { success: false, error: result.error ?? `No element matched ${selector}` };
    });
}

async function scroll(tabId: number, direction: 'up' | 'down'): Promise<ActionResult> {
    return withClient(tabId, async (client) => {
        const result = await client.scroll(0, direction === 'down' ? 500 : -500);
        return result.success
            ? { success: true, data: `Scrolled ${direction}` }
            : { success: false, error: result.error };
    });
}

async function evaluate(tabId: number, expression: string): Promise<ActionResult> {
    if (!expression.trim()) {
        return { success: false, error: 'Enter a JavaScript expression, for example document.title' };
    }
    return withClient(tabId, async (client) => {
        const result = await client.evaluate(expression);
        return result.success
            ? { success: true, data: result.data }
            : { success: false, error: result.error };
    });
}

/**
 * Capture the page and hand the image straight back to the caller.
 *
 * The panel renders it and offers a save link. Nothing is written to disk here,
 * so nothing claims to have been saved.
 */
async function captureScreenshot(tabId: number): Promise<ActionResult> {
    return withClient(tabId, async (client) => {
        const result = await client.captureScreenshot('png');
        if (!result.success || !result.data?.data) {
            return { success: false, error: result.error ?? 'Screenshot failed.' };
        }
        const dataUrl = `data:image/png;base64,${result.data.data}`;

        // Held so the panel can show a shot taken while it was closed. Skip the
        // write when it would not fit: chrome.storage.session allows 10 MB in
        // total, and console buffers share it. The capture itself still
        // succeeds either way - the panel is handed the image directly.
        let stored = false;
        if (dataUrl.length <= MAX_STORED_SCREENSHOT) {
            stored = await chrome.storage.session
                .set({ lastScreenshot: { dataUrl, capturedAt: Date.now() } })
                .then(() => true, () => false);
        } else {
            await chrome.storage.session.remove('lastScreenshot').catch(() => undefined);
        }

        return { success: true, data: dataUrl, stored };
    });
}

/** Structured summary of the page, built entirely in the page itself. */
async function extractData(tabId: number): Promise<ActionResult> {
    return withClient(tabId, async (client) => {
        const expression = `(function () {
            var pick = function (nodes, fn) { return Array.prototype.slice.call(nodes, 0, 50).map(fn); };
            return JSON.stringify({
                title: document.title,
                url: location.href,
                headings: pick(document.querySelectorAll('h1,h2,h3'), function (h) {
                    return { tag: h.tagName.toLowerCase(), text: (h.textContent || '').trim() };
                }),
                links: pick(document.querySelectorAll('a[href]'), function (a) {
                    return { text: (a.textContent || '').trim(), href: a.href };
                }),
                images: pick(document.querySelectorAll('img[src]'), function (i) {
                    return { alt: i.alt || '', src: i.src };
                })
            }, null, 2);
        })()`;
        const result = await client.evaluate(expression);
        return result.success
            ? { success: true, data: result.data }
            : { success: false, error: result.error };
    });
}

/**
 * Return console output captured since the CDP session attached.
 *
 * Attaching is what starts capture, so a fresh session legitimately has nothing
 * yet - the panel says so rather than showing an empty box.
 */
async function getConsoleLogs(tabId: number): Promise<ActionResult> {
    // Read the buffer first: attaching can reset the live session, and the
    // stored copy is what survives a service-worker restart.
    const stored = await readConsoleLogs(tabId);

    const { error } = await ensureCDP(tabId);
    if (error) {
        return { success: false, error };
    }

    return { success: true, data: stored.length ? stored : (consoleLogs.get(tabId) ?? []) };
}

async function getTabInfo(tabId: number): Promise<ActionResult> {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
        return { success: false, error: 'That tab is no longer open.' };
    }
    return {
        success: true,
        data: {
            id: tab.id,
            url: tab.url,
            title: tab.title,
            blank: isBlankTab(tab.url),
            restricted: isRestrictedUrl(tab.url) && !isBlankTab(tab.url),
        },
    };
}

// ============================================================
// History
// ============================================================

interface HistoryEntry {
    action: string;
    detail: string;
    at: number;
}

async function addHistory(action: string, detail: string): Promise<void> {
    const { history = [] } = (await chrome.storage.local.get('history')) as { history?: HistoryEntry[] };
    history.unshift({ action, detail, at: Date.now() });
    await chrome.storage.local.set({ history: history.slice(0, MAX_HISTORY) });
}

async function getHistory(): Promise<ActionResult> {
    const { history = [] } = (await chrome.storage.local.get('history')) as { history?: HistoryEntry[] };
    return { success: true, data: history };
}

async function clearHistory(): Promise<ActionResult> {
    await chrome.storage.local.remove('history');
    return { success: true, data: 'History cleared' };
}

// ============================================================
// Message router
// ============================================================

interface Message {
    type: string;
    tabId?: number;
    url?: string;
    selector?: string;
    text?: string;
    expression?: string;
    direction?: 'up' | 'down';
}

/** Messages that operate on the browser as a whole rather than on one tab. */
const TAB_FREE_ACTIONS = new Set(['GET_HISTORY', 'CLEAR_HISTORY', 'GET_LAST_SCREENSHOT']);

async function handleMessage(message: Message): Promise<ActionResult> {
    const tabId = message.tabId;

    // Guard once, so a new tab-scoped case cannot forget to check.
    if (!TAB_FREE_ACTIONS.has(message.type) && tabId === undefined) {
        return { success: false, error: 'No tab selected.' };
    }

    switch (message.type) {
        case 'CDP_NAVIGATE': {
            const result = await navigate(tabId!, message.url ?? '');
            if (result.success) await addHistory('Navigate', message.url ?? '');
            return result;
        }

        case 'CDP_CLICK': {
            const result = await click(tabId!, message.selector ?? '');
            if (result.success) await addHistory('Click', message.selector ?? '');
            return result;
        }

        case 'CDP_TYPE': {
            const result = await type(tabId!, message.selector ?? '', message.text ?? '');
            if (result.success) await addHistory('Type', message.selector ?? '');
            return result;
        }

        case 'CDP_SCROLL': {
            const result = await scroll(tabId!, message.direction ?? 'down');
            if (result.success) await addHistory('Scroll', message.direction ?? 'down');
            return result;
        }

        case 'CDP_EVALUATE': {
            const result = await evaluate(tabId!, message.expression ?? '');
            if (result.success) await addHistory('Run JavaScript', message.expression ?? '');
            return result;
        }

        case 'CDP_SCREENSHOT': {
            const result = await captureScreenshot(tabId!);
            if (result.success) await addHistory('Screenshot', 'Captured');
            return result;
        }

        case 'EXTRACT_DATA': {
            const result = await extractData(tabId!);
            if (result.success) await addHistory('Extract Data', 'Page contents');
            return result;
        }

        case 'GET_CONSOLE_LOGS': {
            return getConsoleLogs(tabId!);
        }

        case 'GET_TAB_INFO': {
            return getTabInfo(tabId!);
        }

        case 'DETACH':
            return detachCDP(tabId!);

        case 'GET_HISTORY':
            return getHistory();

        case 'CLEAR_HISTORY':
            return clearHistory();

        case 'GET_LAST_SCREENSHOT': {
            const { lastScreenshot } = await chrome.storage.session.get('lastScreenshot');
            return { success: true, data: lastScreenshot ?? null };
        }

        default:
            return { success: false, error: `Unknown action: ${message.type}` };
    }
}

/**
 * The side panel holds a port open for its lifetime.
 *
 * When it closes, end every debugger session it started - otherwise Chrome's
 * "started debugging this browser" banner outlives the UI that could stop it,
 * which reads as surveillance rather than automation.
 */
/** Live side-panel ports. Empty means no panel is open right now. */
const panelPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'panel') return;
    panelPorts.add(port);
    port.onDisconnect.addListener(() => {
        panelPorts.delete(port);
        if (panelPorts.size === 0) {
            void endAllSessions();
        }
    });
});

/**
 * End every session this extension started, including ones begun by a previous
 * service-worker generation whose in-memory client map is long gone.
 */
async function endAllSessions(): Promise<void> {
    const ids = new Set<number>([...clients.keys(), ...(await readAttached())]);
    for (const tabId of ids) {
        await detachCDP(tabId);
    }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((error) => {
            sendResponse({
                success: false,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    return true; // keep the channel open for the async response
});

// ============================================================
// Side panel, commands and context menus
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'praisonai-screenshot',
            title: 'Capture screenshot',
            contexts: ['all'],
        });
        chrome.contextMenus.create({
            id: 'praisonai-open-panel',
            title: 'Open PraisonAI panel',
            contexts: ['all'],
        });
    });
});

// Clicking the toolbar icon opens the panel. With this set,
// chrome.action.onClicked never fires, so there is deliberately no listener.
// The Ctrl+Shift+P shortcut is a separate `open-panel` command handled in
// chrome.commands.onCommand - the _execute_action keyboard path does not
// reliably open a side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) {
        // contexts: ['all'] can fire on surfaces where Chrome supplies no tab.
        // Say so rather than appearing to do nothing.
        notifyScreenshot({
            success: false,
            error: 'Could not tell which tab this was. Open the panel and try from there.',
        });
        return;
    }
    const tabId = tab.id;
    const windowId = tab.windowId;

    // Open the panel synchronously - chrome.sidePanel.open() needs the user
    // gesture, which is gone by the time an awaited action resolves.
    if (info.menuItemId !== 'praisonai-screenshot' && windowId !== undefined) {
        chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }

    if (info.menuItemId === 'praisonai-screenshot') {
        void (async () => {
            const result = await captureScreenshot(tabId);
            if (result.success) await addHistory('Screenshot', 'Captured');
            await releaseIfNoPanel(tabId);
            notifyScreenshot(result);
        })();
    }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'open-panel') {
        // Called synchronously: a command invocation is a user gesture, and
        // awaiting anything first would spend it.
        if (tab?.windowId !== undefined) {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
        }
        return;
    }

    if (command !== 'capture-screenshot') return;

    if (!tab?.id) {
        // The shortcut works with the panel closed, so a silent no-op here
        // leaves the user with no feedback at all.
        notifyScreenshot({
            success: false,
            error: 'Could not tell which tab to capture. Focus a website tab and try again.',
        });
        return;
    }

    const result = await captureScreenshot(tab.id);
    if (result.success) {
        await addHistory('Screenshot', 'Captured');
    }
    await releaseIfNoPanel(tab.id);
    notifyScreenshot(result);
});

/**
 * Detach after a one-shot capture taken with no panel open.
 *
 * The shortcut and the context menu work while the panel is closed, so nothing
 * would ever end the session they start - leaving Chrome's debugging banner on
 * a tab the user never targeted from the panel.
 */
async function releaseIfNoPanel(tabId: number): Promise<void> {
    if (panelPorts.size === 0) {
        await detachCDP(tabId);
    }
}

/**
 * Tell the user what actually happened.
 *
 * The image is held in session storage and shown in the panel; it is not written
 * to disk, so this must not say "saved".
 */
function notifyScreenshot(result: ActionResult): void {
    if (!chrome.notifications?.create) return;

    // Read the real outcome rather than re-deriving it from the image size: a
    // quota failure is swallowed, and guessing would tell the user to open a
    // panel that has nothing in it.
    const stored = result.success && result.stored === true;

    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: result.success ? 'Screenshot captured' : 'Screenshot failed',
        message: result.success
            ? stored
                ? 'Open the PraisonAI panel to view and save it.'
                : 'The image was too large to hold for the panel. Capture it from the panel instead.'
            : (result.error ?? 'Could not capture this page.'),
    });
}
