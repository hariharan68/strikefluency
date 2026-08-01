/**
 * Theme tokens, resolved to concrete colours for ECharts.
 *
 * Recharts got this for free: it writes `var(--gain)` straight into an SVG
 * attribute and the browser resolves it live. ECharts draws to canvas, so every
 * colour has to be a real value at `setOption` time — which means reading the
 * custom properties ourselves and re-reading them when the theme changes.
 *
 * `index.html` applies the theme class before React paints, so the first
 * synchronous read is already correct for all four themes.
 */
import { useEffect, useState } from 'react'

const THEME_CHANGE_EVENT = 'sf-theme-change'

// Only tokens defined in ALL FOUR theme blocks of styles/index.css.
// Deliberately excluded: --secondary, --secondary-bg, --bg-deep (absent from
// dark) and --warn-text (does not exist in any theme).
const TOKEN_NAMES = [
  'gain', 'gain-bg', 'gain-text', 'gain-bar',
  'loss', 'loss-bg', 'loss-text', 'loss-bar',
  'warn', 'warn-bg',
  'primary', 'primary-dark', 'primary-bg', 'primary-border', 'primary-glow-rgb',
  'on-primary',
  'border', 'border-light',
  'text', 'text-sub', 'text-muted',
  'color-surface', 'color-surface2', 'color-accent-l',
]

// Used only if a read happens outside the browser or before styles load, so a
// chart never renders with `undefined` colours.
const FALLBACK = {
  gain: '#31dd6a', loss: '#ff5c5c', warn: '#f5c451', primary: '#dbbdff',
  border: '#262626', 'border-light': '#262626',
  text: '#e3e3e3', 'text-sub': '#a1a1a1', 'text-muted': '#8a8a8a',
  'color-surface': '#1a1a1a', 'primary-glow-rgb': '219,189,255',
}

const readTokens = () => {
  if (typeof window === 'undefined') return { ...FALLBACK }
  const style = getComputedStyle(document.documentElement)
  const tokens = {}
  for (const name of TOKEN_NAMES) {
    tokens[name] = style.getPropertyValue(`--${name}`).trim() || FALLBACK[name] || 'transparent'
  }
  return tokens
}

/**
 * `--primary-glow-rgb` holds a bare "r,g,b" triple rather than a colour, so it
 * cannot be handed to ECharts directly.
 */
export const glow = (tokens, alpha = 1) => `rgba(${tokens['primary-glow-rgb'] || '0,0,0'},${alpha})`

/**
 * Tokens for the current theme, re-resolved whenever it changes.
 *
 * `storage` covers a theme switched in another tab; useTheme's applyTheme
 * dispatches `sf-theme-change` for switches in this one.
 */
export default function useChartTokens() {
  const [tokens, setTokens] = useState(readTokens)

  useEffect(() => {
    const resync = () => setTokens(readTokens())
    window.addEventListener(THEME_CHANGE_EVENT, resync)
    window.addEventListener('storage', resync)
    // Covers the case where this component mounts before the theme class is on
    // <html> (a direct hit on a lazy route, or the inline script being skipped).
    resync()
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, resync)
      window.removeEventListener('storage', resync)
    }
  }, [])

  return tokens
}
