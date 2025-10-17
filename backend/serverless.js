const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');

// In-memory storage suitable for prototyping. Swap with Redis/Supabase in production.
const DB_FILE = path.join(__dirname, 'balances.json');

const nonceStore = new Map();
const purchaseIntents = new Map();
const sessionStore = new Map();
const challengeStore = new Map();
const leaderboardRewards = new Map();
let currencyBalances = new Map();
const grmcSwapIntents = new Map();

const WEEKLY_CHALLENGE_BLUEPRINT = [
  { id: 'weekly_medium_plate_master', target: 12, reward: 15 },
  { id: 'weekly_flawless_shift', target: 1, reward: 20 },
  { id: 'weekly_score_chaser', target: 1, reward: 18 },
];

const WEEKLY_RESET_MS = 7 * 24 * 60 * 60 * 1000;

function loadBalancesFromDisk() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      currencyBalances = new Map();
      return;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw) {
      currencyBalances = new Map();
      return;
    }
    const parsed = JSON.parse(raw);
    const map = new Map();
    for (const [wallet, entry] of Object.entries(parsed || {})) {
      if (!entry || typeof entry !== 'object') continue;
      const chefcoins = Math.max(0, Math.floor(Number(entry.chefcoins) || 0));
      const updatedAt = Number(entry.updatedAt) || Date.now();
      const owned = new Set(Array.isArray(entry.owned) ? entry.owned : []);
      map.set(wallet, { chefcoins, updatedAt, owned });
    }
    currencyBalances = map;
  } catch (error) {
    console.error('[GRMC] Failed to load balances from disk', error);
    currencyBalances = new Map();
  }
}

function snapshotBalances() {
  const payload = {};
  for (const [wallet, entry] of currencyBalances.entries()) {
    payload[wallet] = {
      chefcoins: entry.chefcoins ?? 0,
      updatedAt: entry.updatedAt ?? Date.now(),
      owned: Array.from(entry.owned || []),
    };
  }
  return payload;
}

function persistBalancesSync() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(snapshotBalances(), null, 2));
  } catch (error) {
    console.error('[GRMC] Failed to persist balances', error);
  }
}

let saveTimer = null;

function markBalancesDirty() {
  if (saveTimer) {
    return;
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistBalancesSync();
  }, 250);
}

loadBalancesFromDisk();
const autoSaveInterval = setInterval(() => {
  persistBalancesSync();
}, 60 * 1000);
if (typeof autoSaveInterval.unref === 'function') {
  autoSaveInterval.unref();
}

process.on('exit', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistBalancesSync();
});
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    persistBalancesSync();
    process.exit(0);
  });
});

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
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());

const RPC_ENDPOINT = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const MINT_ADDRESS = process.env.GRMC_MINT || '';
const DEV_WALLET = process.env.DEV_WALLET || '9Ctm5fCGoLrdXVZAkdKNBZnkf3YF5qD4Ejjdge4cmaWX';
const swapTaxEnv = Number(process.env.SWAP_TAX_BPS);
const SWAP_TAX_BPS = Number.isFinite(swapTaxEnv) ? Math.max(0, Math.floor(swapTaxEnv)) : 300;
const minSwapEnv = Number(process.env.MIN_SWAP_AMOUNT);
const MIN_SWAP_AMOUNT = Number.isFinite(minSwapEnv) ? Math.max(1, Math.floor(minSwapEnv)) : 1;

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

function getConnection() {
  return connection;
}
let mintPublicKey = null;
if (MINT_ADDRESS) {
  try {
    mintPublicKey = new PublicKey(MINT_ADDRESS);
  } catch (error) {
    console.warn('[GRMC] Invalid GRMC_MINT provided:', error.message);
  }
}

let treasuryKeypair = null;
if (process.env.TREASURY_SECRET_B58) {
  try {
    const secret = bs58.decode(process.env.TREASURY_SECRET_B58);
    treasuryKeypair = Keypair.fromSecretKey(secret);
  } catch (error) {
    console.warn('[GRMC] Failed to decode TREASURY_SECRET_B58:', error.message);
  }
}

const treasuryPublicKey = treasuryKeypair?.publicKey || null;

let mintDecimalsCache = null;

function ensureBalanceEntry(wallet) {
  if (!currencyBalances.has(wallet)) {
    currencyBalances.set(wallet, { chefcoins: 0, updatedAt: Date.now(), owned: new Set() });
    markBalancesDirty();
  }
  const entry = currencyBalances.get(wallet);
  if (!(entry.owned instanceof Set)) {
    entry.owned = new Set(Array.isArray(entry.owned) ? entry.owned : []);
  }
  return entry;
}

function computeSwapBreakdown(amount) {
  const numeric = Math.max(0, Math.floor(Number(amount) || 0));
  const tax = Math.floor((numeric * SWAP_TAX_BPS) / 10_000);
  const net = Math.max(0, numeric - tax);
  return { amount: numeric, tax, net };
}

async function getMintDecimals() {
  if (!mintPublicKey) {
    throw new Error('GRMC mint not configured');
  }
  if (mintDecimalsCache && Date.now() - mintDecimalsCache.fetchedAt < 60 * 60 * 1000) {
    return mintDecimalsCache.decimals;
  }
  const info = await connection.getParsedAccountInfo(mintPublicKey);
  const decimals = info?.value?.data?.parsed?.info?.decimals;
  if (!Number.isFinite(decimals)) {
    throw new Error('Unable to fetch mint decimals');
  }
  mintDecimalsCache = { decimals: Number(decimals), fetchedAt: Date.now() };
  return mintDecimalsCache.decimals;
}

function toBaseUnits(amount, decimals) {
  const normalized = BigInt(Math.max(0, Math.floor(Number(amount) || 0)));
  const factor = BigInt(10) ** BigInt(decimals);
  return normalized * factor;
}

async function ensureAtaInstruction(ataPublicKey, tokenOwner, payer) {
  const info = await connection.getAccountInfo(ataPublicKey);
  if (info) {
    return null;
  }
  return createAssociatedTokenAccountInstruction(
    payer,
    ataPublicKey,
    tokenOwner,
    mintPublicKey,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
}

function recordTelemetry(event, data = {}) {
  const payload = { event, timestamp: Date.now(), ...data };
  console.log('[telemetry]', payload);
}

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

app.get('/currency/balances', requireSession, (req, res) => {
  const wallet = req.session.publicKey;
  const entry = ensureBalanceEntry(wallet);
  res.json({
    wallet,
    chefcoins: entry.chefcoins,
    chefcoinsToGrmcEnabled: Boolean(treasuryPublicKey),
    chefcoinsToGrmcDisabledReason: treasuryPublicKey ? undefined : 'Treasury not configured.',
  });
});

app.post('/currency/earn', requireSession, (req, res) => {
  const { amount, reason } = req.body || {};
  const numericAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!numericAmount) {
    return res.status(400).json({ error: 'amount must be greater than zero' });
  }
  if (numericAmount > 10_000) {
    return res.status(400).json({ error: 'amount exceeds allowed limit' });
  }
  const wallet = req.session.publicKey;
  const entry = ensureBalanceEntry(wallet);
  entry.chefcoins += numericAmount;
  entry.updatedAt = Date.now();
  markBalancesDirty();
  const normalizedReason = typeof reason === 'string' ? reason.slice(0, 64) : 'gameplay';
  recordTelemetry('earn_awarded', { wallet, amount: numericAmount, reason: normalizedReason });
  res.json({ wallet, chefcoins: entry.chefcoins });
});

app.post('/swap/grmc-to-chefcoins/intent', requireSession, async (req, res) => {
  try {
    if (!mintPublicKey) {
      return res.status(500).json({ error: 'GRMC mint not configured on server' });
    }
    const { amount, purpose } = req.body || {};
    const normalizedPurpose = typeof purpose === 'string' ? purpose : 'swap';
    const isPurchaseTransfer = normalizedPurpose === 'purchase';
    const { amount: normalizedAmount, tax, net } = computeSwapBreakdown(amount);
    if (!normalizedAmount) {
      return res.status(400).json({ error: 'amount must be greater than zero' });
    }
    if (normalizedAmount < MIN_SWAP_AMOUNT) {
      return res.status(400).json({ error: `Minimum swap amount is ${MIN_SWAP_AMOUNT}` });
    }

    const wallet = req.session.publicKey;
    const playerPublicKey = new PublicKey(wallet);
    const devPublicKey = new PublicKey(DEV_WALLET);
    const decimals = await getMintDecimals();
    const rawAmount = toBaseUnits(normalizedAmount, decimals);

    const sourceAta = getAssociatedTokenAddressSync(mintPublicKey, playerPublicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const destinationAta = getAssociatedTokenAddressSync(
      mintPublicKey,
      devPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const instructions = [];
    const maybeCreateDest = await ensureAtaInstruction(destinationAta, devPublicKey, playerPublicKey);
    if (maybeCreateDest) {
      instructions.push(maybeCreateDest);
    }
    instructions.push(createTransferInstruction(sourceAta, destinationAta, playerPublicKey, rawAmount, [], TOKEN_PROGRAM_ID));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: playerPublicKey, recentBlockhash: blockhash });
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    instructions.forEach((instruction) => transaction.add(instruction));

    const serialized = transaction.serialize({ requireAllSignatures: false });
    const intentId = crypto.randomUUID();
    if (!isPurchaseTransfer) {
      grmcSwapIntents.set(intentId, {
        wallet,
        amount: normalizedAmount,
        tax,
        net,
        rawAmount: rawAmount.toString(),
        createdAt: Date.now(),
        blockhash,
        lastValidBlockHeight,
      });
    }
    recordTelemetry('swap_intent_created', {
      wallet,
      direction: 'grmc-to-chefcoins',
      amount: normalizedAmount,
      tax,
      net,
      intentId,
      purpose: normalizedPurpose,
    });
    res.json({
      intentId: isPurchaseTransfer ? null : intentId,
      transaction: Buffer.from(serialized).toString('base64'),
      amount: normalizedAmount,
      tax,
      net,
      swapTaxBps: SWAP_TAX_BPS,
    });
  } catch (error) {
    console.error('[GRMC] swap intent error', error);
    res.status(500).json({ error: error?.message || 'Unable to create swap intent' });
  }
});

app.post('/swap/grmc-to-chefcoins/confirm', requireSession, async (req, res) => {
  const { intentId, signature } = req.body || {};
  if (!intentId || typeof intentId !== 'string') {
    return res.status(400).json({ error: 'intentId required' });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'signature required' });
  }

  const intent = grmcSwapIntents.get(intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Swap intent not found' });
  }
  if (intent.wallet !== req.session.publicKey) {
    return res.status(403).json({ error: 'Intent owner mismatch' });
  }

  try {
    const parsed = await connection.getParsedTransaction(signature, { commitment: 'confirmed' });
    if (!parsed) {
      recordTelemetry('swap_failed', { wallet: intent.wallet, intentId, reason: 'transaction_not_found' });
      return res.status(404).json({ error: 'Transaction not found on-chain' });
    }
    if (parsed.meta?.err) {
      recordTelemetry('swap_failed', { wallet: intent.wallet, intentId, reason: 'transaction_failed', err: parsed.meta.err });
      return res.status(400).json({ error: 'Transaction failed on-chain' });
    }

    const mint = mintPublicKey?.toBase58();
    const findBalance = (balances = [], owner) =>
      balances.find((entry) => entry.owner === owner && entry.mint === mint);

    const walletPre = findBalance(parsed.meta?.preTokenBalances, intent.wallet);
    const walletPost = findBalance(parsed.meta?.postTokenBalances, intent.wallet);
    const devPre = findBalance(parsed.meta?.preTokenBalances, DEV_WALLET);
    const devPost = findBalance(parsed.meta?.postTokenBalances, DEV_WALLET);

    const expectedRaw = BigInt(intent.rawAmount);
    if (!walletPre || !walletPost) {
      recordTelemetry('swap_failed', { wallet: intent.wallet, intentId, reason: 'wallet_balance_missing' });
      return res.status(400).json({ error: 'Wallet token balance not present in transaction' });
    }

    const walletDelta = BigInt(walletPre.uiTokenAmount.amount) - BigInt(walletPost.uiTokenAmount.amount);
    if (walletDelta !== expectedRaw) {
      recordTelemetry('swap_failed', { wallet: intent.wallet, intentId, reason: 'amount_mismatch' });
      return res.status(400).json({ error: 'Transferred amount does not match intent' });
    }

    const devDelta = BigInt(devPost?.uiTokenAmount?.amount || 0) - BigInt(devPre?.uiTokenAmount?.amount || 0);
    if (devDelta !== expectedRaw) {
      recordTelemetry('swap_failed', { wallet: intent.wallet, intentId, reason: 'dev_amount_mismatch' });
      return res.status(400).json({ error: 'Developer wallet did not receive expected amount' });
    }

    const entry = ensureBalanceEntry(intent.wallet);
    entry.chefcoins += intent.net;
    entry.updatedAt = Date.now();
    markBalancesDirty();
    grmcSwapIntents.delete(intentId);
    recordTelemetry('swap_confirmed', {
      wallet: intent.wallet,
      direction: 'grmc-to-chefcoins',
      intentId,
      signature,
      amount: intent.amount,
      tax: intent.tax,
      net: intent.net,
    });
    res.json({ wallet: intent.wallet, chefcoins: entry.chefcoins, amount: intent.amount, net: intent.net, tax: intent.tax });
  } catch (error) {
    console.error('[GRMC] swap confirmation error', error);
    res.status(500).json({ error: error?.message || 'Unable to confirm swap' });
  }
});

app.post('/swap/chefcoins-to-grmc', requireSession, async (req, res) => {
  const { amount, destination } = req.body || {};
  const { amount: normalizedAmount, tax, net } = computeSwapBreakdown(amount);
  if (!normalizedAmount) {
    return res.status(400).json({ error: 'amount must be greater than zero' });
  }
  if (normalizedAmount < MIN_SWAP_AMOUNT) {
    return res.status(400).json({ error: `Minimum swap amount is ${MIN_SWAP_AMOUNT}` });
  }
  if (!destination || typeof destination !== 'string') {
    return res.status(400).json({ error: 'destination wallet required' });
  }
  if (!mintPublicKey) {
    return res.status(500).json({ error: 'GRMC mint not configured on server' });
  }
  if (!treasuryKeypair || !treasuryPublicKey) {
    return res.status(500).json({ error: 'Treasury not configured' });
  }

  const wallet = req.session.publicKey;
  if (destination !== wallet) {
    return res.status(400).json({ error: 'destination must match authenticated wallet' });
  }
  const entry = ensureBalanceEntry(wallet);
  if (entry.chefcoins < normalizedAmount) {
    return res.status(400).json({ error: 'Insufficient ChefCoins' });
  }

  entry.chefcoins -= normalizedAmount;

  try {
    const recipient = new PublicKey(destination);
    const decimals = await getMintDecimals();
    const rawAmount = toBaseUnits(net, decimals);
    const treasuryAta = getAssociatedTokenAddressSync(
      mintPublicKey,
      treasuryPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const recipientAta = getAssociatedTokenAddressSync(
      mintPublicKey,
      recipient,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const instructions = [];
    const ensureTreasuryAta = await ensureAtaInstruction(treasuryAta, treasuryPublicKey, treasuryPublicKey);
    if (ensureTreasuryAta) {
      instructions.push(ensureTreasuryAta);
    }
    const ensureRecipientAta = await ensureAtaInstruction(recipientAta, recipient, treasuryPublicKey);
    if (ensureRecipientAta) {
      instructions.push(ensureRecipientAta);
    }

    instructions.push(createTransferInstruction(treasuryAta, recipientAta, treasuryPublicKey, rawAmount, [], TOKEN_PROGRAM_ID));

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: treasuryPublicKey, recentBlockhash: blockhash });
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    instructions.forEach((instruction) => transaction.add(instruction));

    const signature = await connection.sendTransaction(transaction, [treasuryKeypair]);
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    entry.updatedAt = Date.now();
    markBalancesDirty();
    recordTelemetry('swap_confirmed', {
      wallet,
      direction: 'chefcoins-to-grmc',
      amount: normalizedAmount,
      tax,
      net,
      signature,
    });
    res.json({ wallet, chefcoins: entry.chefcoins, signature, amount: normalizedAmount, net, tax });
  } catch (error) {
    entry.chefcoins += normalizedAmount;
    markBalancesDirty();
    console.error('[GRMC] chefcoins->GRMC swap error', error);
    res.status(500).json({ error: error?.message || 'Unable to complete conversion' });
  }
});

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
  if (!itemId) {
    return res.status(400).json({ error: 'itemId required' });
  }
  const numericPrice = Math.max(0, Math.floor(Number(price) || 0));
  if (!numericPrice) {
    return res.status(400).json({ error: 'price must be greater than zero' });
  }
  const intentId = crypto.randomUUID();
  const message = `Confirm purchase of ${itemId} for ${numericPrice} GRMC`;
  purchaseIntents.set(intentId, {
    itemId,
    price: numericPrice,
    message,
    publicKey: req.session.publicKey,
    createdAt: Date.now(),
  });
  res.json({ id: intentId, message });
});

app.post('/purchase/confirm', requireSession, async (req, res) => {
  const { intentId } = req.body || {};
  const intent = purchaseIntents.get(intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Intent not found' });
  }
  if (intent.publicKey !== req.session.publicKey) {
    return res.status(403).json({ error: 'Intent owner mismatch' });
  }

  if (!mintPublicKey) {
    return res.status(500).json({ error: 'GRMC mint not configured' });
  }

  const connectionInstance = getConnection();
  const { price, itemId, publicKey } = intent;

  try {
    const { signature } = req.body || {};
    if (!signature || typeof signature !== 'string') {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const tx = await connectionInstance.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    if (!tx.meta) {
      return res.status(400).json({ error: 'Transaction metadata unavailable' });
    }

    const expectedFrom = new PublicKey(publicKey).toBase58();
    const expectedTo = new PublicKey(DEV_WALLET).toBase58();
    const decimals = await getMintDecimals();
    const expectedRaw = toBaseUnits(price, decimals);

    const mint = mintPublicKey.toBase58();
    const findBalance = (balances = [], owner) =>
      balances.find((entry) => entry.owner === owner && entry.mint === mint);

    const walletPre = findBalance(tx.meta?.preTokenBalances, expectedFrom);
    const walletPost = findBalance(tx.meta?.postTokenBalances, expectedFrom);
    const devPre = findBalance(tx.meta?.preTokenBalances, expectedTo);
    const devPost = findBalance(tx.meta?.postTokenBalances, expectedTo);

    if (!walletPre || !walletPost) {
      return res.status(400).json({ error: 'Wallet token balance not present in transaction' });
    }

    const walletDelta = BigInt(walletPre.uiTokenAmount.amount) - BigInt(walletPost.uiTokenAmount.amount);
    if (walletDelta !== expectedRaw) {
      return res.status(400).json({ error: 'GRMC transfer not found or amount mismatch' });
    }

    const devDelta = BigInt(devPost?.uiTokenAmount?.amount || 0) - BigInt(devPre?.uiTokenAmount?.amount || 0);
    if (devDelta !== expectedRaw) {
      return res.status(400).json({ error: 'Developer wallet did not receive expected amount' });
    }

    purchaseIntents.delete(intentId);
    const entry = ensureBalanceEntry(publicKey);
    entry.owned ??= new Set();
    entry.owned.add(itemId);
    entry.updatedAt = Date.now();
    markBalancesDirty();

    recordTelemetry('purchase_confirmed', { wallet: publicKey, itemId, price, signature });
    return res.json({ ok: true, owned: Array.from(entry.owned) });
  } catch (e) {
    console.error('Purchase confirm failed', e);
    return res.status(500).json({ error: 'Unable to confirm purchase' });
  }
});

app.get('/purchase/owned', requireSession, (req, res) => {
  const wallet = req.session.publicKey;
  const entry = ensureBalanceEntry(wallet);
  res.json({ wallet, owned: Array.from(entry.owned || []) });
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
