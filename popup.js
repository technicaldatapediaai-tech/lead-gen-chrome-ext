/**
 * Lead Genius Chrome Extension - Popup Script
 * Auto-connects using the web app session, with email/password fallback
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
    messages: [],
    history: []
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
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    connectBtn: document.getElementById('connectBtn'),
    autoConnectBtn: document.getElementById('autoConnectBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    userEmail: document.getElementById('userEmail'),
    statsSection: document.getElementById('statsSection'),
    queueSection: document.getElementById('queueSection'),
    messageList: document.getElementById('messageList'),
    refreshBtn: document.getElementById('refreshBtn'),
    queuedCount: document.getElementById('queuedCount'),
    sentCount: document.getElementById('sentCount'),
    connectError: document.getElementById('connectError'),
    connectingState: document.getElementById('connectingState'),
    historySection: document.getElementById('historySection'),
    historyList: document.getElementById('historyList')
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load saved state
    const savedState = await chrome.storage.local.get(['token', 'userEmail', 'orgId']);

    if (savedState.token) {
        // Validate saved token is still valid
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/me`, {
                headers: { 'Authorization': `Bearer ${savedState.token}` }
            });

            if (response.ok) {
                const userData = await response.json();
                state.token = savedState.token;
                state.userEmail = userData.email;
                state.orgId = userData.current_org_id;
                state.connected = true;
                updateUI();
                fetchQueue();
                fetchHistory();
                fetchStats();
            } else {
                // Token expired, try auto-connect
                await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
                tryAutoConnect();
            }
        } catch (err) {
            // Backend not reachable
            showError('Backend not reachable. Is the server running?');
        }
    } else {
        // No saved token, try auto-connect
        tryAutoConnect();
    }

    // Event listeners
    elements.connectBtn.addEventListener('click', handleEmailLogin);
    elements.autoConnectBtn.addEventListener('click', tryAutoConnect);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);
    elements.refreshBtn.addEventListener('click', () => {
        fetchQueue();
        fetchHistory();
        fetchStats();
    });

    // Enter key on password
    elements.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleEmailLogin();
    });

    // Auto-refresh stats and queue every 30 seconds if connected
    setInterval(() => {
        if (state.connected) {
            fetchQueue();
            fetchHistory();
            fetchStats();
        }
    }, 30000);
});

// =============================================================================
// AUTO-CONNECT
// =============================================================================

async function tryAutoConnect() {
    showConnecting('Looking for active session...');

    try {
        // Ask the content script on localhost:3000 to send the token
        const tabs = await chrome.tabs.query({ url: '*://localhost:3000/*' });

        if (tabs.length > 0) {
            // Execute script in the web app tab to grab the token
            const results = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: () => {
                    return {
                        token: localStorage.getItem('access_token'),
                        expiresAt: localStorage.getItem('token_expires_at')
                    };
                }
            });

            if (results && results[0] && results[0].result && results[0].result.token) {
                const { token, expiresAt } = results[0].result;

                // Check if token is expired locally
                const isLocallyExpired = expiresAt && Date.now() > parseInt(expiresAt);

                if (isLocallyExpired) {
                    console.log("⏰ Token locally expired, but will try validating with backend anyway...");
                }

                // Validate the token (this is the true test)
                const response = await fetch(`${API_BASE_URL}/api/users/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const userData = await response.json();

                    state.token = token;
                    state.connected = true;
                    state.userEmail = userData.email;
                    state.orgId = userData.current_org_id;

                    await chrome.storage.local.set({
                        token: state.token,
                        userEmail: state.userEmail,
                        orgId: state.orgId
                    });

                    hideConnecting();
                    updateUI();
                    fetchQueue();
                    fetchHistory();
                    fetchStats();
                    return;
                }
            }
        }

        hideConnecting();
        // No web app tab or no token — show login form
    } catch (err) {
        hideConnecting();
        console.error('Auto-connect failed:', err);
    }
}

// =============================================================================
// EMAIL/PASSWORD LOGIN
// =============================================================================

async function handleEmailLogin() {
    const email = elements.emailInput.value.trim();
    const password = elements.passwordInput.value;

    if (!email || !password) {
        showError('Please enter your email and password');
        return;
    }

    hideError();
    showConnecting('Logging in...');

    try {
        // Login using OAuth2 form data (same as the web app)
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            hideConnecting();
            showError(errorData.detail || 'Invalid email or password');
            return;
        }

        const tokenData = await response.json();

        // Fetch user info
        const userResponse = await fetch(`${API_BASE_URL}/api/users/me`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        if (!userResponse.ok) {
            hideConnecting();
            showError('Failed to fetch user info');
            return;
        }

        const userData = await userResponse.json();

        state.token = tokenData.access_token;
        state.connected = true;
        state.userEmail = userData.email;
        state.orgId = userData.current_org_id;

        // Save to storage
        await chrome.storage.local.set({
            token: state.token,
            userEmail: state.userEmail,
            orgId: state.orgId
        });

        hideConnecting();
        updateUI();
        fetchQueue();
        fetchHistory();
        fetchStats();
    } catch (error) {
        hideConnecting();
        showError('Connection failed. Is the server running?');
    }
}

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

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        console.warn('🔒 Unauthorized. Logging out...');
        handleDisconnect();
        throw new Error('Session expired. Please login again.');
    }

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
    } catch (error) {
        console.error('Failed to fetch queue:', error);
    }
}

async function fetchHistory() {
    try {
        const data = await apiCall('/api/extension/history');
        state.history = data.messages;
        renderHistory();
    } catch (error) {
        console.error('Failed to fetch history:', error);
    }
}

async function fetchStats() {
    try {
        const data = await apiCall('/api/extension/stats');
        if (elements.queuedCount) elements.queuedCount.textContent = data.queued;
        if (elements.sentCount) elements.sentCount.textContent = data.sent;
    } catch (error) {
        console.error('Failed to fetch stats:', error);
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleDisconnect() {
    state = {
        connected: false,
        token: null,
        userEmail: null,
        orgId: null,
        messages: [],
        history: []
    };

    await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
    updateUI();
}

function handleMessageClick(message) {
    let url = message.linkedin_url;
    if (url && !url.startsWith('http')) {
        if (url.startsWith('www.')) url = 'https://' + url;
        else if (url.startsWith('linkedin.com')) url = 'https://' + url;
        else url = 'https://www.linkedin.com/' + url.replace(/^\//, '');
    }

    console.log("📍 Opening LinkedIn page:", url);

    chrome.tabs.create({ url: url }, (tab) => {
        chrome.storage.local.set({
            pendingMessage: {
                id: message.id,
                content: message.message,
                messageType: message.message_type || 'inmail',
                linkedinUrl: url
            }
        });
    });
}

// =============================================================================
// UI HELPERS
// =============================================================================

function showError(msg) {
    if (elements.connectError) elements.connectError.textContent = msg;
    elements.connectError.style.display = 'block';
}

function hideError() {
    elements.connectError.style.display = 'none';
}

function showConnecting(msg) {
    if (elements.connectingState) {
        const span = elements.connectingState.querySelector('span');
        if (span) span.textContent = msg;
    }
    elements.connectingState.style.display = 'flex';
    elements.connectBtn.style.display = 'none';
}

function hideConnecting() {
    elements.connectingState.style.display = 'none';
    elements.connectBtn.style.display = 'block';
}

// =============================================================================
// UI UPDATES
// =============================================================================

function updateUI() {
    hideError();
    hideConnecting();

    if (state.connected) {
        elements.statusBadge.className = 'status-badge connected';
        elements.statusBadge.querySelector('.dot').className = 'dot connected';
        if (elements.statusText) elements.statusText.textContent = 'Connected';
        elements.authSection.classList.add('connected');

        elements.loginForm.style.display = 'none';
        elements.connectedInfo.style.display = 'block';
        if (elements.userEmail) elements.userEmail.textContent = state.userEmail;

        elements.statsSection.style.display = 'block';
        elements.queueSection.style.display = 'block';
        elements.historySection.style.display = 'block';
    } else {
        elements.statusBadge.className = 'status-badge disconnected';
        elements.statusBadge.querySelector('.dot').className = 'dot disconnected';
        if (elements.statusText) elements.statusText.textContent = 'Not Connected';
        elements.authSection.classList.remove('connected');

        elements.loginForm.style.display = 'block';
        elements.connectedInfo.style.display = 'none';
        elements.emailInput.value = '';
        elements.passwordInput.value = '';

        elements.statsSection.style.display = 'none';
        elements.queueSection.style.display = 'none';
        elements.historySection.style.display = 'none';
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

    elements.messageList.innerHTML = state.messages.map(msg => {
        const typeIcon = msg.message_type === 'connection' ? '🔗' : '💬';
        const typeLabel = msg.message_type === 'connection' ? 'Connection' : 'InMail';
        return `
    <div class="message-item" data-id="${msg.id}" data-url="${msg.linkedin_url}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="message-lead">${msg.lead_name}</div>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${msg.message_type === 'connection' ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)'};color:${msg.message_type === 'connection' ? '#60a5fa' : '#a78bfa'}">${typeIcon} ${typeLabel}</span>
      </div>
      <div class="message-company">${msg.lead_company || 'No company'}</div>
      <div class="message-preview">${msg.message}</div>
    </div>
  `;
    }).join('');

    elements.messageList.querySelectorAll('.message-item').forEach(item => {
        item.addEventListener('click', () => {
            const message = state.messages.find(m => m.id === item.dataset.id);
            if (message) {
                handleMessageClick(message);
            }
        });
    });
}

function renderHistory() {
    if (state.history.length === 0) {
        elements.historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>No recent activity</p>
      </div>
    `;
        return;
    }

    elements.historyList.innerHTML = state.history.map(msg => {
        const typeIcon = msg.message_type === 'connection' ? '🔗' : '💬';
        const date = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
    <div class="history-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="message-lead">${msg.lead_name}</div>
        <span style="font-size:10px;color:rgba(255,255,255,0.4)">${date}</span>
      </div>
      <div class="message-company">${msg.lead_company || 'No company'}</div>
      <div style="margin-top:4px">
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(16,185,129,0.15);color:#10b981">✨ Sent ${typeIcon}</span>
      </div>
    </div>
  `;
    }).join('');
}
