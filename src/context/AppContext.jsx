import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DAY } from '@/lib/utils'
import { useBalances } from '@/hooks/useBalances'
import { lockGoal, unlockWithKey, withdrawGoal } from '@/contracts'
import { clearSession } from '@/lib/auth'
import * as api from '@/lib/api'

/**
 * App state.
 *  - Sign-in: wallet signature -> JWT (src/lib/auth.js). Every request carries it; a 401 logs the user out.
 *  - Money moves on-chain (src/contracts.js). Goals mirror the contract: the backend READS the contract before it marks
 *    a goal active or liquidated, so the UI only ever shows what the chain says.
 *  - Goal lifecycle: create (pending) -> user locks on-chain -> backend confirms -> active -> released.
 *    Early release = pass the AI task -> the backend relays the signed key to the contract (components/AiTask.jsx).
 *  - Rules, activity and task completions live in the FastAPI backend. Nothing is persisted in localStorage.
 */
const AppCtx = createContext(null)

const dayKey = (ms) => Math.floor(ms / DAY)
/** Consecutive days with at least one completed task, counting back from today (or yesterday if none today). */
function streakOf(times) {
  const days = new Set(times.map(dayKey))
  let d = dayKey(Date.now())
  if (!days.has(d)) d -= 1
  let n = 0
  while (days.has(d)) { n += 1; d -= 1 }
  return n
}
const errText = (e) => e?.shortMessage || e?.reason || e?.message || 'Request failed'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The chain can lag a few seconds behind the wallet's confirmation, so ask the backend to confirm a few times. */
async function confirmWithRetry(id, txHash) {
  let last
  for (let i = 0; i < 5; i += 1) {
    try { return await api.confirmGoal(id, txHash) } catch (e) {
      last = e
      if (e.status !== 409 && e.status !== 503 && e.status !== undefined) break // a real rejection: don't hammer it
      await sleep(2500)
    }
  }
  throw last
}

export function AppProvider({ children }) {
  const [wallet, setWallet] = useState(null) // from connectNimiqPay(), plus { user } after sign-in
  const balances = useBalances(wallet)

  const [allGoals, setAllGoals] = useState([]) // includes `pending` rows (lock sent, not confirmed yet)
  const [conditions, setConditions] = useState([])
  const [activity, setActivity] = useState([])
  const [taskTimes, setTaskTimes] = useState([]) // completion timestamps (ms)
  const [loaded, setLoaded] = useState(false)
  const [syncError, setSyncError] = useState(null) // shown as a banner when the backend is unreachable / a save failed

  const owner = wallet ? wallet.evmAddress || wallet.address : null
  const live = !!wallet && !wallet.demo // the demo wallet (dev only) has no keys: it can browse but not move money

  // goals the user should see: unconfirmed rows stay hidden until the backend finds the lock on-chain
  const goals = useMemo(() => allGoals.filter((g) => g.status !== 'pending'), [allGoals])
  const goalsRef = useRef(allGoals)
  goalsRef.current = allGoals

  const upsertGoal = useCallback((row) => setAllGoals((gs) => (gs.some((g) => g.id === row.id) ? gs.map((g) => (g.id === row.id ? row : g)) : [row, ...gs])), [])

  // ---- load everything for this user from the backend ----
  const load = useCallback(async () => {
    const [g, r, a, t] = await Promise.all([api.listGoals(), api.listRules(), api.listActivity(), api.listTaskCompletions()])
    setAllGoals(g); setConditions(r); setActivity(a); setTaskTimes(t.map((x) => x.at).filter(Boolean))

    // Reconcile with the chain (best effort): a lock whose confirmation never came back, or a withdraw done in the wallet.
    const now = Date.now()
    const fixes = g.filter((x) => x.status === 'pending' || (x.status === 'active' && x.unlockAt <= now))
    if (fixes.length) {
      const rows = await Promise.all(fixes.map((x) => (x.status === 'pending' ? api.confirmGoal(x.id) : api.syncGoal(x.id)).catch(() => x)))
      setAllGoals((cur) => cur.map((x) => rows.find((r2) => r2.id === x.id) || x))
      if (rows.some((x, i) => x.status !== fixes[i].status)) api.listActivity().then(setActivity).catch(() => {})
    }
  }, [])

  // session: a 401 means the token expired or was revoked, so go back to the sign-in screen
  useEffect(() => {
    api.setUnauthorizedHandler(() => { clearSession(); setWallet(null) })
    return () => api.setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    setLoaded(false); setSyncError(null)
    if (!owner) { clearSession(); setAllGoals([]); setConditions([]); setActivity([]); setTaskTimes([]); return }
    if (wallet.demo) api.setAuth({ devAddress: owner }) // dev header, needs AUTH_DEV_MODE=1 on the backend
    // a real wallet already has its token: lib/auth.js set it during sign-in
    let cancelled = false
    load()
      .catch((e) => !cancelled && setSyncError(`Could not load your data: ${errText(e)}`))
      .finally(() => !cancelled && setLoaded(true))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, load])

  const stats = useMemo(() => ({ tasksDone: taskTimes.length, streak: streakOf(taskTimes) }), [taskTimes])

  /** Pull the server's view again after anything that moved money or changed a task. */
  const refreshAll = useCallback(async () => {
    try { await load(); setSyncError(null) } catch (e) { setSyncError(errText(e)) }
    balances.refresh()
  }, [load, balances])

  /** Add an activity line for client-side events (swap, send, rule). Lock / unlock lines are written by the server. */
  const log = useCallback((kind, text, txHash) => {
    const tempId = `tmp-${Date.now()}-${Math.random()}`
    setActivity((a) => [{ id: tempId, kind, text, txHash: txHash ?? null, at: Date.now() }, ...a].slice(0, 50))
    api.createActivity({ kind, text, txHash })
      .then((row) => setActivity((a) => a.map((x) => (x.id === tempId ? row : x))))
      .catch((e) => setSyncError(`Could not save activity: ${errText(e)}`))
  }, [])

  /**
   * New goal: create the row (pending) -> lock on-chain under that row's id -> backend confirms from the contract.
   * Throws if the row can't be created or the user rejects / fails the lock transaction (the pending row is removed).
   */
  const addGoal = useCallback(async (g) => {
    if (!live) throw new Error('The demo wallet cannot lock funds. Open the app inside Nimiq Pay.')
    const draft = await api.createGoal({ ...g, token: 'USDT' })
    let receipt
    try {
      receipt = await lockGoal(draft.id, g.amount, draft.unlockAt)
    } catch (e) {
      api.deleteGoal(draft.id).catch(() => {}) // nothing was locked, drop the pending row
      throw e
    }
    try {
      upsertGoal(await confirmWithRetry(draft.id, receipt?.hash))
    } catch (e) {
      upsertGoal(draft) // stays pending; load() retries the confirmation next time the app opens
      setSyncError(`Your USDT is locked on-chain, but the app could not confirm it yet (${errText(e)}). It will retry automatically.`)
    }
    api.listActivity().then(setActivity).catch(() => {})
    balances.refresh()
  }, [live, balances, upsertGoal])

  /** After the lock period: the user withdraws from the contract themselves (their wallet, their gas), then the backend syncs. */
  const withdrawGoalNow = useCallback(async (id) => {
    if (!live) throw new Error('The demo wallet cannot move funds.')
    await withdrawGoal(id)
    try { upsertGoal(await api.syncGoal(id)) } catch (e) { setSyncError(`Funds released, but the app could not update the goal yet (${errText(e)}).`) }
    api.listActivity().then(setActivity).catch(() => {})
    balances.refresh()
  }, [live, balances, upsertGoal])

  /** Early release, retry: ask the backend to relay the passed task's key to the contract again. Returns { released, error }. */
  const retryRelease = useCallback(async (id) => {
    const r = await api.releaseGoal(id)
    upsertGoal(r.goal)
    if (r.released) await refreshAll()
    return r
  }, [refreshAll, upsertGoal])

  /** Early release, fallback: submit the signed task key from the user's own wallet (they pay the gas). */
  const selfUnlock = useCallback(async (id) => {
    const goal = goalsRef.current.find((x) => x.id === id)
    if (!goal || !owner) return
    const key = await api.getUnlockKey(id)
    await unlockWithKey(owner, id, key)
    upsertGoal(await api.syncGoal(id))
    await refreshAll()
  }, [owner, refreshAll, upsertGoal])

  /** Saves a rule. Throws if the backend rejects it. */
  const addCondition = useCallback(async (c) => {
    const row = await api.createRule({ enabled: true, ...c })
    setConditions((cs) => [row, ...cs])
    log('rule', `Rule “${c.title}” armed`)
  }, [log])

  const toggleCondition = useCallback((id) => {
    const cur = conditions.find((c) => c.id === id)
    if (!cur) return
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))) // optimistic
    api.setRuleEnabled(id, !cur.enabled).catch((e) => {
      setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: cur.enabled } : c))) // revert
      setSyncError(`Could not update rule: ${errText(e)}`)
    })
  }, [conditions])

  const removeCondition = useCallback((id) => {
    const prev = conditions
    setConditions((cs) => cs.filter((c) => c.id !== id)) // optimistic
    api.deleteRule(id).catch((e) => {
      setConditions(prev) // revert
      setSyncError(`Could not delete rule: ${errText(e)}`)
    })
  }, [conditions])

  const value = useMemo(
    () => ({
      wallet, setWallet, live, balances,
      goals, addGoal, withdrawGoalNow, retryRelease, selfUnlock, refreshAll,
      conditions, addCondition, toggleCondition, removeCondition,
      activity, log, stats, loaded, syncError,
      clearSyncError: () => setSyncError(null),
      reload: () => load().then(() => setSyncError(null)).catch((e) => setSyncError(errText(e))),
    }),
    [wallet, live, balances, goals, addGoal, withdrawGoalNow, retryRelease, selfUnlock, refreshAll, conditions, addCondition, toggleCondition, removeCondition, activity, log, stats, loaded, syncError, load],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => useContext(AppCtx)
