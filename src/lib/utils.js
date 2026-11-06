import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const fmtUSD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n) || 0)

export const shortAddr = (a = '') => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

export const DAY = 86_400_000

/** Price formatter that keeps precision for sub-cent assets (NIM) and trims large ones. */
export const fmtPrice = (n) => {
  const v = Number(n) || 0
  const digits = v >= 100 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: digits })}`
}
