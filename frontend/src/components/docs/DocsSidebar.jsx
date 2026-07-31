import { NavLink } from 'react-router-dom'
import { navTree } from '../../content/docs/registry'

// Badges only appear on pages that are not fully shipped, so a clean page shows
// nothing and the exceptions stand out.
const STATUS_BADGE = {
  partial: { label: 'Partial', className: 'border-[var(--warn)] text-[var(--warn)]' },
  'coming-soon': { label: 'Soon', className: 'border-[var(--border)] text-[var(--text-muted)]' },
}

export default function DocsSidebar({ onNavigate }) {
  return (
    <nav aria-label="Documentation" className="pb-16 pt-8">
      {navTree.map(section => (
        <div key={section.slug} className="mb-7">
          <h2 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {section.label}
          </h2>
          <ul className="space-y-0.5">
            {section.pages.map(page => {
              const badge = STATUS_BADGE[page.status]
              return (
                <li key={page.slug}>
                  <NavLink
                    to={`/docs/${page.slug}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-[13.5px] transition ${
                        isActive
                          ? 'bg-[var(--primary-bg)] font-semibold text-[var(--primary)]'
                          : 'text-[var(--text-sub)] hover:bg-[var(--color-surface2)] hover:text-[var(--text)]'
                      }`
                    }
                  >
                    <span>{page.title}</span>
                    {badge && (
                      <span
                        className={`flex-shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
