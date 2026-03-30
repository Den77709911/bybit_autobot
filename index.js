const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage;

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: text
  });
}

app.get("/", (req, res) => {
  res.send("bot is running");
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook received:", req.body);

    await sendTelegram(
      Сигнал получен\n${JSON.stringify(req.body, null, 2)}
    );

    res.json({ ok: true });
  } catch (error) {
    console.log("Webhook error:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
