import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import DocsHeader from './DocsHeader'
import DocsSidebar from './DocsSidebar'
import DocsSearch from './DocsSearch'

// The docs shell lives outside PublicTransitionLayout (which is keyed by
// pathname and remounts everything on navigation). Rendering the header and
// sidebar once here means only the article swaps between pages, so sidebar
// scroll position survives and the route animation doesn't replay.
export default function DocsLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { pathname } = useLocation()

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  // Close the mobile drawer on navigation, and lock body scroll while it's open
  // — same pattern as the marketing mobile menu in SiteChrome.
  useEffect(() => { setNavOpen(false) }, [pathname])
  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [navOpen])

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(open => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--text)]">
      <DocsHeader
        navOpen={navOpen}
        onToggleNav={() => setNavOpen(open => !open)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <div className="mx-auto grid max-w-[1600px] gap-x-10 px-4 md:px-6 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_224px]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
            <DocsSidebar />
          </div>
        </aside>

        <Outlet context={{ openSearch: () => setSearchOpen(true) }} />
      </div>

      {/* Mobile drawer */}
      {navOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 top-16 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          />
          <div className="sf-mobile-nav fixed inset-y-16 left-0 z-50 w-[280px] max-w-[85vw] overflow-y-auto border-r border-[var(--border)] bg-[var(--color-surface)] px-3 shadow-[var(--shadow-md)] lg:hidden">
            <DocsSidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </>
      )}

      <DocsSearch open={searchOpen} onClose={closeSearch} />
    </div>
  )
}
