/**
 * Wallet-signature login against the backend.
 *   signIn(evmAddress)  -> reuse a saved session if it is still valid, else: nonce -> wallet signs -> POST /auth/login
 *                          returns { token, user }, or { needsUsername, signature } when this wallet has no account yet
 *   register(...)       -> POST /auth/create_user with the SAME signature (the backend did not burn the nonce on the 404)
 * The token lives in sessionStorage (gone when the app closes) and in memory (api.js). Nothing else is persisted.
 */
import * as api from '@/lib/api'
import { signMessage } from '@/contracts'

const KEY = 'condify-session'
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) } catch { return null } }
const save = (s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }

export function clearSession() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  api.setAuth(null)
}

function finish(address, out) {
  save({ address: address.toLowerCase(), token: out.token })
  api.setAuth({ token: out.token })
  return out
}

export async function signIn(address) {
  const addr = address.toLowerCase()
  const saved = read()
  if (saved?.address === addr && saved.token) {
    api.setAuth({ token: saved.token })
    try {
      const user = await api.me()
      if (user.address === addr) return { token: saved.token, user }
    } catch { /* expired or invalid: fall through to a fresh sign-in */ }
    api.setAuth(null)
  }
  const { message } = await api.getNonce(address)
  const signature = await signMessage(message)
  try {
    return finish(addr, await api.login(address, signature))
  } catch (e) {
    if (e.status === 404) return { needsUsername: true, signature } // new wallet: ask for a username next
    throw e
  }
}

export async function register({ address, signature, username, nimAddress }) {
  return finish(address, await api.createUser({ address, username, signature, nimAddress }))
}
