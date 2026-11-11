import { useEffect, useState } from 'react'
import { ArrowDown, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { useApp } from '@/context/AppContext'
import { cn } from '@/lib/utils'
import { quoteSwap, swapNIMforUSDT, swapUSDTforNIM } from '@/contracts'

const TOKENS = ['USDT', 'NIM']

export default function SwapMatrixView() {
  const { log, balances, live } = useApp()
  const BAL = { USDT: balances.usdt ?? 0, NIM: balances.nim ?? 0 }
  const [from, setFrom] = useState('USDT')
  const [to, setTo] = useState('NIM')
  const [amount, setAmount] = useState('')
  const [out, setOut] = useState(null) // quoted amount (number) from the swap contract
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const amt = Number(amount) || 0
  const max = BAL[from] ?? 0
  const invalid = !(amt > 0) || amt > max || from === to

  // live quote from the contract (debounced)
  useEffect(() => {
    setOut(null)
    if (!(amt > 0) || from === to || !live) return
    let cancelled = false
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const q = await quoteSwap(from, amount)
        if (!cancelled) { setOut(Number(q)); setError('') }
      } catch (e) {
        if (!cancelled) setError(e?.shortMessage || e?.message || 'Could not get a quote')
      } finally {
        if (!cancelled) setQuoting(false)
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(t); setQuoting(false) }
  }, [amount, from, to, amt, live])

  const flip = () => { setFrom(to); setTo(from); }
  const pick = (side, v) => { // keep from ≠ to
    if (side === 'from') { setFrom(v); if (v === to) setTo(TOKENS.find((t) => t !== v)) }
    else { setTo(v); if (v === from) setFrom(TOKENS.find((t) => t !== v)) }
  }

  const exec = async () => {
    setBusy(true); setError('')
    try {
      if (live) await (from === 'USDT' ? swapUSDTforNIM(amount) : swapNIMforUSDT(amount))
      log('swap', `Swapped ${amount} ${from} → ${out != null ? out.toLocaleString(undefined, { maximumFractionDigits: 4 }) : ''} ${to}`.replace('  ', ' '))
      setDone(true); setAmount(''); setTimeout(() => setDone(false), 2200)
      balances.refresh()
    } catch (e) {
      setError(e?.shortMessage || e?.reason || e?.message || 'Swap failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(BAL).map(([k, v]) => (
          <Card key={k} className={cn('rounded-2xl p-3 text-center', k === 'NIM' && 'border-primary/20 bg-primary/10')}>
            <p className={cn('text-[10px] font-bold', k === 'NIM' ? 'text-primary' : 'text-muted-foreground')}>{k}</p>
            <p className="mt-0.5 font-mono text-xs font-bold">{v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-2 rounded-3xl p-5">
        <div className="rounded-2xl bg-muted/60 p-4">
          <div className="flex justify-between text-xs font-bold text-muted-foreground"><span>You pay</span><button onClick={() => setAmount(String(max))} className="text-primary">Max {max.toLocaleString()}</button></div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Input type="number" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-auto border-0 bg-transparent p-0 font-mono text-2xl font-bold focus-visible:ring-0" />
            <Select value={from} onChange={(e) => pick('from', e.target.value)} className="w-24 font-bold">{TOKENS.map((t) => <option key={t}>{t}</option>)}</Select>
          </div>
        </div>

        <div className="relative z-10 -my-4 flex justify-center">
          <button onClick={flip} className="flex h-9 w-9 items-center justify-center rounded-full border-4 border-card bg-primary text-white shadow-md transition-transform active:rotate-180" aria-label="Flip"><ArrowDown size={15} /></button>
        </div>

        <div className="rounded-2xl bg-muted/60 p-4">
          <div className="flex justify-between text-xs font-bold text-muted-foreground"><span>You receive (quote)</span>{quoting && <Loader2 size={12} className="animate-spin" />}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-mono text-2xl font-bold">{out != null ? out.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '—'}</p>
            <Select value={to} onChange={(e) => pick('to', e.target.value)} className="w-24 font-bold">{TOKENS.map((t) => <option key={t}>{t}</option>)}</Select>
          </div>
        </div>

        {out != null && amt > 0 && (
          <p className="px-1 pt-2 text-center text-[11px] text-muted-foreground">1 {from} ≈ {(out / amt).toLocaleString(undefined, { maximumFractionDigits: 6 })} {to}</p>
        )}
        {error && <p className="break-words px-1 text-center text-[11px] font-medium text-destructive">{error}</p>}
        <Button size="lg" className="w-full" disabled={invalid || busy} onClick={exec}>
          {busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : done ? <><CheckCircle2 size={17} /> Swap complete</> : from === to ? 'Choose different tokens' : amt > max ? 'Insufficient balance' : 'Swap'}
        </Button>
      </Card>
    </div>
  )
}
