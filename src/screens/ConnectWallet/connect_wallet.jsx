import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, ShieldCheck, Smartphone, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Logo } from '@/components/Logo'
import { connectNimiqPay, demoWallet } from '@/lib/nimiq'
import { register, signIn } from '@/lib/auth'
import { haptic } from '@/hooks/useTelegram'

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

/**
 * Login = connect Nimiq Pay, then prove you own the wallet by signing a one-time message (no funds move).
 *   connecting -> signing -> (first visit only) username -> app
 * Inside Nimiq Pay this starts automatically; in a normal browser it explains how to open the app in Nimiq Pay.
 */
export default function ConnectWallet({ onBack, onConnected }) {
  const [state, setState] = useState('connecting') // connecting | signing | username | error | not-in-pay
  const [message, setMessage] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(null) // { wallet, signature } while we wait for a username
  const started = useRef(false)

  const connect = async () => {
    setState('connecting'); setMessage(''); pending.current = null
    try {
      const wallet = await connectNimiqPay()
      if (!wallet.evmAddress) throw new Error(wallet.evmError || 'Nimiq Pay did not share an EVM account, which Nimlock needs to lock USDT.')
      setState('signing')
      const out = await signIn(wallet.evmAddress) // reuses a live session, otherwise asks the wallet to sign
      if (out.needsUsername) {
        pending.current = { wallet, signature: out.signature }
        setState('username')
        return
      }
      haptic.success()
      onConnected({ ...wallet, user: out.user })
    } catch (e) {
      if (e.message === 'NOT_IN_NIMIQ_PAY') setState('not-in-pay')
      else { setState('error'); setMessage(e.shortMessage || e.message || 'Could not connect') }
    }
  }

  const createAccount = async (e) => {
    e.preventDefault()
    if (!USERNAME_RE.test(username) || !pending.current || busy) return
    setBusy(true); setMessage('')
    const { wallet, signature } = pending.current
    try {
      const out = await register({ address: wallet.evmAddress, signature, username, nimAddress: wallet.nimAddress })
      haptic.success()
      onConnected({ ...wallet, user: out.user })
    } catch (err) {
      haptic.error()
      if (err.status === 401) { await connect() } // the 5-minute sign-in message expired: sign a fresh one
      else setMessage(err.message || 'Could not create your account')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice in dev
    started.current = true
    connect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deeplink = `https://nimpay.app/miniapps/open/${window.location.host}`

  return (
    <div className="flex h-full flex-col bg-background px-6" style={{ paddingTop: 'calc(1.5rem + var(--tg-top))', paddingBottom: 'calc(1.5rem + var(--tg-bottom))' }}>
      <button onClick={onBack} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Back"><ArrowLeft size={20} /></button>

      <div className="mt-6 space-y-3">
        <Logo />
        <h1 className="pt-4 text-2xl font-extrabold tracking-tight">Connect Nimiq Pay</h1>
        <p className="text-sm text-muted-foreground">Nimlock uses your Nimiq Pay wallet to read your NIM and USDT balances and to sign you in. Your keys never leave Nimiq Pay.</p>
      </div>

      <div className="mt-10 flex flex-1 flex-col items-center gap-4 text-center">
        {state === 'connecting' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm font-semibold">Waiting for Nimiq Pay…</p>
            <p className="max-w-[30ch] text-xs text-muted-foreground">Approve the request in the Nimiq Pay dialog.</p>
          </>
        )}

        {state === 'signing' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm font-semibold">Sign in with your wallet</p>
            <p className="max-w-[32ch] text-xs text-muted-foreground">Sign the message to prove this wallet is yours. It does not move any funds and costs no gas.</p>
          </>
        )}

        {state === 'username' && (
          <form onSubmit={createAccount} className="w-full max-w-xs space-y-3 text-left">
            <div className="flex flex-col items-center gap-2 text-center">
              <UserRound size={32} className="text-primary" />
              <p className="text-sm font-semibold">Welcome! Pick a username</p>
              <p className="text-xs text-muted-foreground">3–20 letters, numbers or underscores.</p>
            </div>
            <Input value={username} onChange={(e) => setUsername(e.target.value.trim())} placeholder="e.g. satoshi_01" maxLength={20} autoFocus autoCapitalize="none" autoCorrect="off" />
            {username && !USERNAME_RE.test(username) && <p className="text-[11px] font-medium text-destructive">Use 3–20 letters, numbers or underscores</p>}
            {message && <p className="break-words text-[11px] font-medium text-destructive">{message}</p>}
            <Button type="submit" className="w-full" disabled={!USERNAME_RE.test(username) || busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Create account'}
            </Button>
          </form>
        )}

        {state === 'error' && (
          <>
            <AlertTriangle size={36} className="text-destructive" />
            <p className="text-sm font-semibold">Connection failed</p>
            <p className="max-w-[34ch] break-words text-xs text-muted-foreground">{message}</p>
            <Button onClick={connect}>Try again</Button>
          </>
        )}

        {state === 'not-in-pay' && (
          <>
            <Smartphone size={36} className="text-primary" />
            <p className="text-sm font-semibold">Open Nimlock inside Nimiq Pay</p>
            <p className="max-w-[34ch] text-xs text-muted-foreground">
              This app talks to your wallet through Nimiq Pay. Open Nimiq Pay, go to <b>Mini Apps</b> and load this app.
            </p>
            <Button asChild className="w-full max-w-xs"><a href={deeplink}><ExternalLink size={16} /> Open in Nimiq Pay</a></Button>
            <Button variant="outline" onClick={connect} className="w-full max-w-xs">Try again</Button>
            {import.meta.env.DEV && (
              <Button variant="ghost" size="sm" onClick={() => onConnected(demoWallet())} className="text-muted-foreground">
                Dev only: continue with demo wallet (browse only, needs AUTH_DEV_MODE=1)
              </Button>
            )}
          </>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 pt-6 text-center text-[11px] text-muted-foreground">
        <ShieldCheck size={14} className="text-success" /> Non-custodial. Every transaction needs your approval.
      </p>
    </div>
  )
}
