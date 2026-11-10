import { useCallback, useState } from 'react'
import { Cpu, LayoutDashboard, RefreshCw, Settings, Target } from 'lucide-react'
import { ThemeProvider } from '@/hooks/useTheme'
import { AppProvider, useApp } from '@/context/AppContext'
import { isTelegram, useTelegram } from '@/hooks/useTelegram'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'
import LaunchScreen from '@/screens/LaunchScreen'
import ConnectWallet from '@/screens/ConnectWallet'
import Dashboard from '@/screens/Dashboard'
import Goals from '@/screens/Goals'
import ConditionWealthView from '@/screens/Goals/conditional_wealth'
import SwapMatrixView from '@/screens/Swap'
import SendView from '@/screens/Send'
import SettingsView from '@/screens/SettingsScreen'
import TokenTools from './test/mockToken'
import { Routes, Route } from 'react-router-dom'
/**
 * App flow:  landing → connect wallet (login) → home → [goals | swap | settings | conditional wealth]
 */
const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, title: 'Home' },
  { id: 'goals', label: 'Goals', icon: Target, title: 'Goals Vault' },
  { id: 'condition', label: 'Automate', icon: Cpu, title: 'Conditional Wealth' },
  { id: 'swap', label: 'Swap', icon: RefreshCw, title: 'Token Swap' },
  { id: 'settings', label: 'Settings', icon: Settings, title: 'Settings' },
]
const CONNECTED_FLAG = 'condify-connected' // only a flag: Nimiq Pay re-approves silently, so we reconnect on load

function Flow() {
  const { wallet, setWallet, syncError, clearSyncError, reload } = useApp()
  const [step, setStep] = useState(() => {
    try { return localStorage.getItem(CONNECTED_FLAG) ? 'connect' : 'landing' } catch { return 'landing' }
  })
  const [page, setPage] = useState('dashboard')
  const [goalsView, setGoalsView] = useState('list')

  const connected = (w) => {
    setWallet(w)
    try { localStorage.setItem(CONNECTED_FLAG, '1') } catch { /* ignore */ }
    setStep('app')
  }
  const logout = () => {
    try { wallet?.nimiq?.disconnect?.() } catch { /* ignore */ }
    setWallet(null)
    try { localStorage.removeItem(CONNECTED_FLAG) } catch { /* ignore */ }
    setPage('dashboard'); setStep('landing')
  }
  const navigate = useCallback((to, state) => { setGoalsView(state || 'list'); setPage(to) }, [])

  if (step === 'landing') return <LaunchScreen onStart={() => setStep('connect')} />
  if (step === 'connect') return <ConnectWallet onBack={() => setStep('landing')} onConnected={connected} />
  if (!wallet) return null

  const current = TABS.find((t) => t.id === page) || { title: 'Send' }
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b bg-card px-5 pb-3" style={{ paddingTop: 'calc(0.75rem + var(--tg-top))' }}>
        {page === 'dashboard' ? <Logo /> : <h1 className="text-lg font-extrabold tracking-tight">{current.title}</h1>}
        <span className="h-2 w-2 animate-pulse rounded-full bg-success" title="Connected" />
      </header>

      {syncError && (
        <div className="flex shrink-0 items-start gap-2 bg-destructive/10 px-5 py-2 text-[11px] font-medium text-destructive">
          <span className="min-w-0 flex-1 break-words">{syncError}</span>
          <button onClick={reload} className="font-bold underline">Retry</button>
          <button onClick={clearSyncError} aria-label="Dismiss" className="font-bold">✕</button>
        </div>
      )}

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-5 pb-8">
        {page === 'dashboard' && <Dashboard onNavigate={navigate} />}
        {page === 'goals' && <Goals key={goalsView} initialView={goalsView} />}
        {page === 'condition' && <ConditionWealthView />}
        {page === 'swap' && <SwapMatrixView />}
        {page === 'send' && <SendView />}
        {page === 'settings' && <SettingsView onLogout={logout} />}
      </main>

      <nav className="flex shrink-0 items-center justify-around border-t bg-card px-2 pt-2" style={{ paddingBottom: 'calc(0.5rem + var(--tg-bottom))' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => navigate(id)} className="flex w-16 flex-col items-center gap-0.5 py-1 transition-transform active:scale-90">
            <span className={cn('rounded-xl px-3 py-1 transition-colors', page === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}><Icon size={21} /></span>
            <span className={cn('text-[10px] font-bold', page === id ? 'text-primary' : 'text-muted-foreground')}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  useTelegram() // ready(), expand(), safe-area insets, header colours
  return (
 <ThemeProvider>
  <AppProvider>
    {/* Inside Telegram the app fills the whole webview; in a browser it sits in a phone frame on large screens */}
    <div className={cn('flex min-h-dvh items-center justify-center bg-background', !isTelegram && 'sm:bg-muted sm:p-6')}>
      <div className={cn('relative h-dvh w-full overflow-hidden bg-background text-foreground', !isTelegram && 'sm:h-[min(900px,calc(100dvh-3rem))] sm:max-w-[430px] sm:rounded-[40px] sm:border sm:shadow-2xl')}>
        
        {/* Routes handle what dynamically renders inside the phone frame */}
        <Routes>
          {/* Main App entry point */}
          <Route path="/" element={<Flow />} />
          
          {/* Dev/Token tools page */}
          <Route path="/mock_token" element={<TokenTools />} />
          
          {/* Fallback 404 page */}
        </Routes>

      </div>
    </div>
  </AppProvider>
</ThemeProvider>

  )
}
