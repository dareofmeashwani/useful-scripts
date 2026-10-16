import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'utools-theme'

/** Read the current theme, falling back to the <html> attribute then 'light'. */
function readTheme() {
  if (typeof document === 'undefined') return 'light'
  return (
    localStorage.getItem(STORAGE_KEY) ||
    document.documentElement.dataset.theme ||
    'light'
  )
}

/**
 * Light/dark theme state, persisted to localStorage and reflected on <html data-theme>.
 * Returns { theme, toggle }.
 */
export default function useTheme() {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
