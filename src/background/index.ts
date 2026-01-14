/**
 * Background Service Worker
 * 
 * Central event handler for the extension.
 * Handles:
 * - Context menu registration
 * - Side panel management
 * - Message routing between components
 * - CDP session management
 * - Bridge server connection
 */

import { CDPClient, createCDPClient } from '../cdp/client';
import { BrowserAgent } from '../ai/agent';
import { BridgeClient, getBridgeClient } from '../bridge/client';

// Active CDP sessions by tab ID
const cdpSessions = new Map<number, CDPClient>();
const agents = new Map<number, BrowserAgent>();

// Bridge server connection
let bridgeClient: BridgeClient | null = null;
let bridgeConnected = false;

// Console logs captured from pages
const consoleLogs = new Map<number, Array<{ level: string; text: string; timestamp: number }>>();

// Panel state tracking
const panelState = new Map<number, boolean>();

/**
 * Initialize bridge connection
 */
async function initBridgeConnection(): Promise<boolean> {
    if (bridgeClient && bridgeConnected) {
        return true;
    }

    bridgeClient = getBridgeClient({
        serverUrl: 'ws://localhost:8765/ws',
        maxReconnectAttempts: 3,
    });

    bridgeClient.onStateChange = (state) => {
        bridgeConnected = state === 'connected';
        console.log(`[PraisonAI] Bridge connection: ${state}`);

        // Notify side panel of connection state
        chrome.runtime.sendMessage({
            type: 'BRIDGE_STATE',
            connected: bridgeConnected,
        }).catch(() => { }); // Ignore if no listener
    };

    bridgeClient.onAction = (action) => {
        console.log(`[PraisonAI] Bridge action:`, action);
        // Forward to side panel for display
        chrome.runtime.sendMessage({
            type: 'BRIDGE_ACTION',
            action,
        }).catch(() => { });
    };

    bridgeClient.onThought = (thought) => {
        chrome.runtime.sendMessage({
            type: 'BRIDGE_THOUGHT',
            thought,
        }).catch(() => { });
    };

    bridgeClient.onError = (error) => {
        console.error(`[PraisonAI] Bridge error:`, error);
        chrome.runtime.sendMessage({
            type: 'BRIDGE_ERROR',
            error,
        }).catch(() => { });
    };

    return bridgeClient.connect();
}

// Try to connect to bridge server on startup
initBridgeConnection().catch(console.error);

/**
 * Side Panel lifecycle events (Chrome 141+)
 */
if (chrome.sidePanel.onOpened) {
    chrome.sidePanel.onOpened.addListener((info) => {
        const key = info.tabId ?? info.windowId;
        panelState.set(key, true);
        console.log(`[PraisonAI] Panel opened: windowId=${info.windowId}, tabId=${info.tabId}, path=${info.path}`);
    });
}

if (chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((info) => {
        const key = info.tabId ?? info.windowId;
        panelState.set(key, false);
        console.log(`[PraisonAI] Panel closed: windowId=${info.windowId}, tabId=${info.tabId}, path=${info.path}`);

        // Cleanup: stop agent if running when panel closes
        if (info.tabId && agents.has(info.tabId)) {
            console.log(`[PraisonAI] Stopping agent for tab ${info.tabId}`);
            agents.get(info.tabId)?.stop();
            agents.delete(info.tabId);
        }
    });
}

/**
 * Keyboard command handlers
 */
chrome.commands.onCommand.addListener(async (command) => {
    console.log(`[PraisonAI] Command received: ${command}`);

    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    switch (command) {
        case 'start-agent':
            // Open panel and start agent with default goal
            await chrome.sidePanel.open({ tabId: tab.id });
            chrome.runtime.sendMessage({
                type: 'START_AUTOMATION',
                tabId: tab.id,
            });
            break;

        case 'capture-screenshot':
            // Capture screenshot and notify
            const result = await captureScreenshot(tab.id);
            if (result.success) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Screenshot Captured',
                    message: 'Screenshot saved successfully',
                });
            }
            break;
    }
});

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async () => {
    console.log('PraisonAI Browser Agent installed');

    // Register context menu items
    chrome.contextMenus.create({
        id: 'praison-automate',
        title: 'Automate with PraisonAI',
        contexts: ['page', 'selection'],
    });

    chrome.contextMenus.create({
        id: 'praison-screenshot',
        title: 'Capture Screenshot',
        contexts: ['page'],
    });

    chrome.contextMenus.create({
        id: 'praison-summarize',
        title: 'Summarize Selection',
        contexts: ['selection'],
    });

    chrome.contextMenus.create({
        id: 'praison-extract',
        title: 'Extract Data',
        contexts: ['page'],
    });

    // Set side panel behavior
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;

    switch (info.menuItemId) {
        case 'praison-automate':
            // Open side panel for automation
            await chrome.sidePanel.open({ tabId: tab.id });
            // Send automation request
            chrome.runtime.sendMessage({
                type: 'START_AUTOMATION',
                tabId: tab.id,
                selection: info.selectionText,
            });
            break;

        case 'praison-screenshot':
            await captureScreenshot(tab.id);
            break;

        case 'praison-summarize':
            if (info.selectionText) {
                await chrome.sidePanel.open({ tabId: tab.id });
                chrome.runtime.sendMessage({
                    type: 'SUMMARIZE',
                    text: info.selectionText,
                });
            }
            break;

        case 'praison-extract':
            await chrome.sidePanel.open({ tabId: tab.id });
            chrome.runtime.sendMessage({
                type: 'EXTRACT_DATA',
                tabId: tab.id,
            });
            break;
    }
});

/**
 * Handle messages from content scripts and side panel
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
});

/**
 * Message handler
 */
async function handleMessage(
    message: {
        type: string;
        tabId?: number;
        [key: string]: unknown;
    },
    sender: chrome.runtime.MessageSender
): Promise<unknown> {
    const tabId = message.tabId || sender.tab?.id;

    switch (message.type) {
        // === CDP Operations ===
        case 'CDP_ATTACH':
            return attachCDP(tabId!);

        case 'CDP_DETACH':
            return detachCDP(tabId!);

        case 'CDP_NAVIGATE':
            return navigate(tabId!, message.url as string);

        case 'CDP_CLICK':
            return click(tabId!, message.selector as string);

        case 'CDP_TYPE':
            return type(tabId!, message.selector as string, message.text as string);

        case 'CDP_SCROLL':
            return scroll(tabId!, message.direction as 'up' | 'down');

        case 'CDP_SCREENSHOT':
            return captureScreenshot(tabId!);

        case 'CDP_EVALUATE':
            return evaluate(tabId!, message.expression as string);

        // === Agent Operations ===
        case 'AGENT_START':
            return startAgent(tabId!, message.goal as string);

        case 'AGENT_STOP':
            return stopAgent(tabId!);

        case 'AGENT_STATUS':
            return getAgentStatus(tabId!);

        // === Tab Info ===
        case 'GET_TAB_INFO':
            return getTabInfo(tabId!);

        case 'GET_CONSOLE_LOGS':
            return consoleLogs.get(tabId!) || [];

        default:
            return { success: false, error: `Unknown message type: ${message.type}` };
    }
}

/**
 * Attach CDP to tab
 */
async function attachCDP(tabId: number) {
    if (cdpSessions.has(tabId)) {
        return { success: true, data: 'Already attached' };
    }

    const result = await createCDPClient(tabId);
    if (result.success && result.data) {
        cdpSessions.set(tabId, result.data);

        // Setup console log capture
        setupConsoleCapture(tabId, result.data);
    }
    return result;
}

/**
 * Detach CDP from tab
 */
async function detachCDP(tabId: number) {
    const client = cdpSessions.get(tabId);
    if (!client) {
        return { success: true, data: 'Not attached' };
    }

    const result = await client.detach();
    if (result.success) {
        cdpSessions.delete(tabId);
        consoleLogs.delete(tabId);
    }
    return result;
}

/**
 * Navigate to URL
 */
async function navigate(tabId: number, url: string) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    return client.navigate(url);
}

/**
 * Click element
 */
async function click(tabId: number, selector: string) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    return client.clickElement(selector);
}

/**
 * Type text
 */
async function type(tabId: number, selector: string, text: string) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    return client.typeInElement(selector, text);
}

/**
 * Scroll page
 */
async function scroll(tabId: number, direction: 'up' | 'down') {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    const deltaY = direction === 'up' ? -300 : 300;
    return client.scroll(0, deltaY);
}

/**
 * Capture screenshot
 */
async function captureScreenshot(tabId: number) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    return client.captureScreenshot('png');
}

/**
 * Evaluate JavaScript
 */
async function evaluate(tabId: number, expression: string) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }
    return client.evaluate(expression);
}

/**
 * Start browser agent
 */
async function startAgent(tabId: number, goal: string) {
    const client = await ensureCDP(tabId);
    if (!client) {
        return { success: false, error: 'Failed to attach CDP' };
    }

    // Stop existing agent
    const existingAgent = agents.get(tabId);
    if (existingAgent) {
        existingAgent.stop();
    }

    const agent = new BrowserAgent(client);
    agents.set(tabId, agent);

    // Run agent in background
    agent.run(goal, (step) => {
        // Notify side panel of each step
        chrome.runtime.sendMessage({
            type: 'AGENT_STEP',
            tabId,
            step,
        }).catch(() => {
            // Side panel might not be listening
        });
    });

    return { success: true, data: 'Agent started' };
}

/**
 * Stop browser agent
 */
function stopAgent(tabId: number) {
    const agent = agents.get(tabId);
    if (agent) {
        agent.stop();
        agents.delete(tabId);
    }
    return { success: true };
}

/**
 * Get agent status
 */
function getAgentStatus(tabId: number) {
    const agent = agents.get(tabId);
    if (!agent) {
        return { success: true, data: null };
    }
    return { success: true, data: agent.getTask() };
}

/**
 * Get tab info
 */
async function getTabInfo(tabId: number) {
    try {
        const tab = await chrome.tabs.get(tabId);
        return {
            success: true,
            data: {
                id: tab.id,
                url: tab.url,
                title: tab.title,
                status: tab.status,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get tab info: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}

/**
 * Ensure CDP is attached
 */
async function ensureCDP(tabId: number): Promise<CDPClient | null> {
    if (cdpSessions.has(tabId)) {
        return cdpSessions.get(tabId)!;
    }

    const result = await attachCDP(tabId);
    if (result.success && result.data) {
        return cdpSessions.get(tabId)!;
    }
    return null;
}

/**
 * Setup console log capture
 */
function setupConsoleCapture(tabId: number, client: CDPClient) {
    consoleLogs.set(tabId, []);

    // Listen for console messages via CDP events
    chrome.debugger.onEvent.addListener((source, method, params) => {
        if (source.tabId !== tabId) return;

        if (method === 'Console.messageAdded') {
            const logs = consoleLogs.get(tabId) || [];
            const message = params as { message: { level: string; text: string } };
            logs.push({
                level: message.message.level,
                text: message.message.text,
                timestamp: Date.now(),
            });
            consoleLogs.set(tabId, logs.slice(-100)); // Keep last 100 logs
        }
    });
}

/**
 * Clean up when tab closes
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    detachCDP(tabId);
    agents.delete(tabId);
    consoleLogs.delete(tabId);
});

/**
 * Handle debugger detach events
 */
chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId) {
        cdpSessions.delete(source.tabId);
        agents.delete(source.tabId);
        consoleLogs.delete(source.tabId);
        console.log(`Debugger detached from tab ${source.tabId}: ${reason}`);
    }
});

// Export for testing
export { handleMessage, cdpSessions, agents };
