/**
 * HTTP client for the Nimlock FastAPI backend.
 * Base URL: VITE_API_URL (e.g. http://localhost:8000). Auth is set once per session with setAuth().
 */
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

let auth = { token: null, devAddress: null }
/** setAuth({ token }) once wallet-signature login exists; setAuth({ devAddress }) for the dev header (backend needs AUTH_DEV_MODE=1). */
export const setAuth = (a) => { auth = { token: a?.token ?? null, devAddress: a?.devAddress ?? null } }

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`
  else if (import.meta.env.DEV && auth.devAddress) headers['X-Dev-Address'] = auth.devAddress

  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).detail } catch { /* not json */ }
    const err = new Error(typeof detail === 'string' && detail ? detail : `API ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// ---- mapping: backend (snake_case, ISO dates) <-> frontend (camelCase, ms timestamps) ----
const ts = (s) => (s ? Date.parse(s) : null)
const iso = (ms) => new Date(ms).toISOString()

const goalIn = (g) => ({ id: g.id, name: g.name, amount: g.amount, token: g.token, status: g.status, taskId: g.task_id, txHash: g.tx_hash, createdAt: ts(g.created_at), unlockAt: ts(g.unlock_at), liquidatedAt: ts(g.liquidated_at) })
const activityIn = (a) => ({ id: a.id, kind: a.kind, text: a.text, txHash: a.tx_hash, at: ts(a.created_at) })
const taskIn = (t) => ({ id: t.id, taskId: t.task_id, goalId: t.goal_id, at: ts(t.completed_at) })

// ---- goals ----
export const listGoals = async () => (await request('GET', '/goals?limit=500')).map(goalIn)
export const createGoal = async (g) =>
  goalIn(await request('POST', '/goals', { name: g.name, amount: g.amount, token: g.token, unlock_at: iso(g.unlockAt), task_id: g.taskId, tx_hash: g.txHash ?? null }))
export const markGoalLiquidated = async (id) => goalIn(await request('PATCH', `/goals/${id}`, { status: 'liquidated', liquidated_at: iso(Date.now()) }))

// ---- rules (conditions / Automate): backend shape already matches the UI ----
export const listRules = () => request('GET', '/rules?limit=500')
export const createRule = (r) => request('POST', '/rules', r)
export const setRuleEnabled = (id, enabled) => request('PATCH', `/rules/${id}`, { enabled })
export const deleteRule = (id) => request('DELETE', `/rules/${id}`)

// ---- activity ----
export const listActivity = async () => (await request('GET', '/activities?limit=50')).map(activityIn)
export const createActivity = async ({ kind, text, txHash }) => activityIn(await request('POST', '/activities', { kind, text, tx_hash: txHash ?? null }))

// ---- task completions (drives the "tasks done" and "streak" stats) ----
export const listTaskCompletions = async () => (await request('GET', '/tasks?limit=500')).map(taskIn)
export const recordTaskCompletion = async ({ taskId, goalId }) => taskIn(await request('POST', '/tasks', { task_id: taskId, goal_id: goalId ?? null }))
