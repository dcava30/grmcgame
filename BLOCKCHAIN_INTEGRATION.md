# Solana & GRMC Integration Blueprint

This document outlines concrete patterns for wiring the Phaser-based kitchen game into the Solana ecosystem so GRMC holders can interact with gameplay loops, unlock cosmetics, and appear on verifiable leaderboards.

## 1. Wallet connectivity

1. **Select adapters:** Install `@solana/web3.js` for core RPC calls and the `@solana/wallet-adapter` packages (base + UI layer that fits your tech stack, e.g., `@solana/wallet-adapter-phantom`).
2. **Expose connect UI:** Add a persistent "Connect Wallet" button inside the game's HTML overlay. On desktop, the wallet adapter will launch the extension. On mobile, deep links hand off to the wallet app.
3. **Initialize on boot:** Once Phaser's `preload` runs, initialize the wallet adapter, listen to `connect` / `disconnect` events, and store the public key in a global session store so scenes can query authentication state.
4. **Sign messages:** Before calling any backend endpoint, have players sign a nonce with their wallet. Send the signature + nonce to the backend so it can verify wallet ownership and defend against replay attacks.
5. **Secure transport:** Serve the game over HTTPS, and pin RPC providers (e.g., Triton, Helius, or a self-hosted RPC node) so traffic isn't routed through untrusted relays.

### GRMC holder gating specifics

To completely lock gameplay behind GRMC ownership, line up the following before you touch code:

- **Mint details:** Provide the token mint address, supply decimals, and an explicit minimum balance (e.g., `> 0` GRMC or `>= 5,000`
  GRMC). Engineering cannot implement gating without it.
- **RPC budget:** Decide which RPC provider (and plan tier) you will use. Balance lookups happen on every session start, so free tiers
  can throttle your audience.
- **Adapter matrix:** Confirm which wallets the marketing team plans to support so the adapter packages can be bundled and the UI
  wording can reflect that list.
- **Fallback strategy:** Choose whether non-holders see a teaser trailer, are invited to purchase GRMC, or are simply blocked. That
  informs the UX copywriting.

Implementation blueprint:

1. Add a pre-game modal with a **Connect Wallet** button. Use `wallet.connect()` to capture the player's public key. (The
   shipped build now provides an example in `wallet-gate.js`.)
2. Call `connection.getParsedTokenAccountsByOwner(publicKey, { mint })` via `@solana/web3.js` (or a backend proxy) to load SPL token
   balances.
3. Sum the returned token account balances and compare them to your minimum threshold.
4. If the threshold is met, allow Phaser to start the level selection scene; otherwise show a "GRMC required" message and disable the
   start button. Optionally inject a CTA that deep-links to an exchange page or your mint site.
5. Re-run the check periodically or when the wallet emits a `accountChange` event so players who sell their tokens mid-session can be
   gently warned or disconnected after a grace period.

## 2. Hybrid leaderboard architecture

A dual-layer architecture keeps the leaderboard snappy while still anchoring high scores to the chain:

| Step | Component | Purpose |
| --- | --- | --- |
| 1 | Client (game) | Submits `{ levelId, score, runDuration }` alongside the wallet signature to your backend immediately after a run. |
| 2 | Backend (serverless or microservice) | Validates the signature, re-computes the expected duration based on level metadata, and rate-limits by wallet address. Writes the accepted score to a low-latency database (Postgres/Supabase, Fauna, DynamoDB). |
| 3 | Backend (same process) | Batches the day's top N entries per level and calls a Solana program that appends them to an on-chain PDA (Program Derived Address) for public verification. |
| 4 | Solana program | Enforces that scores only increase for a given wallet + level combo and keeps a rolling history. Emits events for analytics/streamers. |
| 5 | Client | Reads the cached leaderboard from the database for immediate UX, and optionally fetches the on-chain PDA to verify marquee scores. |

This approach gives you instant refresh in-game while still producing a cryptographically verifiable audit trail for marketing and tournaments.

## 3. GRMC utility loops

### Cosmetic store

- Host a catalog JSON that lists skins, emotes, and kitchen themes priced in GRMC.
- When a player selects an item, your backend constructs a transaction transferring the GRMC amount to the treasury address and returns it for the player to sign.
- After confirmation, persist the unlock in the player's profile and surface it in-game the next time they connect.

### Premium events & battle pass

- Gate special weekend levels or "Chef Trials" behind a GRMC entry fee.
- Use a Solana program to escrow the fee and distribute rewards (exclusive recipes, leaderboard multipliers) based on participation.

### Reward multipliers

- For wallets holding a threshold (e.g., 5,000 GRMC), automatically apply a +10% score multiplier or double cosmetics drop rate by reading token accounts when the player connects.

## 4. Operational considerations

- **Custodial fallback:** Provide an email-based custodial wallet option for casual players so they can still engage with tokenized features without prior Solana experience.
- **Compliance & terms:** Update your Terms of Service and privacy policy to reflect on-chain transactions, potential token rewards, and regional restrictions.
- **Analytics:** Capture wallet connection events, on-chain spend, and leaderboard submissions in a product analytics platform to measure token-driven retention.
- **Support:** Prepare documentation and helpdesk macros covering wallet troubleshooting, RPC outages, and transaction delays.

By blending fast off-chain UX with verifiable on-chain checkpoints, you can deliver a smooth casual cooking experience that still showcases the GRMC token's utility.
