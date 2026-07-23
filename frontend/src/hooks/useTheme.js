import { useCallback, useEffect, useState } from 'react'

export const DARK_THEME = 'dark'
export const MISTY_LIGHT_THEME = 'light'
export const FOREST_LIGHT_THEME = 'forest-light'

const THEME_STORAGE_KEY = 'sf-theme'
const LIGHT_THEME_STORAGE_KEY = 'sf-light-theme'
const THEME_CHANGE_EVENT = 'sf-theme-change'
const VALID_THEMES = new Set([DARK_THEME, MISTY_LIGHT_THEME, FOREST_LIGHT_THEME])
const VALID_LIGHT_THEMES = new Set([MISTY_LIGHT_THEME, FOREST_LIGHT_THEME])

const normalizeTheme = (theme) => VALID_THEMES.has(theme) ? theme : DARK_THEME

export const getStoredTheme = () => {
  if (typeof window === 'undefined') return DARK_THEME
  return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
}

export const getPreferredLightTheme = () => {
  if (typeof window === 'undefined') return MISTY_LIGHT_THEME
  const saved = localStorage.getItem(LIGHT_THEME_STORAGE_KEY)
  return VALID_LIGHT_THEMES.has(saved) ? saved : MISTY_LIGHT_THEME
}

export const applyTheme = (theme) => {
  if (typeof window === 'undefined') return normalizeTheme(theme)

  const nextTheme = normalizeTheme(theme)
  const root = document.documentElement

  root.classList.toggle(DARK_THEME, nextTheme === DARK_THEME)
  root.classList.toggle(MISTY_LIGHT_THEME, nextTheme === MISTY_LIGHT_THEME)
  root.classList.toggle(FOREST_LIGHT_THEME, nextTheme === FOREST_LIGHT_THEME)
  root.dataset.theme = nextTheme

  localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  if (VALID_LIGHT_THEMES.has(nextTheme)) {
    localStorage.setItem(LIGHT_THEME_STORAGE_KEY, nextTheme)
  }

  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: nextTheme } }))
  return nextTheme
}

export default function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)

  useEffect(() => {
    const syncTheme = (event) => {
      const nextTheme = event.type === 'storage'
        ? getStoredTheme()
        : normalizeTheme(event.detail?.theme)
      setThemeState(nextTheme)
    }

    window.addEventListener(THEME_CHANGE_EVENT, syncTheme)
    window.addEventListener('storage', syncTheme)
    applyTheme(getStoredTheme())

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  const setTheme = useCallback((nextTheme) => applyTheme(nextTheme), [])
  const toggleTheme = useCallback(() => {
    const currentTheme = getStoredTheme()
    applyTheme(currentTheme === DARK_THEME ? getPreferredLightTheme() : DARK_THEME)
  }, [])

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === DARK_THEME,
  }
}
