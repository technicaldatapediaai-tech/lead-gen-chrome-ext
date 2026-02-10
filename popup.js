/**
 * Lead Genius Chrome Extension - Popup Script
 * Handles authentication and message queue display
 */

const API_BASE_URL = 'http://localhost:8000';

// =============================================================================
// STATE
// =============================================================================

let state = {
    connected: false,
    token: null,
    userEmail: null,
    orgId: null,
    messages: []
};

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
    authSection: document.getElementById('authSection'),
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    loginForm: document.getElementById('loginForm'),
    connectedInfo: document.getElementById('connectedInfo'),
    apiToken: document.getElementById('apiToken'),
    connectBtn: document.getElementById('connectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    userEmail: document.getElementById('userEmail'),
    statsSection: document.getElementById('statsSection'),
    queueSection: document.getElementById('queueSection'),
    messageList: document.getElementById('messageList'),
    refreshBtn: document.getElementById('refreshBtn'),
    queuedCount: document.getElementById('queuedCount'),
    sentCount: document.getElementById('sentCount')
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load saved state
    const savedState = await chrome.storage.local.get(['token', 'userEmail', 'orgId']);

    if (savedState.token) {
        state.token = savedState.token;
        state.userEmail = savedState.userEmail;
        state.orgId = savedState.orgId;
        state.connected = true;
        updateUI();
        fetchQueue();
        fetchStats();
    }

    // Event listeners
    elements.connectBtn.addEventListener('click', handleConnect);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);
    elements.refreshBtn.addEventListener('click', fetchQueue);
});

// =============================================================================
// API CALLS
// =============================================================================

async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
}

async function fetchQueue() {
    try {
        const data = await apiCall('/api/extension/queue');
        state.messages = data.messages;
        renderMessageQueue();
        elements.queuedCount.textContent = data.count;
    } catch (error) {
        console.error('Failed to fetch queue:', error);
    }
}

async function fetchStats() {
    try {
        const data = await apiCall('/api/extension/stats');
        elements.queuedCount.textContent = data.queued;
        elements.sentCount.textContent = data.sent;
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

async function updateMessageStatus(messageId, status, error = null) {
    try {
        await apiCall(`/api/extension/messages/${messageId}/status`, {
            method: 'POST',
            body: JSON.stringify({
                status,
                error_message: error
            })
        });
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleConnect() {
    const token = elements.apiToken.value.trim();

    if (!token) {
        alert('Please enter your API token');
        return;
    }

    try {
        // Test the token by fetching user profile
        state.token = token;
        const userData = await apiCall('/api/users/me');

        state.connected = true;
        state.userEmail = userData.email;
        state.orgId = userData.current_org_id;

        // Save to storage
        await chrome.storage.local.set({
            token: state.token,
            userEmail: state.userEmail,
            orgId: state.orgId
        });

        updateUI();
        fetchQueue();
        fetchStats();
    } catch (error) {
        alert('Invalid token or connection failed');
        state.token = null;
    }
}

async function handleDisconnect() {
    state = {
        connected: false,
        token: null,
        userEmail: null,
        orgId: null,
        messages: []
    };

    await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
    updateUI();
}

function handleMessageClick(message) {
    // Open LinkedIn profile and send message
    chrome.tabs.create({ url: message.linkedin_url }, (tab) => {
        // Store message info for content script to pick up
        chrome.storage.local.set({
            pendingMessage: {
                id: message.id,
                content: message.message,
                linkedinUrl: message.linkedin_url
            }
        });
    });
}

// =============================================================================
// UI UPDATES
// =============================================================================

function updateUI() {
    if (state.connected) {
        // Connected state
        elements.statusBadge.className = 'status-badge connected';
        elements.statusBadge.querySelector('.dot').className = 'dot connected';
        elements.statusText.textContent = 'Connected';
        elements.authSection.classList.add('connected');

        elements.loginForm.style.display = 'none';
        elements.connectedInfo.style.display = 'block';
        elements.userEmail.textContent = state.userEmail;

        elements.statsSection.style.display = 'block';
        elements.queueSection.style.display = 'block';
    } else {
        // Disconnected state
        elements.statusBadge.className = 'status-badge disconnected';
        elements.statusBadge.querySelector('.dot').className = 'dot disconnected';
        elements.statusText.textContent = 'Not Connected';
        elements.authSection.classList.remove('connected');

        elements.loginForm.style.display = 'block';
        elements.connectedInfo.style.display = 'none';
        elements.apiToken.value = '';

        elements.statsSection.style.display = 'none';
        elements.queueSection.style.display = 'none';
    }
}

function renderMessageQueue() {
    if (state.messages.length === 0) {
        elements.messageList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No messages in queue</p>
      </div>
    `;
        return;
    }

    elements.messageList.innerHTML = state.messages.map(msg => `
    <div class="message-item" data-id="${msg.id}" data-url="${msg.linkedin_url}">
      <div class="message-lead">${msg.lead_name}</div>
      <div class="message-company">${msg.lead_company || 'No company'}</div>
      <div class="message-preview">${msg.message}</div>
    </div>
  `).join('');

    // Add click handlers
    elements.messageList.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => {
            const message = state.messages.find(m => m.id === item.dataset.id);
            if (message) {
                handleMessageClick(message);
            }
        });
    });
}
