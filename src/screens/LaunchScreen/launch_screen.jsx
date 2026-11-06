import { ArrowRight, BrainCircuit, Lock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/Logo'
import hero from '@/assets/hero.jpg'

/** Landing page → "Get started" leads to Connect Wallet. */
export default function LaunchScreen({ onStart }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#1C3B2B] text-white">
      {/* hero image */}
      <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent via-45% to-[#140c04]/95" />

      <header className="relative z-10 px-6 pb-0" style={{ paddingTop: 'calc(1.5rem + var(--tg-top))' }}>
        <Logo tone="light" />
      </header>

      <div className="relative z-10 mt-auto space-y-5 px-6" style={{ paddingBottom: 'calc(1.75rem + var(--tg-bottom))' }}>
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold backdrop-blur-md">
            <Lock size={12} /> Savings with a reason to stay
          </span>
          <h1 className="text-[2.1rem] font-extrabold leading-[1.1] tracking-tight">
            Lock your money.<br />
            <span className="text-accent">Earn it back.</span>
          </h1>
          <p className="max-w-[34ch] text-sm leading-relaxed text-white/80">
            Set a goal, lock your funds and pick a challenge. Want out early? Complete the task to unlock.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold">
          {[
            { i: Lock, t: 'Lock goals' },
            { i: BrainCircuit, t: 'Unlock by tasks' },
            { i: MapPin, t: 'Smart rules' },
          ].map(({ i: Icon, t }) => (
            <div key={t} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 py-3 backdrop-blur-md">
              <Icon size={18} className="text-accent" /> {t}
            </div>
          ))}
        </div>

        <Button size="lg" className="w-full" onClick={onStart}>
          Get started <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  )
}
