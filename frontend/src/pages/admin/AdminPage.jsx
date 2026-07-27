import { useEffect, useState } from 'react'
import { Shield, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import * as adminApi from '../../api/admin'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatCurrency } from '../../utils/formatters'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'audit', label: 'Audit Trail' },
  { key: 'users', label: 'Users' },
  { key: 'ledger', label: 'Funds Ledger' },
]

const Card = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--color-surface)', border: '1px solid var(--border)',
    borderRadius: 12, overflow: 'hidden', ...style,
  }}>{children}</div>
)

const Stat = ({ label, value, tone }) => (
  <Card style={{ padding: '14px 16px' }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </div>
    <div className="num" style={{
      fontSize: 21, fontWeight: 700, marginTop: 5,
      color: tone === 'warn' ? 'var(--warn)' : tone === 'loss' ? 'var(--loss)' : 'var(--text)',
    }}>{value}</div>
  </Card>
)

const th = {
  textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td = {
  padding: '8px 12px', fontSize: 12, color: 'var(--text)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}

function OutcomePill({ outcome }) {
  const bad = outcome === 'FAILURE'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5,
      fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      background: bad ? 'var(--loss-bg)' : 'var(--gain-bg)',
      color: bad ? 'var(--loss-text)' : 'var(--gain-text)',
    }}>
      {bad ? <XCircle size={11} /> : <CheckCircle2 size={11} />}{outcome}
    </span>
  )
}

export default function AdminPage() {
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [health, setHealth] = useState(null)
  const [audit, setAudit] = useState(null)
  const [users, setUsers] = useState(null)
  const [ledger, setLedger] = useState(null)
  const [outcomeFilter, setOutcomeFilter] = useState('')

  useEffect(() => {
    setError('')
    const load = {
      overview: () => Promise.all([adminApi.getOverview(), adminApi.getHealth()])
        .then(([o, h]) => { setOverview(o.data); setHealth(h.data) }),
      audit: () => adminApi.getAudit(outcomeFilter ? { outcome: outcomeFilter } : {})
        .then(r => setAudit(r.data)),
      users: () => adminApi.getUsers().then(r => setUsers(r.data)),
      ledger: () => adminApi.getLedger().then(r => setLedger(r.data)),
    }[tab]
    // Never render an API error payload directly — FastAPI 422 `detail` is an
    // array of objects and blanks the page.
    load?.().catch(e => setError(getApiErrorMessage(e, 'Could not load admin data.')))
  }, [tab, outcomeFilter])

  return (
    <div style={{ padding: '18px 22px', maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
        <Shield size={17} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          Administration
        </h1>
        {overview && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
            background: 'var(--primary-bg)', color: 'var(--primary)',
            border: '1px solid var(--primary-border)',
          }}>
            {overview.scope === 'global' ? 'ALL TENANTS' : 'THIS TENANT'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Read-only. Nothing on this page changes state.
      </p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700,
            color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {error && (
        <div style={{
          background: 'var(--loss-bg)', border: '1px solid var(--loss)',
          borderRadius: 8, padding: '9px 12px', color: 'var(--loss-text)',
          fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {tab === 'overview' && overview && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(165px,1fr))', gap: 11, marginBottom: 16 }}>
            <Stat label="Users" value={`${overview.active_users} / ${overview.users}`} />
            <Stat label="Open Positions" value={overview.open_positions} />
            <Stat label="Resting Limits" value={overview.resting_limits} />
            <Stat label="Trades Today" value={overview.trades_today} />
            <Stat label="Realised Today" value={formatCurrency(overview.realized_pnl_today)} />
            <Stat label="Total Equity" value={formatCurrency(overview.total_equity)} />
            <Stat label="Discipline Off"
                  value={overview.discipline_mode_off}
                  tone={overview.discipline_mode_off > 0 ? 'warn' : undefined} />
            <Stat label="Failed Logins 24h"
                  value={overview.failed_logins_24h}
                  tone={overview.failed_logins_24h > 0 ? 'warn' : undefined} />
            <Stat label="Rejected Orders 24h" value={overview.rejected_orders_24h} />
          </div>

          {health && (
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                System
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10, fontSize: 12 }}>
                {[
                  ['Environment', health.environment],
                  ['Market provider', health.market_provider],
                  ['Provider connected', health.provider_connected ? 'yes' : 'no'],
                  ['Market open', health.market_open ? 'yes' : 'no'],
                  ['Redis configured', health.redis_configured ? 'yes' : 'no'],
                  ['Scheduler leader', health.scheduler_leader ? 'yes' : 'no'],
                  ['WebSocket clients', health.websocket_connections],
                  ['Migration head', health.alembic_head || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{k}</div>
                    <div style={{ color: 'var(--text)', marginTop: 2 }}>{String(v)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'audit' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
            {['', 'SUCCESS', 'FAILURE'].map(v => (
              <button key={v || 'all'} onClick={() => setOutcomeFilter(v)} style={{
                padding: '4px 11px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${outcomeFilter === v ? 'var(--primary)' : 'var(--border)'}`,
                background: outcomeFilter === v ? 'var(--primary-bg)' : 'var(--color-surface)',
                color: outcomeFilter === v ? 'var(--primary)' : 'var(--text-sub)',
              }}>{v || 'All'}</button>
            ))}
          </div>
          <Card style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead><tr>
                <th style={th}>#</th><th style={th}>Action</th><th style={th}>Outcome</th>
                <th style={th}>When</th><th style={th}>IP</th><th style={th}>Detail</th>
              </tr></thead>
              <tbody>
                {(audit?.entries || []).map(e => (
                  <tr key={e.id}>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{e.seq}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{e.action}</td>
                    <td style={td}><OutcomePill outcome={e.outcome} /></td>
                    <td style={{ ...td, color: 'var(--text-sub)' }}>
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td style={{ ...td, color: 'var(--text-sub)' }}>{e.ip_address || '—'}</td>
                    <td style={{ ...td, color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {Object.keys(e.detail || {}).length ? JSON.stringify(e.detail) : '—'}
                    </td>
                  </tr>
                ))}
                {audit && !audit.entries.length && (
                  <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={6}>
                    No audit entries yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Card>
          {audit && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Showing {audit.entries.length} of {audit.total}
            </div>
          )}
        </>
      )}

      {tab === 'users' && (
        <Card style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr>
              <th style={th}>Email</th><th style={th}>Name</th><th style={th}>Role</th>
              <th style={th}>Balance</th><th style={th}>Tier</th>
              <th style={th}>Discipline</th><th style={th}>Open</th>
            </tr></thead>
            <tbody>
              {(users?.users || []).map(u => (
                <tr key={u.id}>
                  <td style={td}>{u.email}</td>
                  <td style={{ ...td, color: 'var(--text-sub)' }}>{u.full_name}</td>
                  <td style={{ ...td, color: 'var(--text-sub)' }}>{u.role}</td>
                  <td className="num" style={td}>
                    {u.balance != null ? formatCurrency(u.balance) : '—'}
                  </td>
                  <td style={{ ...td, color: 'var(--text-sub)' }}>{u.tier || '—'}</td>
                  <td style={td}>
                    {u.discipline_mode_enabled === false
                      ? <span style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 11 }}>OFF</span>
                      : <span style={{ color: 'var(--text-sub)', fontSize: 11 }}>on</span>}
                  </td>
                  <td className="num" style={td}>{u.open_positions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'ledger' && (
        <Card style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead><tr>
              <th style={th}>#</th><th style={th}>Type</th><th style={th}>Amount</th>
              <th style={th}>Before</th><th style={th}>After</th>
              <th style={th}>Description</th><th style={th}>When</th>
            </tr></thead>
            <tbody>
              {(ledger?.entries || []).map(e => (
                <tr key={e.seq}>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{e.seq}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{e.transaction_type}</td>
                  <td className="num" style={{
                    ...td, fontWeight: 700,
                    color: Number(e.amount) >= 0 ? 'var(--gain)' : 'var(--loss)',
                  }}>{formatCurrency(e.amount)}</td>
                  <td className="num" style={{ ...td, color: 'var(--text-sub)' }}>{formatCurrency(e.balance_before)}</td>
                  <td className="num" style={{ ...td, color: 'var(--text-sub)' }}>{formatCurrency(e.balance_after)}</td>
                  <td style={{ ...td, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.description}</td>
                  <td style={{ ...td, color: 'var(--text-sub)' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {ledger && !ledger.entries.length && (
                <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={7}>
                  No ledger entries yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
