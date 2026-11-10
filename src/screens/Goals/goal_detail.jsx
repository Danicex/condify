import { useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, Loader2, Lock, PartyPopper, Unlock, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import TaskIcon from '@/components/TaskIcon'
import AiTask from '@/components/AiTask'
import { useApp } from '@/context/AppContext'
import { getCategory } from '@/data/task'
import { fmtUSD } from '@/lib/utils'
import { daysLeft, lockProgress } from './goals'

const errMsg = (e, fallback) => e?.shortMessage || e?.reason || e?.message || fallback

/**
 * Goal detail. Two ways out:
 *   - lock period over  -> "Withdraw": the user calls the contract from their wallet
 *   - early             -> "Liquidate early": pass the AI task; the backend then sends the signed key to the contract
 *                          and the funds go back to the user's wallet. If that send fails (relayer down / out of gas) the
 *                          task stays passed and the user can retry, or submit the key from their own wallet.
 */
export default function GoalDetail({ goal, onBack }) {
  const { withdrawGoalNow, retryRelease, selfUnlock, refreshAll } = useApp()
  const [doingTask, setDoingTask] = useState(false)
  const [busy, setBusy] = useState('') // '' | 'withdraw' | 'retry' | 'self'
  const [error, setError] = useState('')
  const [pendingRelease, setPendingRelease] = useState(null) // set when the task is passed but the funds have not moved yet
  const cat = getCategory(goal.taskCategory)
  const isReady = goal.unlockAt <= Date.now()
  const done = goal.status === 'liquidated'

  const withdraw = async () => {
    setBusy('withdraw'); setError('')
    try { await withdrawGoalNow(goal.id) } catch (e) { setError(errMsg(e, 'Withdraw failed')) } finally { setBusy('') }
  }

  const taskPassed = async (res) => {
    setDoingTask(false)
    if (!res.release?.released) setPendingRelease(res.release?.error || 'Your task is passed. The release has not been sent yet.')
    await refreshAll() // the goal flips to liquidated once the backend has read the release from the chain
  }

  const retry = async () => {
    setBusy('retry'); setError('')
    try {
      const r = await retryRelease(goal.id)
      if (!r.released) setPendingRelease(r.error || 'The release could not be sent yet.')
    } catch (e) { setError(errMsg(e, 'Retry failed')) } finally { setBusy('') }
  }

  const fromMyWallet = async () => {
    setBusy('self'); setError('')
    try { await selfUnlock(goal.id) } catch (e) { setError(errMsg(e, 'Unlock failed')) } finally { setBusy('') }
  }

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Back"><ArrowLeft size={20} /></button>
        <h2 className="truncate text-lg font-extrabold tracking-tight">{goal.name}</h2>
      </div>

      {done ? (
        <Card className="space-y-3 rounded-3xl p-8 text-center">
          <PartyPopper className="mx-auto text-primary" size={40} />
          <h3 className="text-lg font-extrabold">Funds released</h3>
          <p className="text-sm text-muted-foreground">{fmtUSD(goal.amount)} {goal.token} is back in your wallet.</p>
          <Button className="w-full" onClick={onBack}>Back to goals</Button>
        </Card>
      ) : (
        <>
          <div className="rounded-[28px] bg-gradient-to-br from-secondary to-[#2c5a42] p-5 text-white shadow-lg dark:from-[#1A201D] dark:to-[#243a2f]">
            <div className="flex items-center justify-between">
              <Badge className="bg-white/15 text-white">{isReady ? <><Unlock size={10} /> Ready</> : <><Lock size={10} /> Locked</>}</Badge>
              <span className="flex items-center gap-1 text-xs font-semibold text-white/70"><CalendarClock size={13} />{new Date(goal.unlockAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
            </div>
            <p className="mt-4 font-mono text-3xl font-bold">{fmtUSD(goal.amount)}</p>
            <p className="text-xs text-white/60">{goal.token} locked</p>
            <Progress value={lockProgress(goal)} className="mt-4 h-2 bg-white/15" indicatorClassName="bg-accent" />
            <p className="mt-2 text-xs font-semibold text-white/80">{isReady ? 'Lock period complete' : `${daysLeft(goal)} days remaining · ${Math.round(lockProgress(goal))}% elapsed`}</p>
          </div>

          {cat && (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider"><TaskIcon name={cat.icon} size={13} />{cat.label}</CardDescription>
                <CardTitle className="text-base">Early-unlock task</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">To unlock before the lock ends, pass a {goal.taskDifficulty} {cat.label.toLowerCase()} task set by the AI.</p>
                <div className="mt-3 flex gap-2"><Badge variant="muted">{goal.taskDifficulty}</Badge><Badge variant="muted">{cat.blurb}</Badge></div>
              </CardContent>
            </Card>
          )}

          {error && <p className="break-words text-center text-xs font-medium text-destructive">{error}</p>}

          {pendingRelease && (
            <Card className="space-y-3 rounded-3xl border-primary/30 p-5">
              <p className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 size={16} className="text-success" /> Task passed</p>
              <p className="flex items-start gap-2 break-words text-xs text-muted-foreground"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />{pendingRelease}</p>
              <Button className="w-full" disabled={!!busy} onClick={retry}>
                {busy === 'retry' ? <><Loader2 size={16} className="animate-spin" /> Releasing…</> : 'Retry release'}
              </Button>
              <Button variant="outline" className="w-full" disabled={!!busy} onClick={fromMyWallet}>
                {busy === 'self' ? <><Loader2 size={16} className="animate-spin" /> Confirm in wallet…</> : 'Release from my wallet (you pay gas)'}
              </Button>
            </Card>
          )}

          {!pendingRelease && (isReady ? (
            <Button size="lg" className="w-full" disabled={!!busy} onClick={withdraw}>
              {busy === 'withdraw' ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><Wallet size={17} /> Withdraw {fmtUSD(goal.amount)}</>}
            </Button>
          ) : !doingTask ? (
            <div className="space-y-2">
              <Button size="lg" variant="outline" className="w-full border-primary/40 text-primary" onClick={() => { setError(''); setDoingTask(true) }}>Liquidate early</Button>
              <p className="text-center text-xs text-muted-foreground">Pass the task to unlock your money before {new Date(goal.unlockAt).toLocaleDateString()}.</p>
            </div>
          ) : (
            <AiTask goal={goal} onPassed={taskPassed} onCancel={() => setDoingTask(false)} />
          ))}
        </>
      )}
    </div>
  )
}
