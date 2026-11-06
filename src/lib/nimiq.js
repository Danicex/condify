/**
 * Nimiq Pay integration (the app runs inside Nimiq Pay's WebView).
 *
 *  - Nimiq account → @nimiq/mini-app-sdk (init(), listAccounts())
 *  - Tokens / contracts → window.ethereum injected by Nimiq Pay, via src/contracts.js (Sepolia)
 *
 * Docs: https://nimiq.dev/mini-apps
 */
import { init, getHostNetwork } from '@nimiq/mini-app-sdk'
import { connectWallet } from '@/contracts'


/** True only inside Nimiq Pay (it seeds window.nimiqPay before the page runs). */
export const inNimiqPay = () => typeof window !== 'undefined' && !!window.nimiqPay
export const hostNetwork = () => getHostNetwork?.() ?? window.nimiqPay?.network ?? 'mainnet'

/** SDK calls may resolve to `{ error: { type, message } }` instead of throwing. */
function unwrap(res) {
  if (res && typeof res === 'object' && 'error' in res) {
    throw new Error(res.error?.message || res.error?.type || 'Nimiq Pay returned an error')
  }
  return res
}

/**
 * Connect to Nimiq Pay.
 * Returns { provider, address, nimAddress, evmAddress, evmError, network, nimiq }.
 * `address` mirrors `nimAddress` so the rest of the app can keep using wallet.address.
 */
export async function connectNimiqPay() {
  let nimiq
  try {
    nimiq = await init({ timeout: 8000 })
  } catch {
    throw new Error('NOT_IN_NIMIQ_PAY')
  }

  const accounts = unwrap(await nimiq.listAccounts()) // may prompt the user (unless cached)
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('Nimiq Pay returned no accounts')

  // EVM side (contracts). Optional: the app still connects if this is declined.
  let evmAddress = null
  let evmError = null
  try {
    evmAddress = (await connectWallet()).address // requests accounts + switches to the contracts' chain
  } catch (e) {
    evmError = e?.message || 'EVM account request was declined'
  }

  return { provider: 'Nimiq Pay', address: accounts[0], nimAddress: accounts[0], evmAddress, evmError, network: hostNetwork(), nimiq }
}

/** Best-effort chain id for diagnostics. */
export const getEvmChainId = async () => {
  try { return await window.ethereum?.request({ method: 'eth_chainId' }) } catch { return null }
}

/** DEV ONLY: lets you click through the UI in a normal desktop browser. Never shipped in production builds. */
export const demoWallet = () => ({
  provider: 'Demo (dev only)', demo: true, network: 'testnet', nimiq: null, evmError: null,
  address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000', nimAddress: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
  evmAddress: '0x0000000000000000000000000000000000000001',
})
