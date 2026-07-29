import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BarChart3, Clock3, Gauge, RefreshCw,
  Scale, ShieldCheck, Target, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { getAdvancedAnalytics } from '../../api/analytics'
import useTradingStore from '../../store/tradingStore'
import { getApiErrorMessage } from '../../utils/apiError'
import { MISTAKE_LABELS, RULE_LABELS } from '../../utils/constants'
import { formatCurrency } from '../../utils/formatters'
import './AdvancedDashboard.css'

const PERIODS = [7, 30, 90]
const OUTCOME_COLORS = ['var(--gain)', 'var(--loss)', 'var(--text-muted)']
const TOOLTIP_STYLE = {
  background: 'var(--color-surface)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  boxShadow: 'var(--shadow-md)',
  color: 'var(--text)',
  fontSize: 11,
}

const asNumber = value => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const signedMoney = value => {
  const number = asNumber(value)
  if (number === 0) return formatCurrency(0)
  return `${number > 0 ? '+' : '-'}${formatCurrency(Math.abs(number))}`
}

const compactMoney = value => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
}).format(asNumber(value))

const dateLabel = value => {
  if (!value) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value)
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

const normalizeAdvancedAnalytics = payload => {
  const source = payload && typeof payload === 'object' ? payload : {}
  const list = key => Array.isArray(source[key]) ? source[key] : []
  return {
    ...source,
    summary: source.summary && typeof source.summary === 'object' ? source.summary : {},
    daily_series: list('daily_series'),
    portfolio_series: list('portfolio_series'),
    outcome_breakdown: list('outcome_breakdown'),
    setup_performance: list('setup_performance'),
    instrument_performance: list('instrument_performance'),
    weekday_performance: list('weekday_performance'),
    rule_breakdown: list('rule_breakdown'),
    mistake_breakdown: list('mistake_breakdown'),
  }
}

const formatDuration = minutes => {
  if (minutes == null) return '—'
  const value = Math.round(asNumber(minutes))
  if (value < 60) return `${value}m`
  return `${Math.floor(value / 60)}h ${value % 60}m`
}

function DashboardSkeleton() {
  return (
    <div className="advanced-skeleton" aria-label="Loading advanced analytics">
      <div className="advanced-skeleton-hero" />
      <div className="advanced-skeleton-kpis">
        {Array.from({ length: 6 }, (_, index) => <div key={index} />)}
      </div>
      <div className="advanced-skeleton-chart" />
    </div>
  )
}

function EmptyChart({ icon: Icon = BarChart3, title, description }) {
  return (
    <div className="advanced-empty-chart">
      <span><Icon size={20} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, badge, className = '', children }) {
  return (
    <section className={`advanced-chart-card ${className}`} aria-label={title}>
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {badge && <span className="advanced-chart-badge">{badge}</span>}
      </header>
      <div className="advanced-chart-body">{children}</div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`advanced-metric-card ${tone}`}>
      <div className="advanced-metric-icon"><Icon size={16} /></div>
      <div>
        <span>{label}</span>
        <strong className="num">{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  )
}

function AmountTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="advanced-tooltip">
      <span>{dateLabel(label) || label}</span>
      {payload.map(item => (
        <div key={item.dataKey || item.name}>
          <i style={{ background: item.color }} />
          <small>{item.name}</small>
          <strong className="num">
            {['discipline_score', 'win_rate'].includes(item.dataKey)
              ? `${asNumber(item.value).toFixed(1)}%`
              : ['violation_count', 'trade_count'].includes(item.dataKey)
                ? Math.round(asNumber(item.value))
                : signedMoney(item.value)}
          </strong>
        </div>
      ))}
    </div>
  )
}

function PerformanceChart({ data, source }) {
  if (!data.length) {
    return (
      <EmptyChart
        icon={TrendingUp}
        title="No closed-trade curve yet"
        description="Close a paper trade to begin building your performance history."
      />
    )
  }

  return (
    <div className="advanced-performance-chart">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 10, right: 18, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id="advancedEquityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-light)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={22} />
          <YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={62} />
          <Tooltip content={<AmountTooltip />} />
          <Area name={source === 'portfolio_snapshots' ? 'EOD equity' : 'Realized equity proxy'} type="monotone" dataKey="equity" stroke="var(--primary)" strokeWidth={2.2} fill="url(#advancedEquityFill)" dot={false} activeDot={{ r: 4 }} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="advanced-drawdown-chart">
        <span>Drawdown</span>
        <ResponsiveContainer width="100%" height={82}>
          <AreaChart data={data} margin={{ top: 5, right: 18, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id="advancedDrawdownFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.06} />
                <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['dataMin', 0]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip content={<AmountTooltip />} />
            <Area name="Drawdown" type="stepAfter" dataKey="drawdown" stroke="var(--loss)" fill="url(#advancedDrawdownFill)" strokeWidth={1.4} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function OutcomeChart({ data }) {
  const visible = data.filter(item => asNumber(item.count) > 0)
  const total = visible.reduce((sum, item) => sum + asNumber(item.count), 0)
  if (!visible.length) {
    return <EmptyChart icon={Target} title="No outcomes yet" description="Closed trades will appear as wins, losses, or breakeven." />
  }
  return (
    <div className="advanced-outcome-wrap">
      <ResponsiveContainer width="100%" height={205}>
        <PieChart>
          <Pie data={visible} dataKey="count" nameKey="label" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
            {visible.map((item, index) => <Cell key={item.label} fill={OUTCOME_COLORS[index % OUTCOME_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name, item) => [`${value} trades · ${signedMoney(item.payload.net_pnl)}`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="advanced-donut-total">
        <strong className="num">{total}</strong>
        <span>trades</span>
      </div>
      <div className="advanced-outcome-legend">
        {visible.map((item, index) => (
          <div key={item.label}>
            <i style={{ background: OUTCOME_COLORS[index % OUTCOME_COLORS.length] }} />
            <span>{item.label}</span>
            <strong className="num">{item.count}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function DailyPnlChart({ data }) {
  const visible = data.filter(item => item.trade_count > 0)
  if (!visible.length) {
    return <EmptyChart icon={BarChart3} title="No daily results" description="This range has no closed paper trades." />
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={visible} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-light)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis tickFormatter={compactMoney} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={58} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip content={<AmountTooltip />} cursor={{ fill: 'var(--primary-bg)' }} />
        <Bar name="Daily net P&L" dataKey="net_pnl" radius={[4, 4, 2, 2]} maxBarSize={34}>
          {visible.map(item => <Cell key={item.date} fill={asNumber(item.net_pnl) >= 0 ? 'var(--gain)' : 'var(--loss)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function DisciplineChart({ data }) {
  const visible = data.filter(item => item.discipline_score != null)
  if (!visible.length) {
    return <EmptyChart icon={ShieldCheck} title="No discipline trend yet" description="Scores appear after disciplined sessions are analyzed." />
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={visible} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-light)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis yAxisId="score" domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
        <YAxis yAxisId="violations" orientation="right" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} width={26} />
        <ReferenceLine yAxisId="score" y={80} stroke="var(--gain)" strokeDasharray="4 4" />
        <Tooltip content={<AmountTooltip />} />
        <Bar yAxisId="violations" name="Violations" dataKey="violation_count" fill="var(--loss)" opacity={0.22} radius={[3, 3, 0, 0]} maxBarSize={20} />
        <Line yAxisId="score" name="Discipline score" type="monotone" dataKey="discipline_score" stroke="var(--primary)" strokeWidth={2.2} dot={{ r: 2.5, fill: 'var(--primary)', strokeWidth: 0 }} activeDot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function PerformanceBars({ data, emptyTitle }) {
  const visible = data.slice(0, 8)
  if (!visible.length || !visible.some(item => item.trade_count > 0)) {
    return <EmptyChart icon={Scale} title={emptyTitle} description="More closed trades are needed for a meaningful comparison." />
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, visible.length * 38)}>
      <BarChart data={visible} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-light)" horizontal={false} />
        <XAxis type="number" tickFormatter={compactMoney} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={88} tick={{ fill: 'var(--text-sub)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Tooltip content={<AmountTooltip />} cursor={{ fill: 'var(--primary-bg)' }} />
        <Bar name="Net P&L" dataKey="net_pnl" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {visible.map(item => <Cell key={item.label} fill={asNumber(item.net_pnl) >= 0 ? 'var(--gain)' : 'var(--loss)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function CategoryBars({ data, labels, emptyTitle, color = 'var(--primary)' }) {
  if (!data.length) {
    return <EmptyChart icon={Activity} title={emptyTitle} description="Nothing has been recorded in this period." />
  }
  const visible = data.slice(0, 7).map(item => ({
    ...item,
    label: labels[item.key]?.label || labels[item.key] || item.key.replaceAll('_', ' ').toLowerCase(),
  }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, visible.length * 38)}>
      <BarChart data={visible} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border-light)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={116} tick={{ fill: 'var(--text-sub)', fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={value => [`${value} occurrence${value === 1 ? '' : 's'}`, 'Count']} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function AdvancedDashboard() {
  const eventSeq = useTradingStore(state => state.eventSeq)
  const [days, setDays] = useState(30)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [loadedAt, setLoadedAt] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const hasData = data != null
    setError('')
    if (hasData) setRefreshing(true)
    else setLoading(true)

    getAdvancedAnalytics(days, controller.signal)
      .then(response => {
        setData(normalizeAdvancedAnalytics(response.data))
        setLoadedAt(new Date())
      })
      .catch(requestError => {
        if (requestError?.code === 'ERR_CANCELED') return
        setError(getApiErrorMessage(requestError, 'Advanced analytics could not be loaded.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      })

    return () => controller.abort()
    // data is intentionally excluded: it only controls loading presentation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, eventSeq, refreshKey])

  const summary = data?.summary
  const diagnostics = useMemo(() => ([
    { label: 'Average win', value: signedMoney(summary?.avg_win), tone: 'gain' },
    { label: 'Average loss', value: summary?.losing_trades ? `-${formatCurrency(summary.avg_loss)}` : '—', tone: 'loss' },
    { label: 'Payoff ratio', value: summary?.payoff_ratio == null ? '—' : `${Number(summary.payoff_ratio).toFixed(2)}×` },
    { label: 'Best trade', value: signedMoney(summary?.best_trade), tone: 'gain' },
    { label: 'Worst trade', value: signedMoney(summary?.worst_trade), tone: 'loss' },
    { label: 'Avg. holding', value: formatDuration(summary?.avg_holding_minutes) },
  ]), [summary])

  if (loading && !data) return <DashboardSkeleton />

  if (error && !data) {
    return (
      <div className="advanced-load-error">
        <span><AlertTriangle size={22} /></span>
        <h2>Advanced analytics unavailable</h2>
        <p>{error}</p>
        <button type="button" onClick={() => setRefreshKey(key => key + 1)}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    )
  }

  const netPnl = asNumber(summary?.net_pnl)
  const winRate = asNumber(summary?.win_rate)
  const disciplineScore = summary?.avg_discipline_score

  return (
    <div className="advanced-dashboard">
      <section className="advanced-dashboard-header">
        <div>
          <span className="advanced-eyebrow"><Activity size={13} /> Practice performance</span>
          <h2>Advanced Performance</h2>
          <p>Measure the quality, consistency, and risk of your paper-trading decisions.</p>
        </div>
        <div className="advanced-dashboard-tools">
          <div className="advanced-range-control" aria-label="Analytics period">
            {PERIODS.map(period => (
              <button
                type="button"
                key={period}
                aria-pressed={days === period}
                className={days === period ? 'active' : ''}
                onClick={() => setDays(period)}
              >
                {period}D
              </button>
            ))}
          </div>
          <button
            type="button"
            className="advanced-refresh-button"
            disabled={refreshing}
            onClick={() => setRefreshKey(key => key + 1)}
          >
            <RefreshCw size={14} className={refreshing ? 'sf-spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <span className="advanced-updated-at">
            {loadedAt ? `Updated ${loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Not updated'}
          </span>
        </div>
      </section>

      {error && (
        <div className="advanced-inline-warning">
          <AlertTriangle size={14} /> {error} Showing the last successful result.
        </div>
      )}

      <section className="advanced-metric-grid" aria-label="Advanced performance summary">
        <MetricCard icon={Wallet} label="Net P&L" value={signedMoney(netPnl)} note={`${summary?.total_trades || 0} closed decisions`} tone={netPnl > 0 ? 'gain' : netPnl < 0 ? 'loss' : 'neutral'} />
        <MetricCard icon={Target} label="Win rate" value={`${winRate.toFixed(1)}%`} note={`${summary?.winning_trades || 0} wins · ${summary?.losing_trades || 0} losses`} tone={winRate >= 50 ? 'gain' : summary?.total_trades ? 'warn' : 'neutral'} />
        <MetricCard icon={Scale} label="Profit factor" value={summary?.profit_factor == null ? '—' : Number(summary.profit_factor).toFixed(2)} note="Gross profit ÷ gross loss" tone={(summary?.profit_factor || 0) >= 1.5 ? 'gain' : summary?.profit_factor == null ? 'neutral' : 'warn'} />
        <MetricCard icon={Gauge} label="Expectancy / trade" value={signedMoney(summary?.expectancy)} note="Average result per decision" tone={asNumber(summary?.expectancy) > 0 ? 'gain' : asNumber(summary?.expectancy) < 0 ? 'loss' : 'neutral'} />
        <MetricCard icon={TrendingDown} label="Maximum drawdown" value={asNumber(summary?.max_drawdown) > 0 ? `-${formatCurrency(summary.max_drawdown)}` : formatCurrency(0)} note={`${asNumber(summary?.max_drawdown_pct).toFixed(2)}% of initial capital`} tone={asNumber(summary?.max_drawdown) > 0 ? 'loss' : 'neutral'} />
        <MetricCard icon={ShieldCheck} label="Discipline score" value={disciplineScore == null ? '—' : `${Number(disciplineScore).toFixed(1)}`} note={`${summary?.violation_count || 0} violations in range`} tone={disciplineScore == null ? 'neutral' : disciplineScore >= 80 ? 'gain' : disciplineScore >= 50 ? 'warn' : 'loss'} />
      </section>

      <section className="advanced-diagnostic-strip" aria-label="Trade diagnostics">
        {diagnostics.map(item => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong className={`num ${item.tone || ''}`}>{item.value}</strong>
          </div>
        ))}
      </section>

      <div className="advanced-chart-grid">
        <ChartCard
          className="span-8 advanced-performance-card"
          title="Portfolio performance & drawdown"
          subtitle={data?.equity_source === 'portfolio_snapshots'
            ? 'True end-of-day equity from portfolio snapshots'
            : 'Realized P&L proxy until two end-of-day snapshots are available'}
          badge={data?.equity_source === 'portfolio_snapshots' ? 'EOD equity' : 'Realized history'}
        >
          <PerformanceChart data={data?.portfolio_series || []} source={data?.equity_source} />
        </ChartCard>

        <ChartCard className="span-4" title="Trade outcomes" subtitle="Strategies count as one decision">
          <OutcomeChart data={data?.outcome_breakdown || []} />
        </ChartCard>

        <ChartCard className="span-6" title="Daily net P&L" subtitle="Booked result by closing day">
          <DailyPnlChart data={data?.daily_series || []} />
        </ChartCard>

        <ChartCard className="span-6" title="Discipline trend" subtitle="Score versus blocked or warned attempts" badge="80 target">
          <DisciplineChart data={data?.daily_series || []} />
        </ChartCard>

        <ChartCard className="span-6" title="Setup performance" subtitle="Which playbooks are actually producing edge">
          <PerformanceBars data={data?.setup_performance || []} emptyTitle="No setup comparison yet" />
        </ChartCard>

        <ChartCard className="span-6" title="Instrument performance" subtitle="Net result by underlying">
          <PerformanceBars data={data?.instrument_performance || []} emptyTitle="No instrument comparison yet" />
        </ChartCard>

        <ChartCard className="span-6" title="Weekday performance" subtitle="Where consistency changes through the week">
          <PerformanceBars data={data?.weekday_performance || []} emptyTitle="No weekday history yet" />
        </ChartCard>

        <ChartCard className="span-6" title="Rule pressure points" subtitle="Discipline rules most often tested">
          <CategoryBars data={data?.rule_breakdown || []} labels={RULE_LABELS} emptyTitle="No discipline violations" color="var(--loss)" />
        </ChartCard>

        <ChartCard className="span-12" title="Journal mistake patterns" subtitle="Review tags expose recurring execution errors">
          <CategoryBars data={data?.mistake_breakdown || []} labels={MISTAKE_LABELS} emptyTitle="No journal mistakes recorded" color="var(--warn)" />
        </ChartCard>
      </div>
    </div>
  )
}
