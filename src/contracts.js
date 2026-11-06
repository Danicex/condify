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

// ---------- LOCK / UNLOCK / VIEW ----------
export async function lockUSDT(amount) {
  const raw = toRaw(amount, "USDT");
  await ensureAllowance("USDT", ADDRESSES.LOCK, raw);
  const c = new Contract(ADDRESSES.LOCK, LOCK_ABI, await signer());
  return (await c.lockUSDT(raw)).wait();
}

export async function unlockUSDT(amount) {
  const c = new Contract(ADDRESSES.LOCK, LOCK_ABI, await signer());
  return (await c.unlockUSDT(toRaw(amount, "USDT"))).wait();
}

export async function viewLockedUSDT() {
  const s = await signer();
  const c = new Contract(ADDRESSES.LOCK, LOCK_ABI, s);
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
