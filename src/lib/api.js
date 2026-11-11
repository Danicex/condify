/**
 * HTTP client for the Condify FastAPI backend.
 * Base URL: VITE_API_URL (e.g. http://localhost:8000).
 * Auth: setAuth({ token }) after the wallet-signature login (lib/auth.js). setAuth({ devAddress }) is the dev header
 * (backend needs AUTH_DEV_MODE=1, and it is only sent by dev builds).
 */
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

let auth = { token: null, devAddress: null }
let unauthorizedHandler = null
export const setAuth = (a) => { auth = { token: a?.token ?? null, devAddress: a?.devAddress ?? null } }
/** Called when a request that carried a token comes back 401 (expired / invalid session). */
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn }

const detailText = (d, status) => {
  if (typeof d === 'string' && d) return d
  if (Array.isArray(d) && d.length) return d.map((x) => x?.msg).filter(Boolean).join(', ')
  return `API ${status}`
}

async function request(method, path, body) {
  const headers = {}
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  else if (import.meta.env.DEV && auth.devAddress) headers['X-Dev-Address'] = auth.devAddress

  let payload
  if (body instanceof FormData) payload = body // the browser sets the multipart boundary itself
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }

  const hadToken = !!auth.token
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* not json */ }
    const err = new Error(detailText(detail, res.status))
    err.status = res.status
    if (res.status === 401 && hadToken) unauthorizedHandler?.()
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// ---- mapping: backend (snake_case, ISO dates) <-> frontend (camelCase, ms timestamps) ----
// The API sends UTC; a timestamp without a zone marker is treated as UTC (never as the phone's local time).
const ts = (s) => (s ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`) : null)
const iso = (ms) => new Date(ms).toISOString()

const goalIn = (g) => ({
  id: g.id, name: g.name, amount: g.amount, token: g.token, status: g.status,
  taskCategory: g.task_category, taskDifficulty: g.task_difficulty,
  txHash: g.tx_hash, releaseTxHash: g.release_tx_hash,
  createdAt: ts(g.created_at), unlockAt: ts(g.unlock_at), liquidatedAt: ts(g.liquidated_at),
})
const activityIn = (a) => ({ id: a.id, kind: a.kind, text: a.text, txHash: a.tx_hash, at: ts(a.created_at) })
const taskIn = (t) => ({ id: t.id, goalId: t.goal_id, category: t.category, at: ts(t.completed_at) })

// ---- auth (wallet signature login) ----  
export const getNonce = (address) => request('GET', `/auth/nonce?address=${encodeURIComponent(address)}`)
export const login = (address, signature) => request('POST', '/auth/login', { address, signature })
export const createUser = ({ address, username, signature, nimAddress }) =>
  request('POST', '/auth/create_user', { address, username, signature, nim_address: nimAddress ?? null })
export const me = () => request('GET', '/me')

// ---- goals: create (pending) -> lock on-chain -> confirm (the backend reads the contract) ----
export const listGoals = async () => (await request('GET', '/goals?limit=500')).map(goalIn)
export const createGoal = async (g) =>
  goalIn(await request('POST', '/goals', { name: g.name, amount: g.amount, token: g.token, unlock_at: iso(g.unlockAt), task_category: g.taskCategory, task_difficulty: g.taskDifficulty }))
export const deleteGoal = (id) => request('DELETE', `/goals/${id}`) // only allowed while unconfirmed
export const confirmGoal = async (id, txHash) => goalIn(await request('POST', `/goals/${id}/confirm`, { tx_hash: txHash ?? null }))
/** After the user's own on-chain withdraw: the backend reads the contract and marks the goal liquidated. */
export const syncGoal = async (id) => goalIn(await request('POST', `/goals/${id}/sync`))
/** Retry the backend -> contract release for a goal whose task was passed. */
export const releaseGoal = async (id) => {
  const r = await request('POST', `/goals/${id}/release`)
  return { released: r.released, txHash: r.tx_hash, error: r.error, goal: goalIn(r.goal) }
}

// ---- AI unlock tasks ----
/** The goal's latest task, or null when none exists yet. The answer key never reaches the client. */
export const getTask = async (goalId) => {
  try { return await request('GET', `/goals/${goalId}/task`) } catch (e) { if (e.status === 404) return null; throw e }
}
/** Returns the goal's live task, asking the AI for a new one if there is none (or the last one was failed). The task
 *  category and difficulty are the ones chosen when the goal was created. */
export const generateTask = (goalId) => request('POST', `/goals/${goalId}/task`)
/** Fallback only: the signed task key, so the user can submit it from their own wallet if the backend relayer is down. */
export const getUnlockKey = (goalId) => request('GET', `/goals/${goalId}/unlock-key`)
/** Submit proof. `file` is an image / audio / video File, `text` the typed answer or note. */
export const verifyTask = (goalId, { text, file }) => {
  const fd = new FormData()
  if (text) fd.append('text', text)
  if (file) fd.append('file', file)
  return request('POST', `/goals/${goalId}/task/verify`, fd)
}
export const listTaskCompletions = async () => (await request('GET', '/tasks?limit=500')).map(taskIn)

// ---- rules (conditions / Automate): backend shape already matches the UI ----
export const listRules = () => request('GET', '/rules?limit=500')
export const createRule = (r) => request('POST', '/rules', r)
export const setRuleEnabled = (id, enabled) => request('PATCH', `/rules/${id}`, { enabled })
export const deleteRule = (id) => request('DELETE', `/rules/${id}`)

// ---- activity (lock / unlock rows are written by the server; swap / send / rule by the client) ----
export const listActivity = async () => (await request('GET', '/activities?limit=50')).map(activityIn)
export const createActivity = async ({ kind, text, txHash }) => activityIn(await request('POST', '/activities', { kind, text, tx_hash: txHash ?? null }))
