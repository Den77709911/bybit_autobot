const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BYBIT_API_KEY = process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET;
const BYBIT_BASE_URL = process.env.BYBIT_BASE_URL || 'https://api.bybit.com';
const TRADE_SYMBOL = process.env.TRADE_SYMBOL || 'BTCUSDT';
const TRADE_CATEGORY = process.env.TRADE_CATEGORY || 'linear';
const TRADE_QTY = process.env.TRADE_QTY || '0.001';
const ENABLE_REAL_TRADING = process.env.ENABLE_REAL_TRADING || 'false';

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text: text
  });
}

function signBybit(timestamp, apiKey, recvWindow, body, secret) {
  const payload = timestamp + apiKey + recvWindow + body;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function bybitRequest(path, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const timestamp = String(Date.now());
  const recvWindow = '5000';
  const sign = signBybit(timestamp, BYBIT_API_KEY, recvWindow, body, BYBIT_API_SECRET);
  const url = BYBIT_BASE_URL + path;

  const response = await axios.post(url, bodyObj, {
    headers: {
      'Content-Type': 'application/json',
      'X-BAPI-API-KEY': BYBIT_API_KEY,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': sign
    },
    timeout: 15000
  });

  return response.data;
}

async function openShort() {
  const body = {
    category: TRADE_CATEGORY,
    symbol: TRADE_SYMBOL,
    side: 'Sell',
    orderType: 'Market',
    qty: String(TRADE_QTY),
    positionIdx: 0
  };

  return await bybitRequest('/v5/order/create', body);
}

async function closeShort() {
  const body = {
    category: TRADE_CATEGORY,
    symbol: TRADE_SYMBOL,
    side: 'Buy',
    orderType: 'Market',
    qty: String(TRADE_QTY),
    reduceOnly: true,
    positionIdx: 0
  };

  return await bybitRequest('/v5/order/create', body);
}

app.get('/', function (req, res) {
  res.send('bot is running');
});

app.post('/webhook', async function (req, res) {
  try {
    const body = req.body || {};
    const action = body.action || '';

    console.log('Webhook received:', body);

    if (ENABLE_REAL_TRADING !== 'true') {
      await sendTelegram('TEST MODE: ' + JSON.stringify(body));
      return res.json({ ok: true, mode: 'test' });
    }

    if (action === 'OPEN_SHORT') {
      const result = await openShort();
      await sendTelegram('OPEN SHORT: ' + JSON.stringify(result));
      return res.json({ ok: true, action: action, result: result });
    }

    if (action === 'CLOSE_SHORT') {
      const result = await closeShort();
      await sendTelegram('CLOSE SHORT: ' + JSON.stringify(result));
      return res.json({ ok: true, action: action, result: result });
    }

    await sendTelegram('UNKNOWN ACTION: ' + JSON.stringify(body));
    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (error) {
    const errText = error.response ? JSON.stringify(error.response.data) : error.message;
    console.log('Webhook error:', errText);

    try {
      await sendTelegram('BOT ERROR: ' + errText);
    } catch (e) {}

    return res.status(500).json({ ok: false, error: errText });
  }
});

app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
