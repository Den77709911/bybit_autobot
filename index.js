const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BYBIT_API_KEY = process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET;
const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || "https://api.bybit.com";
const TRADE_SYMBOL = process.env.TRADE_SYMBOL || "BTCUSDT";
const TRADE_CATEGORY = process.env.TRADE_CATEGORY || "linear";
const TRADE_QTY = process.env.TRADE_QTY || "0.001";
const TRADE_LEVERAGE = process.env.TRADE_LEVERAGE || "2";
const ENABLE_REAL_TRADING = process.env.ENABLE_REAL_TRADING || "false";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log("Telegram env not set");
    return;
  }

  const url = https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage;

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: text
  });
}

function signBybit(timestamp, apiKey, recvWindow, body, secret) {
  const payload = ${timestamp}${apiKey}${recvWindow}${body};
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function bybitRequest(path, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const timestamp = Date.now().toString();
  const recvWindow = "5000";

  const sign = signBybit(
    timestamp,
    BYBIT_API_KEY,
    recvWindow,
    body,
    BYBIT_API_SECRET
  );

  const url = ${BYBIT_BASE_URL}${path};

  const response = await axios.post(url, bodyObj, {
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": BYBIT_API_KEY,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": sign
    },
    timeout: 15000
  });

  return response.data;
}

async function setLeverageIfNeeded() {
  if (!TRADE_LEVERAGE) return;

  try {
    const body = {
      category: TRADE_CATEGORY,
      symbol: TRADE_SYMBOL,
      buyLeverage: String(TRADE_LEVERAGE),
      sellLeverage: String(TRADE_LEVERAGE)
    };

    const data = await bybitRequest("/v5/position/set-leverage", body);
    log("Set leverage result:", data);
  } catch (error) {
    log("Set leverage error:", error.response ? error.response.data : error.message);
  }
}

async function openShort() {
  const body = {
    category: TRADE_CATEGORY,
    symbol: TRADE_SYMBOL,
    side: "Sell",
    orderType: "Market",
    qty: String(TRADE_QTY),
    positionIdx: 0
  };

  return await bybitRequest("/v5/order/create", body);
}

async function closeShort() {
  const body = {
    category: TRADE_CATEGORY,
    symbol: TRADE_SYMBOL,
    side: "Buy",
    orderType: "Market",
    qty: String(TRADE_QTY),
    reduceOnly: true,
    positionIdx: 0
  };

  return await bybitRequest("/v5/order/create", body);
}

app.get("/", (req, res) => {
  res.status(200).send("bot is running");
});

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    log("Webhook received:", JSON.stringify(payload));

    if (!payload.secret || payload.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ ok: false, error: "bad secret" });
    }

    if (!payload.action) {
      return res.status(400).json({ ok: false, error: "no action" });
    }

    if (ENABLE_REAL_TRADING !== "true") {
      await sendTelegram(
        TEST MODE\nAction: ${payload.action}\nSymbol: ${payload.symbol || TRADE_SYMBOL}
      );
      return res.json({ ok: true, mode: "test" });
    }

    if (payload.action === "OPEN_SHORT") {
      const result = await openShort();

      await sendTelegram(
        🟠 OPEN SHORT\nPair: ${TRADE_SYMBOL}\nQty: ${TRADE_QTY}\nResult: ${JSON.stringify(result)}
      );

      return res.json({ ok: true, action: payload.action, result: result });
    }

    if (payload.action === "CLOSE_SHORT") {
      const result = await closeShort();

      await sendTelegram(
        🟣 CLOSE SHORT\nPair: ${TRADE_SYMBOL}\nQty: ${TRADE_QTY}\nResult: ${JSON.stringify(result)}
      );

      return res.json({ ok: true, action: payload.action, result: result });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (error) {
    const errData = error.response ? error.response.data : error.message;
    log("Webhook error:", errData);

    try {
      await sendTelegram(`❌ BOT ERROR\n${JSON.stringify(errData)}`);
    } catch (e) {}
