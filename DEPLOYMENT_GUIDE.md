# Lead Genius Chrome Extension - Deployment Guide

## 🚀 Overview

This guide explains how to deploy the Lead Genius Chrome extension so your customers can use it.

## 📋 Pre-Deployment Checklist

### 1. Update API URLs for Production

Before deploying, you MUST update the hardcoded `localhost` URLs to your production API URL.

**Files to Update:**

#### `background.js` (Line 6)
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:8000';

// To:
const API_BASE_URL = 'https://your-production-api.com';
```

#### `content.js` (Line 32)
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:8000';

// To:
const API_BASE_URL = 'https://your-production-api.com';
```

#### `popup.js` (Line 6)
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:8000';

// To:
const API_BASE_URL = 'https://your-production-api.com';
```

#### `manifest.json` (Line 14)
```json
// Change from:
"host_permissions": [
    "https://www.linkedin.com/*",
    "https://linkedin.com/*",
    "http://localhost:8000/*"
],

// To:
"host_permissions": [
    "https://www.linkedin.com/*",
    "https://linkedin.com/*",
    "https://your-production-api.com/*"
],
```

> **⚠️ CRITICAL**: Replace `https://your-production-api.com` with your actual production API domain.

---

## 🎯 Deployment Options

You have **3 ways** to deploy this extension to your customers:

### **Option 1: Chrome Web Store (Recommended for Public Release)** 🌟

**Best for:** Wide distribution, automatic updates, trusted by users

#### Steps:

1. **Create a Developer Account**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Pay one-time $5 registration fee
   - Complete account setup

2. **Prepare the Extension Package**
   ```bash
   # Navigate to the extension directory
   cd "d:\lead genius\chrome-extension"
   
   # Create a ZIP file containing all files
   # Include: manifest.json, *.js, *.html, *.css, icons folder
   ```
   
   > **Note**: Do NOT include any `.git` folders, `node_modules`, or development files.

3. **Upload to Chrome Web Store**
   - Click "New Item" in the developer dashboard
   - Upload the ZIP file
   - Fill in the store listing:
     - **Name**: Lead Genius LinkedIn Helper
     - **Summary**: Send LinkedIn outreach messages from Lead Genius
     - **Description**: (Detailed description of features)
     - **Category**: Productivity
     - **Screenshots**: Take 1280x800 screenshots of the extension in action
     - **Icon**: Use the 128x128 icon
     - **Privacy Policy**: Required! (See section below)

4. **Submit for Review**
   - Review typically takes 1-3 business days
   - Google will review for policy compliance
   - Once approved, it's live!

5. **Share with Customers**
   - Share the Chrome Web Store URL
   - Customers can install with one click

**Privacy Policy Required:** You must host a privacy policy explaining:
- What data you collect (LinkedIn URLs, messages, user tokens)
- How you use it (sending messages via your API)
- How you store it (your backend database)

---

### **Option 2: Direct Distribution (For Enterprise/Beta Users)** 🔒

**Best for:** Private beta, enterprise customers, internal testing

#### Steps:

1. **Package the Extension**
   ```bash
   # Create a ZIP file of the entire chrome-extension folder
   cd "d:\lead genius"
   Compress-Archive -Path "chrome-extension\*" -DestinationPath "lead-genius-extension-v1.0.0.zip"
   ```

2. **Share Installation Instructions**

   Create a document for your customers:

   ```markdown
   # How to Install Lead Genius Chrome Extension
   
   1. Download the extension ZIP file
   2. Unzip it to a folder on your computer
   3. Open Chrome and go to: chrome://extensions/
   4. Enable "Developer mode" (toggle in top right)
   5. Click "Load unpacked"
   6. Select the unzipped extension folder
   7. The extension icon should appear in your Chrome toolbar
   
   ## Getting Your API Token
   
   1. Log in to Lead Genius at [your-app-url]
   2. Go to Settings → API Tokens
   3. Generate a new token
   4. Copy the token
   5. Click the extension icon in Chrome
   6. Paste your token and click "Connect"
   ```

3. **⚠️ Limitations:**
   - Shows "unverified extension" warning
   - No automatic updates
   - Users must manually update
   - Developer mode must stay enabled

---

### **Option 3: Chrome Enterprise Policy (For Organizations)** 🏢

**Best for:** Companies deploying to employees, managed deployments

This requires Chrome Enterprise licensing and IT admin setup. Not recommended unless you're selling to large enterprises.

---

## 🔧 Testing Before Release

### Local Testing Checklist:

- [ ] Update all API URLs to production
- [ ] Test authentication flow
- [ ] Test message sending on LinkedIn
- [ ] Test post data extraction
- [ ] Verify badge updates work
- [ ] Test on different LinkedIn profile pages
- [ ] Check error handling when offline/API down
- [ ] Test disconnection flow

### Testing Instructions:

```bash
# 1. Load in Chrome
# - Go to chrome://extensions/
# - Enable Developer mode
# - Click "Load unpacked"
# - Select the chrome-extension folder

# 2. Test the flow
# - Click extension icon
# - Enter API token
# - Visit a LinkedIn profile
# - Check if message helper appears
# - Try sending a message
```

---

## 📦 Package Checklist

Before distributing, ensure your ZIP contains:

```
chrome-extension/
├── manifest.json          ✅ Updated with production URL
├── background.js          ✅ Updated with production URL
├── content.js             ✅ Updated with production URL
├── popup.js               ✅ Updated with production URL
├── popup.html             ✅ No changes needed
├── content.css            ✅ No changes needed
└── icons/
    ├── icon16.png         ✅ Present
    ├── icon48.png         ✅ Present
    └── icon128.png        ✅ Present
```

**DO NOT INCLUDE:**
- `.git` folder
- `.env` files
- `node_modules`
- Development/test files
- This DEPLOYMENT_GUIDE.md (unless you want customers to see it)

---

## 🔐 Security Recommendations

1. **API Token Security**
   - Tokens are stored in Chrome's local storage (secure)
   - Ensure your backend validates tokens properly
   - Consider adding token expiration

2. **HTTPS Only**
   - Your production API MUST use HTTPS
   - HTTP will be blocked by Chrome for security

3. **CORS Configuration**
   - Ensure your backend API allows requests from `chrome-extension://*`
   - Or specifically allow the extension's ID after Chrome Web Store publication

---

## 📊 Post-Deployment Monitoring

After deployment, monitor:

1. **Chrome Web Store Metrics** (if published)
   - Install count
   - User reviews
   - Crash reports

2. **Backend API Logs**
   - Extension API endpoint usage
   - Authentication failures
   - Error rates

3. **User Support**
   - Common installation issues
   - Feature requests
   - Bug reports

---

## 🆘 Common Issues & Solutions

### "Extension Failed to Install"
- Check manifest.json is valid JSON
- Ensure all required files are present
- Verify icon files exist

### "API Connection Failed"
- Verify production URL is correct
- Check HTTPS is configured
- Confirm CORS headers are set
- Check host_permissions in manifest

### "Auto-fill Not Working"
- LinkedIn frequently changes their DOM structure
- May need to update selectors in content.js
- Test on multiple LinkedIn page types

---

## 📞 Support

For deployment issues, contact your development team or refer to:
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Chrome Web Store Help](https://support.google.com/chrome_webstore/)

---

## 🔄 Version Updates

When updating the extension:

1. Increment version in `manifest.json`
2. Document changes in a CHANGELOG.md
3. Test thoroughly
4. If using Chrome Web Store: upload new version
5. If direct distribution: notify customers to update

---

**✅ You're ready to deploy!** Choose the deployment option that best fits your business model.
