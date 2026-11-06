# Nimlock: dummy data map and how to replace it

Wallet connection is treated as working. The only contract the rest of the app needs from it is
`wallet = { provider, address }` in `AppContext`. Everything below is what is still fake.

## 1. Where the dummy data lives

| # | File : line | What is fake | Real source |
|---|---|---|---|
| 1 | `src/context/AppContext.jsx` : 11–15 `seedGoals` | 3 pre-made goals (Emergency Fund, Staking Node, Holiday Trip) | Backend `goals` table, mirrored by the lock contract |
| 2 | `AppContext.jsx` : 17–21 `seedConditions` | 3 pre-made rules | Backend `conditions` table |
| 3 | `AppContext.jsx` : 23–28 `seedActivity` | 4 fake feed items | Backend `activity` table or chain events |
| 4 | `AppContext.jsx` : 35 `stats {tasksDone: 7, streak: 4}` | hardcoded counters | Derived on the server from `task_completions` |
| 5 | `AppContext.jsx` : `addGoal / liquidateGoal / addCondition / toggleCondition / removeCondition / log` | only mutate local React state, lost on reload | API calls plus contract calls (section 3) |
| 6 | `src/screens/Dashboard/dashboard.jsx` : 12–17 `MARKET` | BTC/ETH/SOL/NMI prices and 24h change | Price API (via your backend) |
| 7 | `dashboard.jsx` : 18–22 `ALLOC` | fixed 52/28/20 allocation | Computed: on-chain balances × prices |
| 8 | `dashboard.jsx` : 41 `+ 1405` | fake free-wallet balance added to the total | Real wallet balances |
| 9 | `dashboard.jsx` : 75 `+14.2% pool interest` | hardcoded yield | Yield source or contract, or remove the line |
| 10 | `dashboard.jsx` : 43 `dailyTask` | picked client-side by day number | Server picks the daily challenge |
| 11 | `dashboard.jsx` : 52 `'Saver'`, `settings.jsx` : 28 `'Nimlock user'` | name fallback outside Telegram | Fine to keep as a fallback |
| 12 | `src/screens/Swap/swap.jsx` : 10 `PRICE`, 11 `BAL` | prices and wallet balances | Quote API and chain balances |
| 13 | `swap.jsx` : 20 `* 0.9985`, 56 `Slippage 0.15%` | fake fee and slippage | Real quote (`amountOut`, `priceImpact`, `fee`) |
| 14 | `swap.jsx` : 25–29 `exec` | logs locally, no transaction | Build, sign and send a swap tx |
| 15 | `src/screens/Goals/conditional_wealth.jsx` : 33 | prefilled CoinGecko URL | UI example only; fine |
| 16 | `conditional_wealth.jsx` : `submit` | stores the rule in local state only | `POST /conditions` |
| 17 | `src/screens/Goals/create_goal_form.jsx` : 41 | `addGoal` only updates state, no funds move | Contract `createGoal` call, then `POST /goals` |
| 18 | `src/screens/Goals/goal_detail.jsx` : `release()` | marks the goal liquidated locally | Server-verified task, then contract release |
| 19 | `src/data/task.js` | all tasks **and their correct answers** ship in the bundle | Move to server; the client gets questions only |
| 20 | `src/components/TaskRunner.jsx` | the client decides pass or fail | Server decides (section 3d) |
| 21 | `src/screens/SettingsScreen/settings.jsx` : 71–73 | Notifications, Geofencing and Haptics switches are uncontrolled and not saved | `PATCH /me/settings` |
| 22 | `settings.jsx` : "System log history" row | does nothing | Page over `GET /activity` |
| 23 | `src/App.jsx` : 31–48 | wallet session kept in `localStorage` as plain JSON | Signed session token (section 3a) |
| 24 | `screens/ConnectWallet/connect_wallet.jsx` : `fakeAddress`, `setTimeout` | mock handshake | You replaced this already |
| 25 | `screens/AssetPage`, `screens/LaunchScreen/launch_screen.jsx` | placeholder, never used (LaunchScreen is the real landing page) | Delete AssetPage or build it |

`useTheme.jsx` also uses `localStorage`. That is a legitimate per-device preference, not dummy data.

## 2. Target architecture

```
React (this app) ──► Your API (Node/Nest/Fastify) ──► Postgres + Redis
      │                      │  ▲
      │                      │  └── worker: condition evaluator (cron/queue)
      │                      └────► price feed, swap aggregator, RPC node
      └────────────────────────────► wallet ► lock contract (funds are held here)
```

Rules of thumb:
- **Money lives on-chain.** The database holds metadata (name, task, history) and never decides who gets funds.
- **The client is never trusted.** Task pass/fail, prices used for swaps and Telegram identity are all verified server-side.
- Keep the UI as is. Replace `AppContext` internals; screens keep calling `addGoal`, `liquidateGoal` and so on.

## 3. How to implement it

### a) Auth (do this first, everything else hangs off it)
1. On connect, the backend issues a nonce. The wallet signs it (SIWE for EVM, `ton_proof` for TON).
2. `POST /auth/wallet {address, signature, nonce}` returns a short-lived JWT in an httpOnly cookie or memory.
   Delete the `localStorage` wallet in `App.jsx`; on load call `GET /me` to restore the session.
3. Inside Telegram also send `window.Telegram.WebApp.initData` and verify it on the server (HMAC-SHA256 with a key derived from your bot token). This links the Telegram user to the wallet.

```js
// src/lib/api.js
const BASE = import.meta.env.VITE_API_URL
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || '' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText)
  return res.json()
}
```

### b) Replace `AppContext` with real data
Install TanStack Query (`npm i @tanstack/react-query`) and swap the seed state for queries. Keep the same exported names so screens barely change:

```js
const goals = useQuery({ queryKey: ['goals'], queryFn: () => api('/goals') }).data ?? []
const addGoal = useMutation({ mutationFn: createGoalOnChainThenApi, onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }) })
```

Endpoints to build:

| Method | Path | Replaces |
|---|---|---|
| GET `/me` | session, settings, stats `{tasksDone, streak}` | #4, #21 |
| GET/POST `/goals`, GET `/goals/:id` | #1, #17 | |
| POST `/goals/:id/challenge`, POST `/goals/:id/liquidate` | #18–20 | |
| GET/POST/PATCH/DELETE `/conditions` | #2, #16 | |
| GET `/activity?cursor=` | #3, #22 | |
| GET `/prices?symbols=` | #6, #12 | |
| GET `/portfolio` | #7–9 | |
| GET `/swap/quote`, POST `/swap/prepare` | #12–14 | |
| GET `/tasks/daily` | #10 | |

Suggested tables: `users(id, address, telegram_id, settings jsonb)`, `goals(id, user_id, name, amount, token, created_at, unlock_at, task_id, status, chain_tx, chain_goal_id)`, `task_completions(id, user_id, goal_id, task_id, completed_at)`, `conditions(id, user_id, type, config jsonb, action jsonb, enabled, last_run_at)`, `activity(id, user_id, kind, text, tx_hash, at)`.

### c) Goals, which are the core of the product
1. **Create:** the user signs `createGoal(token, amount, unlockAt, taskCommitment)` on the lock contract. Your API then records the goal once the tx confirms. Do not create the DB row first.
2. **Withdraw after the lock ends:** the contract allows `withdraw(goalId)` once `block.timestamp >= unlockAt`, so no server involvement.
3. **Liquidate early:** the contract only accepts `liquidate(goalId, attestation)`, where the attestation is signed by your backend key (section d).
4. Progress and days left stay computed in the UI from `createdAt` and `unlockAt`.

### d) Task verification (critical)
Today `task.js` includes the right answers, and `TaskRunner` decides success, so anyone can bypass it in dev tools.
- Move task content to the server. `POST /goals/:id/challenge` returns the question or memory sequence plus a `challengeId`. Never send the answer.
- `POST /goals/:id/liquidate {challengeId, answer}` checks the answer server-side, rate-limits attempts and enforces timing. Timer tasks need a server-side start and end timestamp, so the server rejects a plank "completed" in 3 seconds.
- On success the server signs the attestation (goalId, user, nonce, expiry) and returns it for the contract call.
- **Fitness tasks cannot be proven from a web app.** Rep counters and "I walked" are honour-system. Be upfront that these are self-reported, or integrate Apple Health / Google Fit / camera pose detection later.

### e) Prices, balances, swap
- **Prices:** backend proxies CoinGecko, Pyth or Chainlink with a 10–30 s cache (hides the API key, avoids rate limits). The UI polls `/prices` every 30 s.
- **Balances:** read ERC-20 `balanceOf` (viem/wagmi) or TON jetton balances for the connected address. Total portfolio = Σ balance × price, plus locked amounts from the contract. This replaces #7, #8 and #12.
- **Swap:** use an aggregator (1inch/0x on EVM, STON.fi or DeDust on TON, Jupiter on Solana). `GET /swap/quote` returns `amountOut`, price impact and fee; show those instead of the hardcoded 0.15%. The user signs the returned transaction in their wallet; then log it to `activity`.
- Drop or replace the "+14.2% pool interest" line unless you actually have a yield source.

### f) Conditional wealth
The UI only collects rules; evaluation is a backend worker.
- **Time:** a scheduled job (BullMQ, pg-boss or cron) fires at `config.when` and handles repeat.
- **API (What):** the worker fetches `config.url` with `config.body` headers, reads `config.path` from the JSON, compares with `op`/`value`, and fires once (add a cooldown). Block internal IPs, cap response size and set timeouts, since users can enter arbitrary URLs (SSRF risk). Store secrets server-side only.
- **Location (Where):** a web app **cannot track location in the background**. Telegram's LocationManager and `navigator.geolocation` only work while the app is open. Options: (1) evaluate when the app is opened or foregrounded and send the position to `/conditions/check-location`; (2) use a native companion app for real geofencing. Set the Settings toggle expectations accordingly.
- **Actions:** automatic swaps or releases need either a pre-approved allowance or a user signature, so the worker can't move funds on its own. Typically the rule triggers a notification, and the user confirms in one tap. Fully automatic actions need a smart-contract vault with scoped permissions.
- Notify via the Telegram Bot API `sendMessage` (that is what the Notifications toggle should control).

### g) Smaller replacements
- Stats: `tasksDone` = count of `task_completions`; `streak` = consecutive days with at least one completion.
- Activity: write a row on every mutation (server side), not from the client `log()`.
- Settings switches: make them controlled, load from `/me`, save with `PATCH /me/settings`.
- Daily challenge: `GET /tasks/daily` (e.g. seeded by date), same task for everyone or per user.

## 4. Suggested order
1. Auth and `/me` (section a)
2. Prices and balances, which makes the Home and Swap numbers real
3. Lock contract plus Goals create/withdraw
4. Server-side tasks and liquidation
5. Activity, stats, settings
6. Swap execution
7. Condition worker (time and API first, location last)

Delete the `seed*` constants and the `MARKET`, `ALLOC`, `PRICE`, `BAL` constants as each piece goes live. Search for `TODO` and `seed` to confirm none remain.
