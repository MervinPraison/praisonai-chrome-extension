/**
 * PraisonAI Browser Agent - Side Panel
 *
 * Every control here maps to one message the background worker can answer with
 * no server and no model. Errors are rendered in the tab the user is looking at
 * - never written into a hidden element, and never reported as success.
 */

interface ActionResponse {
    success: boolean;
    data?: unknown;
    error?: string;
}

interface HistoryEntry {
    action: string;
    detail: string;
    at: number;
}

const elements = {
    statusIndicator: document.getElementById('status-indicator') as HTMLElement,
    statusText: document.querySelector('#status-indicator .status-text') as HTMLElement,
    tabUrl: document.getElementById('tab-url') as HTMLElement,
    outputContent: document.getElementById('output-content') as HTMLElement,
    screenshotResult: document.getElementById('screenshot-result') as HTMLElement,
    screenshotImg: document.getElementById('screenshot-img') as HTMLImageElement,
    screenshotSave: document.getElementById('screenshot-save') as HTMLAnchorElement,
    historyList: document.getElementById('history-list') as HTMLElement,
    navUrl: document.getElementById('nav-url') as HTMLInputElement,
    clickSelector: document.getElementById('click-selector') as HTMLInputElement,
    typeSelector: document.getElementById('type-selector') as HTMLInputElement,
    typeText: document.getElementById('type-text') as HTMLInputElement,
    evalCode: document.getElementById('eval-code') as HTMLInputElement,
};

let currentTabId: number | null = null;
/** The window this panel belongs to - side panels are per-window. */
let myWindowId: number | null = null;

// ============================================================
// Messaging
// ============================================================

async function sendMessage(message: Record<string, unknown>): Promise<ActionResponse> {
    try {
        const response = (await chrome.runtime.sendMessage(message)) as ActionResponse | undefined;
        return response ?? { success: false, error: 'No response from the extension.' };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// ============================================================
// Output
// ============================================================

function setStatus(state: 'ready' | 'busy' | 'error', text: string): void {
    elements.statusIndicator.className = `status-indicator ${state}`;
    elements.statusText.textContent = text;
}

function setOutput(text: string, isError = false): void {
    elements.outputContent.textContent = text;
    elements.outputContent.classList.toggle('is-error', isError);
    elements.screenshotResult.hidden = true;
}

/** Object URL backing the current save link, revoked when replaced. */
let screenshotObjectUrl: string | null = null;

function showScreenshot(dataUrl: string, capturedAt?: number): void {
    elements.outputContent.textContent = capturedAt
        ? `Screenshot captured at ${new Date(capturedAt).toLocaleTimeString()}.`
        : 'Screenshot captured.';
    elements.outputContent.classList.remove('is-error');
    elements.screenshotImg.src = dataUrl;

    // Chrome refuses `<a download>` on some data: URLs, so save from a blob.
    if (screenshotObjectUrl) {
        URL.revokeObjectURL(screenshotObjectUrl);
        screenshotObjectUrl = null;
    }
    try {
        const base64 = dataUrl.split(',')[1] ?? '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        screenshotObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        elements.screenshotSave.href = screenshotObjectUrl;
    } catch {
        elements.screenshotSave.href = dataUrl;
    }

    elements.screenshotSave.download = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    elements.screenshotResult.hidden = false;
}

/**
 * Run an action and always show the outcome.
 *
 * A failed action reports the failure - it never leaves the previous result on
 * screen and never sets a success state.
 */
async function run(message: Record<string, unknown>, onSuccess: (data: unknown) => void): Promise<void> {
    if (currentTabId === null) {
        setOutput('No tab selected. Focus a website tab and try again.', true);
        setStatus('error', 'No tab');
        return;
    }

    setStatus('busy', 'Working...');
    setControlsDisabled(true);
    try {
        const result = await sendMessage({ ...message, tabId: currentTabId });

        if (result.success) {
            try {
                onSuccess(result.data);
                setStatus('ready', 'Done');
            } catch (error) {
                // Never leave the panel stuck on "Working..." because a
                // renderer choked on an unexpected payload shape.
                setOutput(
                    `Could not display the result: ${error instanceof Error ? error.message : String(error)}`,
                    true
                );
                setStatus('error', 'Failed');
            }
        } else {
            setOutput(result.error ?? 'The action failed.', true);
            setStatus('error', 'Failed');
        }
    } finally {
        setControlsDisabled(false);
    }

    void loadHistory();
}

/** Two overlapping actions on one tab tear down each other's CDP session. */
function setControlsDisabled(disabled: boolean): void {
    document.querySelectorAll<HTMLButtonElement>('.tool-btn, .btn').forEach((button) => {
        button.disabled = disabled;
    });
}

// ============================================================
// Tab tracking
// ============================================================

async function refreshCurrentTab(): Promise<void> {
    if (myWindowId === null) {
        // If this throws, fall back to the focused window rather than aborting
        // init - an unguarded rejection here leaves the panel permanently
        // reporting "No tab selected" while still looking healthy.
        myWindowId = await chrome.windows
            .getCurrent()
            .then((win) => win.id ?? null)
            .catch(() => null);
    }
    const [tab] = await chrome.tabs.query(
        myWindowId === null ? { active: true, lastFocusedWindow: true } : { active: true, windowId: myWindowId }
    );

    if (!tab?.id) {
        currentTabId = null;
        elements.tabUrl.textContent = 'No tab selected';
        return;
    }

    currentTabId = tab.id;
    elements.tabUrl.textContent = tab.url ?? tab.title ?? 'Untitled tab';

    const info = await sendMessage({ type: 'GET_TAB_INFO', tabId: tab.id });
    const state = info.data as { restricted?: boolean; blank?: boolean } | undefined;
    elements.tabUrl.classList.toggle('is-restricted', Boolean(state?.restricted || state?.blank));
    if (state?.blank) {
        elements.tabUrl.textContent = 'Open a website in this tab first';
    } else if (state?.restricted) {
        elements.tabUrl.textContent = `${tab.url ?? ''} — Chrome blocks automation here`;
    }
}

// ============================================================
// History
// ============================================================

async function loadHistory(): Promise<void> {
    const result = await sendMessage({ type: 'GET_HISTORY' });
    const history = (result.data as HistoryEntry[] | undefined) ?? [];

    if (!history.length) {
        elements.historyList.innerHTML = '<p class="empty-state">No history yet</p>';
        return;
    }

    elements.historyList.innerHTML = '';
    for (const entry of history) {
        const row = document.createElement('div');
        row.className = 'history-item';

        const action = document.createElement('span');
        action.className = 'history-action';
        action.textContent = entry.action;

        const detail = document.createElement('span');
        detail.className = 'history-detail';
        detail.textContent = entry.detail;

        const time = document.createElement('span');
        time.className = 'history-time';
        time.textContent = new Date(entry.at).toLocaleTimeString();

        row.append(action, detail, time);
        elements.historyList.appendChild(row);
    }
}

// ============================================================
// Wiring
// ============================================================

function switchMode(mode: string): void {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
        tab.classList.toggle('active', (tab as HTMLElement).dataset.mode === mode);
    });
    document.querySelectorAll('.mode-content').forEach((section) => {
        section.classList.toggle('active', section.id === `mode-${mode}`);
    });
    if (mode === 'history') {
        void loadHistory();
    }
}

function setupEventListeners(): void {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
        tab.addEventListener('click', () => switchMode((tab as HTMLElement).dataset.mode!));
    });

    document.querySelectorAll('.tool-btn').forEach((button) => {
        button.addEventListener('click', () => {
            void handleTool((button as HTMLElement).dataset.action!);
        });
    });

    document.getElementById('nav-go')!.addEventListener('click', () => {
        void run({ type: 'CDP_NAVIGATE', url: elements.navUrl.value }, (data) =>
            setOutput(String(data))
        );
    });

    document.getElementById('click-go')!.addEventListener('click', () => {
        void run({ type: 'CDP_CLICK', selector: elements.clickSelector.value }, (data) =>
            setOutput(String(data))
        );
    });

    document.getElementById('type-go')!.addEventListener('click', () => {
        void run(
            {
                type: 'CDP_TYPE',
                selector: elements.typeSelector.value,
                text: elements.typeText.value,
            },
            (data) => setOutput(String(data))
        );
    });

    document.getElementById('eval-go')!.addEventListener('click', () => {
        void run({ type: 'CDP_EVALUATE', expression: elements.evalCode.value }, (data) =>
            setOutput(formatValue(data))
        );
    });

    document.getElementById('scroll-up')!.addEventListener('click', () => {
        void run({ type: 'CDP_SCROLL', direction: 'up' }, (data) => setOutput(String(data)));
    });

    document.getElementById('scroll-down')!.addEventListener('click', () => {
        void run({ type: 'CDP_SCROLL', direction: 'down' }, (data) => setOutput(String(data)));
    });

    document.getElementById('clear-history')!.addEventListener('click', () => {
        void sendMessage({ type: 'CLEAR_HISTORY' }).then(loadHistory);
    });

    // Ignore events from other windows - this panel only drives its own.
    chrome.tabs.onActivated.addListener((info) => {
        if (myWindowId === null || info.windowId === myWindowId) {
            void refreshCurrentTab();
        }
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (tabId === currentTabId && changeInfo.status === 'complete') {
            void refreshCurrentTab();
        }
    });
}

async function handleTool(action: string): Promise<void> {
    switch (action) {
        case 'screenshot':
            await run({ type: 'CDP_SCREENSHOT' }, (data) => showScreenshot(String(data)));
            break;

        case 'extract':
            await run({ type: 'EXTRACT_DATA' }, (data) => setOutput(formatValue(data)));
            break;

        case 'console':
            await run({ type: 'GET_CONSOLE_LOGS' }, (data) => {
                const logs = (data as Array<{ level: string; text: string }>) ?? [];
                setOutput(
                    logs.length
                        ? logs.map((l) => `[${l.level}] ${l.text}`).join('\n')
                        : 'No console output yet. Messages are captured from the moment this panel connects to the tab — reload the page to capture its startup logs.'
                );
            });
            break;

        case 'detach':
            // Report what the worker actually did - it distinguishes ending a
            // live session from finding none attached.
            await run({ type: 'DETACH' }, (data) => setOutput(String(data)));
            break;
    }
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

// ============================================================
// Init
// ============================================================

/**
 * Hold a port open for the panel's lifetime.
 *
 * The worker detaches every session when this port drops, so the debugging
 * banner cannot outlive the panel. The port also dies when Chrome recycles the
 * service worker, and a dead port would silently forfeit that guarantee - so
 * reconnect whenever it drops.
 */
function keepPanelPort(): void {
    let port: chrome.runtime.Port;
    try {
        port = chrome.runtime.connect({ name: 'panel' });
    } catch {
        return;
    }
    port.onDisconnect.addListener(() => {
        // Fires when the worker is recycled. (When the panel itself closes this
        // document is being torn down, so nothing runs here.)
        setTimeout(keepPanelPort, 250);
    });
}

async function init(): Promise<void> {
    keepPanelPort();

    setupEventListeners();
    await refreshCurrentTab();
    await loadHistory();

    // A screenshot taken with the keyboard shortcut or the context menu while
    // the panel was closed is waiting in session storage.
    const last = await sendMessage({ type: 'GET_LAST_SCREENSHOT' });
    const shot = last.data as { dataUrl?: string; capturedAt?: number } | null;
    if (shot?.dataUrl) {
        const age = Date.now() - (shot.capturedAt ?? 0);
        // Only offer it while it is plausibly the one the user just took.
        if (age < 5 * 60 * 1000) {
            showScreenshot(shot.dataUrl, shot.capturedAt);
        }
    }

    setStatus('ready', 'Ready');
}

void init();
