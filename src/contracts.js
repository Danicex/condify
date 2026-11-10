import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import { ADDRESSES, DECIMALS, CHAIN_ID_HEX, ERC20_ABI, LOCK_ABI, SWAP_ABI, CONDIFI_ABI } from "./lib/config";

// Nimiq Pay mini apps inject an EVM provider as window.ethereum
// (check the Nimiq mini-app SDK docs; if it exposes a different object,
// only change getProvider below).
function getProvider() {
  if (!window.ethereum) throw new Error("No wallet provider found");
  return new BrowserProvider(window.ethereum);
}

export async function connectWallet() {
  const provider = getProvider();
  await provider.send("eth_requestAccounts", []);
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
  } catch (e) { /* wallet may not support switching; ignore */ }
  const signer = await getProvider().getSigner();
  return { signer, address: await signer.getAddress() };
}

async function signer() { return getProvider().getSigner(); }
const toRaw = (v, t) => parseUnits(String(v), DECIMALS[t]);
const fromRaw = (v, t) => formatUnits(v, DECIMALS[t]);

async function ensureAllowance(token, spender, amountRaw) {
  const s = await signer();
  const c = new Contract(ADDRESSES[token], ERC20_ABI, s);
  const owner = await s.getAddress();
  const current = await c.allowance(owner, spender);
  if (current < amountRaw) {
    const tx = await c.approve(spender, amountRaw);
    await tx.wait();
  }
}

// ---------- balances ----------
export async function getBalance(token /* "USDT" | "NIM" */) {
  const s = await signer();
  const c = new Contract(ADDRESSES[token], ERC20_ABI, s);
  return fromRaw(await c.balanceOf(await s.getAddress()), token);
}

// testnet only: mint yourself tokens
export async function mintTestTokens(token, amount) {
  const s = await signer();
  const c = new Contract(ADDRESSES[token], ERC20_ABI, s);
  await (await c.faucet(toRaw(amount, token))).wait();
}

// ---------- sign-in ----------
/** personal_sign of the backend's login message. It proves wallet ownership and moves no funds. */
export async function signMessage(message) {
  return (await signer()).signMessage(message);
}

// ---------- LOCK (per goal) ----------
function lockContract(s) {
  if (!ADDRESSES.LOCK) throw new Error("Lock contract not set. Deploy USDTlock and put its address in VITE_LOCK_ADDRESS.");
  return new Contract(ADDRESSES.LOCK, LOCK_ABI, s);
}

/** Lock USDT for goal `goalId` (the backend's goal id) until `unlockAtMs`. Asks for an approve first if needed. */
export async function lockGoal(goalId, amount, unlockAtMs) {
  const raw = toRaw(amount, "USDT");
  await ensureAllowance("USDT", ADDRESSES.LOCK, raw);
  const c = lockContract(await signer());
  return (await c.lock(goalId, raw, BigInt(Math.floor(unlockAtMs / 1000)))).wait();
}

/** After the lock period: the contract pays the goal's owner. The user signs and pays the gas for this one. */
export async function withdrawGoal(goalId) {
  const s = await signer();
  return (await lockContract(s).withdraw(await s.getAddress(), goalId)).wait();
}

/** Fallback only: submit a task key yourself (you pay the gas) if the backend's relayer could not. Funds still go to the owner. */
export async function unlockWithKey(user, goalId, key) {
  const c = lockContract(await signer());
  return (await c.unlockWithKey(user, goalId, key.nonce, key.expiry, key.signature)).wait();
}

export async function viewLockedUSDT() {
  const s = await signer();
  const c = lockContract(s);
  return fromRaw(await c.viewLockedUSDT(await s.getAddress()), "USDT");
}

// ---------- SWAP ----------
export async function quoteSwap(from /* "USDT"|"NIM" */, amount) {
  const c = new Contract(ADDRESSES.SWAP, SWAP_ABI, await signer());
  const raw = toRaw(amount, from);
  if (from === "USDT") return fromRaw(await c.quoteUsdtToNim(raw), "NIM");
  return fromRaw(await c.quoteNimToUsdt(raw), "USDT");
}

export async function swapUSDTforNIM(amount) {
  const raw = toRaw(amount, "USDT");
  await ensureAllowance("USDT", ADDRESSES.SWAP, raw);
  const c = new Contract(ADDRESSES.SWAP, SWAP_ABI, await signer());
  return (await c.swapUSDTforNIM(raw)).wait();
}

export async function swapNIMforUSDT(amount) {
  const raw = toRaw(amount, "NIM");
  await ensureAllowance("NIM", ADDRESSES.SWAP, raw);
  const c = new Contract(ADDRESSES.SWAP, SWAP_ABI, await signer());
  return (await c.swapNIMforUSDT(raw)).wait();
}

// ---------- SEND ----------
export async function sendUSDT(to, amount) {
  const raw = toRaw(amount, "USDT");
  await ensureAllowance("USDT", ADDRESSES.CONDIFI, raw);
  const c = new Contract(ADDRESSES.CONDIFI, CONDIFI_ABI, await signer());
  return (await c.sendUSDT(to, raw)).wait();
}

export async function sendNIM(to, amount) {
  const raw = toRaw(amount, "NIM");
  await ensureAllowance("NIM", ADDRESSES.CONDIFI, raw);
  const c = new Contract(ADDRESSES.CONDIFI, CONDIFI_ABI, await signer());
  return (await c.sendNIM(to, raw)).wait();
}
