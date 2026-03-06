/**
 * Lead Genius Chrome Extension - Content Script
 * Runs on LinkedIn pages to help send messages and extract data
 * Also runs on localhost:3000 to auto-capture auth token
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const SELECTORS = {
  // InMail / Direct Message selectors
  messageButton: 'button[aria-label*="Message"]',
  messageTextarea: '.msg-form__contenteditable',
  sendButton: 'button[type="submit"].msg-form__send-button',

  // Connection Request selectors
  connectButton: 'button[aria-label*="Invite"], button[aria-label*="Connect"], button.pvs-profile-actions__action[aria-label*="connect" i]',
  connectButtonMore: 'button[aria-label="More actions"]',
  connectInDropdown: 'div[aria-label*="connect" i], span[class*="artdeco"]',
  addNoteButton: 'button[aria-label="Add a note"]',
  connectionNoteTextarea: 'textarea[name="message"], textarea#custom-message',
  sendConnectionButton: 'button[aria-label="Send invitation"], button[aria-label="Send now"]',

  // Profile selectors
  profileName: '.text-heading-xlarge',
  profileHeadline: '.text-body-medium',

  // Post selectors
  postContainer: '.feed-shared-update-v2',
  postContent: '.update-components-text',
  postActorName: '.update-components-actor__name',
  postActorHeadline: '.update-components-actor__description',
  socialCounts: '.social-details-social-counts__reactions-count',
  commentsContainer: '.comments-comments-list',
  commentItem: '.comments-comments-list__comment-item',
  commentAuthor: '.comments-post-meta__name-text',
  commentText: '.comments-comment-item__main-content',
};

const API_BASE_URL = 'http://localhost:8000';

// =============================================================================
// AUTO-CONNECT: Grab token from the Lead Genius web app (localhost:3000)
// =============================================================================

async function autoConnectFromWebApp() {
  // Only run on the Lead Genius web app
  if (!window.location.origin.includes('localhost:3000')) return;

  // Check if extension context is still valid
  if (!isExtensionValid()) return;

  console.log('🔗 Lead Genius extension detected on web app, checking for auth token...');
  // ... rest of code follows the same logic, wrapped in a try/catch if needed
  try {
    // Try to read token from the web app's localStorage
    const token = localStorage.getItem('access_token');

    if (token) {
      // Validate the token is not expired (local check)
      const expiresAt = localStorage.getItem('token_expires_at');
      if (expiresAt && Date.now() > parseInt(expiresAt)) {
        console.log('⏰ Token locally expired, but will try validating with backend anyway...');
      }

      // Check if we already have this token saved
      const saved = await chrome.storage.local.get(['token']);
      if (saved.token === token) {
        console.log('✅ Extension already connected with current token');
        showConnectionBadge('connected');
        return;
      }

      // Validate token against the backend
      const response = await fetch(`${API_BASE_URL}/api/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const userData = await response.json();

        // Save to Chrome extension storage
        await chrome.storage.local.set({
          token: token,
          userEmail: userData.email,
          orgId: userData.current_org_id
        });

        console.log(`✅ Extension auto-connected as ${userData.email}`);
        showConnectionBadge('connected', userData.email);
      } else {
        console.log('❌ Token validation failed');
        showConnectionBadge('error');
      }
    } else {
      console.log('ℹ️ No token found - user not logged in yet');

      // Clear extension storage if user logged out from web app
      const saved = await chrome.storage.local.get(['token']);
      if (saved.token) {
        await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
        console.log('🔓 Extension disconnected (user logged out of web app)');
        showConnectionBadge('disconnected');
      }
    }
  } catch (err) {
    if (err.message.includes('context invalidated')) {
      console.log('🔌 Extension context invalidated during auto-connect');
    } else {
      console.log('❌ Auth error:', err.message);
    }
  }
}

function showConnectionBadge(status, email = '') {
  // Remove existing badge
  const existing = document.getElementById('lg-connection-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = 'lg-connection-badge';

  const colors = {
    connected: { bg: 'rgba(16, 185, 129, 0.95)', border: '#10b981', icon: '✅', text: `Extension connected${email ? ` • ${email}` : ''}` },
    disconnected: { bg: 'rgba(239, 68, 68, 0.95)', border: '#ef4444', icon: '🔓', text: 'Extension disconnected' },
    error: { bg: 'rgba(245, 158, 11, 0.95)', border: '#f59e0b', icon: '⚠️', text: 'Token expired — please re-login' },
  };

  const c = colors[status] || colors.disconnected;

  badge.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 99999;
    background: ${c.bg}; color: white; padding: 10px 16px;
    border-radius: 10px; font-family: -apple-system, sans-serif; font-size: 13px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3); backdrop-filter: blur(10px);
    border: 1px solid ${c.border}; display: flex; align-items: center; gap: 8px;
    transition: all 0.4s ease; cursor: default;
    animation: lg-slide-in 0.4s ease-out;
  `;

  badge.innerHTML = `<span>${c.icon}</span><span style="font-weight:500">Lead Genius</span><span style="opacity:0.85">—</span><span style="opacity:0.85">${c.text}</span>`;

  // Add animation keyframes
  if (!document.getElementById('lg-badge-styles')) {
    const style = document.createElement('style');
    if (style) {
      style.id = 'lg-badge-styles';
      style.textContent = `
        @keyframes lg-slide-in {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes lg-fade-out {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(30px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  document.body.appendChild(badge);

  // Auto-hide after 5 seconds
  setTimeout(() => {
    badge.style.animation = 'lg-fade-out 0.4s ease-in forwards';
    setTimeout(() => badge.remove(), 400);
  }, 5000);
}

// =============================================================================
// LIFECYCLE MANAGEMENT (PROTECTION AGAINST CONTEXT INVALIDATION)
// =============================================================================

/**
 * Checks if the extension context is still valid.
 * This is the most critical check to prevent "Extension context invalidated" errors.
 */
function isExtensionValid() {
  try {
    // Both chrome.runtime.id and getURL should be available in a valid context
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

/**
 * Check if this content script is an 'orphan' (extension disconnected)
 */
function isOrphaned() {
  return !isExtensionValid();
}

/**
 * Semantic Ranker: A fuzzy search engine for finding LinkedIn UI elements
 * based on multiple signals (text, aria-label, roles, classes).
 */
function findSemanticElement(goal) {
  if (isOrphaned()) return null;

  const candidates = Array.from(document.querySelectorAll('button, a.artdeco-button, div[role="button"], li[role="menuitem"], .artdeco-dropdown__item'));

  const goalMap = {
    'message': {
      keywords: ['message', 'inmail', 'send message'],
      ariaKeywords: ['message', 'inmail'],
      negative: ['close', 'open', 'request', 'follow', 'dismiss'],
      priorityClass: 'artdeco-button--primary'
    },
    'connect': {
      keywords: ['connect', 'invite', 'send invitation'],
      ariaKeywords: ['connect', 'invite', 'invitation'],
      negative: ['message', 'follow', 'visit', 'more'],
      priorityClass: 'artdeco-button--primary'
    },
    'send': {
      keywords: ['send', 'send now', 'send invitation', 'done'],
      ariaKeywords: ['send'],
      negative: ['cancel', 'discard', 'dismiss'],
      priorityClass: 'artdeco-button--primary'
    },
    'add-note': {
      keywords: ['add a note', 'add note', 'personalize'],
      ariaKeywords: ['note'],
      negative: ['send', 'cancel'],
      priorityClass: ''
    }
  };

  const config = goalMap[goal];
  if (!config) return null;

  let bestCandidate = null;
  let maxScore = -1;

  for (const el of candidates) {
    // Basic visibility & usability check
    if (el.disabled || el.offsetParent === null) continue;

    let score = 0;
    const text = el.innerText.trim().toLowerCase();
    const label = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const combined = `${text} ${label} ${title}`;

    // 1. Direct Text/Keyword Match
    if (config.keywords.some(k => text === k)) score += 20;
    else if (config.keywords.some(k => text.includes(k))) score += 10;

    // 2. Aria-Label Match
    if (config.ariaKeywords.some(k => label.includes(k))) score += 15;

    // 3. Negative Filter (Penalty for wrong buttons)
    if (config.negative.some(k => combined.includes(k))) score -= 30;

    // 4. Visual Priority (Premium buttons)
    if (config.priorityClass && el.classList.contains(config.priorityClass)) score += 5;

    // 5. Container context (Action Bars get boost)
    if (el.closest('.pvs-profile-actions, .pv-top-card-v2-ctas, .pv-top-card--list')) score += 10;
    if (el.closest('.artdeco-modal__actionbar, .msg-form__footer')) score += 12;

    if (score > maxScore && score > 0) {
      maxScore = score;
      bestCandidate = el;
    }
  }

  return bestCandidate;
}

/**
 * Safely sends a message to the background script.
 * Handles "Could not establish connection" and other communication errors.
 */
async function safeSendMessage(message, retries = 1) {
  if (!isExtensionValid()) return null;

  for (let i = 0; i <= retries; i++) {
    try {
      // Use the promise-based version of sendMessage
      const response = await chrome.runtime.sendMessage(message);
      return response;
    } catch (err) {
      const errorMsg = err?.message || String(err);

      // If context is completely gone, don't even log standard error
      if (errorMsg.includes('context invalidated')) {
        return null;
      }

      // Log for debugging but don't throw
      if (i === retries) {
        console.log(`ℹ️ Lead Genius: Message delivery skipped:`, errorMsg);
      } else {
        // Short sleep before retry
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  return null;
}

/**
 * Safely accesses storage.
 */
async function safeStorageGet(keys) {
  if (!isExtensionValid()) return {};
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    return {};
  }
}

// Watch for login/logout changes on the web app page
let authWatcherInterval = null;
function startAuthWatcher() {
  if (!window.location.origin.includes('localhost:3000')) return;

  // Clear any existing interval just in case
  if (authWatcherInterval) clearInterval(authWatcherInterval);

  authWatcherInterval = setInterval(async () => {
    // CRITICAL: Check context validity before EVERY iteration
    if (!isExtensionValid()) {
      console.log('🔌 Lead Genius: Context invalidated - stopping watcher');
      if (authWatcherInterval) clearInterval(authWatcherInterval);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const saved = await safeStorageGet(['token']);

      if (token && !saved.token) {
        // User just logged in
        autoConnectFromWebApp();
      } else if (!token && saved.token) {
        // User just logged out
        await chrome.storage.local.remove(['token', 'userEmail', 'orgId']).catch(() => { });
        console.log('🔓 Lead Genius: Extension auto-disconnected (logout)');
        showConnectionBadge('disconnected');
      }
    } catch (e) {
      // Catch-all to prevent interval crashes
      if (e?.message?.includes('context invalidated')) {
        if (authWatcherInterval) clearInterval(authWatcherInterval);
      }
    }
  }, 4000); // 4 seconds is enough for background watching
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(function init() {
  if (!isExtensionValid()) return;

  console.log('🚀 Lead Genius extension initialized');

  // Auto-connect if on the web app
  if (window.location.origin.includes('localhost:3000')) {
    autoConnectFromWebApp();
    startAuthWatcher();
  }

  // LinkedIn-specific functionality
  if (window.location.hostname.includes('linkedin.com')) {
    checkPendingMessage();
    checkForPostPage();
    if (window.location.href.includes('/in/')) {
      setTimeout(showExtractionHelper, 2000);
    }

    // SPA Support: Watch for URL changes that don't trigger a reload
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('🔄 URL changed (SPA), re-checking messaging...');
        setTimeout(() => {
          checkPendingMessage();
          if (window.location.href.includes('/in/')) {
            showExtractionHelper();
          }
        }, 1000);
      }
    });
    observer.observe(document, { subtree: true, childList: true });

    // Start health checks
    startHeartbeat();
  }
})();

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!isExtensionValid()) return false;

  if (request.action === 'ping') {
    sendResponse({ alive: true });
  } else if (request.action === 'fillMessage') {
    fillMessage(request.content);
    sendResponse({ success: true });
  } else if (request.action === 'triggerCheck') {
    console.log('🔔 Received trigger check from background');
    checkPendingMessage();
    sendResponse({ success: true });
  }
  return true;
});

/**
 * Proactive Heartbeat: Periodically pings the background script to verify context.
 */
function startHeartbeat() {
  setInterval(async () => {
    if (isOrphaned()) return;
    try {
      await chrome.runtime.sendMessage({ action: 'heartbeat' });
    } catch (e) {
      console.log('🔌 Lead Genius: Heartbeat failed, script may be orphaned.');
    }
  }, 10000); // 10s heartbeat
}

// Listen for messages from the Dashboard (Web App)
window.addEventListener("message", async (event) => {
  if (event.source !== window || !isExtensionValid()) return;

  const { type, payload } = event.data;

  try {
    if (type === "LEAD_GENIUS_CONNECT") {
      console.log("🔗 Lead Genius: Received token from Dashboard");
      await chrome.storage.local.set({ token: payload.token });
    }

    if (type === "LEAD_GENIUS_START_BATCH") {
      console.log("🚀 Lead Genius: Batch signal received");
      safeSendMessage({ action: "startQueueProcessing" });
    }

    if (type === "LEAD_GENIUS_START_SINGLE") {
      console.log("🚀 Lead Genius: Single lead priority received", payload);
      // Wait a moment for database persistence, then process
      setTimeout(() => {
        safeSendMessage({ action: "startQueueProcessing" });
      }, 500);
    }
  } catch (e) {
    // Context issues handled by safeSendMessage and isExtensionValid
  }
});

// =============================================================================
// LINKEDIN FUNCTIONS
// =============================================================================

// =============================================================================
// LINKEDIN FUNCTIONS
// =============================================================================

function checkForPostPage() {
  if (window.location.href.includes('/posts/') || window.location.href.includes('/feed/update/')) {
    console.log('📄 Detected LinkedIn Post Page');
    setTimeout(() => {
      showExtractionHelper();
    }, 2000);
  }
}

async function checkPendingMessage() {
  // Stability delay for SPAs
  await sleep(1500);

  const data = await chrome.storage.local.get('pendingMessage');

  if (data.pendingMessage) {
    const { id, content, messageType, linkedinUrl } = data.pendingMessage;
    const currentUrl = window.location.href;

    console.log(`📋 Pending message check: type=${messageType}, target=${linkedinUrl}`);

    // Check if we're on LinkedIn authwall/login page — user isn't logged in
    if (currentUrl.includes('/authwall') || currentUrl.includes('/login') ||
      currentUrl.includes('/signup') || currentUrl.includes('/checkpoint')) {
      console.log("🔒 LinkedIn requires login — cannot automate");
      await chrome.storage.local.remove('pendingMessage');
      showProcessingOverlay("🔒 Please log into LinkedIn first, then retry from the extension.", "error");
      updateMessageStatus(id, 'failed', 'LinkedIn login required - please log into LinkedIn first');
      return;
    }

    // Check for Sales Navigator
    if (currentUrl.includes('linkedin.com/sales/')) {
      console.log("💼 Sales Navigator detected - using standard LinkedIn logic (limited support)");
    }

    // Check if we're on the correct profile page
    // We normalize the URLs to ignore trailing slashes and 'www.'
    const normalize = (u) => u?.replace(/\/$/, '').replace('https://www.', 'https://').replace('http://', 'https://').split('?')[0];
    const targetUrl = normalize(linkedinUrl);
    const currentUrlNormalized = normalize(currentUrl);

    // Identify profile slug
    const profileSlug = targetUrl.split('/in/')[1]?.split(/[?#]/)[0];
    const isCorrectProfile = profileSlug && currentUrlNormalized.includes(`/in/${profileSlug}`);

    // Fallback for Sales Navigator URLs if they contain the slug
    const isSalesProfile = profileSlug && currentUrl.includes('/sales/people/') && currentUrl.includes(profileSlug);

    if (!isCorrectProfile && !isSalesProfile) {
      console.log(`⏳ On wrong page. Target: ${profileSlug}, Current: ${currentUrlNormalized}`);

      // If we've been on this wrong page for a while, it might be a redirected URL or 404
      // We'll give it 5 seconds then mark as failed so the queue can continue
      showProcessingOverlay(`⏳ Wrong profile detected. Redirecting or skipping in 5s...`, "info");
      setTimeout(async () => {
        const stillData = await chrome.storage.local.get('pendingMessage');
        if (stillData.pendingMessage && stillData.pendingMessage.id === id) {
          await updateMessageStatus(id, 'failed', `URL mismatch: Page is ${currentUrlNormalized}, expected profile matching ${profileSlug}`);
          await chrome.storage.local.remove('pendingMessage');
          removeOverlay();
          await safeSendMessage({ action: "startQueueProcessing" });
        }
      }, 5000);
      return;
    }

    const resolvedType = messageType || 'inmail';
    console.log(`🤖 Starting automated ${resolvedType} sequence...`);

    // remove from storage so it doesn't trigger twice if page refreshes
    await chrome.storage.local.remove('pendingMessage');

    showProcessingOverlay(`🤖 AI Agent: Initiating ${resolvedType === 'connection' ? 'connection request' : 'message'} sequence...`);

    // Give LinkedIn some time to render the action buttons
    await sleep(800);

    try {
      if (resolvedType === 'connection') {
        await executeConnectionRequest({ id, message: content });
      } else {
        await executeAutomatedSending({ id, message: content });
      }
    } catch (err) {
      console.error("Automation failed:", err);
      const cleanError = err.message.replace("Timeout waiting for element", "Page took too long to load");
      showProcessingOverlay("❌ " + cleanError, "error");
      await updateMessageStatus(id, 'failed', cleanError);

      // Tell background to continue
      await sleep(3000);
      removeOverlay();
      await safeSendMessage({ action: "startQueueProcessing" });
    }
  }
}

/**
 * Robust helper to find the "Message" button on a LinkedIn profile
 */
function findMessageButton() {
  return findSemanticElement('message');
}

/**
 * Execute sending a regular LinkedIn message (InMail/Message)
 */
async function executeAutomatedSending(messageData) {
  console.log("📤 Lead Genius: Messaging execution", messageData);
  showProcessingOverlay("1/4: Looking for Message button...");

  try {
    // 1. Find message button (try a few times if page is still loading)
    let messageBtn = null;
    for (let i = 0; i < 5; i++) {
      messageBtn = findMessageButton();
      if (messageBtn) break;
      await sleep(1000);
    }

    // If not found, try the "More" dropdown
    if (!messageBtn) {
      console.log("🔍 Message button not visible, checking 'More' menu...");
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => {
        const text = b.innerText;
        const label = b.getAttribute('aria-label') || '';
        return (text.includes('More') || label.toLowerCase().includes('more actions')) && b.offsetParent !== null;
      });

      if (moreBtn) {
        moreBtn.click();
        await sleep(1000);
        // Retry semantic search after opening more menu
        messageBtn = findSemanticElement('message');
      }
    }

    if (!messageBtn) {
      throw new Error("Could not find Message button. You may not be connected or it is restricted.");
    }

    // Check if message button is actually a connection button
    if (messageBtn.innerText.includes('Connect')) {
      return executeConnectionRequest(messageData);
    }

    messageBtn.click();
    console.log("✅ Message button clicked");

    // 2. Wait for message box to appear
    showProcessingOverlay("2/4: Preparing message editor...");

    try {
      await waitForElement('.msg-form__contenteditable, .msg-form__textarea', 6000);
    } catch (e) {
    }

    showProcessingOverlay("3/4: Typing personalized message...");
    await sleep(500);

    // CENTRALIZED FILLING
    const success = await fillMessage(messageData.message);
    if (!success) {
      throw new Error("Message editor failed to receive text. Try opening it manually once.");
    }

    await sleep(400);

    await sleep(400);
    console.log("✅ Message content populated");

    // 3. Find and click send
    showProcessingOverlay("4/4: Delivering message...");

    const sendBtnSelectors = [
      'button.msg-form__send-button',
      'button[type="submit"].artdeco-button--primary',
      'button.msg-form__send-btn',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[data-control-name="send_now"]',
      '.msg-form__footer button.artdeco-button--primary'
    ];

    let sendBtn = null;
    for (const sel of sendBtnSelectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) {
        sendBtn = btn;
        break;
      }
    }

    if (!sendBtn) {
      sendBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.innerText.trim() === 'Send' || b.innerText.trim() === 'InMail') && !b.disabled
      );
    }

    if (!sendBtn || sendBtn.disabled) {
      // Often LinkedIn still disables the button until a manual keydown. Force enable it.
      const forceSendBtn = document.querySelector(sendBtnSelectors[0]) || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send' || b.innerText.trim() === 'InMail');
      if (forceSendBtn) {
        forceSendBtn.removeAttribute('disabled');
        sendBtn = forceSendBtn;
      } else {
        throw new Error("Send button not found.");
      }
    }

    // Force click
    sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    sendBtn.click();
    console.log("🚀 Message sent!");
    showProcessingOverlay("Successfully sent! ✅", "success");

    // 4. Update status in backend
    await updateMessageStatus(messageData.id, 'sent');
    await sleep(2500);

    // Check queue for next message
    const response = await safeSendMessage({ action: "startQueueProcessing" });

    if (response && response.count === 0) {
      showProcessingOverlay("🎉 All messages sent! returning to CRM...", "success");
      await sleep(2000);
      window.location.href = "http://localhost:3000/dashboard/crm";
    } else {
      removeOverlay();
    }

    return { success: true };

  } catch (error) {
    console.error("❌ Lead Genius Automation Error:", error);
    showProcessingOverlay("Automation Failed: " + error.message, "error");
    await updateMessageStatus(messageData.id, 'failed', error.message);
    await sleep(4000);
    removeOverlay();

    // Auto-continue to the next message even if this one failed
    await safeSendMessage({ action: "startQueueProcessing" });
  }
}

// =============================================================================
// CONNECTION REQUEST FLOW
// =============================================================================

/**
 * Execute sending a connection request with note
 */
async function executeConnectionRequest(messageData) {
  console.log("🤝 Lead Genius: Executing connection request", messageData);
  showProcessingOverlay("1/5: Looking for Connect button...");

  try {
    // 1. Find Connect button
    let connectBtn = findConnectButton();

    if (!connectBtn) {
      // Look in "More" menu if not visible
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.innerText.includes('More') || b.getAttribute('aria-label')?.includes('More actions'))
      );
      if (moreBtn) {
        moreBtn.click();
        await sleep(1000);
        connectBtn = Array.from(document.querySelectorAll('div[role="button"], li div')).find(b =>
          b.innerText.includes('Connect')
        );
      }
    }

    if (!connectBtn) {
      throw new Error("Connect button not found on this profile");
    }

    connectBtn.click();
    console.log("✅ Connect button clicked");

    // 2. Click "Add a note"
    showProcessingOverlay("2/5: Opening note dialog...");
    await sleep(2000);

    const addNoteBtn = findAddNoteButton();
    if (!addNoteBtn) {
      // Maybe sent directly?
      console.log("⚠️ No 'Add a note' found - connection might have sent directly");
      await updateMessageStatus(messageData.id, 'sent');
      showProcessingOverlay("✅ Sent (direct)", "success");
      await sleep(2000);
      safeSendMessage({ action: "startQueueProcessing" });
      removeOverlay();
      return { success: true };
    }

    addNoteBtn.click();
    console.log("✅ Add a note clicked");

    // 3. Type note
    showProcessingOverlay("3/5: Typing note...");
    await sleep(1000);

    const success = await fillMessage(messageData.message);
    if (!success) {
      throw new Error("Note textarea not found or not interactable");
    }
    console.log("✅ Note typed");

    await sleep(300);

    // 4. Send invitation
    showProcessingOverlay("4/5: Sending...");
    let sendBtn = findSendInvitationButton();
    if (!sendBtn) {
      throw new Error("Send invitation button not found");
    }

    sendBtn.removeAttribute('disabled');
    sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    sendBtn.click();
    console.log("🚀 Connection invitation sent!");
    showProcessingOverlay("5/5: Done! ✅", "success");

    // 5. Update status
    await updateMessageStatus(messageData.id, 'sent');
    await sleep(2000);

    // Continue processing
    const response = await safeSendMessage({ action: "startQueueProcessing" });

    if (response && response.count === 0) {
      showProcessingOverlay("🎉 All requests sent! returning to dashboard...", "success");
      await sleep(2000);
      window.location.href = "http://localhost:3000/dashboard";
    } else {
      removeOverlay();
    }

    return { success: true };

  } catch (error) {
    console.error("❌ Lead Genius: Connection request failed", error);
    showProcessingOverlay("Failed: " + error.message, "error");
    await updateMessageStatus(messageData.id, 'failed', error.message);
    await sleep(3000);
    removeOverlay();

    // Auto-continue to the next message even if this one failed
    await safeSendMessage({ action: "startQueueProcessing" });
  }
}

// =============================================================================
// HELPER: Find LinkedIn UI elements
// =============================================================================

function findConnectButton() {
  return findSemanticElement('connect');
}

function waitForModal() {
  return document.querySelector(
    '.artdeco-modal, ' +
    '[role="dialog"], ' +
    '.send-invite, ' +
    '.artdeco-modal-overlay'
  );
}

function findAddNoteButton() {
  return findSemanticElement('add-note');
}

function findConnectionTextarea() {
  // Search inside the modal first
  const modal = document.querySelector('.artdeco-modal, [role="dialog"], .send-invite');
  const searchArea = modal || document;

  // Priority-ordered selectors
  const selectors = [
    'textarea[name="message"]',
    'textarea#custom-message',
    'textarea.connect-button-send-invite__custom-message',
    'textarea',
  ];

  for (const sel of selectors) {
    const ta = searchArea.querySelector(sel);
    if (ta && ta.offsetParent !== null) return ta;
  }

  return null;
}

function findSendInvitationButton() {
  return findSemanticElement('send');
}

function removeOverlay() {
  const overlay = document.getElementById('lg-processing-overlay');
  if (overlay) overlay.remove();
}

function showProcessingOverlay(text, type = 'info') {
  let overlay = document.getElementById('lg-processing-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lg-processing-overlay';
    overlay.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: #1a1a2e; color: white; padding: 16px;
      border-radius: 8px; font-family: sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      border-left: 4px solid #3b82f6; max-width: 300px;
    `;
    document.body.appendChild(overlay);
  }

  const color = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
  overlay.style.borderLeftColor = color;
  overlay.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px">Lead Genius Agent</div>
    <div style="font-size:14px; opacity:0.9">${text}</div>
  `;
}

function showExtractionHelper() {
  if (document.getElementById('lg-agent-bar') || isOrphaned()) return;

  const bar = document.createElement('div');
  bar.id = 'lg-agent-bar';

  // Extract Profile Data
  const profileName = document.querySelector('.text-heading-xlarge')?.innerText.trim() || "Lead";
  const profileHeadline = document.querySelector('.text-body-medium')?.innerText.trim() || "";
  const company = document.querySelector('[data-field="experience_company_logo"]')?.closest('li')?.querySelector('.hoverable-link-text')?.innerText.trim() || "";

  bar.innerHTML = `
    <div class="lg-bar-content">
      <div class="lg-logo-section">
        <div class="lg-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
      <div class="lg-info-section">
        <div class="lg-profile-name">${profileName}</div>
        <div class="lg-status-pill">
          <div class="lg-status-dot"></div>
          Agent Active
        </div>
      </div>
      <div class="lg-actions">
        <button id="lg-outreach-btn" class="lg-btn lg-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          Outreach
        </button>
        <button id="lg-sync-btn" class="lg-btn lg-btn-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
          Sync
        </button>
      </div>
    </div>
    <div id="lg-composer" class="lg-composer-hidden">
        <div class="lg-composer-header">
            <span>Compose Message</span>
            <div class="lg-method-toggle">
                <button id="lg-mode-ext" class="lg-mode-btn active">Extension</button>
                <button id="lg-mode-api" class="lg-mode-btn">Direct API</button>
            </div>
        </div>
        <textarea id="lg-message-area" placeholder="Hi ${profileName.split(' ')[0]}, I saw you are at ${company}..."></textarea>
        <div class="lg-composer-footer">
            <span id="lg-char-count">0 / 300</span>
            <button id="lg-send-now-btn" class="lg-btn lg-btn-primary">Send Now</button>
        </div>
    </div>
  `;

  document.body.appendChild(bar);

  // Button Listeners
  document.getElementById('lg-sync-btn').addEventListener('click', async () => {
    const btn = document.getElementById('lg-sync-btn');
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="lg-spinner"></div> Syncing...';

    const leadData = {
      name: profileName,
      headline: profileHeadline,
      company: company,
      url: window.location.href.split('?')[0]
    };

    try {
      // Sync to CRM via background script bridge
      const response = await safeSendMessage({
        action: "syncLead",
        leadData
      });

      if (response && response.success) {
        btn.innerHTML = '✅ Synced';
        console.log("✅ Lead synced successfully:", response.data);
      } else {
        throw new Error(response?.error || "Sync failed");
      }

      setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }, 3000);
    } catch (e) {
      console.error("❌ Sync Error:", e);
      btn.innerHTML = '❌ Failed';
      setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.disabled = false;
      }, 3000);
    }
  });

  // Outreach Toggle
  const outreachBtn = document.getElementById('lg-outreach-btn');
  if (outreachBtn) {
    outreachBtn.addEventListener('click', () => {
      const composer = document.getElementById('lg-composer');
      if (composer) {
        composer.classList.toggle('lg-composer-hidden');
      }
    });
  }

  // Method Toggle Logic
  let selectedMode = 'extension';
  document.getElementById('lg-mode-ext').addEventListener('click', () => {
    selectedMode = 'extension';
    document.getElementById('lg-mode-ext').classList.add('active');
    document.getElementById('lg-mode-api').classList.remove('active');
  });
  document.getElementById('lg-mode-api').addEventListener('click', () => {
    selectedMode = 'api';
    document.getElementById('lg-mode-api').classList.add('active');
    document.getElementById('lg-mode-ext').classList.remove('active');
  });

  // Char Count
  document.getElementById('lg-message-area').addEventListener('input', (e) => {
    document.getElementById('lg-char-count').innerText = `${e.target.value.length} / 300`;
  });

  // Send Now Logic
  document.getElementById('lg-send-now-btn').addEventListener('click', async () => {
    const btn = document.getElementById('lg-send-now-btn');
    const msg = document.getElementById('lg-message-area').value;

    if (!msg.trim()) return;

    btn.disabled = true;
    btn.innerHTML = '<div class="lg-spinner"></div> Sending...';

    try {
      if (selectedMode === 'extension') {
        // Option A: UI Automation
        await fillMessage(msg);
        btn.innerHTML = '✅ Filled';
      } else {
        // Option B: Direct API
        const response = await safeSendMessage({
          action: "syncLead", // Ensure lead is in CRM first
          leadData: { name: profileName, headline: profileHeadline, company: company, url: window.location.href.split('?')[0] }
        });

        if (response && response.success) {
          const sendRes = await safeSendMessage({
            action: "sendDirectMessage",
            payload: { lead_id: response.data.id, message: msg }
          });
          if (sendRes && sendRes.success) btn.innerHTML = '🚀 Sent API';
          else throw new Error("API Send failed");
        } else throw new Error("Lead sync failed for API");
      }

      setTimeout(() => {
        btn.innerHTML = 'Send Now';
        btn.disabled = false;
        document.getElementById('lg-composer').classList.add('lg-composer-hidden');
      }, 3000);
    } catch (e) {
      btn.innerHTML = '❌ Failed';
      btn.disabled = false;
    }
  });
}

/**
 * Fills the LinkedIn message box or connection note with content
 */
async function fillMessage(message) {
  console.log("🤖 Lead Genius: Attempting to fill message...");

  // Selectors for various LinkedIn editors
  const selectors = [
    '.msg-form__contenteditable',
    '[contenteditable="true"]',
    'textarea[name="message"]',
    'textarea#custom-message',
    'textarea'
  ];

  let msgBox = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.offsetParent !== null) {
      msgBox = el;
      break;
    }
  }

  if (msgBox) {
    msgBox.focus();

    // Use document.execCommand for most reliable LinkedIn filling for SPAs
    try {
      document.execCommand('insertText', false, message);
    } catch (e) {
      // Fallback to direct value setting if execCommand is not supported (rare)
      if (msgBox.tagName === 'TEXTAREA') {
        msgBox.value = message;
      } else {
        msgBox.innerText = message;
      }
    }

    // Trigger input events for LinkedIn's state management
    msgBox.dispatchEvent(new Event('input', { bubbles: true }));
    msgBox.dispatchEvent(new Event('change', { bubbles: true }));

    console.log("✅ Lead Genius: Message filled.");
    return true;
  } else {
    console.log("❌ Lead Genius: Could not find message box.");
    return false;
  }
}

async function updateMessageStatus(messageId, status, errorMessage) {
  try {
    await safeSendMessage({
      action: 'updateStatus',
      messageId,
      status,
      error_message: errorMessage
    });
  } catch (e) {
    console.error("Failed to update status remotely:", e);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robust utility to wait for an element to appear in the DOM
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      return resolve(element);
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    if (timeout) {
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    }
  });
}

