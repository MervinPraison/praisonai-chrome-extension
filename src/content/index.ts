/**
 * Content Script
 * 
 * Injected into web pages to:
 * - Extract page content
 * - Add visual overlays for agent actions
 * - Handle user selections
 */

interface ElementHighlight {
    element: HTMLElement;
    overlay: HTMLDivElement;
}

const highlights: ElementHighlight[] = [];

/**
 * Message handler for content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
});

/**
 * Handle incoming messages
 */
async function handleMessage(message: {
    type: string;
    [key: string]: unknown;
}): Promise<unknown> {
    switch (message.type) {
        case 'GET_PAGE_CONTENT':
            return getPageContent();

        case 'GET_CLICKABLE_ELEMENTS':
            return getClickableElements();

        case 'HIGHLIGHT_ELEMENT':
            return highlightElement(message.selector as string);

        case 'CLEAR_HIGHLIGHTS':
            return clearHighlights();

        case 'SIMULATE_CLICK':
            return simulateClick(message.selector as string);

        case 'SIMULATE_TYPE':
            return simulateType(message.selector as string, message.text as string);

        case 'GET_FORM_DATA':
            return getFormData();

        case 'GET_ACCESSIBILITY_TREE':
            return getAccessibilityTree();

        default:
            return { success: false, error: `Unknown message type: ${message.type}` };
    }
}

/**
 * Get page content for summarization
 */
function getPageContent(): { success: boolean; data: object } {
    const content = {
        title: document.title,
        url: location.href,
        text: document.body.innerText.slice(0, 50000),
        headings: Array.from(document.querySelectorAll('h1, h2, h3'))
            .slice(0, 20)
            .map((h) => ({
                level: h.tagName,
                text: h.textContent?.trim(),
            })),
        meta: {
            description: document
                .querySelector('meta[name="description"]')
                ?.getAttribute('content'),
            keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content'),
        },
    };

    return { success: true, data: content };
}

/**
 * Get clickable elements on page
 */
function getClickableElements(): {
    success: boolean;
    data: Array<{
        selector: string;
        text: string;
        tagName: string;
        rect: DOMRect | null;
    }>;
} {
    const selectors = [
        'a[href]',
        'button',
        'input[type="button"]',
        'input[type="submit"]',
        '[onclick]',
        '[role="button"]',
        '[role="link"]',
        '[tabindex="0"]',
    ];

    const elements: Array<{
        selector: string;
        text: string;
        tagName: string;
        rect: DOMRect | null;
    }> = [];

    selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el, index) => {
            const element = el as HTMLElement;
            const rect = element.getBoundingClientRect();

            // Only include visible elements
            if (rect.width > 0 && rect.height > 0) {
                elements.push({
                    selector: generateSelector(element),
                    text: element.textContent?.trim().slice(0, 100) || '',
                    tagName: element.tagName.toLowerCase(),
                    rect: rect,
                });
            }
        });
    });

    return { success: true, data: elements.slice(0, 50) };
}

/**
 * Generate unique CSS selector for element
 */
function generateSelector(element: HTMLElement): string {
    // Try ID first
    if (element.id) {
        return `#${element.id}`;
    }

    // Try class combination
    if (element.className && typeof element.className === 'string') {
        const classes = element.className.trim().split(/\s+/).slice(0, 3).join('.');
        if (classes) {
            const selector = `${element.tagName.toLowerCase()}.${classes}`;
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }
    }

    // Build path-based selector
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
            selector = `#${current.id}`;
            path.unshift(selector);
            break;
        }

        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(
                (child) => child.tagName === current!.tagName
            );
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }

        path.unshift(selector);
        current = parent;
    }

    return path.join(' > ');
}

/**
 * Highlight element on page
 */
function highlightElement(selector: string): { success: boolean; error?: string } {
    try {
        const element = document.querySelector(selector) as HTMLElement;
        if (!element) {
            return { success: false, error: 'Element not found' };
        }

        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');

        overlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #6366f1;
      border-radius: 4px;
      background: rgba(99, 102, 241, 0.1);
      pointer-events: none;
      z-index: 999999;
      transition: all 0.3s;
    `;

        document.body.appendChild(overlay);
        highlights.push({ element, overlay });

        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

/**
 * Clear all highlights
 */
function clearHighlights(): { success: boolean } {
    highlights.forEach(({ overlay }) => {
        overlay.remove();
    });
    highlights.length = 0;
    return { success: true };
}

/**
 * Simulate click on element
 */
function simulateClick(selector: string): { success: boolean; error?: string } {
    try {
        const element = document.querySelector(selector) as HTMLElement;
        if (!element) {
            return { success: false, error: 'Element not found' };
        }

        element.click();
        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

/**
 * Simulate typing in element
 */
function simulateType(
    selector: string,
    text: string
): { success: boolean; error?: string } {
    try {
        const element = document.querySelector(selector) as HTMLInputElement;
        if (!element) {
            return { success: false, error: 'Element not found' };
        }

        element.focus();
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true };
    } catch (error) {
        return { success: false, error: String(error) };
    }
}

/**
 * Get form data from page
 */
function getFormData(): { success: boolean; data: object } {
    const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input, select, textarea')).map(
            (input) => ({
                name: (input as HTMLInputElement).name,
                type: (input as HTMLInputElement).type,
                value: (input as HTMLInputElement).value,
                placeholder: (input as HTMLInputElement).placeholder,
            })
        ),
    }));

    return { success: true, data: { forms } };
}

/**
 * Get simplified accessibility tree
 */
function getAccessibilityTree(): { success: boolean; data: object } {
    const tree = buildAccessibilityTree(document.body);
    return { success: true, data: tree };
}

/**
 * Build accessibility tree from element
 */
function buildAccessibilityTree(
    element: Element,
    depth = 0
): object | null {
    if (depth > 5) return null; // Limit depth

    const el = element as HTMLElement;
    const role = el.getAttribute('role') || getImplicitRole(el);
    const ariaLabel = el.getAttribute('aria-label');
    const text = el.textContent?.trim().slice(0, 100);

    // Skip hidden elements
    if (el.hidden || el.style.display === 'none') {
        return null;
    }

    const node: {
        role: string;
        name?: string;
        children?: object[];
    } = {
        role: role || el.tagName.toLowerCase(),
    };

    if (ariaLabel) {
        node.name = ariaLabel;
    } else if (text && !el.children.length) {
        node.name = text;
    }

    const children = Array.from(el.children)
        .map((child) => buildAccessibilityTree(child, depth + 1))
        .filter(Boolean) as object[];

    if (children.length > 0) {
        node.children = children;
    }

    return node;
}

/**
 * Get implicit ARIA role for element
 */
function getImplicitRole(element: HTMLElement): string {
    const tagRoles: Record<string, string> = {
        A: 'link',
        BUTTON: 'button',
        INPUT: 'textbox',
        SELECT: 'listbox',
        TEXTAREA: 'textbox',
        IMG: 'img',
        ARTICLE: 'article',
        ASIDE: 'complementary',
        FOOTER: 'contentinfo',
        HEADER: 'banner',
        MAIN: 'main',
        NAV: 'navigation',
        SECTION: 'region',
        FORM: 'form',
        TABLE: 'table',
        UL: 'list',
        OL: 'list',
        LI: 'listitem',
    };

    return tagRoles[element.tagName] || '';
}

// Notify that content script is loaded
console.log('[PraisonAI] Content script loaded');

// ============================================================
// SERVICE WORKER KEEP-ALIVE MECHANISM
// Chrome MV3 service workers terminate after ~30s of inactivity
// Using chrome.runtime.connect keeps the service worker alive
// Ports disconnect after 5 minutes, so we reconnect every 4.5 min
// ============================================================

let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function connectToServiceWorker(): void {
    try {
        // Open a persistent port to the service worker
        keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
        console.log('[PraisonAI] Keep-alive port connected');

        // Handle port disconnect (service worker terminated or 5-min timeout)
        keepAlivePort.onDisconnect.addListener(() => {
            console.log('[PraisonAI] Keep-alive port disconnected, reconnecting...');
            keepAlivePort = null;
            // Reconnect immediately
            setTimeout(connectToServiceWorker, 100);
        });

        // Listen for messages from service worker
        keepAlivePort.onMessage.addListener((msg) => {
            if (msg.type === 'pong') {
                console.log('[PraisonAI] Keep-alive pong received');
            }
        });

        // Send initial ping
        keepAlivePort.postMessage({ type: 'ping', url: location.href });
    } catch (err) {
        console.log('[PraisonAI] Could not connect to service worker:', err);
        // Retry after a delay
        setTimeout(connectToServiceWorker, 1000);
    }
}

// Start the keep-alive connection
connectToServiceWorker();

// Send periodic pings to keep the connection active (every 20 seconds)
keepAliveInterval = setInterval(() => {
    if (keepAlivePort) {
        try {
            keepAlivePort.postMessage({ type: 'ping' });
        } catch (err) {
            console.log('[PraisonAI] Ping failed, reconnecting...');
            connectToServiceWorker();
        }
    } else {
        connectToServiceWorker();
    }
}, 20000);

// Also send the legacy message for backward compatibility
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY', url: location.href })
    .then(() => console.log('[PraisonAI] Service worker pinged'))
    .catch(() => console.log('[PraisonAI] Service worker not responding yet'));
