/**
 * Lead Genius Chrome Extension - Background Service Worker
 * Handles API communication and message status updates
 */

const API_BASE_URL = 'http://localhost:8000';

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateStatus') {
        updateMessageStatus(request.messageId, request.status, request.error_message)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }

    if (request.action === 'startQueueProcessing') {
        processQueue()
            .then(count => sendResponse({ success: true, count }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
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

        if (!response.ok) return 0;

        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
            const msg = data.messages[0];
            console.log("🚀 Processing:", msg.lead_name);

            // Store for content script
            await chrome.storage.local.set({
                pendingMessage: {
                    id: msg.id,
                    content: msg.message,
                    linkedinUrl: msg.linkedin_url
                }
            });

            // Mark as sending effectively to avoid double fetch
            await updateMessageStatus(msg.id, 'sending');

            // Navigate
            const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { url: msg.linkedin_url, active: true });
            } else {
                chrome.tabs.create({ url: msg.linkedin_url });
            }
            return 1;
        }
    } catch (error) {
        console.error("Queue error:", error);
    }
    return 0;
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

// =============================================================================
// BADGE UPDATES
// =============================================================================

async function updateBadge() {
    try {
        const token = await getToken();

        if (!token) {
            chrome.action.setBadge({ text: '' });
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

// Update badge periodically
setInterval(updateBadge, 60000); // Every minute

// Update on install/startup
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
