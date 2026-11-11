import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ExternalLink, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import { connectNimiqPay, demoWallet } from '@/lib/nimiq'
import { useApp } from '@/context/AppContext'

/**
 * Login = connect Nimiq Pay. Inside Nimiq Pay this starts automatically (one approval dialog);
 * in a normal browser it explains how to open the app in Nimiq Pay.
 */
export default function ConnectWallet({ onBack, onConnected }) {
  const {signUser} = useApp()
  const [state, setState] = useState('connecting') // connecting | error | not-in-pay
  const [message, setMessage] = useState('')
  const started = useRef(false)

  const connect = async () => {
    setState('connecting'); setMessage('')
    try {
      const wallet = await connectNimiqPay()
      onConnected(wallet)
      signUser(wallet)
    } catch (e) {
      if (e.message === 'NOT_IN_NIMIQ_PAY') setState('not-in-pay')
      else { setState('error'); setMessage(e.message || 'Could not connect') }
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
        <p className="text-sm text-muted-foreground">Nimlock uses your Nimiq Pay wallet to read your NIM and USDT balances. Your keys never leave Nimiq Pay.</p>
      </div>

      <div className="mt-10 flex flex-1 flex-col items-center gap-4 text-center">
        {state === 'connecting' && (
          <>
            <Loader2 size={36} className="animate-spin text-primary" />
            <p className="text-sm font-semibold">Waiting for Nimiq Pay…</p>
            <p className="max-w-[30ch] text-xs text-muted-foreground">Approve the request in the Nimiq Pay dialog.</p>
          </>
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
                Dev only: continue with demo wallet
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