# Gordon's Blocky Kitchen Brigade

A retro-leaning browser management game inspired by Overcooked where you guide pixelated Gordon Ramsay through a Minecraft-style
kitchen. Three escalating services (3, 4, and 4 minutes long) challenge you to clear specific score targets by completing
Minecraft-inspired recipes before their order timers expire. The kitchen supports mouse clicks and mobile taps.

## Game loop

- **Grab ingredients** from the supply crates on the left wall.
- **Prep** anything that needs chopping on the cutting boards.
- **Cook** items on the matching stove type (skillet or cauldron) until they hit the cooked stage.
- **Plate and serve** finished ingredients at the plating counter to fill customer orders. Clear every ingredient on a ticket to
  bank the recipe's point value before its personal timer runs out.
- **Keep moving!** Wandering zombie sous-chef adds ambience with random groans while you chase high scores.

The project uses the Phaser 3 engine to deliver a Unity-like scene flow within the constraints of a lightweight web build, so it
remains easy to run locally while still providing a structured engine-driven experience.

## Levels & scoring

- **Level 1 – Tutorial Service (3 minutes, goal: 32 pts):** Serve one easy, one medium, and one hard recipe to learn the flow.
- **Level 2 – Dinner Rush (4 minutes, goal: 100 pts):** Maintain a steady rhythm as overlapping tickets demand quick multitasking.
- **Level 3 – Chef Showdown (4 minutes, goal: 130 pts):** Keep every station humming to break the final score threshold and view
  the BigRigDev thank-you message while future content is still in development.

Recipe difficulty determines its value: easy dishes award 6 points, medium dishes give 10 points, and hard dishes deliver 16
points. Clearing a level requires meeting or exceeding its point target before time expires.

## Running locally

1. Clone or download this repository.
2. Open `index.html` in any modern desktop or mobile browser. No build step is required.
3. Tap or click stations to direct Gordon around the kitchen and push your service score as high as possible before time expires.

## Hosting on your website

Because the project is a static HTML/JS/CSS bundle, you can deploy it with any static host:

- **Traditional web servers:** Copy the repository contents to the public directory of Apache, Nginx, IIS, etc. Ensure the files are
  served over HTTPS for best mobile compatibility.
- **Static site platforms:** Drop the files into Netlify, Vercel, Cloudflare Pages, GitHub Pages, or similar. Point the platform at the
  repository (or a deployment branch) and configure the build command to `None` so the files are shipped as-is.
- **Self-hosted object storage/CDN:** Upload to an S3-compatible bucket, enable static-site mode, and map your domain via DNS.

Whichever route you choose, the entry point is `index.html`. If you later introduce routing, configure the host to redirect unknown
paths back to that file so Phaser can boot correctly.

## Adding leaderboards

Keeping per-level leaderboards requires a small backend or serverless function that can store scores. A minimal architecture looks like:

1. **API endpoint:** Create a `/scores` endpoint (REST or GraphQL) that supports `POST` for submitting `{ playerName, levelId, score }`
   and `GET` for retrieving the top entries per level. Serverless functions (Netlify Functions, Cloudflare Workers, AWS Lambda) keep
   this lightweight.
2. **Persistence layer:** Use a managed database such as Firebase Realtime Database, Supabase/Postgres, or Fauna. Store level ID,
   player name/handle, score, and timestamp. Add indexes on `(levelId, score)` so you can fetch the top N scores quickly.
3. **Client integration:** Extend `game.js` to hit the `/scores` endpoint when a service ends. Fetch and render the current leaderboard
   in a HUD panel or modal. Cache responses client-side so the UI remains responsive between network calls.
4. **Anti-cheat considerations:** Require authenticated users (email/password, OAuth, or wallet-based login), validate scores on the
   server (e.g., ensure duration matches the level's timer), and rate-limit submissions.

## Connecting the GRMC Solana token

To tie the GRMC memecoin into the game economy and create demand:

- **Wallet gating:** Require players to connect a Solana wallet via libraries like `@solana/web3.js` and `@solana/wallet-adapter`. Offer
  cosmetic rewards or access to special events for wallets holding a threshold of GRMC tokens.
- **On-chain rewards:** Emit GRMC token drops when players complete weekly challenges or place on the leaderboard. Use a backend to sign
  transactions or integrate with custodial services that can send tokens securely.
- **In-game shop:** Introduce a cosmetics or boost store where purchases are denominated in GRMC. Process payments through Solana smart
  contracts or an off-chain order flow that settles on-chain.
- **Token sinks:** Offer limited-time events, kitchen themes, or premium levels that consume GRMC to enter, ensuring ongoing token
  utility.

When adding wallet support, host over HTTPS, follow Solana best practices for signing/transaction handling, and communicate clearly how
player data and tokens are used. Pair the token integration with marketing beats (weekly tournaments, collaboration drops) to keep
interest high.
