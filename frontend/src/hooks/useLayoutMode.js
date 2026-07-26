import { useCallback, useEffect, useState } from 'react'

// Shell layout, chosen in Settings → Customization. Device-local like the theme:
// it describes how this screen shows the app, not who the user is.
export const FULL_LAYOUT = 'full'   // default — sidebar with icons and labels
export const ICON_LAYOUT = 'icon'   // icon-only sidebar rail

const LAYOUT_STORAGE_KEY = 'sf-layout'
const LAYOUT_CHANGE_EVENT = 'sf-layout-change'
const VALID_LAYOUTS = new Set([FULL_LAYOUT, ICON_LAYOUT])

const normalizeLayout = (layout) => VALID_LAYOUTS.has(layout) ? layout : FULL_LAYOUT

export const getStoredLayout = () => {
  if (typeof window === 'undefined') return FULL_LAYOUT
  return normalizeLayout(localStorage.getItem(LAYOUT_STORAGE_KEY))
}

export const applyLayout = (layout) => {
  if (typeof window === 'undefined') return normalizeLayout(layout)

  const nextLayout = normalizeLayout(layout)
  document.documentElement.dataset.layout = nextLayout
  localStorage.setItem(LAYOUT_STORAGE_KEY, nextLayout)
  window.dispatchEvent(new CustomEvent(LAYOUT_CHANGE_EVENT, { detail: { layout: nextLayout } }))
  return nextLayout
}

export default function useLayoutMode() {
  const [layout, setLayoutState] = useState(getStoredLayout)

  useEffect(() => {
    const syncLayout = (event) => {
      const nextLayout = event.type === 'storage'
        ? getStoredLayout()
        : normalizeLayout(event.detail?.layout)
      setLayoutState(nextLayout)
    }

    window.addEventListener(LAYOUT_CHANGE_EVENT, syncLayout)
    window.addEventListener('storage', syncLayout)
    applyLayout(getStoredLayout())

    return () => {
      window.removeEventListener(LAYOUT_CHANGE_EVENT, syncLayout)
      window.removeEventListener('storage', syncLayout)
    }
  }, [])

  const setLayout = useCallback((nextLayout) => applyLayout(nextLayout), [])

  return { layout, setLayout, isIconRail: layout === ICON_LAYOUT }
}
