import { useMemo, useState } from 'react'
import { Clock, Cpu, Crosshair, MapPin, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApp } from '@/context/AppContext'
import { haptic } from '@/hooks/useTelegram'

const TYPE_META = {
  time: { icon: Clock, label: 'When', color: 'text-primary bg-primary/10' },
  api: { icon: Cpu, label: 'What', color: 'text-secondary bg-secondary/10 dark:text-accent dark:bg-accent/10' },
  location: { icon: MapPin, label: 'Where', color: 'text-success bg-success/10' },
}

const Field = ({ label, children }) => (<div className="space-y-1.5"><Label>{label}</Label>{children}</div>)

/**
 * Conditional wealth — attach a condition to money.
 * Types: time (when) · api (what) · location (where). UI only; evaluation is backend logic.
 */
export default function ConditionWealthView() {
  const { conditions, addCondition, toggleCondition, removeCondition } = useApp()
  const [type, setType] = useState('time')

  // time
  const [when, setWhen] = useState('')
  const [repeat, setRepeat] = useState('once')
  // api
  const [url, setUrl] = useState('https://api.coingecko.com/api/v3/simple/price?ids=nimiq-2&vs_currencies=usd')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('{\n  "headers": { "accept": "application/json" }\n}')
  const [path, setPath] = useState('nimiq-2.usd')
  const [op, setOp] = useState('<')
  const [value, setValue] = useState('0.002')
  // location
  const [place, setPlace] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radius, setRadius] = useState('500')
  const [edge, setEdge] = useState('enter')
  // action (THEN)
  const [act, setAct] = useState('swap')
  const [amount, setAmount] = useState('')
  const [target, setTarget] = useState('NIM')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const jsonError = useMemo(() => {
    if (type !== 'api' || !body.trim()) return null
    try { JSON.parse(body); return null } catch (e) { return e.message }
  }, [type, body])

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(5)); setLng(p.coords.longitude.toFixed(5)); haptic.success() },
      () => haptic.error(),
    )
  }

  const actionText = {
    swap: `Swap ${amount || '…'} USDT → ${target}`,
    release: `Release ${amount || '…'} USDT to wallet`,
    lock: `Lock ${amount || '…'} USDT for 7 days`,
  }[act]

  const ready = Number(amount) > 0 && (
    (type === 'time' && when) || (type === 'api' && url && path && value && !jsonError) || (type === 'location' && place && lat && lng)
  )

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || saving) return
    const rule =
      type === 'time' ? { title: `On ${new Date(when).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`, detail: repeat === 'once' ? 'One time' : `Repeats ${repeat}` }
      : type === 'api' ? { title: `${path} ${op} ${value}`, detail: `${method} ${url.replace(/^https?:\/\//, '').slice(0, 40)}…` }
      : { title: `${edge === 'enter' ? 'Arrives at' : 'Leaves'} ${place}`, detail: `${radius} m radius · ${lat}, ${lng}` }
    setSaving(true); setSaveError('')
    try {
      await addCondition({ type, ...rule, action: actionText, config: { when, repeat, url, method, body, path, op, value, place, lat, lng, radius, edge, act, amount, target } })
      haptic.success()
      setAmount('')
    } catch (err) {
      haptic.error()
      setSaveError(err?.message || 'Could not save rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Conditional wealth</h2>
        <p className="text-xs text-muted-foreground">Attach conditions to your money. When the condition is met, Nimlock acts for you.</p>
      </div>

      <form onSubmit={submit}>
        <Card className="space-y-5 rounded-3xl p-5">
          <Tabs value={type} onValueChange={setType}>
            <TabsList>
              <TabsTrigger value="time"><Clock size={14} /> When</TabsTrigger>
              <TabsTrigger value="api"><Cpu size={14} /> What</TabsTrigger>
              <TabsTrigger value="location"><MapPin size={14} /> Where</TabsTrigger>
            </TabsList>

            <TabsContent value="time" className="space-y-3">
              <Field label="Date & time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
              <Field label="Repeat">
                <Select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                  <option value="once">Only once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </Select>
              </Field>
            </TabsContent>

            <TabsContent value="api" className="space-y-3">
              <Field label="Endpoint">
                <div className="flex gap-2">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-24 font-bold"><option>GET</option><option>POST</option></Select>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="font-mono text-xs" />
                </div>
              </Field>
              <Field label="Request JSON (headers / body)">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} className={jsonError ? 'border-destructive' : ''} />
                {jsonError && <p className="text-[11px] font-medium text-destructive">Invalid JSON: {jsonError}</p>}
              </Field>
              <Field label="Trigger when response value…">
                <div className="grid grid-cols-[1fr_4.5rem_1fr] gap-2">
                  <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="data.price" className="font-mono text-xs" />
                  <Select value={op} onChange={(e) => setOp(e.target.value)} className="px-2 text-center font-bold"><option>&lt;</option><option>&gt;</option><option>=</option><option>≤</option><option>≥</option></Select>
                  <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="2500" className="font-mono text-xs" />
                </div>
              </Field>
            </TabsContent>

            <TabsContent value="location" className="space-y-3">
              <Field label="Place name"><Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Lekki Phase 1" /></Field>
              <Field label="Coordinates">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" inputMode="decimal" className="font-mono text-xs" />
                  <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" inputMode="decimal" className="font-mono text-xs" />
                  <Button type="button" variant="soft" size="icon" onClick={locate} aria-label="Use my location"><Crosshair size={16} /></Button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Radius (m)"><Input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} /></Field>
                <Field label="Trigger on"><Select value={edge} onChange={(e) => setEdge(e.target.value)}><option value="enter">Arrive</option><option value="exit">Leave</option></Select></Field>
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-3 border-t pt-4">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-primary"><Zap size={13} /> Then do</p>
            <Select value={act} onChange={(e) => setAct(e.target.value)}>
              <option value="swap">Swap tokens</option><option value="release">Release funds to wallet</option><option value="lock">Lock funds for 7 days</option>
            </Select>
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" min="0" placeholder="Amount (USDT)" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
              {act === 'swap' && <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-28 font-bold"><option>NIM</option><option>USDT</option></Select>}
            </div>
          </div>

          {saveError && <p className="break-words text-center text-xs font-medium text-destructive">{saveError}</p>}
          <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={!ready || saving}>{saving ? 'Saving…' : 'Deploy rule'}</Button>
        </Card>
      </form>

      <section className="space-y-3">
        <h3 className="text-sm font-extrabold tracking-tight">Your rules ({conditions.length})</h3>
        {conditions.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No conditions yet. Add one above.</p>}
        {conditions.map((c) => {
          const M = TYPE_META[c.type]
          const Icon = M.icon
          return (
            <Card key={c.id} className="flex items-center gap-3 rounded-2xl p-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${M.color}`}><Icon size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><Badge variant="muted">{M.label}</Badge><p className="truncate text-sm font-bold">{c.title}</p></div>
                <p className="truncate text-[11px] text-muted-foreground">{c.detail}</p>
                <p className="mt-0.5 text-xs font-semibold text-primary">→ {c.action}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Switch checked={c.enabled} onCheckedChange={() => toggleCondition(c.id)} aria-label="Enable rule" />
                <button onClick={() => removeCondition(c.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete rule"><Trash2 size={14} /></button>
              </div>
            </Card>
          )
        })}
      </section>
    </div>
  )
}
