import { useEffect, useState } from 'react'
import { Shield, ShieldOff, AlertTriangle } from 'lucide-react'
import * as disciplineApi from '../../api/discipline'

// ── Switch primitive (theme-token driven, no hardcoded hex) ──────────
function Switch({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 46, height: 26, borderRadius: 999, border: 'none', padding: 3,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        background: on ? 'var(--gain)' : 'var(--border-light)',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background 0.2s, justify-content 0.2s',
      }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--on-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

/**
 * Master Discipline Mode switch.
 * Self-contained: fetches its own state and updates on toggle.
 *
 * Props:
 *   variant  — 'full' (card with copy) | 'compact' (inline row)
 *   onChange — optional callback(modeData) after a successful toggle
 */
export default function DisciplineModeToggle({ variant = 'full', onChange }) {
  const [mode, setMode] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setMode((await disciplineApi.getMode()).data) } catch {}
  }
  useEffect(() => { load() }, [])

  const enabled = mode?.enabled ?? true

  const flip = async () => {
    const next = !enabled
    // Turning OFF is consequential — confirm.
    if (!next && !window.confirm(
      'Turn Discipline Mode OFF?\n\nAll trading rules will be bypassed and your full ' +
      '₹10,00,000 sandbox capital will be unlocked. Trades taken while off do NOT ' +
      'count toward your discipline score.'
    )) return
    setBusy(true)
    try {
      const data = (await disciplineApi.setMode(next)).data
      setMode(data)
      onChange?.(data)
    } catch {
      /* leave state as-is on failure */
    } finally {
      setBusy(false)
    }
  }

  const Icon = enabled ? Shield : ShieldOff
  const accent = enabled ? 'var(--gain)' : 'var(--warn)'

  if (variant === 'compact') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={accent} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
          Discipline {enabled ? 'On' : 'Off'}
        </span>
        <Switch on={enabled} onClick={flip} disabled={busy} />
      </div>
    )
  }

  return (
    <div className="sf-card" style={{
      padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
      border: `1px solid ${enabled ? 'var(--border-light)' : 'var(--warn)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: enabled ? 'var(--gain-bg)' : 'var(--warn-bg)', display: 'grid', placeItems: 'center' }}>
          <Icon size={20} color={accent} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: "'Inter', sans-serif" }}>
            Discipline Mode
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-sub)', marginTop: 2 }}>
            {enabled
              ? 'Rules gate every order — the disciplined sandbox.'
              : 'Free play — all rules off, full capital unlocked.'}
          </div>
        </div>
        <Switch on={enabled} onClick={flip} disabled={busy} />
      </div>

      {!enabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--warn-bg)', borderRadius: 8, padding: '9px 12px', color: 'var(--warn)', fontSize: 12, fontWeight: 600 }}>
          <AlertTriangle size={14} />
          Free-play trades don't affect your discipline score or streak.
          {mode?.capital_unlocked && ' Full ₹10,00,000 capital is unlocked.'}
        </div>
      )}
    </div>
  )
}
