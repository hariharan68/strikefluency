import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BarChart3, Clock3, Gauge, RefreshCw,
  Scale, ShieldCheck, Target, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import {
  CategoryBars, DailyPnlChart, DisciplineChart, equityDelta,
  OutcomeSummary, PerformanceBars, PerformanceChart,
} from '../../components/charts/AdvancedCharts'
import { getAdvancedAnalytics } from '../../api/analytics'
import useTradingStore from '../../store/tradingStore'
import { getApiErrorMessage } from '../../utils/apiError'
import { MISTAKE_LABELS, RULE_LABELS } from '../../utils/constants'
import { asNumber, signedMoney } from '../../utils/chartFormat'
import { formatCurrency, formatDuration } from '../../utils/formatters'
import './AdvancedDashboard.css'

const PERIODS = [7, 30, 90]

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
  // Shown on the equity card: its y axis is zoomed to the data range, so the
  // period change has to be stated outright rather than inferred from the slope.
  const periodChange = equityDelta(data?.portfolio_series)

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
          badge={periodChange || (data?.equity_source === 'portfolio_snapshots' ? 'EOD equity' : 'Realized history')}
        >
          <PerformanceChart data={data?.portfolio_series || []} source={data?.equity_source} />
        </ChartCard>

        <ChartCard className="span-4" title="Trade outcomes" subtitle="Strategies count as one decision">
          <OutcomeSummary data={data?.outcome_breakdown || []} summary={summary} />
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
          <CategoryBars data={data?.rule_breakdown || []} labels={RULE_LABELS} emptyTitle="No discipline violations" tone="loss" />
        </ChartCard>

        <ChartCard className="span-12" title="Journal mistake patterns" subtitle="Review tags expose recurring execution errors">
          <CategoryBars data={data?.mistake_breakdown || []} labels={MISTAKE_LABELS} emptyTitle="No journal mistakes recorded" tone="warn" />
        </ChartCard>
      </div>
    </div>
  )
}
