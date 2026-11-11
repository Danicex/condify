import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileUp, Loader2, RotateCcw, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Textarea } from '@/components/ui/input'
import * as api from '@/lib/api'

/**
 * The AI unlock task for one goal. Replaces the old client-side TaskRunner: nothing here knows the answer.
 *   load      GET the goal's task (or ask the backend to generate one: the AI task is created on the server)
 *   submit    the proof (text / image / audio / video) goes to the backend, where the AI judges it
 *   passed    the backend has already relayed the signed key to the contract; onPassed(result) says whether the funds moved
 */
const MAX_MB = { image: 8, audio: 24, video: 50 } // mirrors the server limits (app/task_ai.py)
const ACCEPT = { image: 'image/*', audio: 'audio/*', video: 'video/*' }
const HOW = {
  text: 'Type your answer.',
  image: 'Add a photo as proof.',
  audio: 'Add a short voice recording as proof.',
  video: 'Add a short video (under 3 minutes) as proof.',
}

export default function AiTask({ goal, onPassed, onCancel }) {
  const [task, setTask] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | ready | checking | error
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [verdict, setVerdict] = useState(null) // the last failed attempt
  const started = useRef(false)
  const onPassedRef = useRef(onPassed)
  onPassedRef.current = onPassed

  const load = useCallback(async () => {
    setPhase('loading'); setError(''); setVerdict(null); setText(''); setFile(null)
    try {
      let t = await api.getTask(goal.id)
      if (t?.status === 'passed') { onPassedRef.current({ passed: true, release: null }); return } // passed earlier, release still pending
      if (!t || t.status === 'failed') t = await api.generateTask(goal.id) // a failed task is replaced by a fresh one
      setTask(t); setPhase('ready')
    } catch (e) {
      setError(e.message || 'Could not load your task'); setPhase('error')
    }
  }, [goal.id])

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice in dev
    started.current = true
    load()
  }, [load])

  const type = task?.submission_type
  const outOfAttempts = task?.status === 'failed'
  const canSubmit = phase === 'ready' && task?.status === 'pending' && (type === 'text' ? text.trim().length > 0 : !!file)

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_MB[type] * 1024 * 1024) { setError(`That file is too large (max ${MAX_MB[type]} MB).`); return }
    setError(''); setFile(f)
  }

  const submit = async () => {
    setPhase('checking'); setError(''); setVerdict(null)
    try {
      const res = await api.verifyTask(goal.id, { text: text.trim() || undefined, file })
      if (res.passed) {  onPassedRef.current(res); return }
     
      setTask((t) => ({ ...t, status: res.status, attempts: t.max_attempts - res.attempts_left }))
      setVerdict(res); setFile(null); setPhase('ready')
    } catch (e) {
      setError(e.message || 'Could not check your proof'); setPhase('ready')
    }
  }

  if (phase === 'loading') {
    return (
      <Card className="flex flex-col items-center gap-3 rounded-3xl p-8 text-center">
        <Loader2 size={30} className="animate-spin text-primary" />
        <p className="text-sm font-semibold">Getting your task…</p>
        <p className="text-xs text-muted-foreground">The AI is writing it for you.</p>
      </Card>
    )
  }

  if (phase === 'error' && !task) {
    return (
      <Card className="space-y-3 rounded-3xl p-6 text-center">
        <AlertTriangle size={30} className="mx-auto text-destructive" />
        <p className="break-words text-sm font-semibold">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
          <Button className="flex-1" onClick={load}>Try again</Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="animate-fade-in space-y-4 rounded-3xl border-primary/30 p-5">
      <div className="flex items-center justify-between">
        <Badge variant="muted">{task.difficulty}</Badge>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {outOfAttempts ? 'No attempts left' : `Attempt ${Math.min(task.attempts + 1, task.max_attempts)} of ${task.max_attempts}`}
        </span>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-base font-extrabold">{task.title}</h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{task.description}</p>
      </div>

      {verdict && (
        <div className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 text-xs font-medium text-destructive">
          <XCircle size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{verdict.feedback || 'That did not pass.'}</span>
        </div>
      )}

      {outOfAttempts ? (
        <Button className="w-full" onClick={load}><RotateCcw size={16} /> Get a new task</Button>
      ) : (
        <>
          <p className="text-xs font-semibold text-muted-foreground">{HOW[type] || HOW.text}</p>

          {type === 'text' ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer…" disabled={phase === 'checking'} className="font-sans" />
          ) : (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm font-semibold text-primary active:scale-[0.98]">
                <FileUp size={17} /> {file ? file.name : 'Choose or record a file'}
                <input type="file" accept={ACCEPT[type]} onChange={pickFile} disabled={phase === 'checking'} className="hidden" />
              </label>
              {file && <p className="text-center text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note (optional)" disabled={phase === 'checking'} />
            </div>
          )}

          {error && <p className="break-words text-center text-xs font-medium text-destructive">{error}</p>}

          <Button size="lg" className="w-full" disabled={!canSubmit} onClick={submit}>
            {phase === 'checking'
              ? <><Loader2 size={17} className="animate-spin" /> Checking your proof…</>
              : <><Send size={16} /> Submit for review</>}
          </Button>
          {phase === 'checking' && <p className="text-center text-[11px] text-muted-foreground">This can take up to a minute. If you pass, your funds are released straight to your wallet.</p>}
        </>
      )}

      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" disabled={phase === 'checking'} onClick={onCancel}>
        Cancel
      </Button>
    </Card>
  )
}
