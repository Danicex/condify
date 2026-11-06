import { useEffect, useMemo } from 'react'

/**
 * Thin wrapper around the Telegram Mini App SDK (window.Telegram.WebApp).
 * Safe to use in a normal browser: every helper is a no-op when not inside Telegram.
 */
const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined

// initData is only populated when the page is really opened from Telegram
export const isTelegram = Boolean(tg && tg.initData)

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred?.('light'),
  success: () => tg?.HapticFeedback?.notificationOccurred?.('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred?.('error'),
  select: () => tg?.HapticFeedback?.selectionChanged?.(),
}

export function useTelegram() {
  useEffect(() => {
    if (!tg) return
    tg.ready()
    tg.expand()
    try { tg.disableVerticalSwipes?.() } catch { /* older clients */ }

    const applyInsets = () => {
      const s = tg.safeAreaInset || {}
      const c = tg.contentSafeAreaInset || {}
      const root = document.documentElement.style
      root.setProperty('--tg-top', `${(s.top || 0) + (c.top || 0)}px`)
      root.setProperty('--tg-bottom', `${(s.bottom || 0) + (c.bottom || 0)}px`)
    }
    applyInsets()
    tg.onEvent?.('safeAreaChanged', applyInsets)
    tg.onEvent?.('contentSafeAreaChanged', applyInsets)
    return () => {
      tg.offEvent?.('safeAreaChanged', applyInsets)
      tg.offEvent?.('contentSafeAreaChanged', applyInsets)
    }
  }, [])

  return useMemo(
    () => ({
      webApp: tg,
      isTelegram,
      user: tg?.initDataUnsafe?.user ?? null,
      colorScheme: tg?.colorScheme ?? null, // 'light' | 'dark'
      haptic,
      openLink: (url) => (tg?.openLink ? tg.openLink(url) : window.open(url, '_blank')),
      close: () => tg?.close?.(),
    }),
    [],
  )
}

/** Shows Telegram's native back button while `visible` and calls onBack when pressed. */
export function useTelegramBack(visible, onBack) {
  useEffect(() => {
    const bb = tg?.BackButton
    if (!bb) return
    if (visible) {
      bb.show()
      bb.onClick(onBack)
      return () => { bb.offClick(onBack); bb.hide() }
    }
    bb.hide()
  }, [visible, onBack])
}

/** Colours Telegram's header / background / bottom bar to match the active theme. */
export function syncTelegramColors(bg) {
  if (!tg) return
  try {
    tg.setHeaderColor?.(bg)
    tg.setBackgroundColor?.(bg)
    tg.setBottomBarColor?.(bg)
  } catch { /* unsupported on old clients */ }
}
