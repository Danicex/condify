import { useState } from 'react'
import { ArrowRight, Brain, Cpu, Flame, Lock, Plus, RefreshCw, Send, Target, Unlock, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useApp } from '@/context/AppContext'
import { useMarket } from '@/hooks/useMarket'
import { DAY, fmtUSD, shortAddr, cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { randomUsername } from '@/lib/username'
const ICONS = { lock: Lock, unlock: Unlock, swap: RefreshCw, send: Send, task: Brain, rule: Cpu }

const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 60) return `${Math.max(m, 1)}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}

export default function Dashboard({ onNavigate }) {
  const { goals, conditions, activity, stats, wallet, balances } = useApp()
  const [guestName] = useState(randomUsername) // only used if the account has no name yet
  const market = useMarket()
  const active = goals.filter((g) => g.status === 'active')
  const now = Date.now()
  const ready = active.filter((g) => g.unlockAt <= now)
  const locked = active.filter((g) => g.unlockAt > now)
  const nextUnlock = [...locked].sort((a, b) => a.unlockAt - b.unlockAt)[0]
  const armed = conditions.filter((c) => c.enabled).length

  // allocation from real balances (NIM valued at the live market price; locked USDT counted as USDT)
  const nimUsd = (balances.nim ?? 0) * (market.prices?.NIM?.p ?? 0)
  const usdtUsd = (balances.usdt ?? 0) + (balances.locked ?? 0)
  const totalUsd = nimUsd + usdtUsd
  const ALLOC = totalUsd > 0 && market.prices?.NIM
    ? [
        { k: 'USDT', v: Math.round((usdtUsd / totalUsd) * 100), cls: 'bg-primary' },
        { k: 'NIM', v: Math.round((nimUsd / totalUsd) * 100), cls: 'bg-accent' },
      ]
    : null

  return (
    <div className="animate-fade-in space-y-6">
      {/* greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Welcome back</p>
          <h2 className="text-xl font-extrabold tracking-tight">{wallet?.user?.username || guestName} 👋</h2>
        </div>
        {wallet && (
          <span className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 font-mono text-[11px] font-bold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {shortAddr(wallet.address.replace(/\s/g, ''))}
          </span>
        )}
      </div>

      {/* balance: real NIM + USDT from Nimiq Pay */}
      <div className="rounded-[28px] bg-gradient-to-br from-primary to-accent p-5 text-white shadow-xl shadow-primary/20">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Wallet balance</p>
          <div className="flex items-center gap-2">
            {<span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase">Testnet</span>}
            {balances.nim === 0 || balances.usdt === 0 ? ( // testnet helper: offer the faucet page when a balance is empty
              <Link to="/mock_token" className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase">Add funds</Link>
            ) : null}
            <button onClick={() => balances.refresh(true)} aria-label="Refresh balances" className="rounded-full bg-white/20 p-1.5 transition-transform active:scale-90">
              <RefreshCw size={13} className={balances.loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <BalanceTile symbol="NIM" value={balances.nim} error={balances.nimError} loading={balances.loading} digits={2} />
          <BalanceTile symbol="USDT" value={balances.usdt} error={balances.usdtError} loading={balances.loading} digits={2} />
        </div>
        {(balances.nimError || balances.usdtError) && (
          <p className="mt-3 break-words text-[11px] font-medium leading-snug text-white/90">
            {balances.nimError && <span className="block">NIM: {balances.nimError}</span>}
            {balances.usdtError && <span className="block">USDT: {balances.usdtError}</span>}
          </p>
        )}
      </div>

      {/* quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { l: 'New goal', i: Plus, to: 'goals', state: 'create' },
          { l: 'Swap', i: RefreshCw, to: 'swap' },
          { l: 'Automate', i: Cpu, to: 'condition' },
          { l: 'Send', i: Send, to: 'send' },
        ].map(({ l, i: Icon, to, state }) => (
          <button key={l} onClick={() => onNavigate(to, state)} className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card py-3 text-[11px] font-bold shadow-sm transition-transform active:scale-95">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={17} /></span>{l}
          </button>
        ))}
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: 'Active goals', v: active.length, i: Target },
          { l: 'Tasks done', v: stats.tasksDone, i: CheckCircle2 },
          { l: 'Day streak', v: stats.streak, i: Flame },
        ].map(({ l, v, i: Icon }) => (
          <Card key={l} className="rounded-2xl p-3 text-center">
            <Icon size={16} className="mx-auto text-primary" />
            <p className="mt-1 font-mono text-lg font-bold leading-none">{v}</p>
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{l}</p>
          </Card>
        ))}
      </div>

      {/* next unlock / ready alert */}
      {(ready.length > 0 || nextUnlock) && (
        <Card className="flex items-center gap-3 rounded-2xl p-4">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', ready.length ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary')}>
            {ready.length ? <Unlock size={18} /> : <Lock size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{ready.length ? `${ready[0].name} is ready` : nextUnlock.name}</p>
            <p className="text-xs text-muted-foreground">
              {ready.length ? 'Lock period over — withdraw anytime' : `Unlocks in ${Math.ceil((nextUnlock.unlockAt - now) / DAY)} days`}
            </p>
          </div>
          <Button size="sm" variant="soft" onClick={() => onNavigate('goals')}>{ready.length ? 'Withdraw' : 'View'}</Button>
        </Card>
      )}

      {/* active goals */}
      <section>
        <SectionHead title="Active goals" action="See all" onClick={() => onNavigate('goals')} />
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {active.length === 0 && <p className="text-xs text-muted-foreground">No active goals yet.</p>}
          {active.map((g) => {
            const pct = Math.min(100, ((now - g.createdAt) / (g.unlockAt - g.createdAt)) * 100)
            return (
              <Card key={g.id} className="w-44 shrink-0 rounded-2xl p-4">
                <Badge variant={g.unlockAt <= now ? 'success' : 'muted'}>{g.unlockAt <= now ? 'Ready' : 'Locked'}</Badge>
                <h4 className="mt-2 truncate text-sm font-bold">{g.name}</h4>
                <p className="font-mono text-xs font-bold text-muted-foreground">{fmtUSD(g.amount)}</p>
                <Progress value={pct} className="mt-3 h-1.5" indicatorClassName="bg-accent" />
              </Card>
            )
          })}
        </div>
      </section>

      {/* automations */}
      <Card className="flex items-center gap-3 rounded-2xl p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Cpu size={18} /></span>
        <div className="flex-1">
          <p className="text-sm font-bold">{armed} conditional rule{armed === 1 ? '' : 's'} armed</p>
          <p className="text-xs text-muted-foreground">When · What · Where triggers watching your money</p>
        </div>
        <button onClick={() => onNavigate('condition')} className="text-primary"><ArrowRight size={18} /></button>
      </Card>

      {/* allocation (from real balances) */}
      {ALLOC && (
        <section>
          <SectionHead title="Allocation" />
          <Card className="rounded-2xl p-4">
            <div className="flex h-3 overflow-hidden rounded-full">
              {ALLOC.map((a) => <div key={a.k} className={a.cls} style={{ width: `${a.v}%` }} />)}
            </div>
            <div className="mt-3 flex justify-between text-xs font-semibold">
              {ALLOC.map((a) => (
                <span key={a.k} className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', a.cls)} />{a.k} {a.v}%</span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Total {fmtUSD(totalUsd)} · NIM valued at the live market price</p>
          </Card>
        </section>
      )}

      {/* recent activity */}
      <section>
        <SectionHead title="Recent activity" />
        <Card className="divide-y overflow-hidden rounded-2xl">
          {activity.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No activity yet.</p>}
          {activity.slice(0, 5).map((a) => {
            const Icon = ICONS[a.kind] || Lock
            return (
              <div key={a.id} className="flex items-center gap-3 p-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon size={14} /></span>
                <p className="flex-1 text-xs font-semibold">{a.text}</p>
                <span className="text-[10px] font-medium text-muted-foreground">{ago(a.at)}</span>
              </div>
            )
          })}
        </Card>
      </section>
    </div>
  )
}

function BalanceTile({ symbol, value, error, loading, digits }) {
  const text = value != null ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : loading ? '…' : error ? 'N/A' : '0'
  return (
    <div className="rounded-2xl bg-black/15 p-3 backdrop-blur-md">
      <span className="text-[11px] font-bold text-white/80">{symbol}</span>
      <p className="mt-0.5 truncate font-mono text-xl font-bold">{text}</p>
    </div>
  )
}

function SectionHead({ title, action, onClick }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-extrabold tracking-tight">{title}</h3>
      {action && <button onClick={onClick} className="text-xs font-bold text-primary">{action}</button>}
    </div>
  )
}
