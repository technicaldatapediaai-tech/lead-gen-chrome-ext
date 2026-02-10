# Quick Fix Before Deployment

## ⚠️ MUST FIX: Replace localhost URLs

You need to replace `http://localhost:8000` with your production API URL in 4 files:

### 1. background.js (Line 6)
```javascript
const API_BASE_URL = 'https://your-production-api.com'; // ← Change this
```

### 2. content.js (Line 32)
```javascript
const API_BASE_URL = 'https://your-production-api.com'; // ← Change this
```

### 3. popup.js (Line 6)
```javascript
const API_BASE_URL = 'https://your-production-api.com'; // ← Change this
```

### 4. manifest.json (Line 14)
```json
"host_permissions": [
    "https://www.linkedin.com/*",
    "https://linkedin.com/*",
    "https://your-production-api.com/*"  ← Change this
],
```

## What's Your Production URL?

Replace `https://your-production-api.com` with:
- Your actual backend API domain (e.g., `https://api.leadgenius.com`)
- Make sure it uses HTTPS (not HTTP)
- Make sure CORS is enabled on your backend for the extension

## After Fixing

1. Test locally first
2. Package as ZIP
3. Distribute to customers

See DEPLOYMENT_GUIDE.md for full instructions.
