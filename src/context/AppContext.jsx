import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DAY } from '@/lib/utils'
import { useBalances } from '@/hooks/useBalances'
import { lockUSDT, unlockUSDT } from '@/contracts'
import * as api from '@/lib/api'

/**
 * App state.
 *  - Money movement (lock / unlock) goes on-chain via src/contracts.js.
 *  - Goal metadata, automation rules, activity and task completions live in the FastAPI backend (src/lib/api.js).
 *    Nothing is persisted in localStorage any more.
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
const errText = (e) => e?.message || 'Request failed'

export function AppProvider({ children }) {
  const [wallet, setWallet] = useState(null) // from connectNimiqPay()
  const balances = useBalances(wallet)

  const [goals, setGoals] = useState([])
  const [conditions, setConditions] = useState([])
  const [activity, setActivity] = useState([])
  const [taskTimes, setTaskTimes] = useState([]) // completion timestamps (ms)
  const [loaded, setLoaded] = useState(false)
  const [syncError, setSyncError] = useState(null) // shown as a banner when the backend is unreachable / a save failed

  const owner = wallet ? wallet.evmAddress || wallet.address : null

  // ---- load everything for this user from the backend ----
  const load = useCallback(async () => {
    const [g, r, a, t] = await Promise.all([api.listGoals(), api.listRules(), api.listActivity(), api.listTaskCompletions()])
    setGoals(g); setConditions(r); setActivity(a); setTaskTimes(t.map((x) => x.at))
  }, [])

  useEffect(() => {
    setLoaded(false); setSyncError(null)
    if (!owner) { api.setAuth(null); setGoals([]); setConditions([]); setActivity([]); setTaskTimes([]); return }
    api.setAuth({ devAddress: owner }) // swap for { token } when wallet-signature login is added
    let cancelled = false
    load()
      .catch((e) => !cancelled && setSyncError(`Could not load your data: ${errText(e)}`))
      .finally(() => !cancelled && setLoaded(true))
    return () => { cancelled = true }
  }, [owner, load])

  const stats = useMemo(() => ({ tasksDone: taskTimes.length, streak: streakOf(taskTimes) }), [taskTimes])

  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const live = !!wallet && !wallet.demo // demo wallet (dev only) skips the chain

  /** Add an activity line: shows instantly, then saves to the backend. */
  const log = useCallback((kind, text, txHash) => {
    const tempId = `tmp-${Date.now()}-${Math.random()}`
    setActivity((a) => [{ id: tempId, kind, text, txHash: txHash ?? null, at: Date.now() }, ...a].slice(0, 50))
    api.createActivity({ kind, text, txHash })
      .then((row) => setActivity((a) => a.map((x) => (x.id === tempId ? row : x))))
      .catch((e) => setSyncError(`Could not save activity: ${errText(e)}`))
  }, [])

  /** Locks USDT on-chain, then saves the goal. Throws only if the lock transaction itself fails. */
  const addGoal = useCallback(async (g) => {
    let txHash = null
    if (live) txHash = (await lockUSDT(g.amount))?.hash ?? null
    const draft = { token: 'USDT', ...g, txHash }
    try {
      const row = await api.createGoal(draft)
      setGoals((gs) => [row, ...gs])
    } catch (e) {
      // funds ARE locked but the record didn't save: keep it visible locally and tell the user
      setGoals((gs) => [{ id: `local-${Date.now()}`, createdAt: Date.now(), status: 'active', unsynced: true, ...draft }, ...gs])
      setSyncError(`Funds are locked on-chain but the goal was not saved (${errText(e)}).`)
    }
    log('lock', `Locked $${Number(g.amount).toLocaleString()} into ${g.name}`, txHash)
    balances.refresh()
  }, [live, log, balances])

  /** sign a user on the backend with address */
  const signUser = (wallet)=>{
    const randomStr = (len) => Math.random().toString(36).substring(2, 2 + len);
    const payload = {
      "evm_addrs": wallet.evmAddress ,
      "nim_addrs": wallet.address,
      "username": `${randomStr(8)}`
    }
    api.signUserToBackend(payload)
  }
  /** Unlocks the goal's USDT on-chain, then marks it liquidated (and records the task if it was an early release). */
  const liquidateGoal = useCallback(async (id, viaTask) => {
    const g = goalsRef.current.find((x) => x.id === id)
    if (!g) return
    if (live) await unlockUSDT(g.amount)
    setGoals((gs) => gs.map((x) => (x.id === id ? { ...x, status: 'liquidated', liquidatedAt: Date.now() } : x)))
    log('unlock', `Liquidated ${g.name} · $${Number(g.amount).toLocaleString()} released`)
    if (!g.unsynced) {
      api.markGoalLiquidated(id).catch((e) => setSyncError(`Funds released, but the goal status was not saved: ${errText(e)}`))
    }
    if (viaTask) {
      setTaskTimes((t) => [...t, Date.now()])
      api.recordTaskCompletion({ taskId: g.taskId, goalId: g.unsynced ? null : id })
        .catch((e) => setSyncError(`Could not save task completion: ${errText(e)}`))
    }
    balances.refresh()
  }, [live, log, balances])

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
    () => ({ signUser, wallet, setWallet, live, balances, goals, addGoal, liquidateGoal, conditions, addCondition, toggleCondition, removeCondition, activity, log, stats, loaded, syncError, clearSyncError: () => setSyncError(null), reload: () => load().then(() => setSyncError(null)).catch((e) => setSyncError(errText(e))) }),
    [signUser, wallet, live, balances, goals, addGoal, liquidateGoal, conditions, addCondition, toggleCondition, removeCondition, activity, log, stats, loaded, syncError, load, ],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => useContext(AppCtx)
