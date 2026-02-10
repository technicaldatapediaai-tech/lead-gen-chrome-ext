# How to Create Test Data for Chrome Extension

## Problem
Your UI doesn't have a "Send via Extension" button yet - it only sends via the LinkedIn API.

## Solution 1: Use SQL (Quickest)

1. **Connect to your PostgreSQL database**:
   - Open pgAdmin, DBeaver, or any PostgreSQL client
   - Or use command line: `psql -U postgres -d lead_genius`

2. **Run the SQL script**:
   ```bash
   # If using psql
   psql -U postgres -d lead_genius -f test_extension_data.sql
   ```
   
   Or copy-paste the contents of `test_extension_data.sql` into your SQL client

3. **Verify**:
   - Open your Chrome extension
   - Click the extension icon
   - You should see "Queued: 1" with the test message

---

## Solution 2: Add "Send Method" Option to UI (Better for Production)

I can update your `LinkedInMessaging.tsx` component to add a toggle:
- **Send via API** (current behavior - uses LinkedIn API)
- **Send via Extension** (queues message for Chrome extension)

Would you like me to add this feature?

---

## For Now (Testing):

**Easiest path:**

1. **Option A - Use Existing Message**:
   - If you already sent any LinkedIn messages through your app
   - I'll show you how to change them to extension mode

2. **Option B - Run SQL Script**:
   - Use the `test_extension_data.sql` file I created
   - Creates a test lead and queued message

3. **Option C - I'll Add the UI Toggle**:
   - Updates your messaging component
   - Lets you choose API vs Extension method

**Which option do you prefer?**
