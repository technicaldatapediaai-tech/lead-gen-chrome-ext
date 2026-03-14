/**
 * Lead Genius Chrome Extension - Background Service Worker
 * Handles API communication and message status updates
 */

// Helper to get API URL - defaults to local, then Render
let API_BASE_URL = 'http://localhost:8000'; 

// Check if we should use production
async function refreshApiBaseUrl() {
    const data = await chrome.storage.local.get('apiBaseUrl');
    if (data.apiBaseUrl) {
        API_BASE_URL = data.apiBaseUrl;
    } else {
        // Fallback check
        try {
            const res = await fetch('http://localhost:8000/health', { method: 'HEAD' });
            if (!res.ok) throw new Error();
        } catch (e) {
            API_BASE_URL = 'https://lead-gen-backend-dcxf.onrender.com';
        }
    }
}
refreshApiBaseUrl();

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Heartbeat check from content script
    if (request.action === 'heartbeat') {
        sendResponse({ alive: true });
        return false;
    }

    if (request.action === 'updateStatus') {
        updateMessageStatus(request.messageId, request.status, request.error_message)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'startQueueProcessing') {
        processQueue()
            .then(count => sendResponse({ success: true, count }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'syncLead') {
        syncLeadToCrm(request.leadData)
            .then(res => sendResponse({ success: true, data: res }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'sendDirectMessage') {
        sendDirectMessage(request.payload)
            .then(res => sendResponse({ success: true, data: res }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (request.action === 'setApiUrl') {
        chrome.storage.local.set({ apiBaseUrl: request.url });
        API_BASE_URL = request.url;
        sendResponse({ success: true });
        return false;
    }
});

async function processQueue() {
    console.log("🔄 Checking queue...");
    const token = await getToken();
    if (!token) {
        console.log("❌ No token");
        return 0;
    }

    try {
        // Fetch 1 pending message
        const response = await fetch(`${API_BASE_URL}/api/extension/queue?limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            console.log("❌ Token invalid/expired. Logging out.");
            await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
            chrome.action.setBadgeText({ text: '' });
            return 0;
        }

        if (!response.ok) return 0;

        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
            const msg = data.messages[0];
            console.log("🚀 Processing:", msg.lead_name);

            // Normalize URL
            let url = msg.linkedin_url;
            if (url && !url.startsWith('http')) {
                if (url.startsWith('www.')) url = 'https://' + url;
                else if (url.startsWith('linkedin.com')) url = 'https://' + url;
                else url = 'https://www.linkedin.com/' + url.replace(/^\//, '');
            }

            // Store for content script
            await chrome.storage.local.set({
                pendingMessage: {
                    id: msg.id,
                    content: msg.message,
                    messageType: msg.message_type || 'inmail',
                    linkedinUrl: url
                }
            });

            // Mark as sending effectively to avoid double fetch
            await updateMessageStatus(msg.id, 'sending');

            // Navigate
            // Navigate and wait for load
            console.log("📍 Navigating to:", url);
            const tabsQuery = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
            const activeTab = tabsQuery.find(t => t.active);

            let targetTabId;
            if (activeTab) {
                targetTabId = activeTab.id;
                await chrome.tabs.update(targetTabId, { url: url, active: true });
            } else if (tabsQuery.length > 0) {
                targetTabId = tabsQuery[0].id;
                await chrome.tabs.update(targetTabId, { url: url, active: true });
            } else {
                const newTab = await chrome.tabs.create({ url: url });
                targetTabId = newTab.id;
            }

            // PERMANENT FIX: Wait for the tab to update then nudge the content script
            // We use a small timeout to let the SPA transitions settle
            setTimeout(() => {
                chrome.tabs.sendMessage(targetTabId, { action: 'triggerCheck' }).catch(() => {
                    // Ignore errors if script isn't loaded yet, it'll run on init anyway
                });
            }, 1200);

            return 1;
        }
    } catch (error) {
        console.error("❌ Queue error:", error);
    }
    return 0;
}

/**
 * WATCHDOG: Periodically checks if the queue is stuck.
 * If there are pending messages but the extension isn't doing anything, it restarts.
 * It also resets messages that have been in 'sending' for more than 5 minutes.
 */
async function runWatchdog() {
    console.log("🕵️ Lead Genius Watchdog checking state...");
    const token = await getToken();
    if (!token) return;

    try {
        // 1. Check for stuck messages (calling the backend to verify)
        const statsRes = await fetch(`${API_BASE_URL}/api/extension/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (statsRes.ok) {
            const stats = await statsRes.json();
            // If we have messages but nothing is happening (this is a heuristic), nudge the queue
            if ((stats.queued > 0 || stats.pending > 0)) {
                console.log(`🕵️ Watchdog: Found ${stats.queued + stats.pending} messages. Nudging queue...`);
                // Check if we already have a pending message in storage
                const data = await chrome.storage.local.get('pendingMessage');
                if (!data.pendingMessage) {
                    processQueue();
                }
            }
        }
    } catch (e) {
        console.error("🕵️ Watchdog error:", e);
    }
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function getToken() {
    const data = await chrome.storage.local.get('token');
    return data.token;
}

async function updateMessageStatus(messageId, status, errorMessage = null) {
    const token = await getToken();

    if (!token) {
        console.error('No auth token found');
        return;
    }

    const response = await fetch(`${API_BASE_URL}/api/extension/messages/${messageId}/status`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status,
            error_message: errorMessage
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to update status: ${response.status}`);
    }

    return response.json();
}

async function syncLeadToCrm(leadData) {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE_URL}/api/extension/leads/sync`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
    });

    if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
    }

    return response.json();
}

async function sendDirectMessage(payload) {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");

    const response = await fetch(`${API_BASE_URL}/api/linkedin/send`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`API Send failed: ${response.status}`);
    }

    return response.json();
}

// =============================================================================
// BADGE UPDATES
// =============================================================================

async function updateBadge() {
    try {
        const token = await getToken();

        if (!token) {
            chrome.action.setBadgeText({ text: '' });
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/extension/stats`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const stats = await response.json();
            const queuedCount = stats.queued || 0;

            if (queuedCount > 0) {
                chrome.action.setBadgeText({ text: String(queuedCount) });
                chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
            } else {
                chrome.action.setBadgeText({ text: '' });
            }
        }
    } catch (error) {
        console.error('Failed to update badge:', error);
    }
}

/**
 * Heartbeat Mechanism: Pings all LinkedIn tabs to ensure content scripts are alive.
 * If a tab is dead (context invalidated), it attempts a silent re-injection.
 */
async function checkTabsHealth() {
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });

    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (err) {
            console.log(`🔌 Lead Genius: Heartbeat failed for tab ${tab.id}. Attempting silent recovery...`);

            // Attempt to re-inject the content script if it's a valid LinkedIn URL
            if (tab.url && tab.url.includes('linkedin.com')) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                }).then(() => {
                    console.log(`✅ Lead Genius: Successfully re-injected agent into tab ${tab.id}`);
                }).catch(e => {
                    console.log(`⚠️ Lead Genius: Recovery skipped for tab ${tab.id}:`, e.message);
                });
            }
        }
    }
}

// Update badge and check health periodically
setInterval(updateBadge, 60000);
setInterval(checkTabsHealth, 30000); // Check context every 30s
setInterval(runWatchdog, 120000);   // Run watchdog every 2 minutes

// Update on install/startup
chrome.runtime.onInstalled.addListener(() => {
    updateBadge();
    // Auto-start queue on install/update if logged in
    setTimeout(processQueue, 2000);
});

chrome.runtime.onStartup.addListener(() => {
    updateBadge();
    // Auto-start queue on browser startup if logged in
    setTimeout(processQueue, 5000);
});

// Immediate start when background script loads
setTimeout(processQueue, 3000);
