import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, LineChart, RefreshCw, Terminal, Wallet, UserRound } from 'lucide-react'
import ReportsSection from './ReportsSection'
import PnlReportSection from './PnlReportSection'
import FundsSection from './FundsSection'
import AccountSection from './AccountSection'
import './ConsolePage.css'

const TABS = [
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'pnl-report', label: 'P&L Report', icon: LineChart },
  { key: 'funds', label: 'Funds', icon: Wallet },
  { key: 'account', label: 'Account', icon: UserRound },
]

// Local YYYY-MM-DD (the browser clock is IST for this app; avoids the UTC shift
// that toISOString() would introduce near midnight).
const isoLocal = date => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const daysAgo = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoLocal(d)
}

// Indian financial year: 1 Apr – 31 Mar.
const financialYearStart = () => {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-04-01`
}

const PRESETS = {
  '30D': () => ({ from: daysAgo(29), to: isoLocal(new Date()) }),
  '90D': () => ({ from: daysAgo(89), to: isoLocal(new Date()) }),
  FY: () => ({ from: financialYearStart(), to: isoLocal(new Date()) }),
}

export default function ConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'reports'

  const [preset, setPreset] = useState('90D')
  const [range, setRange] = useState(PRESETS['90D']())
  const [refreshKey, setRefreshKey] = useState(0)

  const setTab = key => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  const applyPreset = key => {
    setPreset(key)
    if (PRESETS[key]) setRange(PRESETS[key]())
  }

  const setCustom = (field, value) => {
    setPreset('Custom')
    setRange(prev => ({ ...prev, [field]: value }))
  }

  // The P&L Report tab carries its own date-range picker in-form, so the
  // page-level range control is hidden there (as it is on Account).
  const showRange = tab !== 'account' && tab !== 'pnl-report'
  const refresh = () => setRefreshKey(key => key + 1)

  const rangeControl = useMemo(() => (
    <div className="console-range" aria-label="Date range">
      <div className="console-range-presets">
        {['30D', '90D', 'FY'].map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={preset === key}
            className={preset === key ? 'active' : ''}
            onClick={() => applyPreset(key)}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={preset === 'Custom'}
          className={preset === 'Custom' ? 'active' : ''}
          onClick={() => setPreset('Custom')}
        >
          Custom
        </button>
      </div>
      {preset === 'Custom' && (
        <div className="console-range-custom">
          <input type="date" value={range.from} max={range.to} onChange={e => setCustom('from', e.target.value)} className="sf-input" aria-label="From date" />
          <span>→</span>
          <input type="date" value={range.to} min={range.from} onChange={e => setCustom('to', e.target.value)} className="sf-input" aria-label="To date" />
        </div>
      )}
      <button type="button" className="console-refresh" onClick={refresh} title="Refresh">
        <RefreshCw size={14} />
      </button>
    </div>
  ), [preset, range.from, range.to])

  return (
    <div className="console-page">
      <header className="console-header">
        <div>
          <span className="console-eyebrow"><Terminal size={13} /> Console</span>
          <h2>Reports, funds & account</h2>
          <p>Your realised P&amp;L, charges, fund movements, and account overview.</p>
        </div>
        {showRange && rangeControl}
      </header>

      <nav className="console-tabs" aria-label="Console sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {tab === 'reports' && <ReportsSection range={range} refreshKey={refreshKey} />}
      {tab === 'pnl-report' && <PnlReportSection />}
      {tab === 'funds' && <FundsSection range={range} refreshKey={refreshKey} />}
      {tab === 'account' && <AccountSection />}
    </div>
  )
}
