# Lead Genius Chrome Extension

This is the browser extension for Lead Genius, enabling seamless integration with **LinkedIn**.

## 🌟 Features

- **Profile Scraping**: Extract LinkedIn profile data directly into Lead Genius.
- **Message Automation**: Send personalized messages using templates directly from the LinkedIn interface.
- **Activity Tracking**: Log connection requests and messages to the Lead Genius CRM.

## 🚀 Installation (Developer Mode)

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** using the toggle switch in the top right corner.
3.  Click the **Load unpacked** button.
4.  Select the `chrome-extension` folder from this repository.
5.  The extension icon (Lead Genius) should appear in your browser toolbar.

## ⚙️ Configuration

### API Connection

By default, the extension connects to `http://localhost:8000`.

To change this for production deployment:
1.  Open `background.js`, `content.js`, and `popup.js`.
2.  Update the `API_BASE_URL` constant to your production API URL (e.g., `https://api.leadgenius.com`).
3.  Update `manifest.json` `host_permissions` to include your production domain.

**See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions.**

## 📂 File Structure

- `manifest.json`: Extension configuration and permissions.
- `background.js`: Service worker for background tasks and API communication.
- `content.js`: Content script injected into LinkedIn pages to manipulate the DOM.
- `popup.html` / `popup.js`: The extension's popup interface.
- `icons/`: Extension icons.

## 🐛 Debugging

- **Popup Issues**: Right-click the extension icon and select "Inspect popup" to view the console.
- **Background Issues**: Go to `chrome://extensions/` and click "service worker" under the Lead Genius extension to open the background console.
- **Content Script Issues**: Open the Developer Tools (F12) on the LinkedIn tab you are testing.
