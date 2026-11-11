import { useState } from 'react'
import { ArrowLeft, Check, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import TaskIcon from '@/components/TaskIcon'
import { useApp } from '@/context/AppContext'
import { CATEGORIES } from '@/data/task'
import { DAY, cn, fmtUSD } from '@/lib/utils'

const DURATIONS = [
  { d: 7, l: '1 week' },
  { d: 30, l: '1 month' },
  { d: 90, l: '3 months' },
  { d: 180, l: '6 months' },
  { d: 365, l: '1 year' },
]
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', hint: '~1 min' },
  { id: 'medium', label: 'Medium', hint: '~3 min' },
  { id: 'hard', label: 'Hard', hint: '~5+ min' },
]

/** create_goal_form: set amount, lock duration and the kind of AI task that unlocks the money early. */
export default function CreateGoalForm({ onCancel, onDone }) {
  const { addGoal, balances } = useApp()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState(30)
  const [custom, setCustom] = useState('')
  const [cat, setCat] = useState(CATEGORIES[0].id)
  const [difficulty, setDifficulty] = useState('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const token = 'USDT' // the lock contract only holds USDT

  const lockDays = custom ? Number(custom) : days
  const enough = balances.usdt == null || Number(amount) <= balances.usdt
  const valid = name.trim() && Number(amount) > 0 && enough && lockDays > 0
  const category = CATEGORIES.find((c) => c.id === cat)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError('')
    try {
      await addGoal({ name: name.trim(), amount: Number(amount), token, unlockAt: Date.now() + lockDays * DAY, taskCategory: cat, taskDifficulty: difficulty })
      onDone()
    } catch (err) {
      setError(err?.shortMessage || err?.reason || err?.message || 'Lock transaction failed')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="animate-fade-in space-y-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Back"><ArrowLeft size={20} /></button>
        <h2 className="text-lg font-extrabold tracking-tight">New saving goal</h2>
      </div>

      <div className="space-y-2">
        <Label htmlFor="g-name">Goal name</Label>
        <Input id="g-name" placeholder="e.g. Tesla down-payment" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="g-amt">Amount to lock</Label>
        <div className="flex gap-2">
          <Input id="g-amt" type="number" inputMode="decimal" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg font-bold" />
          <div className="flex w-28 items-center justify-center rounded-xl border bg-muted/50 text-sm font-bold">USDT</div>
        </div>
        <p className={cn('text-[11px]', enough ? 'text-muted-foreground' : 'text-destructive')}>
          {balances.usdt != null ? `Available: ${balances.usdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT${enough ? '' : ' — not enough'}` : 'Balance unavailable'}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Lock duration</Label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((o) => (
            <button
              type="button"
              key={o.d}
              onClick={() => { setDays(o.d); setCustom('') }}
              className={cn('rounded-xl border px-3.5 py-2 text-xs font-bold transition-all active:scale-95', !custom && days === o.d ? 'border-primary bg-primary text-white' : 'bg-card')}
            >{o.l}</button>
          ))}
        </div>
        <Input type="number" inputMode="numeric" min="1" placeholder="…or custom number of days" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </div>

      <div className="space-y-3">
        <div>
          <Label>Early-unlock task</Label>
          <p className="mt-1 text-xs text-muted-foreground">If you want your money out before the lock ends, an AI will set you a task of this kind. You choose the type and difficulty now and cannot change them later.</p>
        </div>
        <div className="space-y-2">
          {CATEGORIES.map((c) => (
            <button type="button" key={c.id} onClick={() => { setCat(c.id) }} className="block w-full text-left">
              <Card className={cn('flex items-center gap-3 rounded-2xl p-3.5 transition-all', cat === c.id && 'border-primary bg-primary/5 ring-2 ring-primary/20')}>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted"><TaskIcon name={c.icon} size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.blurb}</p>
                </div>
                {cat === c.id && <Check size={18} className="text-primary" />}
              </Card>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => { setDifficulty(d.id) }}
              className={cn('flex-1 rounded-xl border px-3 py-2 text-center transition-all active:scale-95', difficulty === d.id ? 'border-primary bg-primary text-white' : 'bg-card')}
            >
              <span className="block text-xs font-bold">{d.label}</span>
              <span className={cn('block text-[10px]', difficulty === d.id ? 'text-white/80' : 'text-muted-foreground')}>{d.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {valid && (
        <Card className="rounded-2xl border-dashed bg-muted/40 p-4 text-xs leading-relaxed shadow-none">
          Locking <b>{fmtUSD(amount)}</b> in <b>{name}</b> for <b>{lockDays} days</b>. Early withdrawal requires passing a <b>{difficulty} {category.label.toLowerCase()}</b> task. Your wallet will ask you to approve USDT and then confirm the lock.
        </Card>
      )}

      {error && <p className="break-words text-center text-xs font-medium text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={!valid || busy}>
        {busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><Lock size={17} /> Lock funds</>}
      </Button>
    </form>
  )
}
