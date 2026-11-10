import { useCallback, useState } from 'react'
import { ChevronRight, Lock, Plus, Unlock, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import TaskIcon from '@/components/TaskIcon'
import { useApp } from '@/context/AppContext'
import { useTelegramBack } from '@/hooks/useTelegram'
import { getCategory } from '@/data/task'
import { DAY, fmtUSD } from '@/lib/utils'
import CreateGoalForm from './create_goal_form'
import GoalDetail from './goal_detail'

export const daysLeft = (g) => Math.max(0, Math.ceil((g.unlockAt - Date.now()) / DAY))
export const lockProgress = (g) => Math.min(100, ((Date.now() - g.createdAt) / (g.unlockAt - g.createdAt)) * 100)

/** Goals: list → create_goal_form | goal_detail (liquidate + task). */
export default function Goals({ initialView = 'list' }) {
  const { goals, balances } = useApp()
  const [view, setView] = useState(initialView) // 'list' | 'create' | 'detail'
  const [selectedId, setSelectedId] = useState(null)

  const back = useCallback(() => setView('list'), [])
  useTelegramBack(view !== 'list', back)

  if (view === 'create') return <CreateGoalForm onCancel={back} onDone={back} />
  if (view === 'detail') {
    const g = goals.find((x) => x.id === selectedId)
    if (g) return <GoalDetail goal={g} onBack={back} />
  }

  const now = Date.now()
  const active = goals.filter((g) => g.status === 'active')
  const history = goals.filter((g) => g.status !== 'active')
  const locked = active.filter((g) => g.unlockAt > now).reduce((s, g) => s + Number(g.amount), 0)
  const ready = active.filter((g) => g.unlockAt <= now).reduce((s, g) => s + Number(g.amount), 0)

  return (
    <div className="animate-fade-in space-y-6">
      <Card className="flex items-center justify-between rounded-3xl p-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Lock size={13} /> Locked</p>
          <p className="font-mono text-lg font-bold">{fmtUSD(locked)}</p>
        </div>
        <div className="h-9 w-px bg-border" />
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold text-success"><Unlock size={13} /> Ready</p>
          <p className="font-mono text-lg font-bold text-success">{fmtUSD(ready)}</p>
        </div>
      </Card>

      {balances.locked != null && (
        <p className="-mt-3 text-center text-[11px] text-muted-foreground">On-chain locked balance: <span className="font-mono font-bold">{fmtUSD(balances.locked)}</span></p>
      )}

      <Button size="lg" className="w-full" onClick={() => setView('create')}><Plus size={18} /> New saving goal</Button>

      <section className="space-y-3">
        <h3 className="text-sm font-extrabold tracking-tight">Active goals ({active.length})</h3>
        {active.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No active goals. Create one to start saving.</p>}
        {active.map((g) => {
          const cat = getCategory(g.taskCategory)
          const isReady = g.unlockAt <= now
          return (
            <button key={g.id} onClick={() => { setSelectedId(g.id); setView('detail') }} className="block w-full text-left transition-transform active:scale-[0.98]">
              <Card className="rounded-3xl p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-bold">{g.name}</h4>
                    <p className="font-mono text-sm font-bold text-primary">{fmtUSD(g.amount)}</p>
                  </div>
                  <Badge variant={isReady ? 'success' : 'default'}>{isReady ? <><Unlock size={10} /> Ready</> : <><Lock size={10} /> {daysLeft(g)}d left</>}</Badge>
                </div>
                <Progress value={lockProgress(g)} className="mt-3 h-1.5" indicatorClassName="bg-accent" />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {cat && <TaskIcon name={cat.icon} size={13} />} {cat?.label} · {g.taskDifficulty}
                  </span>
                  <ChevronRight size={16} />
                </div>
              </Card>
            </button>
          )
        })}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold tracking-tight">History</h3>
          {history.map((g) => (
            <Card key={g.id} className="flex items-center justify-between rounded-2xl p-3.5 opacity-70">
              <span className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={15} className="text-success" />{g.name}</span>
              <span className="font-mono text-xs font-bold">{fmtUSD(g.amount)}</span>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}
