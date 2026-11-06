import { useCallback, useEffect, useRef, useState } from 'react'
import { getEvmChainId } from '@/lib/nimiq'
import { getBalance, viewLockedUSDT } from '@/contracts'

const EMPTY = { nim: null, usdt: null, locked: null, nimError: null, usdtError: null, lockedError: null, loading: false, updatedAt: null, evmChainId: null }
const msg = (r) => r?.shortMessage || r?.message || String(r)

/** On-chain NIM + USDT balances and USDT held in the lock contract. Refreshes every 20 s and on focus. */
export function useBalances(wallet) {
  const [state, setState] = useState(EMPTY)
  const walletRef = useRef(wallet)
  walletRef.current = wallet

  const refresh = useCallback(async () => {
    const w = walletRef.current
    if (!w) return
    setState((s) => ({ ...s, loading: true }))

    if (w.demo) {
      setState({ ...EMPTY, nim: 1250.5, usdt: 42.25, locked: 0, updatedAt: Date.now(), evmChainId: '0xaa36a7' })
      return
    }

    const [nim, usdt, locked] = await Promise.allSettled([getBalance('NIM'), getBalance('USDT'), viewLockedUSDT()])
    const evmChainId = await getEvmChainId()
    if (walletRef.current !== w) return // wallet changed while loading

    setState((s) => ({
      nim: nim.status === 'fulfilled' ? Number(nim.value) : s.nim,
      usdt: usdt.status === 'fulfilled' ? Number(usdt.value) : s.usdt,
      locked: locked.status === 'fulfilled' ? Number(locked.value) : s.locked,
      nimError: nim.status === 'rejected' ? msg(nim.reason) : null,
      usdtError: usdt.status === 'rejected' ? msg(usdt.reason) : null,
      lockedError: locked.status === 'rejected' ? msg(locked.reason) : null,
      loading: false,
      updatedAt: Date.now(),
      evmChainId,
    }))
  }, [])

  useEffect(() => {
    if (!wallet) { setState(EMPTY); return }
    refresh()
    const t = setInterval(refresh, 20_000)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [wallet, refresh])

  return { ...state, refresh }
}
