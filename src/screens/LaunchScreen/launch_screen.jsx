
import {
  ArrowRight,
  BrainCircuit,
  Lock,
  MapPin,
  Clock,
  Webhook,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import hero from '@/assets/hero.jpg'

/** Landing page → "Get started" leads to Connect Wallet. */
export default function LaunchScreen({ onStart }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#1C3B2B] text-white">
      <img
        src={hero}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[50%_20%]"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent via-45% to-[#140c04]/95" />

      <header
        className="relative z-10 px-6 pb-0"
        style={{ paddingTop: 'calc(1.5rem + var(--tg-top))' }}
      >
        <Logo tone="light" />
      </header>

      <div
        className="relative z-10 mt-auto space-y-5 px-6"
        style={{ paddingBottom: 'calc(1.75rem + var(--tg-bottom))' }}
      >
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold backdrop-blur-md">
            <BrainCircuit size={12} />
            Wealth on your terms
          </span>

          <h1 className="text-[2.1rem] font-extrabold leading-[1.1] tracking-tight">
            Your wealth.<br />
            Your <span className="text-accent">conditions.</span>
          </h1>

          <p className="max-w-[34ch] text-sm leading-relaxed text-white/80">
            Put conditions on your money. Control when it moves,
            unlocks or gets spent using time, location, tasks,
            natural language or API triggers.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
          {[
            { i: Lock, t: 'Lock your funds' },
            { i: Clock, t: 'Time conditions' },
            { i: MapPin, t: 'Location triggers' },
            { i: Webhook, t: 'API triggers' },
          ].map(({ i: Icon, t }) => (
            <div
              key={t}
              className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-md"
            >
              <Icon size={17} className="shrink-0 text-accent" />
              {t}
            </div>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-white/65">
          Lock, unlock, send and swap. Your money follows your rules.
        </p>

        <Button size="lg" className="w-full" onClick={onStart}>
          Get started <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  )
}
