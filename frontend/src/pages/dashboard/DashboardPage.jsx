import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccount } from '../../api/trading'
import { getTodayViolations, getScore, getRules } from '../../api/discipline'
import { getPnlCurve, getSummary } from '../../api/analytics'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { RULE_LABELS } from '../../utils/constants'
import {
  ArrowRight, Shield, ShieldCheck, Flame, Timer, Gauge,
  Wallet, TrendingUp, BookOpen, Check, Ban, AlertTriangle
} from 'lucide-react'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'
import useAuthStore from '../../store/authStore'

// ── Reference data ────────────────────────────────────────────────
const TIER_META = {
  TIER_1: { label: 'Tier 1', capital: '₹1,00,000' },
  TIER_2: { label: 'Tier 2', capital: '₹5,00,000' },
  TIER_3: { label: 'Tier 3', capital: '₹10,00,000' },
}

// Why each rule exists — coaching, not just a label
const RULE_WHY = {
  MAX_TRADES_PER_DAY:  'Caps overtrading — the fastest way to give back gains.',
  MANDATORY_SL:        'Every trade carries a stop. No exceptions, no hoping.',
  NO_AVERAGING_DOWN:   'Adding to losers turns small losses into blow-ups.',
  NO_DIRECTION_FLIP:   'Flipping long/short mid-session is tilt, not analysis.',
  REVENGE_COOLDOWN:    'Forces a pause after a stop-out, before you retaliate.',
  MAX_DAILY_LOSS:      'Stops the bleeding on a bad day so tomorrow exists.',
  MANDATORY_SETUP_TAG: "If you can't name the setup, don't take the trade.",
}

const ON_OFF_RULES = ['MANDATORY_SL', 'NO_AVERAGING_DOWN', 'NO_DIRECTION_FLIP', 'MANDATORY_SETUP_TAG']

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function scoreColor(s) {
  if (s >= 80) return 'var(--gain)'
  if (s >= 50) return 'var(--warn)'
  return 'var(--loss)'
}

// ── Sparkline SVG ─────────────────────────────────────────────────
function Sparkline({ data = [], color = 'var(--primary)', w = 70, h = 34 }) {
  if (!data || data.length < 2) {
    return (
      <svg width={w} height={h}>
        <polyline points={`0,${h / 2} ${w},${h / 2}`} fill="none"
          stroke={color} strokeWidth="1.5" opacity="0.35" strokeLinecap="round" />
      </svg>
    )
  }
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1, pad = 3
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / range) * (h - pad * 2)
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h}>
      <polyline points={pts.join(' ')} fill="none" stroke={color}
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Discipline Score ring ─────────────────────────────────────────
function ScoreRing({ score, size = 118, stroke = 10 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const dash = c * (1 - pct / 100)
  const ringColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f5c542' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={dash} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x="50%" y="50%" dy="0.05em" textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
        fill="#fff" fontSize="26" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
        {Math.round(pct)}
      </text>
      <text x="50%" y="66%" textAnchor="middle"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
        fill="rgba(255,255,255,0.55)" fontSize="10" fontWeight="600" letterSpacing="0.08em">
        SCORE
      </text>
    </svg>
  )
}

// ── Discipline Hero ───────────────────────────────────────────────
function DisciplineHero({ name, score, streak, tier, toNextTier, navigate }) {
  const s = Math.round(Number(score) || 0)
  const tierMeta = TIER_META[tier] || TIER_META.TIER_1
  const isTop = tier === 'TIER_3'
  const coach = s >= 90
    ? 'Textbook discipline. This is exactly how edge compounds.'
    : s >= 70
    ? 'Solid process. Protect it — one impulsive day undoes weeks.'
    : s >= 40
    ? 'Rebuilding. Follow every rule today, no matter the P&L.'
    : 'Reset mode. Your only job today is to not break a single rule.'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0B1437 0%, #1E3A6A 100%)',
      borderRadius: 18, padding: '26px 30px', position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', right: 60, top: -40, width: 150, height: 150, borderRadius: '50%', background: 'rgba(37,99,235,0.30)' }} />
      <div style={{ position: 'absolute', right: -10, top: 30, width: 110, height: 110, borderRadius: '50%', background: 'rgba(96,165,250,0.18)' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
        <ScoreRing score={s} />

        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ color: '#93C5FD', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 8 }}>
            {getGreeting()}, {name} · Discipline Desk
          </p>
          <h2 style={{ color: '#fff', fontSize: 21, fontWeight: 700, lineHeight: 1.3, marginBottom: 14, maxWidth: 460 }}>
            {coach}
          </h2>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>
              <Flame size={14} /> {streak} disciplined {streak === 1 ? 'trade' : 'trades'} in a row
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#DBEAFE', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600 }}>
              <ShieldCheck size={14} /> {tierMeta.label} · {tierMeta.capital}
            </span>
            <span style={{ color: '#B8CDEE', fontSize: 12 }}>
              {isTop ? 'Top tier reached' : `${toNextTier} clean trades to next tier`}
            </span>
          </div>
        </div>

        <button onClick={() => navigate('/trading')} style={{
          background: '#fff', color: '#0F1C3F', border: 'none', borderRadius: 999,
          padding: '10px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start'
        }}>
          Open Trading Desk <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Guardrail card (live rule status) ─────────────────────────────
function GuardrailCard({ icon: Icon, label, value, sub, tone, progress }) {
  const toneColor = tone === 'loss' ? 'var(--loss)' : tone === 'warn' ? 'var(--warn)' : 'var(--gain)'
  const toneBg = tone === 'loss' ? 'var(--loss-bg)' : tone === 'warn' ? 'var(--warn-bg)' : 'var(--gain-bg)'
  return (
    <div className="sf-card" style={{ padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: toneBg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={16} color={toneColor} strokeWidth={2} />
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-sub)' }}>{label}</span>
      </div>
      <div className="num" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: toneColor, fontWeight: 600, marginTop: 5 }}>{sub}</div>
      {typeof progress === 'number' && (
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: '100%', background: toneColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
        </div>
      )}
    </div>
  )
}

// ── On/off rule pill ──────────────────────────────────────────────
function RulePill({ code, active }) {
  return (
    <div title={RULE_WHY[code]} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      background: active ? 'var(--gain-bg)' : 'var(--color-surface2)',
      border: `1px solid ${active ? 'rgba(22,163,74,0.22)' : 'var(--border)'}`,
      color: active ? 'var(--gain-text)' : 'var(--text-muted)',
      borderRadius: 999, padding: '6px 12px', fontSize: 11.5, fontWeight: 600
    }}>
      {active ? <Check size={13} /> : <Ban size={13} />}
      {RULE_LABELS[code] || code}
    </div>
  )
}

// ── Calm P&L stat card (P&L is secondary here) ────────────────────
function CalmStat({ icon: Icon, label, value, tint, sparkData }) {
  return (
    <div className="sf-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-bg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color="var(--primary)" strokeWidth={1.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="num" style={{ color: tint || 'var(--text)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, fontWeight: 500 }}>{label}</div>
      </div>
      {sparkData && <Sparkline data={sparkData} color="var(--primary)" />}
    </div>
  )
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div className="num" style={{ color: val >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 600 }}>
        {val >= 0 ? '+' : ''}{formatCurrency(val)}
      </div>
    </div>
  )
}

// ── Main Dashboard Page ───────────────────────────────────────────
export default function DashboardPage() {
  const [account, setAccount] = useState(null)
  const [score, setScore] = useState(null)
  const [violations, setViolations] = useState([])
  const [rules, setRules] = useState([])
  const [summary, setSummary] = useState(null)
  const [pnlCurve, setPnlCurve] = useState([])
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    Promise.allSettled([
      getAccount().then(r => setAccount(r.data)),
      getScore().then(r => setScore(r.data)),
      getTodayViolations().then(r => setViolations(r.data || [])),
      getRules().then(r => setRules(r.data || [])),
      getSummary().then(r => setSummary(r.data)),
      getPnlCurve().then(r => setPnlCurve(r.data?.data || r.data || [])),
    ]).catch(() => {})
  }, [])

  const acc = account?.account || account
  const initial = Number(acc?.initial_balance ?? 100000)
  const todayPnl = Number(account?.today_realized_pnl ?? 0)
  const unrealized = Number(account?.total_unrealized_pnl ?? 0)
  const totalPnl = Number(summary?.total_realized_pnl ?? 0)
  const disciplineScore = Number(acc?.discipline_score ?? score?.score ?? 0)
  const streak = Number(acc?.consecutive_disciplined_trades ?? score?.consecutive_disciplined_trades ?? 0)
  const tier = acc?.tier ?? score?.tier ?? 'TIER_1'
  const toNextTier = score?.trades_to_next_tier ?? Math.max(0, 15 - streak)
  const todayTrades = account?.today_trades ?? 0
  const cooldownLeft = account?.cooldown_remaining_seconds ?? 0

  // Guardrail limits pulled from the user's actual rules
  const ruleMap = Object.fromEntries((rules || []).map(r => [r.rule_code, r]))
  const maxTrades = ruleMap.MAX_TRADES_PER_DAY?.rule_value?.max_trades ?? 3
  const lossPct = ruleMap.MAX_DAILY_LOSS?.rule_value?.loss_pct ?? 2
  const lossCap = initial * (lossPct / 100)
  const cooldownMin = ruleMap.REVENGE_COOLDOWN?.rule_value?.cooldown_minutes ?? 15

  const tradesLeft = Math.max(0, maxTrades - todayTrades)
  const tradesTone = tradesLeft === 0 ? 'loss' : tradesLeft <= 1 ? 'warn' : 'gain'

  const lossUsed = todayPnl < 0 ? Math.abs(todayPnl) : 0
  const lossUsedPct = lossCap > 0 ? (lossUsed / lossCap) * 100 : 0
  const lossTone = lossUsed >= lossCap ? 'loss' : lossUsedPct >= 60 ? 'warn' : 'gain'

  const cooldownTone = cooldownLeft > 0 ? 'loss' : 'gain'

  const winDays = summary?.win_days ?? summary?.winning_trades ?? 0
  const lossDays = summary?.loss_days ?? summary?.losing_trades ?? 0

  const barData = pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, pnl: d.daily_pnl ?? d.pnl ?? 0 }))
  const areaData = pnlCurve.map(d => ({ date: d.date?.slice(5) || d.date, cumulative: d.cumulative_pnl ?? d.cumulative ?? 0 }))
  const isGain = totalPnl >= 0
  const balanceSpark = pnlCurve.map((_, i) => initial + (areaData[i]?.cumulative ?? 0))

  const name = user?.full_name?.split(' ')[0] || 'Trader'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

      {/* Discipline is the hero */}
      <DisciplineHero
        name={name} score={disciplineScore} streak={streak}
        tier={tier} toNextTier={toNextTier} navigate={navigate}
      />

      {/* Guardrails — the rails that keep you disciplined */}
      <div className="sf-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="sf-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--primary)" />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Today's Guardrails</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Live limits from your rulebook</span>
        </div>

        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <GuardrailCard
            icon={Gauge} label="Trades left today"
            value={`${tradesLeft} of ${maxTrades}`}
            sub={tradesLeft === 0 ? 'Daily limit reached — done for today' : `${todayTrades} used so far`}
            tone={tradesTone}
            progress={(todayTrades / maxTrades) * 100}
          />
          <GuardrailCard
            icon={Shield} label={`Daily loss cap · ${lossPct}%`}
            value={formatCurrency(lossCap)}
            sub={lossUsed > 0 ? `${formatCurrency(lossUsed)} used (${Math.round(lossUsedPct)}%)` : 'No loss today — cap untouched'}
            tone={lossTone}
            progress={lossUsedPct}
          />
          <GuardrailCard
            icon={Timer} label="Revenge cooldown"
            value={cooldownLeft > 0 ? `${Math.floor(cooldownLeft / 60)}m ${cooldownLeft % 60}s` : 'Clear'}
            sub={cooldownLeft > 0 ? 'Locked out after a stop-out — breathe' : `${cooldownMin}m lock arms after an SL hit`}
            tone={cooldownTone}
          />
        </div>

        <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ON_OFF_RULES.map(code => (
            <RulePill key={code} code={code}
              active={(ruleMap[code]?.is_active ?? true) && (ruleMap[code]?.rule_value?.enabled ?? true)} />
          ))}
        </div>
      </div>

      {/* P&L — present, but calm and secondary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <CalmStat icon={Wallet} label="Virtual Balance"
          value={formatCurrency(Number(acc?.balance ?? initial))}
          sparkData={balanceSpark.length ? balanceSpark : null} />
        <CalmStat icon={TrendingUp} label="Today's P&L"
          value={`${todayPnl >= 0 ? '+' : ''}${formatCurrency(todayPnl)}`}
          tint={todayPnl === 0 ? 'var(--text)' : todayPnl > 0 ? 'var(--gain-text)' : 'var(--loss-text)'} />
        <CalmStat icon={TrendingUp} label="Open (Unrealized)"
          value={`${unrealized >= 0 ? '+' : ''}${formatCurrency(unrealized)}`}
          tint={unrealized === 0 ? 'var(--text)' : unrealized > 0 ? 'var(--gain-text)' : 'var(--loss-text)'} />
        <CalmStat icon={TrendingUp} label="All-time P&L"
          value={`${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl)}`}
          tint={totalPnl === 0 ? 'var(--text)' : totalPnl > 0 ? 'var(--gain-text)' : 'var(--loss-text)'} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="sf-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Daily P&L</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--primary-bg)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>Practice ledger</span>
          </div>
          {barData.length === 0 ? (
            <div style={{ height: 190, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Place disciplined trades to build your ledger
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={barData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--primary-bg)', opacity: 0.4 }} />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {barData.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="sf-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Equity Curve</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--primary-bg)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>Cumulative</span>
          </div>
          {areaData.length === 0 ? (
            <div style={{ height: 190, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Your equity curve appears as you trade
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={areaData} margin={{ left: 0, right: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isGain ? '#22c55e' : '#ef4444'} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={isGain ? '#22c55e' : '#ef4444'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={v => formatCurrency(v)} labelStyle={{ color: 'var(--text-muted)' }} />
                <Area type="monotone" dataKey="cumulative" stroke={isGain ? '#22c55e' : '#ef4444'} strokeWidth={2}
                  fill="url(#cumGrad)" dot={{ r: 2, fill: isGain ? '#22c55e' : '#ef4444', strokeWidth: 0 }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Discipline log + reflection nudge */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* Discipline log — violations reframed as coaching */}
        <div className="sf-card" style={{ overflow: 'hidden' }}>
          <div className="sf-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Today's Discipline Log</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
              background: violations.length > 0 ? 'var(--loss-bg)' : 'var(--gain-bg)',
              color: violations.length > 0 ? 'var(--loss-text)' : 'var(--gain-text)'
            }}>
              {violations.length > 0 ? `${violations.length} slip${violations.length > 1 ? 's' : ''}` : 'Clean run'}
            </span>
          </div>

          {violations.length === 0 ? (
            <div style={{ padding: '30px 18px', textAlign: 'center' }}>
              <div style={{ width: 46, height: 46, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--gain-bg)', display: 'grid', placeItems: 'center' }}>
                <ShieldCheck size={24} color="var(--gain)" />
              </div>
              <div style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No rules broken today</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5, maxWidth: 340, margin: '0 auto' }}>
                Restraint is the skill. Days like this are what compound into a real edge.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {violations.map((v, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 18px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: v.was_blocked ? 'var(--loss-bg)' : 'var(--warn-bg)', display: 'grid', placeItems: 'center' }}>
                    <AlertTriangle size={16} color={v.was_blocked ? 'var(--loss)' : 'var(--warn)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{RULE_LABELS[v.rule_code] || v.rule_code}</span>
                      <span style={{
                        fontSize: 9.5, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                        background: v.was_blocked ? 'var(--loss-bg)' : 'var(--warn-bg)',
                        color: v.was_blocked ? 'var(--loss-text)' : 'var(--warn)'
                      }}>{v.was_blocked ? 'BLOCKED' : 'WARNED'}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{formatDate(v.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{RULE_WHY[v.rule_code]}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Practice summary + reflection nudge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="sf-card" style={{ overflow: 'hidden' }}>
            <div className="sf-card-header">
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Practice Summary</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {[
                { label: 'Streak', value: `${streak}`, sub: 'clean trades', color: 'var(--primary)' },
                { label: 'Score', value: `${Math.round(disciplineScore)}%`, sub: 'discipline', color: scoreColor(disciplineScore) },
                { label: 'Win Days', value: winDays, sub: 'sessions', color: 'var(--gain)' },
                { label: 'Loss Days', value: lossDays, sub: 'sessions', color: 'var(--loss)' },
              ].map((it, i) => (
                <div key={it.label} style={{
                  padding: '14px 16px',
                  borderTop: i > 1 ? '1px solid var(--border-light)' : 'none',
                  borderRight: i % 2 === 0 ? '1px solid var(--border-light)' : 'none'
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{it.label}</div>
                  <div className="num" style={{ color: it.color, fontSize: 19, fontWeight: 700, lineHeight: 1 }}>{it.value}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 10.5, marginTop: 3 }}>{it.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => navigate('/journal')} className="sf-card" style={{
            textAlign: 'left', cursor: 'pointer', padding: 16, display: 'flex', gap: 12, alignItems: 'center', width: '100%'
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-bg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <BookOpen size={18} color="var(--primary)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Journal today's trades</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Name the setup and the emotion — that's where the learning is.</div>
            </div>
            <ArrowRight size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    </div>
  )
}
