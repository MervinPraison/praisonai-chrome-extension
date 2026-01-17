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

// *** FIX: Session cleanup lock to prevent race conditions ***
let sessionCleanupInProgress = false;

// *** FIX: Use chrome.storage.session for persistent session state ***
// This survives service worker restarts and prevents back-to-back session issues
interface SessionState {
    activeTabId: number | null;
    sessionId: string | null;
    isActive: boolean;
    timestamp: number;
}

const DEFAULT_SESSION_STATE: SessionState = {
    activeTabId: null,
    sessionId: null,
    isActive: false,
    timestamp: 0,
};

async function getSessionState(): Promise<SessionState> {
    try {
        const result = await chrome.storage.session.get('sessionState');
        return result.sessionState || DEFAULT_SESSION_STATE;
    } catch (e) {
        console.warn('[PraisonAI] Failed to get session state:', e);
        return DEFAULT_SESSION_STATE;
    }
}

async function setSessionState(state: Partial<SessionState>): Promise<void> {
    try {
        const current = await getSessionState();
        await chrome.storage.session.set({
            sessionState: { ...current, ...state, timestamp: Date.now() }
        });
    } catch (e) {
        console.warn('[PraisonAI] Failed to set session state:', e);
    }
}

// *** VIDEO RECORDING STATE ***
let isRecording = false;
let recordingSessionId: string | null = null;

/**
 * Ensure offscreen document exists for recording
 */
async function ensureOffscreenDocument(): Promise<void> {
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDocument = existingContexts.find(
        (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
    );

    if (!offscreenDocument) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Recording browser automation session',
        });
    }
}

/**
 * Start recording the current tab
 */
async function startSessionRecording(tabId: number): Promise<{ success: boolean; error?: string }> {
    if (isRecording) {
        return { success: false, error: 'Already recording' };
    }

    try {
        // Ensure offscreen document exists
        await ensureOffscreenDocument();

        // Get media stream ID for the tab
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

        if (!streamId) {
            return { success: false, error: 'Failed to get stream ID' };
        }

        // Send to offscreen document to start recording
        const response = await chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            streamId: streamId,
        });

        if (response?.success) {
            isRecording = true;
            console.log('[PraisonAI] Session recording started');
            return { success: true };
        }

        return { success: false, error: response?.error || 'Unknown error' };
    } catch (error) {
        console.error('[PraisonAI] Failed to start recording:', error);
        return { success: false, error: String(error) };
    }
}

/**
 * Stop recording and save the video
 */
async function stopSessionRecording(): Promise<{ success: boolean; videoUrl?: string; duration?: number; error?: string }> {
    if (!isRecording) {
        return { success: false, error: 'Not recording' };
    }

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'STOP_RECORDING',
        });

        isRecording = false;

        if (response?.success && response.data) {
            console.log('[PraisonAI] Session recording stopped, duration:', response.data.duration, 'ms');
            return {
                success: true,
                videoUrl: response.data.url,
                duration: response.data.duration,
            };
        }

        return { success: false, error: response?.error || 'Unknown error' };
    } catch (error) {
        isRecording = false;
        console.error('[PraisonAI] Failed to stop recording:', error);
        return { success: false, error: String(error) };
    }
}

// Compatibility layer - also track in memory for faster access within same SW lifecycle
let lastSessionTabId: number | null = null;

/**
 * Ensure no active debugger is attached before starting new session.
 * This prevents "Another debugger attached" errors.
 * 
 * *** FIX: Uses chrome.storage.session to persist state across service worker restarts ***
 */
async function ensureNoActiveDebugger(tabId?: number): Promise<void> {
    // If cleanup is in progress, wait for it
    while (sessionCleanupInProgress) {
        console.log('[PraisonAI] Waiting for session cleanup to complete...');
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Set cleanup lock
    sessionCleanupInProgress = true;

    try {
        // *** FIX: Check BOTH in-memory and storage-based state ***
        // This catches cases where:
        // 1. stopAgent() cleared memory but didn't wait for new session
        // 2. Service worker restarted and lost memory state
        const storedState = await getSessionState();
        const previousTabId = lastSessionTabId || storedState.activeTabId;

        if (previousTabId !== null) {
            const oldClient = cdpSessions.get(previousTabId);
            if (oldClient) {
                console.log(`[PraisonAI] Cleaning up previous session on tab ${previousTabId}`);
                try {
                    await oldClient.disconnect();
                } catch (e) {
                    console.warn('[PraisonAI] Previous session disconnect warning:', e);
                }
                cdpSessions.delete(previousTabId);
                // Wait for Chrome to release debugger
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            // Clear memory state but keep storage state for tracking
            lastSessionTabId = null;
        }

        // Also check the target tab if specified and different from previousTab
        if (tabId && tabId !== previousTabId) {
            const existingClient = cdpSessions.get(tabId);
            if (existingClient) {
                console.log(`[PraisonAI] Disconnecting existing CDP on target tab ${tabId}`);
                try {
                    await existingClient.disconnect();
                } catch (e) {
                    console.warn('[PraisonAI] Existing CDP disconnect warning:', e);
                }
                cdpSessions.delete(tabId);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Mark session as inactive in storage (but DON'T clear activeTabId yet)
        // This allows next session to know cleanup was attempted
        await setSessionState({ isActive: false });

    } finally {
        sessionCleanupInProgress = false;
    }
}

// Console logs captured from pages
const consoleLogs = new Map<number, Array<{ level: string; text: string; timestamp: number }>>();

// Panel state tracking
const panelState = new Map<number, boolean>();

// Session action log for tracking progress (accessible by sendObservation)
let sessionActionLog: { action: string; selector: string; success: boolean; url: string }[] = [];
let currentSessionGoal = '';

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

    // Handler for server-triggered automation (from CLI)
    bridgeClient.onStartAutomation = async (goal, sessionId, hadPreviousSession) => {
        console.log(`[PraisonAI] Starting automation from server: ${goal}`);
        console.log(`[PraisonAI] hadPreviousSession=${hadPreviousSession}, lastSessionTabId=${lastSessionTabId}`);

        // *** FIX: Always cleanup CDP between sessions ***
        // After normal completion: stopped=true (so hadPreviousSession=false) AND lastSessionTabId=null
        // So we must ALWAYS run cleanup and ensure state is correct for new session
        console.log(`[PraisonAI] Session cleanup - hadPreviousSession=${hadPreviousSession}, lastSessionTabId=${lastSessionTabId}`);

        // Ensure no stale CDP is attached (ALWAYS run this)
        await ensureNoActiveDebugger(lastSessionTabId || undefined);

        // Always wait for any previous session to fully complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get current active tab or find a suitable one
        let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        let tab = tabs[0];

        // If no tab or tab is a chrome:// URL, create a new tab
        if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
            console.log('[PraisonAI] Active tab is not suitable, creating new tab');
            tab = await chrome.tabs.create({ url: 'https://www.google.com', active: true });

            // Wait for tab to fully load using onUpdated listener
            if (tab.id) {
                const tabId = tab.id;
                await new Promise<void>((resolve) => {
                    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
                        if (id === tabId && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(onUpdated);
                            resolve();
                        }
                    };
                    chrome.tabs.onUpdated.addListener(onUpdated);
                    // Fallback timeout
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(onUpdated);
                        resolve();
                    }, 10000);
                });
                console.log('[PraisonAI] New tab loaded');
            }
        }

        if (!tab?.id) {
            console.error('[PraisonAI] No suitable tab for automation');
            return;
        }

        // *** FIX: Ensure no previous debugger is attached ***
        await ensureNoActiveDebugger(tab.id);

        // Create CDP client for this tab
        const cdpResult = await createCDPClient(tab.id);
        if (!cdpResult.success || !cdpResult.data) {
            console.error('[PraisonAI] Failed to create CDP client:', cdpResult.error);
            return;
        }
        const cdpClient = cdpResult.data;
        cdpSessions.set(tab.id, cdpClient);
        lastSessionTabId = tab.id;  // Track for cleanup

        // *** FIX: Persist session state in chrome.storage.session ***
        await setSessionState({
            activeTabId: tab.id,
            sessionId: sessionId,
            isActive: true,
        });

        // Setup the bridge client with CDP
        bridgeClient.setCDPClient(cdpClient);

        // Reset session state
        sessionActionLog.length = 0;
        currentSessionGoal = goal;

        // *** FIX: Setup action handler for CLI-triggered automation ***
        // This was missing - without it, actions from LLM are silently dropped
        const tabId = tab.id!;
        bridgeClient.onAction = async (action) => {
            console.log('[PraisonAI] CLI action received:', action.action);

            // Check for completion
            if (action.done || action.action === 'done') {
                console.log('[PraisonAI] CLI task completed - stopping session');
                // Clean up CDP before ending session
                const client = cdpSessions.get(tabId);
                if (client) {
                    client.disconnect().catch(() => { });
                    cdpSessions.delete(tabId);
                }
                // Properly end the session
                await bridgeClient?.stopSession();
                return;
            }

            // Track step
            const currentStep = (bridgeClient?.currentStep || 0) + 1;
            console.log(`[PraisonAI] CLI Step ${currentStep}`);

            // Log action
            const selector = action.selector || action.element || '';
            sessionActionLog.push({
                action: action.action,
                selector,
                success: true,
                url: '',
            });

            // Execute the action
            try {
                const result = await bridgeClient!.executeAction(action);

                // Update success status
                if (sessionActionLog.length > 0) {
                    sessionActionLog[sessionActionLog.length - 1].success = result.success;
                    sessionActionLog[sessionActionLog.length - 1].error = result.error;
                }

                // Send next observation to continue the loop
                await sendObservationToBridge(tabId, goal, cdpClient, result.error);
            } catch (error) {
                console.error('[PraisonAI] CLI action error:', error);
                // Still send observation to let agent recover
                await sendObservationToBridge(tabId, goal, cdpClient, String(error));
            }
        };

        // Send first observation to server to start the loop
        await sendObservationToBridge(tab.id, goal, cdpClient);
    };

    return bridgeClient.connect();
}

// Try to connect to bridge server on startup
initBridgeConnection().catch(console.error);

// Setup periodic reconnection check using chrome.alarms (guard for API availability)
if (chrome.alarms?.create) {
    chrome.alarms.create('bridgeReconnect', { periodInMinutes: 0.5 }); // Every 30 seconds
}

if (chrome.alarms?.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'bridgeReconnect') {
            // If not connected, try to reconnect
            if (!bridgeConnected && bridgeClient) {
                console.log('[PraisonAI] Attempting periodic reconnection...');
                bridgeClient.connect().catch(console.error);
            }
        }
    });
}

/**
 * Side Panel lifecycle events (Chrome 141+)
 */
if (chrome.sidePanel?.onOpened) {
    chrome.sidePanel.onOpened.addListener((info) => {
        const key = info.tabId ?? info.windowId;
        panelState.set(key, true);
        console.log(`[PraisonAI] Panel opened: windowId=${info.windowId}, tabId=${info.tabId}, path=${info.path}`);
    });
}

if (chrome.sidePanel?.onClosed) {
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

        // *** FIX: Mark session as inactive in storage ***
        setSessionState({ isActive: false }).catch(console.warn);
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
            chrome.sidePanel?.open?.({ tabId: tab.id });
            chrome.runtime.sendMessage({
                type: 'START_AUTOMATION',
                tabId: tab.id,
            });
            break;

        case 'capture-screenshot':
            // Capture screenshot and notify
            const result = await captureScreenshot(tab.id);
            if (result.success && chrome.notifications?.create) {
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

    // Register context menu items (guard for Chrome versions without contextMenus API)
    if (chrome.contextMenus?.create) {
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
    }

    // Set side panel behavior (guard for Chrome versions without sidePanel API)
    if (chrome.sidePanel?.setPanelBehavior) {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
});

/**
 * Handle context menu clicks
 */
if (chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (!tab?.id) return;

        switch (info.menuItemId) {
            case 'praison-automate':
                // Open side panel for automation
                chrome.sidePanel?.open?.({ tabId: tab.id });
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
                    chrome.sidePanel?.open?.({ tabId: tab.id });
                    chrome.runtime.sendMessage({
                        type: 'SUMMARIZE',
                        text: info.selectionText,
                    });
                }
                break;

            case 'praison-extract':
                chrome.sidePanel?.open?.({ tabId: tab.id });
                chrome.runtime.sendMessage({
                    type: 'EXTRACT_DATA',
                    tabId: tab.id,
                });
                break;
        }
    });
}

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

    // Try bridge server first (PraisonAI)
    if (bridgeClient && bridgeConnected) {
        console.log('[PraisonAI] Starting session via bridge server');

        // Reset session state
        sessionActionLog = [];
        currentSessionGoal = goal;

        // Start session with bridge
        await bridgeClient.startSession(goal);
        bridgeClient.setCDPClient(client);

        // Setup action handler with retry detection
        const actionHistory: { action: string; selector: string; count: number }[] = [];
        let lastActionResult: { success: boolean; error?: string } | null = null;

        bridgeClient.onAction = async (action) => {
            console.log('[PraisonAI] Received action:', action);

            // Track steps
            const currentStep = (bridgeClient?.currentStep || 0) + 1;
            const MAX_STEPS = 15;
            console.log(`[PraisonAI] Step ${currentStep}/${MAX_STEPS}`);

            // Notify side panel
            chrome.runtime.sendMessage({
                type: 'AGENT_STEP',
                tabId,
                step: {
                    action: {
                        type: action.action,
                        reason: action.thought || '',
                    },
                    result: { success: true },
                },
            }).catch(() => { });

            // Check for completion or max steps
            if (action.done || action.action === 'done') {
                console.log('[PraisonAI] Task completed, stopping agent');
                stopAgent(tabId);
                return;
            }

            if (currentStep >= MAX_STEPS) {
                console.log('[PraisonAI] Max steps reached, stopping agent');
                stopAgent(tabId);
                return;
            }

            // Track repeated actions to detect loops
            // Normalize selector (server sends 'element' or 'selector')
            const actionSelector = action.selector || action.element || '';
            const actionKey = `${action.action}:${actionSelector}`;
            const lastHistoryEntry = actionHistory[actionHistory.length - 1];

            if (lastHistoryEntry && lastHistoryEntry.action === action.action && lastHistoryEntry.selector === actionSelector) {
                lastHistoryEntry.count++;
                console.log(`[PraisonAI] Repeated action detected: ${actionKey} (${lastHistoryEntry.count} times)`);

                // If repeated 2+ times, try alternate click method
                if (lastHistoryEntry.count >= 2 && action.action === 'click') {
                    console.log('[PraisonAI] Switching to JavaScript click fallback');
                    action.clickMethod = 'js';  // Signal to use JS click
                }

                // If repeated 3+ times on a button, just try pressing Enter
                if (lastHistoryEntry.count >= 3 && (actionSelector.includes('btn') || actionSelector.includes('submit') || actionSelector.includes('search'))) {
                    console.log('[PraisonAI] Button click failed 3x, falling back to Enter key');
                    action.action = 'submit';  // Convert to Enter press
                }
            } else {
                actionHistory.push({ action: action.action, selector: actionSelector, count: 1 });
            }

            // Execute the action
            try {
                const pageState = await client.getPageState();
                const currentUrl = pageState.data?.url || '';

                const result = await bridgeClient!.executeAction(action);
                lastActionResult = { success: result.success, error: result.error };

                // Log to session action log for progress tracking
                sessionActionLog.push({
                    action: action.action,
                    selector: actionSelector,
                    success: result.success,
                    url: currentUrl,
                    error: result.error,  // Include error message
                });

                // Send next observation with last action result (including error)
                await sendObservationToBridge(tabId, goal, client, result.error);
            } catch (error) {
                console.error('[PraisonAI] Action failed:', error);
                lastActionResult = { success: false, error: String(error) };
                sessionActionLog.push({
                    action: action.action,
                    selector: actionSelector,
                    success: false,
                    url: '',
                });
            }
        };

        // Setup completion handler
        bridgeClient.onComplete = (summary) => {
            console.log('[PraisonAI] Task completed with summary:', summary);
            // Notify side panel of completion
            chrome.runtime.sendMessage({
                type: 'AGENT_COMPLETE',
                tabId,
                summary,
            }).catch(() => { });
        };

        // Send initial observation to start the loop
        await sendObservationToBridge(tabId, goal, client);

        return { success: true, data: 'Agent started via PraisonAI bridge' };
    }

    // Fallback to local agent (built-in AI)
    console.log('[PraisonAI] Bridge unavailable, using local agent');
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
 * Send observation to bridge server
 */
async function sendObservationToBridge(tabId: number, goal: string, client: CDPClient, lastActionError?: string) {
    try {
        // Get page state
        const pageState = await client.getPageState();
        if (!pageState.success || !pageState.data) {
            console.error('[PraisonAI] Failed to get page state');
            return;
        }

        // Capture screenshot (JPEG for smaller size)
        const screenshot = await client.captureScreenshot('jpeg', 30);

        // Get interactive elements
        const elements = await client.getClickableElements();

        // Build elements list for server with clear type indicators
        const elementsList = (elements.data || []).slice(0, 15).map((e, i) => {
            // Determine element type for clarity
            let typeHint = 'ELEMENT';
            if (e.tagName === 'a') typeHint = 'LINK';
            else if (e.tagName === 'button' || e.tagName === 'input' && e.attributes?.type === 'submit') typeHint = 'BUTTON';
            else if (e.tagName === 'input' || e.tagName === 'textarea') typeHint = 'INPUT';
            else if (e.tagName === 'select') typeHint = 'SELECT';

            return {
                index: i + 1,
                type: typeHint,
                selector: e.selector,
                tag: e.tagName,
                text: e.text || '',
            };
        });

        // Log elements for debugging with action hints
        console.log(`[PraisonAI] Step ${bridgeClient?.currentStep || 0}: ${pageState.data.url}`);
        console.log(`[PraisonAI] Found ${elementsList.length} elements:`);
        elementsList.forEach(e => {
            const actionHint = e.type === 'INPUT' ? '→ type here' :
                e.type === 'LINK' ? '→ click to navigate' :
                    e.type === 'BUTTON' ? '→ click to submit' : '';
            console.log(`  [${e.index}] ${e.type} ${e.selector} "${e.text}" ${actionHint}`);
        });

        // Build action history summary for agent context
        const actionHistorySummary = sessionActionLog.slice(-5).map((a, i) => ({
            step: sessionActionLog.length - 4 + i,
            action: a.action,
            selector: a.selector,
            success: a.success,
            url: a.url.slice(0, 60),  // Truncate URL
        }));

        // Build progress notes to help agent stay on track
        const progressNotes = sessionActionLog.length > 0
            ? `PROGRESS: ${sessionActionLog.length} actions completed. Last URL: ${sessionActionLog[sessionActionLog.length - 1]?.url?.slice(0, 50) || 'unknown'}`
            : 'PROGRESS: 0 actions completed. Just started.';

        // Send observation with full context
        await bridgeClient?.sendObservation({
            task: goal,  // Original goal always included
            url: pageState.data.url,
            title: pageState.data.title,
            screenshot: screenshot.data?.data || '',
            elements: elementsList,
            console_logs: [],
            step_number: bridgeClient?.currentStep || 0,
            // Add progress context for agent self-correction
            action_history: actionHistorySummary,
            progress_notes: progressNotes,
            original_goal: currentSessionGoal,  // Explicit reminder of original goal
            // Add last action error for LLM to see failures
            last_action_error: lastActionError,
        });
    } catch (error) {
        console.error('[PraisonAI] Failed to send observation:', error);
    }
}

/**
 * Stop browser agent
 */
async function stopAgent(tabId: number) {
    console.log('[PraisonAI] Stopping agent for tab', tabId);

    // *** FIX: Use cleanup lock to prevent race conditions ***
    sessionCleanupInProgress = true;

    try {
        // Stop local agent if exists
        const agent = agents.get(tabId);
        if (agent) {
            agent.stop();
            agents.delete(tabId);
        }

        // Stop bridge session if connected
        if (bridgeClient && bridgeConnected) {
            bridgeClient.stopSession();
            bridgeClient.onAction = null;  // Clear action handler to stop loop
        }

        // *** FIX: Clean up CDP session to prevent "Another debugger attached" error ***
        const cdpClient = cdpSessions.get(tabId);
        if (cdpClient) {
            console.log('[PraisonAI] Disconnecting CDP client for tab', tabId);
            try {
                await cdpClient.disconnect();
            } catch (err) {
                console.warn('[PraisonAI] CDP disconnect warning:', err);
            }
            cdpSessions.delete(tabId);
        }

        // *** CRITICAL FIX: Do NOT clear lastSessionTabId here! ***
        // Instead, mark session as inactive in storage
        // This allows ensureNoActiveDebugger() to still detect and handle cleanup
        // when the next session starts, even if this session's cleanup completed
        await setSessionState({ isActive: false });
        // NOTE: We intentionally do NOT clear lastSessionTabId here anymore
        // It will be cleared by ensureNoActiveDebugger() when new session starts

        // Small delay to ensure Chrome releases debugger
        await new Promise(resolve => setTimeout(resolve, 300));

    } finally {
        sessionCleanupInProgress = false;
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
