/**
 * Side Panel JavaScript
 * 
 * Handles all UI interactions and communicates with background service worker.
 */

import { builtInAI } from '../ai/builtin';

// DOM Elements
const elements = {
    statusIndicator: document.getElementById('status-indicator')!,
    tabUrl: document.getElementById('tab-url')!,
    goalInput: document.getElementById('goal-input') as HTMLTextAreaElement,
    startAgent: document.getElementById('start-agent') as HTMLButtonElement,
    stopAgent: document.getElementById('stop-agent') as HTMLButtonElement,
    stepsList: document.getElementById('steps-list')!,
    outputContent: document.getElementById('output-content')!,
    aiStatus: document.getElementById('ai-status')!,
    historyList: document.getElementById('history-list')!,
    // Tool inputs
    navUrl: document.getElementById('nav-url') as HTMLInputElement,
    navGo: document.getElementById('nav-go') as HTMLButtonElement,
    clickSelector: document.getElementById('click-selector') as HTMLInputElement,
    clickGo: document.getElementById('click-go') as HTMLButtonElement,
    typeSelector: document.getElementById('type-selector') as HTMLInputElement,
    typeText: document.getElementById('type-text') as HTMLInputElement,
    typeGo: document.getElementById('type-go') as HTMLButtonElement,
    evalCode: document.getElementById('eval-code') as HTMLInputElement,
    evalGo: document.getElementById('eval-go') as HTMLButtonElement,
};

// State
let currentTabId: number | null = null;
let isAgentRunning = false;
let history: Array<{ goal: string; timestamp: number; steps: number }> = [];

/**
 * Initialize side panel
 */
async function init() {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        currentTabId = tab.id;
        updateTabInfo(tab);
    }

    // Check AI capabilities
    await checkAIStatus();

    // Load history from storage
    await loadHistory();

    // Setup event listeners
    setupEventListeners();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener(handleMessage);

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
}

/**
 * Update tab info display
 */
function updateTabInfo(tab: chrome.tabs.Tab) {
    elements.tabUrl.textContent = tab.url || 'No URL';
}

/**
 * Check AI status
 */
async function checkAIStatus() {
    const result = await builtInAI.checkCapabilities();

    if (result.success && result.data?.promptApiAvailable) {
        elements.aiStatus.className = 'ai-status ready';
        elements.aiStatus.querySelector('.ai-text')!.textContent = 'Gemini Nano Ready';
    } else {
        elements.aiStatus.className = 'ai-status unavailable';
        elements.aiStatus.querySelector('.ai-text')!.textContent = 'Built-in AI Unavailable';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const mode = (tab as HTMLElement).dataset.mode;
            switchMode(mode!);
        });
    });

    // Agent controls
    elements.startAgent.addEventListener('click', startAgent);
    elements.stopAgent.addEventListener('click', stopAgent);

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = (btn as HTMLElement).dataset.action;
            handleToolAction(action!);
        });
    });

    // Quick actions
    elements.navGo.addEventListener('click', () => navigate(elements.navUrl.value));
    elements.clickGo.addEventListener('click', () => clickElement(elements.clickSelector.value));
    elements.typeGo.addEventListener('click', () =>
        typeInElement(elements.typeSelector.value, elements.typeText.value)
    );
    elements.evalGo.addEventListener('click', () => evaluate(elements.evalCode.value));

    // Enter key handlers
    elements.navUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') navigate(elements.navUrl.value);
    });
    elements.evalCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') evaluate(elements.evalCode.value);
    });
}

/**
 * Switch mode tab
 */
function switchMode(mode: string) {
    document.querySelectorAll('.mode-tab').forEach((tab) => {
        tab.classList.toggle('active', (tab as HTMLElement).dataset.mode === mode);
    });
    document.querySelectorAll('.mode-content').forEach((content) => {
        content.classList.toggle('active', content.id === `mode-${mode}`);
    });
}

/**
 * Start agent
 */
async function startAgent() {
    const goal = elements.goalInput.value.trim();
    if (!goal || !currentTabId) return;

    isAgentRunning = true;
    updateStatus('running', 'Running...');
    elements.startAgent.disabled = true;
    elements.stopAgent.disabled = false;
    elements.stepsList.innerHTML = '';

    const result = await sendMessage({ type: 'AGENT_START', tabId: currentTabId, goal });

    if (!result.success) {
        setOutput(`Error: ${result.error}`);
        stopAgent();
    } else {
        // Add to history
        history.unshift({ goal, timestamp: Date.now(), steps: 0 });
        await saveHistory();
        renderHistory();
    }
}

/**
 * Stop agent
 */
async function stopAgent() {
    if (!currentTabId) return;

    isAgentRunning = false;
    updateStatus('ready', 'Ready');
    elements.startAgent.disabled = false;
    elements.stopAgent.disabled = true;

    await sendMessage({ type: 'AGENT_STOP', tabId: currentTabId });
}

/**
 * Handle incoming messages
 */
function handleMessage(message: { type: string;[key: string]: unknown }) {
    switch (message.type) {
        case 'AGENT_STEP':
            addStep(message.step as { action: { type: string; reason: string }; result: { success: boolean } });
            break;

        case 'SUMMARIZE':
            summarize(message.text as string);
            break;

        case 'START_AUTOMATION':
            if (message.selection) {
                elements.goalInput.value = `Do something with: "${message.selection}"`;
            }
            switchMode('agent');
            break;

        case 'EXTRACT_DATA':
            handleToolAction('extract');
            break;
    }
}

/**
 * Add agent step to UI
 */
function addStep(step: { action: { type: string; reason: string }; result: { success: boolean } }) {
    const stepEl = document.createElement('div');
    stepEl.className = 'step-item';

    const icons: Record<string, string> = {
        click: '👆',
        type: '⌨️',
        scroll: '📜',
        navigate: '🔗',
        wait: '⏳',
        screenshot: '📸',
        extract: '📋',
    };

    stepEl.innerHTML = `
    <span class="step-icon">${icons[step.action.type] || '▪️'}</span>
    <div class="step-content">
      <div class="step-action">${step.action.type}</div>
      <div class="step-reason">${step.action.reason}</div>
    </div>
    <span class="step-status ${step.result.success ? 'success' : 'failed'}">
      ${step.result.success ? '✓' : '✗'}
    </span>
  `;

    elements.stepsList.appendChild(stepEl);
    elements.stepsList.scrollTop = elements.stepsList.scrollHeight;

    // Update history step count
    if (history.length > 0) {
        history[0].steps++;
    }
}

/**
 * Handle tool action
 */
async function handleToolAction(action: string) {
    if (!currentTabId) return;

    setOutput('Loading...');

    switch (action) {
        case 'screenshot':
            const screenshotResult = await sendMessage({ type: 'CDP_SCREENSHOT', tabId: currentTabId });
            if (screenshotResult.success && screenshotResult.data?.data) {
                setOutput(`Screenshot captured (${Math.round(screenshotResult.data.data.length / 1024)}KB)`);
                // Could display the image here
            } else {
                setOutput(`Error: ${screenshotResult.error}`);
            }
            break;

        case 'summarize':
            const tab = await chrome.tabs.get(currentTabId);
            if (tab.url) {
                setOutput('Summarizing page...');
                // Get page content via content script
                const contentResult = await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    func: () => document.body.innerText,
                });
                const text = contentResult[0]?.result;
                if (text) {
                    await summarize(text);
                } else {
                    setOutput('Could not get page content');
                }
            }
            break;

        case 'extract':
            setOutput('Extracting data...');
            const extractResult = await sendMessage({
                type: 'CDP_EVALUATE', tabId: currentTabId, expression: `
        JSON.stringify({
          title: document.title,
          url: location.href,
          headings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 10).map(h => h.textContent),
          links: Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({ text: a.textContent?.slice(0, 50), href: a.href })),
          images: Array.from(document.querySelectorAll('img[src]')).slice(0, 10).map(i => i.src),
        }, null, 2)
      ` });
            if (extractResult.success) {
                setOutput(extractResult.data);
            } else {
                setOutput(`Error: ${extractResult.error}`);
            }
            break;

        case 'console':
            const logsResult = await sendMessage({ type: 'GET_CONSOLE_LOGS', tabId: currentTabId });
            if (logsResult.success) {
                const logs = logsResult.data as Array<{ level: string; text: string }>;
                if (logs?.length) {
                    setOutput(logs.map((l) => `[${l.level}] ${l.text}`).join('\n'));
                } else {
                    setOutput('No console logs captured');
                }
            }
            break;
    }
}

/**
 * Summarize text using built-in AI
 */
async function summarize(text: string) {
    setOutput('Summarizing...');
    const result = await builtInAI.summarize(text.slice(0, 10000));
    if (result.success) {
        setOutput(result.data!);
    } else {
        // Fallback to prompt API
        const promptResult = await builtInAI.prompt(`Summarize this text in bullet points:\n\n${text.slice(0, 5000)}`);
        if (promptResult.success) {
            setOutput(promptResult.data!);
        } else {
            setOutput(`Error: ${promptResult.error}`);
        }
    }
}

/**
 * Navigate to URL
 */
async function navigate(url: string) {
    if (!url || !currentTabId) return;

    // Add protocol if missing
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }

    const result = await sendMessage({ type: 'CDP_NAVIGATE', tabId: currentTabId, url });
    setOutput(result.success ? `Navigated to ${url}` : `Error: ${result.error}`);
}

/**
 * Click element
 */
async function clickElement(selector: string) {
    if (!selector || !currentTabId) return;

    const result = await sendMessage({ type: 'CDP_CLICK', tabId: currentTabId, selector });
    setOutput(result.success ? `Clicked ${selector}` : `Error: ${result.error}`);
}

/**
 * Type in element
 */
async function typeInElement(selector: string, text: string) {
    if (!selector || !text || !currentTabId) return;

    const result = await sendMessage({ type: 'CDP_TYPE', tabId: currentTabId, selector, text });
    setOutput(result.success ? `Typed "${text}" in ${selector}` : `Error: ${result.error}`);
}

/**
 * Evaluate JavaScript
 */
async function evaluate(expression: string) {
    if (!expression || !currentTabId) return;

    const result = await sendMessage({ type: 'CDP_EVALUATE', tabId: currentTabId, expression });
    if (result.success) {
        setOutput(typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2));
    } else {
        setOutput(`Error: ${result.error}`);
    }
}

/**
 * Set output content
 */
function setOutput(content: string) {
    elements.outputContent.textContent = content;
}

/**
 * Update status indicator
 */
function updateStatus(status: 'ready' | 'running' | 'error', text: string) {
    elements.statusIndicator.className = `status-indicator ${status}`;
    elements.statusIndicator.querySelector('.status-text')!.textContent = text;
}

/**
 * Handle tab change
 */
async function handleTabChange(activeInfo: chrome.tabs.TabActiveInfo) {
    currentTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateTabInfo(tab);
}

/**
 * Handle tab update
 */
function handleTabUpdate(tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
    if (tabId === currentTabId && changeInfo.url) {
        updateTabInfo(tab);
    }
}

/**
 * Send message to background
 */
async function sendMessage(message: { type: string;[key: string]: unknown }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Load history from storage
 */
async function loadHistory() {
    const result = await chrome.storage.local.get('history');
    history = result.history || [];
    renderHistory();
}

/**
 * Save history to storage
 */
async function saveHistory() {
    await chrome.storage.local.set({ history: history.slice(0, 50) });
}

/**
 * Render history list
 */
function renderHistory() {
    if (history.length === 0) {
        elements.historyList.innerHTML = '<p class="empty-state">No history yet</p>';
        return;
    }

    elements.historyList.innerHTML = history
        .slice(0, 20)
        .map(
            (item) => `
      <div class="history-item">
        <div class="history-goal">${item.goal}</div>
        <div class="history-meta">
          ${new Date(item.timestamp).toLocaleString()} • ${item.steps} steps
        </div>
      </div>
    `
        )
        .join('');
}

// Initialize
init();
