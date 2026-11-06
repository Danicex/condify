import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useBalances } from '@/hooks/useBalances'
import { lockUSDT, unlockUSDT } from '@/contracts'

/**
 * App state.
 *  - Money movement (lock / unlock) is real: it goes through src/contracts.js.
 *  - The contracts only track a per-user locked USDT total, so goal metadata (name, unlock date,
 *    unlock task), automation rules, activity and stats are kept per wallet in localStorage.
 */
const AppCtx = createContext(null)

const storeKey = (a) => `nimlock:v1:${String(a).toLowerCase()}`
const readStore = (a) => { try { return JSON.parse(localStorage.getItem(storeKey(a))) || {} } catch { return {} } }

export function AppProvider({ children }) {
  const [wallet, setWallet] = useState(null) // from connectNimiqPay()
  const balances = useBalances(wallet)
  const [goals, setGoals] = useState([])
  const [conditions, setConditions] = useState([])
  const [activity, setActivity] = useState([])
  const [stats, setStats] = useState({ tasksDone: 0, streak: 0 })

  // ---- per-wallet persistence ----
  const owner = wallet ? wallet.evmAddress || wallet.address : null
  const loadedFor = useRef(null)
  useEffect(() => {
    if (!owner) { loadedFor.current = null; setGoals([]); setConditions([]); setActivity([]); setStats({ tasksDone: 0, streak: 0 }); return }
    const d = readStore(owner)
    setGoals(d.goals || []); setConditions(d.conditions || []); setActivity(d.activity || []); setStats(d.stats || { tasksDone: 0, streak: 0 })
    loadedFor.current = owner
  }, [owner])
  useEffect(() => {
    if (!owner || loadedFor.current !== owner) return
    try { localStorage.setItem(storeKey(owner), JSON.stringify({ goals, conditions, activity, stats })) } catch { /* ignore */ }
  }, [owner, goals, conditions, activity, stats])

  const goalsRef = useRef(goals)
  goalsRef.current = goals
  const live = !!wallet && !wallet.demo // demo wallet (dev only) skips the chain

  const log = useCallback((kind, text) => setActivity((a) => [{ id: Date.now() + Math.random(), kind, text, at: Date.now() }, ...a].slice(0, 20)), [])

  /** Locks USDT on-chain, then records the goal. Throws if the transaction fails. */
  const addGoal = useCallback(async (g) => {
    if (live) await lockUSDT(g.amount)
    setGoals((gs) => [{ id: Date.now(), createdAt: Date.now(), status: 'active', token: 'USDT', ...g }, ...gs])
    log('lock', `Locked $${Number(g.amount).toLocaleString()} into ${g.name}`)
    balances.refresh()
  }, [live, log, balances])

  /** Unlocks the goal's USDT on-chain (after maturity, or after the unlock task), then marks it released. */
  const liquidateGoal = useCallback(async (id, viaTask) => {
    const g = goalsRef.current.find((x) => x.id === id)
    if (!g) return
    if (live) await unlockUSDT(g.amount)
    setGoals((gs) => gs.map((x) => (x.id === id ? { ...x, status: 'liquidated', liquidatedAt: Date.now() } : x)))
    log('unlock', `Liquidated ${g.name} · $${Number(g.amount).toLocaleString()} released`)
    if (viaTask) setStats((s) => ({ tasksDone: s.tasksDone + 1, streak: s.streak + 1 }))
    balances.refresh()
  }, [live, log, balances])

  const addCondition = useCallback((c) => {
    setConditions((cs) => [{ id: Date.now(), enabled: true, ...c }, ...cs])
    log('rule', `Rule “${c.title}” armed`)
  }, [log])
  const toggleCondition = useCallback((id) => setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))), [])
  const removeCondition = useCallback((id) => setConditions((cs) => cs.filter((c) => c.id !== id)), [])

  const value = useMemo(
    () => ({ wallet, setWallet, live, balances, goals, addGoal, liquidateGoal, conditions, addCondition, toggleCondition, removeCondition, activity, log, stats }),
    [wallet, live, balances, goals, addGoal, liquidateGoal, conditions, addCondition, toggleCondition, removeCondition, activity, log, stats],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => useContext(AppCtx)
