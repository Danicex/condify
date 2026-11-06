import { useState } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, Lock, PartyPopper, Unlock, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import TaskIcon from '@/components/TaskIcon'
import TaskRunner from '@/components/TaskRunner'
import { useApp } from '@/context/AppContext'
import { getCategory, getTask } from '@/data/task'
import { fmtUSD } from '@/lib/utils'
import { daysLeft, lockProgress } from './goals'

/** Goal detail: shows the lock, and the Liquidate flow where the user performs the task. */
export default function GoalDetail({ goal, onBack }) {
  const { liquidateGoal } = useApp()
  const [doingTask, setDoingTask] = useState(false)
  const [released, setReleased] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const task = getTask(goal.taskId)
  const cat = task && getCategory(task.category)
  const isReady = goal.unlockAt <= Date.now()
  const done = released || goal.status !== 'active'

  const release = async (viaTask) => {
    setBusy(true); setError('')
    try {
      await liquidateGoal(goal.id, viaTask) // unlocks USDT on-chain
      setReleased(true); setDoingTask(false)
    } catch (e) {
      setError(e?.shortMessage || e?.reason || e?.message || 'Unlock transaction failed')
    } finally {
      setBusy(false)
    }
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

          {task && (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5 font-bold uppercase tracking-wider"><TaskIcon name={cat.icon} size={13} />{cat.label}</CardDescription>
                <CardTitle className="text-base">{task.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{task.description}</p>
                <div className="mt-3 flex gap-2"><Badge variant="muted">{task.difficulty}</Badge><Badge variant="muted">~{task.minutes} min</Badge></div>
              </CardContent>
            </Card>
          )}

          {error && <p className="break-words text-center text-xs font-medium text-destructive">{error}</p>}
          {isReady ? (
            <Button size="lg" className="w-full" disabled={busy} onClick={() => release(false)}>
              {busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : <><Wallet size={17} /> Withdraw {fmtUSD(goal.amount)}</>}
            </Button>
          ) : !doingTask ? (
            <div className="space-y-2">
              <Button size="lg" variant="outline" className="w-full border-primary/40 text-primary" onClick={() => setDoingTask(true)}>Liquidate early</Button>
              <p className="text-center text-xs text-muted-foreground">Complete “{task?.title}” to unlock your money before {new Date(goal.unlockAt).toLocaleDateString()}.</p>
            </div>
          ) : (
            <Card className="animate-fade-in rounded-3xl border-primary/30 p-5">
              <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><CheckCircle2 size={14} /> Complete the task to liquidate</p>
              <TaskRunner task={task} onComplete={() => release(true)} />
              {busy && <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-primary"><Loader2 size={14} className="animate-spin" /> Unlocking — confirm in wallet…</p>}
              <Button variant="ghost" size="sm" className="mt-3 w-full text-muted-foreground" disabled={busy} onClick={() => setDoingTask(false)}>Cancel</Button>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
