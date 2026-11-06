import { useState } from 'react'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { isAddress } from 'ethers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/context/AppContext'
import { haptic } from '@/hooks/useTelegram'
import { shortAddr } from '@/lib/utils'
import { sendNIM, sendUSDT } from '@/contracts'

/** Send USDT or NIM to another address through the Condifi contract. */
export default function SendView() {
  const { balances, log, live } = useApp()
  const [token, setToken] = useState('USDT')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const bal = (token === 'USDT' ? balances.usdt : balances.nim) ?? 0
  const addrOk = isAddress(to.trim())
  const valid = addrOk && Number(amount) > 0 && Number(amount) <= bal

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true); setError('')
    try {
      if (live) await (token === 'USDT' ? sendUSDT(to.trim(), amount) : sendNIM(to.trim(), amount))
      haptic.success()
      log('send', `Sent ${amount} ${token} to ${shortAddr(to.trim())}`)
      setDone(true); setAmount(''); setTo(''); setTimeout(() => setDone(false), 2500)
      balances.refresh()
    } catch (err) {
      haptic.error()
      setError(err?.shortMessage || err?.reason || err?.message || 'Transfer failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="animate-fade-in space-y-5">
      <Card className="space-y-5 rounded-3xl p-5">
        <div className="space-y-2">
          <Label htmlFor="s-to">Recipient address</Label>
          <Input id="s-to" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value)} className="font-mono text-xs" autoComplete="off" spellCheck={false} />
          {to && !addrOk && <p className="text-[11px] font-medium text-destructive">Not a valid address</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="s-amt">Amount</Label>
            <button type="button" onClick={() => setAmount(String(bal))} className="text-xs font-bold text-primary">Max {bal.toLocaleString(undefined, { maximumFractionDigits: 4 })}</button>
          </div>
          <div className="flex gap-2">
            <Input id="s-amt" type="number" inputMode="decimal" min="0" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-lg font-bold" />
            <Select value={token} onChange={(e) => setToken(e.target.value)} className="w-28 font-bold"><option>USDT</option><option>NIM</option></Select>
          </div>
          {Number(amount) > bal && <p className="text-[11px] font-medium text-destructive">Insufficient balance</p>}
        </div>
        {error && <p className="break-words text-xs font-medium text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!valid || busy}>
          {busy ? <><Loader2 size={17} className="animate-spin" /> Confirm in wallet…</> : done ? <><CheckCircle2 size={17} /> Sent</> : <><Send size={16} /> Send {token}</>}
        </Button>
      </Card>
    </form>
  )
}
