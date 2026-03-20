(function() {
  if (window.LG_CONTENT_INITIALIZED) {
    console.log('ℹ️ Lead Genius already initialized on this tab');
    return;
  }
  window.LG_CONTENT_INITIALIZED = true;

  var SELECTORS = {
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

  // Helper to get API URL - defaults to local, then Render
  let API_BASE_URL = 'http://localhost:8000';

  async function refreshApiBaseUrl() {
    if (isOrphaned()) return;
    try {
      const data = await chrome.storage.local.get('apiBaseUrl');
      if (data.apiBaseUrl) {
        API_BASE_URL = data.apiBaseUrl;
      } else {
        try {
          const res = await fetch('http://localhost:8000/health', { method: 'HEAD' }).catch(() => ({ ok: false }));
          if (!res.ok) throw new Error();
          API_BASE_URL = 'http://localhost:8000';
        } catch (e) {
          API_BASE_URL = 'https://lead-gen-backend-dcxf.onrender.com';
        }
      }
    } catch (e) {
      if (API_BASE_URL.includes('localhost')) {
        API_BASE_URL = 'https://lead-gen-backend-dcxf.onrender.com';
      }
    }
  }
  refreshApiBaseUrl();

  async function autoConnectFromWebApp() {
    const host = window.location.host;
    const isWebApp = (host.includes('localhost') || host.includes('127.0.0.1')) || 
                    (host.includes('lead-genius') && host.includes('vercel.app'));
    if (!isWebApp) return;
    if (!isExtensionValid()) return;

    try {
      const token = localStorage.getItem('access_token');
      const saved = await chrome.storage.local.get(['token']);

      if (token) {
        if (saved.token === token) {
          showConnectionBadge('connected');
          return;
        }
        const response = await fetch(`${API_BASE_URL}/api/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const userData = await response.json();
          await chrome.storage.local.set({
            token: token,
            userEmail: userData.email,
            orgId: userData.current_org_id
          });
          showConnectionBadge('connected', userData.email);
        }
      } else if (saved.token && window.location.href.includes('/dashboard')) {
        await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
        showConnectionBadge('disconnected');
      }
    } catch (err) {}
  }

  function showConnectionBadge(status, email = '') {
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
    badge.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 99999; background: ${c.bg}; color: white; padding: 10px 16px; border-radius: 10px; font-family: sans-serif; font-size: 13px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); backdrop-filter: blur(10px); border: 1px solid ${c.border}; display: flex; align-items: center; gap: 8px; transition: all 0.4s ease; animation: lg-slide-in 0.4s ease-out;`;
    badge.innerHTML = `<span>${c.icon}</span><span style="font-weight:500">Lead Genius</span><span style="opacity:0.85">—</span><span style="opacity:0.85">${c.text}</span>`;
    if (!document.getElementById('lg-badge-styles')) {
      const style = document.createElement('style');
      style.id = 'lg-badge-styles';
      style.textContent = `@keyframes lg-slide-in { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes lg-fade-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(30px); opacity: 0; } }`;
      document.head.appendChild(style);
    }
    document.body.appendChild(badge);
    setTimeout(() => {
      badge.style.animation = 'lg-fade-out 0.4s ease-in forwards';
      setTimeout(() => badge.remove(), 400);
    }, 5000);
  }

  function isExtensionValid() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function isOrphaned() {
    const orphaned = !isExtensionValid();
    if (orphaned) {
      ['lg-agent-bar', 'lg-connection-badge', 'lg-processing-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    }
    return orphaned;
  }

  function findSemanticElement(goal) {
    if (isOrphaned()) return null;
    const candidates = Array.from(document.querySelectorAll('button, a.artdeco-button, div[role="button"], li[role="menuitem"], .artdeco-dropdown__item'));
    const goalMap = {
      'message': { keywords: ['message', 'inmail', 'send message'], ariaKeywords: ['message', 'inmail'], negative: ['close', 'open', 'request', 'follow', 'dismiss'], priorityClass: 'artdeco-button--primary' },
      'connect': { keywords: ['connect', 'invite', 'send invitation'], ariaKeywords: ['connect', 'invite', 'invitation'], negative: ['message', 'follow', 'visit', 'more'], priorityClass: 'artdeco-button--primary' },
      'send': { keywords: ['send', 'send now', 'send invitation', 'done'], ariaKeywords: ['send'], negative: ['cancel', 'discard', 'dismiss'], priorityClass: 'artdeco-button--primary' },
      'add-note': { keywords: ['add a note', 'add note', 'personalize'], ariaKeywords: ['note'], negative: ['send', 'cancel'], priorityClass: '' }
    };
    const config = goalMap[goal];
    if (!config) return null;
    let bestCandidate = null; let maxScore = -1;
    for (const el of candidates) {
      if (el.disabled || el.offsetParent === null) continue;
      let score = 0; const text = el.innerText.trim().toLowerCase(); const label = (el.getAttribute('aria-label') || '').toLowerCase(); const combined = `${text} ${label}`;
      if (config.keywords.some(k => text === k)) score += 20; else if (config.keywords.some(k => text.includes(k))) score += 10;
      if (config.ariaKeywords.some(k => label.includes(k))) score += 15;
      if (config.negative.some(k => combined.includes(k))) score -= 30;
      if (config.priorityClass && el.classList.contains(config.priorityClass)) score += 5;
      if (el.closest('.pvs-profile-actions, .pv-top-card-v2-ctas')) score += 10;
      if (score > maxScore && score > 0) { maxScore = score; bestCandidate = el; }
    }
    return bestCandidate;
  }

  async function safeSendMessage(message, retries = 1) {
    if (!isExtensionValid()) return null;
    for (let i = 0; i <= retries; i++) {
      try {
        return await chrome.runtime.sendMessage(message);
      } catch (err) {
        if (err?.message?.includes('context invalidated')) return null;
        if (i === retries) console.log('ℹ️ Lead Genius: skipped send:', err.message);
        else await new Promise(r => setTimeout(r, 500));
      }
    }
    return null;
  }

  let authWatcherInterval = null;
  function startAuthWatcher() {
    const isLocal = window.location.host.includes('localhost') || window.location.host.includes('127.0.0.1');
    if (!isLocal && !window.location.host.includes('lead-genius')) return;
    if (authWatcherInterval) clearInterval(authWatcherInterval);
    authWatcherInterval = setInterval(async () => {
      if (!isExtensionValid()) { clearInterval(authWatcherInterval); return; }
      try {
        const token = localStorage.getItem('access_token');
        const saved = await chrome.storage.local.get(['token']);
        if (token && !saved.token) autoConnectFromWebApp();
        else if (!token && saved.token && window.location.href.includes('/dashboard')) {
          await chrome.storage.local.remove(['token', 'userEmail', 'orgId']);
          showConnectionBadge('disconnected');
        }
      } catch (e) { if (e?.message?.includes('context invalidated')) clearInterval(authWatcherInterval); }
    }, 4000);
  }

  (function init() {
    if (!isExtensionValid()) return;
    const host = window.location.host;
    const isWebApp = (host.includes('localhost') || host.includes('127.0.0.1')) || (host.includes('lead-genius') && host.includes('vercel.app'));
    if (isWebApp) { autoConnectFromWebApp(); startAuthWatcher(); }
    if (window.location.hostname.includes('linkedin.com')) {
      checkPendingMessage();
      if (window.location.href.includes('/in/')) setTimeout(showExtractionHelper, 2000);
      let lastUrl = window.location.href;
      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          setTimeout(() => { checkPendingMessage(); if (window.location.href.includes('/in/')) showExtractionHelper(); }, 1500);
        }
      });
      observer.observe(document, { subtree: true, childList: true });
      setInterval(async () => {
        if (isOrphaned()) return;
        try { await chrome.runtime.sendMessage({ action: 'heartbeat' }); } catch (e) {}
      }, 10000);
    }
  })();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isExtensionValid()) return false;
    if (request.action === 'ping') sendResponse({ alive: true });
    else if (request.action === 'fillMessage') { fillMessage(request.content); sendResponse({ success: true }); }
    else if (request.action === 'triggerCheck') { checkPendingMessage(); sendResponse({ success: true }); }
    return true;
  });

  async function checkPendingMessage() {
    await sleep(1500);
    const data = await chrome.storage.local.get('pendingMessage');
    if (data.pendingMessage) {
      const { id, content, messageType, linkedinUrl } = data.pendingMessage;
      if (window.location.href.includes('/login') || window.location.href.includes('/authwall')) {
        await chrome.storage.local.remove('pendingMessage');
        showProcessingOverlay("🔒 Please login to LinkedIn first", "error");
        return;
      }
      const normalize = (u) => u?.replace(/\/$/, '').replace('https://www.', 'https://').split('?')[0];
      if (normalize(window.location.href) !== normalize(linkedinUrl) && !window.location.href.includes(linkedinUrl.split('/in/')[1]?.split('/')[0])) {
        return;
      }
      await chrome.storage.local.remove('pendingMessage');
      showProcessingOverlay(`🤖 Starting automated ${messageType || 'message'} sequence...`);
      try {
        if (messageType === 'connection') await executeConnectionRequest({ id, message: content });
        else await executeAutomatedSending({ id, message: content });
      } catch (err) {
        showProcessingOverlay("❌ " + err.message, "error");
        await updateMessageStatus(id, 'failed', err.message);
      }
    }
  }

  async function executeAutomatedSending(messageData) {
    showProcessingOverlay("1/4: Finding Message button...");
    let btn = findMessageButton();
    if (!btn) {
      const moreBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('More') || b.getAttribute('aria-label')?.includes('More actions'));
      if (moreBtn) { moreBtn.click(); await sleep(1000); dismissLinkedInModals(); btn = findSemanticElement('message'); }
    }
    if (!btn) throw new Error("Message button not found");
    if (btn.innerText.includes('Connect')) return executeConnectionRequest(messageData);
    btn.click();
    await waitForElement('.msg-form__contenteditable', 6000).catch(() => {});
    showProcessingOverlay("2/4: Filling message...");
    let filled = false;
    for (let i = 0; i < 3; i++) {
        filled = await fillMessage(messageData.message);
        if (filled) break;
        dismissLinkedInModals();
        await sleep(1000);
    }
    if (!filled) throw new Error("Could not fill message");
    showProcessingOverlay("3/4: Sending...");
    const sendBtn = document.querySelector('button.msg-form__send-button') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Send');
    if (sendBtn) { sendBtn.removeAttribute('disabled'); sendBtn.click(); showProcessingOverlay("Sent! ✅", "success"); await updateMessageStatus(messageData.id, 'sent'); }
    await sleep(2000);
    removeOverlay();
    safeSendMessage({ action: "startQueueProcessing" });
  }

  async function executeConnectionRequest(messageData) {
    showProcessingOverlay("1/5: Finding Connect button...");
    let btn = findConnectButton();
    if (!btn) { /* try more menu */ }
    if (!btn) throw new Error("Connect button not found");
    btn.click(); await sleep(1500);
    const noteBtn = findAddNoteButton();
    if (noteBtn) {
      noteBtn.click(); await sleep(1000);
      await fillMessage(messageData.message);
      const sendBtn = findSendInvitationButton();
      if (sendBtn) { sendBtn.removeAttribute('disabled'); sendBtn.click(); }
    } else {
      const sendBtn = findSendInvitationButton(); if (sendBtn) sendBtn.click();
    }
    await updateMessageStatus(messageData.id, 'sent');
    showProcessingOverlay("Sent! ✅", "success");
    await sleep(2000);
    removeOverlay();
    safeSendMessage({ action: "startQueueProcessing" });
  }

  async function fillMessage(message) {
    if (isOrphaned()) return false;
    const box = document.querySelector('.msg-form__contenteditable, textarea[name="message"], textarea#custom-message, [contenteditable="true"]');
    if (box) {
      box.focus();
      try {
        if (box.tagName === 'TEXTAREA') box.value = ''; else box.innerHTML = '';
        document.execCommand('insertText', false, message);
        if (box.innerText.length < 5 && box.tagName !== 'TEXTAREA') box.innerText = message;
      } catch (e) { if (box.tagName === 'TEXTAREA') box.value = message; else box.innerText = message; }
      ['input', 'change'].forEach(e => box.dispatchEvent(new Event(e, { bubbles: true })));
      return true;
    }
    return false;
  }

  function dismissLinkedInModals() {
    const selectors = ['button[aria-label="Dismiss"]', '.artdeco-modal__dismiss', '.msg-overlay-bubble-header__control--close-button'];
    selectors.forEach(s => { const b = document.querySelector(s); if (b) b.click(); });
  }

  async function updateMessageStatus(messageId, status, error) {
    await safeSendMessage({ action: 'updateStatus', messageId, status, error_message: error });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function waitForElement(s, t) {
    return new Promise((res, rej) => {
      const e = document.querySelector(s); if (e) return res(e);
      const obs = new MutationObserver(() => { const e = document.querySelector(s); if (e) { res(e); obs.disconnect(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      if (t) setTimeout(() => { obs.disconnect(); rej(new Error('timeout')); }, t);
    });
  }

  function findMessageButton() { return findSemanticElement('message'); }
  function findAddNoteButton() { return findSemanticElement('add-note'); }
  function findSendInvitationButton() { return findSemanticElement('send'); }
  function removeOverlay() { const o = document.getElementById('lg-processing-overlay'); if (o) o.remove(); }
  function showProcessingOverlay(t, type) { /* simple implementation */ }
  function showExtractionHelper() { /* simple implementation of the agent bar */ }

})();
