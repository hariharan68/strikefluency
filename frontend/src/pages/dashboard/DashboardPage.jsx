import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccount, getSession } from '../../api/trading'
import { getTodayViolations, getScore } from '../../api/discipline'
import { getPnlCurve, getSummary } from '../../api/analytics'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { RULE_LABELS } from '../../utils/constants'
import { TrendingUp, ArrowUpRight } from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#ffffff', border: '1px solid #E5E7EB',
    borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    ...style
  }}>
    {children}
  </div>
)

const CardHeader = ({ title }) => (
  <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0EDF1' }}>
    <span style={{ color: '#6B7280', fontSize: 12, fontWeight: 500 }}>{title}</span>
  </div>
)

const chartTooltip = {
  contentStyle: {
    background: '#fff', border: '1px solid #E5E7EB',
    borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
  },
  labelStyle: { color: '#6B7280', fontWeight: 500 },
  itemStyle: { color: '#111827' }
}

function CustomBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ color: '#6B7280', marginBottom: 4 }}>{label}</div>
      <div style={{ color: val >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>
        {val >= 0 ? '+' : ''}{formatCurrency(val)}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [account, setAccount] = useState(null)
  const [session, setSession] = useState(null)
  const [score, setScore] = useState(null)
  const [violations, setViolations] = useState([])
  const [summary, setSummary] = useState(null)
  const [pnlCurve, setPnlCurve] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    Promise.allSettled([
      getAccount().then(r => setAccount(r.data)),
      getScore().then(r => setScore(r.data)),
      getSession().then(r => setSession(r.data)),
      getTodayViolations().then(r => setViolations(r.data || [])),
      getSummary().then(r => setSummary(r.data)),
      getPnlCurve().then(r => {
        const d = r.data?.data || r.data || []
        setPnlCurve(d)
      }),
    ]).catch(() => {})
  }, [])

  const acc = account?.account || account
  const pnl = account?.today_realized_pnl ?? 0
  const totalPnl = summary?.total_realized_pnl ?? 0
  const initial = acc?.initial_balance ?? 100000
  const pnlPct = initial > 0 ? ((totalPnl / initial) * 100).toFixed(1) : '0.0'
  const winDays = summary?.win_days ?? summary?.winning_trades ?? 0
  const lossDays = summary?.loss_days ?? summary?.losing_trades ?? 0
  const avgPnlDay = summary?.avg_pnl_per_day ?? summary?.avg_pnl_per_trade ?? 0
  const disciplineScore = acc?.discipline_score ?? score?.score ?? 0
  const streak = acc?.consecutive_disciplined_trades ?? 0

  // Build aggregate bar data from pnlCurve or mock
  const barData = pnlCurve.length > 0
    ? pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, pnl: d.daily_pnl ?? d.pnl ?? 0 }))
    : []

  // Cumulative line data
  const areaData = pnlCurve.length > 0
    ? pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, cumulative: d.cumulative_pnl ?? d.cumulative ?? 0 }))
    : []

  const isGain = totalPnl >= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── TOP STATS CARD ── matches reference exactly */}
      <Card>
        <div style={{ display: 'flex', minHeight: 90 }}>
          {/* Avg PnL/Day */}
          <div style={{ flex: 1, padding: '20px 24px', borderRight: '1px solid #F0EDF1' }}>
            <div style={{ color: '#6B7280', fontSize: 12, marginBottom: 6 }}>Avg. PnL/Day</div>
            <div className="num" style={{ color: '#111827', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>
              {formatCurrency(avgPnlDay)}
            </div>
          </div>

          {/* Win / Loss Days */}
          <div style={{ flex: 1, padding: '20px 24px', borderRight: '1px solid #F0EDF1', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#6B7280', fontSize: 13 }}>Win Days:</span>
              <span className="num" style={{ color: '#16a34a', fontSize: 16, fontWeight: 600 }}>{winDays}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#6B7280', fontSize: 13 }}>Loss Days:</span>
              <span className="num" style={{ color: '#dc2626', fontSize: 16, fontWeight: 600 }}>{lossDays}</span>
            </div>
          </div>

          {/* Total PnL — with % badge like reference */}
          <div style={{ flex: 1.5, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ color: '#6B7280', fontSize: 12 }}>Total PnL</span>
              <span className={isGain ? 'badge-gain' : 'badge-loss'}>
                {isGain && <ArrowUpRight size={11} />}
                {isGain ? '+' : ''}{pnlPct}%
              </span>
            </div>
            <div className="num" style={{ color: '#111827', fontSize: 26, fontWeight: 600, lineHeight: 1, marginBottom: 4 }}>
              {formatCurrency(Math.abs(totalPnl))}
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 11 }}>
              from {formatCurrency(initial)}
            </div>
          </div>

          {/* Extra quick stats */}
          <div style={{
            padding: '20px 24px', borderLeft: '1px solid #F0EDF1',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', alignContent: 'center'
          }}>
            {[
              { label: 'Balance', value: formatCurrency(acc?.balance ?? 0), color: '#111827' },
              { label: 'Discipline', value: `${Math.round(Number(disciplineScore))}%`, color: Number(disciplineScore) >= 70 ? '#16a34a' : '#d97706' },
              { label: "Today's P&L", value: (pnl >= 0 ? '+' : '') + formatCurrency(pnl), color: pnl >= 0 ? '#16a34a' : '#dc2626' },
              { label: 'Streak', value: `${streak} trades`, color: '#6B7280' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
                <div className="num" style={{ color: item.color, fontSize: 13, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── DUAL CHARTS — matching reference layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Aggregate PnL (bar chart, green/red) */}
        <Card>
          <div style={{ padding: '16px 18px 6px' }}>
            <div style={{ textAlign: 'center', color: '#111827', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Aggregate PnL vs Date
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, background: '#22c55e', borderRadius: 2 }} />
              <span style={{ color: '#6B7280', fontSize: 11 }}>Daily PnL</span>
            </div>
          </div>
          {barData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 12 }}>
              Place trades to see your daily P&L chart
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <CartesianGrid stroke="#F0EDF1" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="#E5E7EB" />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Cumulative PnL (area chart, green line + fill) */}
        <Card>
          <div style={{ padding: '16px 18px 6px' }}>
            <div style={{ textAlign: 'center', color: '#111827', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Cumulative PnL vs Date
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #22c55e', background: '#fff' }} />
              <span style={{ color: '#6B7280', fontSize: 11 }}>Daily PnL</span>
            </div>
          </div>
          {areaData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 12 }}>
              Place trades to see your cumulative curve
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="cumGradNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F0EDF1" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="#E5E7EB" />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 12 }}
                  formatter={v => formatCurrency(v)} labelStyle={{ color: '#6B7280' }} />
                <Area type="monotone" dataKey="cumulative" stroke="#22c55e" strokeWidth={1.5}
                  fill="url(#cumGrad)" dot={{ r: 2, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── BOTTOM: Session + Violations side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>

        {/* Today's session */}
        <Card>
          <CardHeader title="TODAY'S SESSION" />
          <div style={{ padding: '14px 18px' }}>
            {account?.is_cooldown_active && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fef3c7', border: '1px solid #fde68a',
                borderRadius: 8, padding: '8px 12px', marginBottom: 12
              }}>
                <span style={{ fontSize: 14 }}>⏱</span>
                <div>
                  <div style={{ color: '#92400e', fontSize: 12, fontWeight: 500 }}>Cooldown Active</div>
                  <div className="num" style={{ color: '#b45309', fontSize: 11 }}>
                    {Math.floor((account.cooldown_remaining_seconds ?? 0) / 60)}m remaining
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: "Today's P&L", value: (pnl >= 0 ? '+' : '') + formatCurrency(pnl), color: pnl >= 0 ? '#16a34a' : '#dc2626' },
                { label: 'Trades Today', value: `${account?.today_trades ?? 0} / ${session?.max_trades ?? 3}`, color: '#111827' },
                { label: 'Discipline Score', value: `${Math.round(Number(disciplineScore))}%`, color: Number(disciplineScore) >= 70 ? '#16a34a' : '#d97706' },
                { label: 'Violations', value: violations.length, color: violations.length > 0 ? '#dc2626' : '#16a34a' },
              ].map(item => (
                <div key={item.label} style={{
                  background: '#F8F7F9', border: '1px solid #F0EDF1',
                  borderRadius: 8, padding: '10px 12px'
                }}>
                  <div style={{ color: '#9CA3AF', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{item.label}</div>
                  <div className="num" style={{ color: item.color, fontSize: 15, fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/trading')}
              className="sf-btn-primary"
              style={{ width: '100%', marginTop: 14 }}
            >
              Open Trading Desk
            </button>
          </div>
        </Card>

        {/* Violations */}
        <Card>
          <CardHeader title={`TODAY'S VIOLATIONS (${violations.length})`} />
          {violations.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <div style={{ color: '#6B7280', fontSize: 13 }}>No violations today — excellent discipline!</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Rule', 'Status', 'Time'].map(h => (
                      <th key={h} style={{
                        padding: '8px 18px', textAlign: 'left',
                        color: '#9CA3AF', fontSize: 11, fontWeight: 500,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        borderBottom: '1px solid #F0EDF1', background: '#F8F7F9'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v, i) => (
                    <tr key={i} className="chain-row" style={{ borderBottom: '1px solid #F8F7F9' }}>
                      <td style={{ padding: '9px 18px', color: '#111827', fontSize: 12 }}>
                        {RULE_LABELS[v.rule_code] || v.rule_code}
                      </td>
                      <td style={{ padding: '9px 18px' }}>
                        <span className={v.was_blocked ? 'badge-loss' : ''} style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                          background: v.was_blocked ? '#fee2e2' : '#fef3c7',
                          color: v.was_blocked ? '#b91c1c' : '#92400e'
                        }}>
                          {v.was_blocked ? 'BLOCKED' : 'WARNED'}
                        </span>
                      </td>
                      <td className="num" style={{ padding: '9px 18px', color: '#9CA3AF', fontSize: 11 }}>
                        {formatDate(v.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
