import { useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2, Eye, Minus, Plus, Play, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { haptic } from '@/hooks/useTelegram'

/** Renders the right mini-game for a task and calls onComplete() when it is passed. */
export default function TaskRunner({ task, onComplete }) {
  const { type, config } = task
  const props = { config, onComplete }
  switch (type) {
    case 'quiz': return <Quiz {...props} />
    case 'memory': return <Memory {...props} />
    case 'timer': return <TimerTask {...props} />
    case 'counter': return <Counter {...props} />
    case 'checklist': return <Checklist {...props} />
    default: return null
  }
}

function Quiz({ config, onComplete }) {
  const [picked, setPicked] = useState(null)
  const correct = picked === config.answer
  const pick = (i) => {
    if (correct) return
    setPicked(i)
    i === config.answer ? haptic.success() : haptic.error()
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold leading-relaxed">{config.question}</p>
      <div className="space-y-2">
        {config.options.map((o, i) => (
          <button
            key={o}
            onClick={() => pick(i)}
            className={cn(
              'flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm font-medium transition-all active:scale-[0.98]',
              picked === i && (i === config.answer ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'),
            )}
          >
            {o}
            {picked === i && (i === config.answer ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-destructive" />)}
          </button>
        ))}
      </div>
      {picked !== null && !correct && <p className="text-xs font-medium text-destructive">Not quite — try again.</p>}
      <Button className="w-full" disabled={!correct} onClick={onComplete}>Task complete · Unlock funds</Button>
    </div>
  )
}

function Memory({ config, onComplete }) {
  const [phase, setPhase] = useState('ready') // ready | show | recall | fail
  const [answer, setAnswer] = useState('')
  const isNum = config.sequence.every((s) => /^\d$/.test(s))
  const start = () => { setPhase('show'); setAnswer(''); setTimeout(() => setPhase('recall'), config.showMs) }
  const check = () => {
    const expected = config.sequence.join(isNum ? '' : ' ').toLowerCase()
    const got = answer.trim().toLowerCase().replace(isNum ? /\s+/g : /[\s,]+/g, isNum ? '' : ' ')
    if (got === expected) { haptic.success(); onComplete() } else { haptic.error(); setPhase('fail') }
  }
  return (
    <div className="space-y-3">
      {phase === 'ready' && (
        <>
          <p className="text-sm text-muted-foreground">You will see {config.sequence.length} items for {config.showMs / 1000}s. Memorise them in order, then type them back.</p>
          <Button className="w-full" onClick={start}><Eye size={16} /> Show sequence</Button>
        </>
      )}
      {phase === 'show' && (
        <div className="flex flex-wrap justify-center gap-2 rounded-2xl bg-muted p-6">
          {config.sequence.map((s, i) => (
            <span key={i} className="rounded-xl bg-card px-4 py-3 font-mono text-lg font-bold text-primary shadow-sm">{s}</span>
          ))}
        </div>
      )}
      {phase === 'recall' && (
        <>
          <p className="text-sm font-semibold">Type the sequence {isNum ? '(digits only)' : '(separate with spaces)'}</p>
          <Input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} inputMode={isNum ? 'numeric' : 'text'} placeholder="…" className="font-mono text-lg tracking-widest" />
          <Button className="w-full" disabled={!answer} onClick={check}>Submit</Button>
        </>
      )}
      {phase === 'fail' && (
        <>
          <p className="text-sm font-medium text-destructive">That wasn’t right. Give it another go.</p>
          <Button variant="outline" className="w-full" onClick={() => setPhase('ready')}><RotateCcw size={16} /> Try again</Button>
        </>
      )}
    </div>
  )
}

function TimerTask({ config, onComplete }) {
  const [left, setLeft] = useState(config.seconds)
  const [running, setRunning] = useState(false)
  const done = left === 0
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => { if (done) { setRunning(false); haptic.success() } }, [done])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <div className="space-y-4 text-center">
      <div className="font-mono text-5xl font-bold tracking-tight text-primary">{mm}:{ss}</div>
      <Progress value={((config.seconds - left) / config.seconds) * 100} />
      {!done && (
        <Button className="w-full" variant={running ? 'outline' : 'default'} onClick={() => setRunning((r) => !r)}>
          {running ? config.verb + '…' : <><Play size={16} /> {left === config.seconds ? 'Start' : 'Resume'}</>}
        </Button>
      )}
      <Button className="w-full" disabled={!done} onClick={onComplete}>Task complete · Unlock funds</Button>
    </div>
  )
}

function Counter({ config, onComplete }) {
  const [n, setN] = useState(0)
  const done = n >= config.target
  const bump = (d) => { setN((v) => Math.min(config.target, Math.max(0, v + d))); haptic.tap() }
  return (
    <div className="space-y-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{config.unit}</p>
      <div className="font-mono text-6xl font-bold text-primary">{n}<span className="text-2xl text-muted-foreground">/{config.target}</span></div>
      <Progress value={(n / config.target) * 100} />
      <div className="flex gap-2">
        <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => bump(-1)}><Minus size={18} /></Button>
        <Button className="h-14 flex-1 text-base" disabled={done} onClick={() => bump(1)}><Plus size={18} /> Count rep</Button>
      </div>
      <Button className="w-full" disabled={!done} onClick={onComplete}>Task complete · Unlock funds</Button>
    </div>
  )
}

function Checklist({ config, onComplete }) {
  const [ticked, setTicked] = useState([])
  const toggle = (i) => { haptic.select(); setTicked((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i])) }
  return (
    <div className="space-y-3">
      {config.steps.map((s, i) => (
        <button key={s} onClick={() => toggle(i)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium active:scale-[0.98]">
          <span className={cn('flex h-5 w-5 items-center justify-center rounded-md border', ticked.includes(i) && 'border-primary bg-primary text-white')}>
            {ticked.includes(i) && <Check size={13} />}
          </span>
          <span className={cn(ticked.includes(i) && 'text-muted-foreground line-through')}>{s}</span>
        </button>
      ))}
      <Button className="w-full" disabled={ticked.length < config.steps.length} onClick={onComplete}>Task complete · Unlock funds</Button>
    </div>
  )
}
