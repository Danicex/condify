import { useCallback, useEffect, useState } from 'react'

// CoinGecko public API (no key). Ids: bitcoin, solana, nimiq-2 (NIM).
const COINS = [
  { s: 'BTC', id: 'bitcoin' },
  { s: 'SOL', id: 'solana' },
  { s: 'NIM', id: 'nimiq-2' },
]
const URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINS.map((c) => c.id).join(',')}&vs_currencies=usd&include_24hr_change=true`

/** Live prices + 24h change. Refreshes every 60 s. Returns { prices: {BTC:{p,c},…}, loading, error, updatedAt }. */
export function useMarket() {
  const [state, setState] = useState({ prices: null, loading: true, error: null, updatedAt: null })

  const load = useCallback(async (signal) => {
    try {
      const res = await fetch(URL, { signal })
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
      const json = await res.json()
      const prices = {}
      for (const { s, id } of COINS) {
        if (json[id]?.usd != null) prices[s] = { p: json[id].usd, c: json[id].usd_24h_change ?? 0 }
      }
      setState({ prices, loading: false, error: null, updatedAt: Date.now() })
    } catch (e) {
      if (e.name === 'AbortError') return
      setState((s) => ({ ...s, loading: false, error: e.message || 'Market data unavailable' }))
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    const t = setInterval(() => load(ac.signal), 60_000)
    return () => { ac.abort(); clearInterval(t) }
  }, [load])

  return state
}
