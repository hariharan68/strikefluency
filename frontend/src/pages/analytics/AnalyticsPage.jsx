import { useEffect, useState } from 'react'
import { getSummary, getDisciplineTrend, getPnlCurve, getMistakes } from '../../api/analytics'
import { formatCurrency } from '../../utils/formatters'
import { ArrowUpRight } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'

const COLORS = ['#ef4444','#3b82f6','#f59e0b','#8b5cf6','#22c55e','#f97316']

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }}>
    {children}
  </div>
)
const CardHeader = ({ title }) => (
  <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
    <span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{title}</span>
  </div>
)
const tooltipStyle = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
  labelStyle: { color: '#64748b' }, itemStyle: { color: '#1e293b' }
}

function CustomBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
      <div style={{ color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ color: val >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>
        {val >= 0 ? '+' : ''}{formatCurrency(val)}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState(null)
  const [pnlCurve, setPnlCurve] = useState([])
  const [disciplineTrend, setDisciplineTrend] = useState([])
  const [mistakes, setMistakes] = useState([])

  useEffect(() => {
    Promise.allSettled([
      getSummary().then(r => setSummary(r.data)).catch(() => {}),
      getPnlCurve().then(r => setPnlCurve(r.data?.data || r.data || [])).catch(() => {}),
      getDisciplineTrend(30).then(r => setDisciplineTrend(r.data?.data || r.data || [])).catch(() => {}),
      getMistakes().then(r => setMistakes(r.data?.mistakes || r.data || [])).catch(() => {})
    ])
  }, [])

  const s = summary
  const totalPnl = s?.total_realized_pnl ?? 0
  const initial = s?.initial_balance ?? 100000
  const pnlPct = initial > 0 ? ((totalPnl / initial) * 100).toFixed(1) : '0.0'
  const isGain = totalPnl >= 0

  const barData = pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, pnl: d.daily_pnl ?? d.pnl ?? 0 }))
  const areaData = pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, cumulative: d.cumulative_pnl ?? d.cumulative ?? 0 }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats strip — matching reference */}
      <Card>
        <div style={{ display: 'flex', minHeight: 88 }}>
          <div style={{ flex: 1, padding: '18px 22px', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 5 }}>Avg. PnL/Day</div>
            <div className="num" style={{ color: '#1e293b', fontSize: 26, fontWeight: 600 }}>
              {formatCurrency(s?.avg_pnl_per_day ?? s?.avg_pnl_per_trade ?? 0)}
            </div>
          </div>
          <div style={{ flex: 1, padding: '18px 22px', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>Win Trades:</span>
              <span className="num" style={{ color: '#16a34a', fontWeight: 600, fontSize: 15 }}>{s?.winning_trades ?? s?.win_days ?? 0}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontSize: 13 }}>Loss Trades:</span>
              <span className="num" style={{ color: '#dc2626', fontWeight: 600, fontSize: 15 }}>{s?.losing_trades ?? s?.loss_days ?? 0}</span>
            </div>
          </div>
          <div style={{ flex: 1.5, padding: '18px 22px', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ color: '#64748b', fontSize: 12 }}>Total PnL</span>
              <span className={isGain ? 'badge-gain' : 'badge-loss'}>
                {isGain && <ArrowUpRight size={11} />}
                {isGain ? '+' : ''}{pnlPct}%
              </span>
            </div>
            <div className="num" style={{ color: '#1e293b', fontSize: 26, fontWeight: 600, marginBottom: 3 }}>
              {formatCurrency(Math.abs(totalPnl))}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>from {formatCurrency(initial)}</div>
          </div>
          <div style={{ flex: 1, padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', alignContent: 'center' }}>
            {[
              { label: 'Total Trades', value: s?.total_trades ?? '—' },
              { label: 'Win Rate', value: s?.win_rate != null ? `${(s.win_rate*100).toFixed(0)}%` : '—', color: '#16a34a' },
              { label: 'Best Trade', value: s?.best_trade != null ? formatCurrency(s.best_trade) : '—', color: '#16a34a' },
              { label: 'Profit Factor', value: s?.profit_factor != null ? Number(s.profit_factor).toFixed(2) : '—', color: (s?.profit_factor ?? 0) >= 1.5 ? '#16a34a' : '#d97706' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
                <div className="num" style={{ color: item.color || '#1e293b', fontSize: 13, fontWeight: 600 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Dual chart row — matches reference */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ padding: '14px 18px 6px', textAlign: 'center' }}>
            <div style={{ color: '#374151', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Aggregate PnL vs Date</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, background: '#22c55e', borderRadius: 2 }} />
              <span style={{ color: '#64748b', fontSize: 11 }}>Daily PnL</span>
            </div>
          </div>
          {barData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
              Place trades to see your daily P&L chart
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="#e2e8f0" />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="pnl" radius={[2,2,0,0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <div style={{ padding: '14px 18px 6px', textAlign: 'center' }}>
            <div style={{ color: '#374151', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Cumulative PnL vs Date</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #22c55e', background: '#fff' }} />
              <span style={{ color: '#64748b', fontSize: 11 }}>Daily PnL</span>
            </div>
          </div>
          {areaData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
              Place trades to see your cumulative curve
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="#e2e8f0" />
                <Tooltip {...tooltipStyle} formatter={v => formatCurrency(v)} />
                <Area type="monotone" dataKey="cumulative" stroke="#22c55e" strokeWidth={1.5} fill="url(#ag)" dot={{ r: 2, fill: '#22c55e' }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Discipline trend + Mistakes */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card>
          <CardHeader title="30-Day Discipline Score Trend" />
          <div style={{ padding: '12px 16px' }}>
            {disciplineTrend.length === 0 ? (
              <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
                No discipline data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={disciplineTrend}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip {...tooltipStyle} formatter={v => `${v}%`} />
                  <Bar dataKey="score" fill="#3b82f6" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Mistake Breakdown" />
          <div style={{ padding: '12px 16px' }}>
            {mistakes.length === 0 ? (
              <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                No mistake data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={mistakes} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={50} innerRadius={28}>
                    {mistakes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#64748b' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
