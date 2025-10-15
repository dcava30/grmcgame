const express = require('express');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

// In-memory storage suitable for prototyping. Swap with Redis/Supabase in production.
const nonceStore = new Map();
const purchaseIntents = new Map();
const sessionStore = new Map();
const challengeStore = new Map();
const leaderboardRewards = new Map();

const WEEKLY_CHALLENGE_BLUEPRINT = [
  { id: 'weekly_medium_plate_master', target: 12, reward: 15 },
  { id: 'weekly_flawless_shift', target: 1, reward: 20 },
  { id: 'weekly_score_chaser', target: 1, reward: 18 },
];

const WEEKLY_RESET_MS = 7 * 24 * 60 * 60 * 1000;

function buildChallengeState(now = Date.now()) {
  return {
    resetAt: now + WEEKLY_RESET_MS,
    challenges: WEEKLY_CHALLENGE_BLUEPRINT.map((entry) => ({
      ...entry,
      progress: 0,
      claimedAt: null,
      claimable: 0,
    })),
  };
}

function ensureChallengeState(publicKey, now = Date.now()) {
  let state = challengeStore.get(publicKey);
  if (!state || state.resetAt <= now) {
    state = buildChallengeState(now);
    challengeStore.set(publicKey, state);
  }
  return state;
}

function ensureLeaderboardRewards(publicKey) {
  if (!leaderboardRewards.has(publicKey)) {
    leaderboardRewards.set(publicKey, { available: 0, lastUpdated: Date.now() });
  }
  return leaderboardRewards.get(publicKey);
}

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

app.get('/challenges/weekly', requireSession, (req, res) => {
  const state = ensureChallengeState(req.session.publicKey);
  res.json(state);
});

app.post('/challenges/claim', requireSession, (req, res) => {
  const { challengeId, progress } = req.body || {};
  if (!challengeId) {
    return res.status(400).json({ error: 'challengeId required' });
  }

  const state = ensureChallengeState(req.session.publicKey);
  const challenge = state.challenges.find((entry) => entry.id === challengeId);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found' });
  }
  const reportedProgress = Number(progress) || 0;
  if (reportedProgress < challenge.target) {
    return res.status(400).json({ error: 'Challenge not complete' });
  }
  if (challenge.claimedAt) {
    return res.status(409).json({ error: 'Challenge already claimed' });
  }

  challenge.progress = Math.max(challenge.progress, reportedProgress);
  challenge.claimedAt = Date.now();
  challenge.claimable = 0;

  res.json({ ok: true, reward: challenge.reward });
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

app.get('/leaderboard/rewards', requireSession, (req, res) => {
  const entry = ensureLeaderboardRewards(req.session.publicKey);
  res.json({ available: entry.available, lastUpdated: entry.lastUpdated });
});

app.post('/leaderboard/claim', requireSession, (req, res) => {
  const entry = ensureLeaderboardRewards(req.session.publicKey);
  if (!entry.available) {
    return res.status(400).json({ error: 'No leaderboard rewards available' });
  }
  const amount = entry.available;
  entry.available = 0;
  entry.lastUpdated = Date.now();
  res.json({ ok: true, amount });
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
