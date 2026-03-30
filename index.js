const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const {
  WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  BYBIT_API_KEY,
  BYBIT_API_SECRET,
  BYBIT_BASE_URL,
  TRADE_SYMBOL,
  TRADE_CATEGORY,
  TRADE_QTY,
  TRADE_LEVERAGE,
  ENABLE_REAL_TRADING
} = process.env;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log("Telegram env not set, skip message");
    return;
  }

  const url = https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage;

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text
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

  const res = await axios.post(url, bodyObj, {
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": BYBIT_API_KEY,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN": sign
    },
    timeout: 15000
  });

  return res.data;
}

async function setLeverageIfNeeded() {
  if (!TRADE_LEVERAGE) return;

  try {
    const body = {
      category: TRADE_CATEGORY || "linear",
      symbol: TRADE_SYMBOL,
      buyLeverage: String(TRADE_LEVERAGE),
      sellLeverage: String(TRADE_LEVERAGE)
    };

    const data = await bybitRequest("/v5/position/set-leverage", body);
    log("Set leverage:", data);
  } catch (err) {
    log("Set leverage error:", err.response?.data || err.message);
  }
}

async function openShort() {
  const body = {
    category: TRADE_CATEGORY || "linear",
    symbol: TRADE_SYMBOL,
    side: "Sell",
    orderType: "Market",
    qty: String(TRADE_QTY),
    positionIdx: 0
  };

  const data = await bybitRequest("/v5/order/create", body);
  return data;
}

async function closeShort() {
  const body = {
    category: TRADE_CATEGORY || "linear",
    symbol: TRADE_SYMBOL,
    side: "Buy",
    orderType: "Market",
    qty: String(TRADE_QTY),
    reduceOnly: true,
    positionIdx: 0
  };

  const data = await bybitRequest("/v5/order/create", body);
  return data;
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

    const action = payload.action;

    if (!action) {
      return res.status(400).json({ ok: false, error: "no action" });
    }

    if (ENABLE_REAL_TRADING !== "true") {
      await sendTelegram(
        TEST MODE\nAction: ${action}\nSymbol: ${payload.symbol || TRADE_SYMBOL}
      );
      return res.json({ ok: true, mode: "test" });
    }

    if (action === "OPEN_SHORT") {
      const result = await openShort();

      await sendTelegram(
        🟠 OPEN SHORT\nPair: ${TRADE_SYMBOL}\nQty: ${TRADE_QTY}\nResult: ${JSON.stringify(result)}
      );

      return res.json({ ok: true, action, result });
    }

    if (action === "CLOSE_SHORT") {
      const result = await closeShort();

      await sendTelegram(
        🟣 CLOSE SHORT\nPair: ${TRADE_SYMBOL}\nQty: ${TRADE_QTY}\nResult: ${JSON.stringify(result)}
      );

      return res.json({ ok: true, action, result });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (err) {
    log("Webhook error:", err.response?.data || err. message);

    try {
      await sendTelegram(
        ❌ BOT ERROR\n${JSON.stringify(err.response?.data || err.message)}
      );
    } catch (_) {}

    return res.status(500).json({
      ok: false,
      error: err.response?.data || err.message
    });
  }
});

app.listen(PORT, async () => {
  log(`Server running on port ${PORT}`);
  await setLeverageIfNeeded();
});
