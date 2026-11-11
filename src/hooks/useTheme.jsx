import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeCtx = createContext(null)
const KEY = 'condify-theme'

const systemPref = () => {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  // theme: 'light' | 'dark' | 'system'
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
  })
  const [sys, setSys] = useState(systemPref)

  // follow OS scheme changes
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const update = () => setSys(systemPref())
    mq?.addEventListener?.('change', update)
    return () => {
      mq?.removeEventListener?.('change', update)
    }
  }, [])

  const resolved = theme === 'system' ? sys : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    document.documentElement.style.colorScheme = resolved
    try { localStorage.setItem(KEY, theme) } catch { /* private mode */ }
  }, [theme, resolved])

  const value = useMemo(() => ({ theme, setTheme, resolved }), [theme, resolved])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export const useTheme = () => useContext(ThemeCtx)
