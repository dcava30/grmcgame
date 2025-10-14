const express = require('express');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

// In-memory storage suitable for prototyping. Swap with Redis/Supabase in production.
const nonceStore = new Map();
const purchaseIntents = new Map();
const sessionStore = new Map();

const app = express();
app.use(express.json());

function createNonce() {
  return crypto.randomBytes(24).toString('base64');
}

function signJwt(payload) {
  // Replace with a proper JWT implementation and secret management.
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${crypto.randomBytes(24).toString('base64url')}`;
}

app.post('/auth/nonce', (req, res) => {
  const { publicKey } = req.body || {};
  if (!publicKey) {
    return res.status(400).json({ error: 'publicKey required' });
  }
  const nonce = createNonce();
  nonceStore.set(publicKey, { nonce, expiresAt: Date.now() + 5 * 60_000 });
  res.json({ nonce, message: `Sign this nonce to authenticate: ${nonce}` });
});

app.post('/auth/verify', (req, res) => {
  const { publicKey, signature } = req.body || {};
  const entry = nonceStore.get(publicKey);
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Nonce expired or missing' });
  }

  try {
    const message = Buffer.from(`Sign this nonce to authenticate: ${entry.nonce}`);
    const sig = Uint8Array.from(signature);
    const key = Uint8Array.from(bs58.decode(publicKey));
    const valid = nacl.sign.detached.verify(message, sig, key);
    if (!valid) {
      return res.status(401).json({ error: 'Signature invalid' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  nonceStore.delete(publicKey);
  const token = signJwt({ publicKey, issuedAt: Date.now() });
  sessionStore.set(token, { publicKey, createdAt: Date.now() });
  res.json({ token });
});

function requireSession(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!sessionStore.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = sessionStore.get(token);
  next();
}

app.post('/scores/submit', requireSession, (req, res) => {
  const { levelId, score, runDuration, message, signature } = req.body || {};
  if (!levelId || typeof score !== 'number') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  // TODO: verify signature with req.session.publicKey, apply anti-cheat, persist to DB.
  console.log('Score received', { levelId, score, runDuration, publicKey: req.session.publicKey });
  res.json({ ok: true });
});

app.post('/purchase/intent', requireSession, (req, res) => {
  const { itemId, price } = req.body || {};
  const intentId = crypto.randomUUID();
  const message = `Confirm purchase of ${itemId} for ${price} GRMC`;
  purchaseIntents.set(intentId, {
    itemId,
    price,
    message,
    publicKey: req.session.publicKey,
    createdAt: Date.now(),
  });
  res.json({ id: intentId, message });
});

app.post('/purchase/confirm', requireSession, (req, res) => {
  const { intentId, signature } = req.body || {};
  const intent = purchaseIntents.get(intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Intent not found' });
  }
  if (intent.publicKey !== req.session.publicKey) {
    return res.status(403).json({ error: 'Intent owner mismatch' });
  }
  // TODO: verify signature and token transfer on-chain before fulfillment.
  purchaseIntents.delete(intentId);
  res.json({ ok: true });
});

app.get('/leaderboard/top', (req, res) => {
  // Replace with actual data source.
  res.json({ entries: [] });
});

app.post('/vault/telemetry', requireSession, (req, res) => {
  console.log('Telemetry received', req.body);
  res.json({ ok: true });
});

module.exports = app;

// If executed directly, start a dev server.
if (require.main === module) {
  const port = process.env.PORT || 8787;
  app.listen(port, () => console.log(`GRMC serverless stub listening on ${port}`));
}
