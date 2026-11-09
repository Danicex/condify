import { cn } from '@/lib/utils'

/** Nimlock mark: a lock-shackle arch framing a coin. */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} fill="currentColor" aria-hidden>
      <path d="M8 44c0-17 10-28 24-28s24 11 24 28c-6-5-14-7-24-7S14 39 8 44Z" />
      <circle cx="32" cy="34" r="7" fill="var(--logo-hole, #E06A1B)" />
      <path d="M12 50c6-4 12-5 20-5s14 1 20 5c-4 4-11 6-20 6s-16-2-20-6Z" />
    </svg>
  )
}

export function Logo({ className, tone = 'brand' }) {
  const brand = tone === 'brand'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', brand ? 'bg-primary text-white' : 'bg-white text-primary')} style={{ '--logo-hole': brand ? 'var(--primary)' : '#fff' }}>
        <LogoMark className="h-5 w-5" />
      </div>
      <span className={cn('text-lg font-extrabold tracking-tight', !brand && 'text-white')}>Condify</span>
    </div>
  )
}
