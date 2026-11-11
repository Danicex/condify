import { Bell, ChevronRight, History, LogOut, MapPin, Moon, Palette, Sun, Monitor, Wallet } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useApp } from '@/context/AppContext'
import { useTheme } from '@/hooks/useTheme'
import { shortAddr, cn } from '@/lib/utils'
import { inNimiqPay } from '@/lib/nimiq'
import { CHAIN_ID_HEX } from '@/lib/config'

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun, bg: '#FFFBF4', fg: '#1C1C1E', card: '#FFFFFF' },
  { id: 'dark', label: 'Dark', icon: Moon, bg: '#121614', fg: '#FFFBF4', card: '#1A201D' },
  { id: 'system', label: 'System', icon: Monitor, bg: 'linear-gradient(135deg,#FFFBF4 50%,#121614 50%)', fg: '#E06A1B', card: 'transparent' },
]

const Row = ({ icon: Icon, label, children, border = true }) => (
  <div className={cn('flex items-center justify-between p-4', border && 'border-b')}>
    <div className="flex items-center gap-3"><Icon size={16} className="text-muted-foreground" /><span className="text-sm font-semibold">{label}</span></div>
    {children}
  </div>
)

export default function SettingsView({ onLogout }) {
  const { theme, setTheme, resolved } = useTheme()
  const { wallet, balances } = useApp()
  const name = wallet?.user?.username || 'Condify user'

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#1C3B2B] to-primary text-base font-black text-white">{name[0]}</div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold leading-none">{name}</h4>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{wallet ? `${wallet.provider} · ${shortAddr(wallet.address.replace(/\s/g, ''))}` : 'No wallet'}</p>
        </div>
      </div>

      {/* THEME */}
      <section className="space-y-3">
        <Label className="flex items-center gap-1.5"><Palette size={13} /> Appearance</Label>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const Icon = t.icon
            const active = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setTheme(t.id) }}
                aria-pressed={active}
                className={cn('rounded-2xl border-2 bg-card p-2 text-center transition-all active:scale-95', active ? 'border-primary shadow-md shadow-primary/10' : 'border-transparent')}
              >
                <div className="flex h-14 items-center justify-center rounded-xl border" style={{ background: t.bg }}>
                  <div className="h-6 w-10 rounded-md border" style={{ background: t.card }}>
                    <div className="m-1 h-1 w-5 rounded-full bg-primary" />
                  </div>
                </div>
                <p className={cn('mt-2 flex items-center justify-center gap-1 text-xs font-bold', active && 'text-primary')}><Icon size={12} />{t.label}</p>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {theme === 'system' ? `Following your device setting (currently ${resolved}).` : `Using the ${theme} theme.`}
        </p>
      </section>

      <Card className="overflow-hidden rounded-3xl">
        <Row icon={Bell} label="Push notifications"><Switch defaultChecked /></Row>
        <Row icon={MapPin} label="Geofencing tracking" border={false}><Switch /></Row>
      </Card>

      {/* WALLET DIAGNOSTICS: handy on a phone where there is no dev console */}
      <section className="space-y-3">
        <Label className="flex items-center gap-1.5"><Wallet size={13} /> Wallet diagnostics</Label>
        <Card className="space-y-2 rounded-3xl p-4 font-mono text-[11px]">
          {[
            ['Inside Nimiq Pay', inNimiqPay() ? 'yes' : 'no'],
            ['NIM network', wallet?.network ?? '—'],
            ['NIM address', wallet?.nimAddress ?? '—'],
            ['EVM address', wallet?.evmAddress ?? wallet?.evmError ?? '—'],
            [`EVM chain id (want ${CHAIN_ID_HEX})`, balances.evmChainId ?? '—', balances.evmChainId && balances.evmChainId.toLowerCase() !== CHAIN_ID_HEX ? 'text-destructive' : ''],
            ['NIM balance', balances.nim ?? balances.nimError ?? '…', balances.nimError ? 'text-destructive' : ''],
            ['USDT balance', balances.usdt ?? balances.usdtError ?? '…', balances.usdtError ? 'text-destructive' : ''],
            ['USDT locked', balances.locked ?? balances.lockedError ?? '…', balances.lockedError ? 'text-destructive' : ''],
            ['Updated', balances.updatedAt ? new Date(balances.updatedAt).toLocaleTimeString() : '—'],
          ].map(([k, v, cls]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">{k}</span>
              <span className={cn('break-all text-right font-semibold', cls)}>{String(v)}</span>
            </div>
          ))}
          <Button variant="soft" size="sm" className="mt-1 w-full" onClick={() => balances.refresh()}>Refresh balances</Button>
        </Card>
      </section>

      <Card className="flex cursor-pointer items-center justify-between rounded-3xl p-4 transition-colors active:bg-muted">
        <span className="flex items-center gap-3"><History size={16} className="text-muted-foreground" /><span className="text-sm font-semibold">System log history</span></span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Card>

      <Button variant="destructive" size="lg" className="w-full" onClick={onLogout}><LogOut size={16} /> Disconnect wallet</Button>
      <p className="text-center text-[10px] font-medium text-muted-foreground">Condify v0.1.0</p>
    </div>
  )
}
