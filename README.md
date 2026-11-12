# Nimlock: Nimiq Pay mini app

React + Vite + Tailwind v4 + shadcn/ui + lucide-react. Runs **inside Nimiq Pay** (Mini Apps).

```bash
npm install
npm run dev -- --host      # prints a "Network" URL, e.g. http://192.168.1.20:5173
npm run build
```

## How the wallet works
| Piece | File | Notes |
|---|---|---|
| Connect + NIM/USDT reads | `src/lib/nimiq.js` | `init()` → `listAccounts()` → `getBalance()` (Luna → NIM); `window.ethereum` → USDT on Polygon via `eth_call balanceOf` |
| Polling hook | `src/hooks/useBalances.js` | refreshes every 20 s, on focus and on demand |
| Connect screen | `src/screens/ConnectWallet/connect_wallet.jsx` | auto-connects; shows "Open in Nimiq Pay" in a normal browser |
| Balance card | `src/screens/Dashboard/dashboard.jsx` | real NIM + USDT |
| Diagnostics | Settings → Wallet diagnostics | shows addresses, chain id, balances, errors (no dev console on a phone) |

## Run it inside Nimiq Pay
1. Phone with Nimiq Pay installed, on the **same Wi-Fi** as your computer.
2. `npm run dev -- --host`, copy the **Network URL** (not localhost).
3. Nimiq Pay → **Mini Apps** → enter that URL.
4. Deployed (HTTPS) apps can be opened with `nimiqpay://miniapp?url=your-app.com` or `https://nimpay.app/miniapps/open/your-app.com`.

Testnet: long-press the Nimiq Pay settings button ~10 s → dev menu → Testnet (affects NIM only; EVM stays on mainnet).

## Dev-only demo
`npm run dev` in a desktop browser shows a "continue with demo wallet" button (fake balances). It is not included in production builds.

See `DUMMY_DATA.md` for everything that is still mock data.

## License
This project is licensed under the [MIT License](LICENSE).
