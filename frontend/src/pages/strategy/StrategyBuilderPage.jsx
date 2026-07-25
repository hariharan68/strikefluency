import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity, AlertCircle, BarChart3, BookOpen, Calculator, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Copy, FileText, Gauge,
  Info, Layers, LineChart as LineChartIcon, Loader2, Menu, Minus, MoreHorizontal,
  Plus, RefreshCw, Save, Search, Settings, ShieldAlert, SlidersHorizontal,
  Sparkles, Target, Trash2, Wallet, X,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from 'recharts'
import { getOptionChainData, getOptionMetrics } from '../../api/options'
import { getPositions } from '../../api/trading'
import {
  createBuilderConfiguration, executePreview, expandTemplate, getBuilderConfiguration,
  getStrategy, getStrategyMarketContext, getTemplates, listBuilderConfigurations,
  listStrategies, simulateStrategy, updateBuilderConfiguration,
} from '../../api/strategy'
import useMarketStore from '../../store/marketStore'
import { useToast } from '../../components/common/Toast'
import { formatCurrency } from '../../utils/formatters'
import { SETUP_TAGS, SETUP_TAG_LABELS } from '../../utils/constants'
import { getApiErrorMessage, toDisplayMessage } from '../../utils/apiError'
import './StrategyBuilderPage.css'

const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'SENSEX']
const CATEGORIES = ['BULLISH', 'BEARISH', 'NEUTRAL', 'OTHER']
const ANALYTICS_TABS = ['Payoff Graph', 'P&L Table', 'Greeks', 'Strategy Chart']
const CHAIN_MODES = ['Straddles', 'Strangles', 'Strikes', 'Futures']
const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 }
const STRIKE_STEPS = { NIFTY: 50, BANKNIFTY: 100, SENSEX: 100 }
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
const cash = value => value === undefined ? '—' : value === null ? 'Unlimited' : formatCurrency(Number(value || 0))
const number = (value, digits = 2) => value == null ? '—' : Number(value).toFixed(digits)
const dateLabel = value => value
  ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  : '—'
const isoDate = value => new Date(value).toISOString().slice(0, 10)
const todayIso = () => new Date().toISOString().slice(0, 10)

function groupRows(chain) {
  const grouped = new Map()
  for (const row of chain?.chain_rows || []) {
    if (!grouped.has(row.strike)) grouped.set(row.strike, { strike: row.strike, ce: null, pe: null })
    grouped.get(row.strike)[row.option_type === 'CE' ? 'ce' : 'pe'] = row
  }
  return [...grouped.values()].sort((a, b) => a.strike - b.strike)
}

function Tooltip({ text }) {
  return <span className="osb-help" title={text} aria-label={text}><CircleHelp size={12} /></span>
}

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`osb-toggle-row${disabled ? ' disabled' : ''}`}>
      <button
        type="button"
        className={`osb-switch${checked ? ' on' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
      ><span /></button>
      {label && <span>{label}</span>}
    </label>
  )
}

function Stepper({ value, onChange, min = 0, max = Infinity, step = 1, ariaLabel = 'value' }) {
  const set = next => onChange(Math.max(min, Math.min(max, next)))
  return (
    <span className="osb-stepper">
      <button type="button" onClick={() => set(Number(value) - step)} aria-label={`Decrease ${ariaLabel}`}><Minus size={11} /></button>
      <input
        aria-label={ariaLabel}
        type="number"
        value={value}
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        onChange={event => set(Number(event.target.value) || min)}
      />
      <button type="button" onClick={() => set(Number(value) + step)} aria-label={`Increase ${ariaLabel}`}><Plus size={11} /></button>
    </span>
  )
}

function Modal({ title, children, onClose, actions, width = 460 }) {
  const ref = useRef(null)
  useEffect(() => {
    const close = event => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', close)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', close)
  }, [onClose])
  return (
    <div className="osb-modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="osb-modal" style={{ width }} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        {title && <header><h3>{title}</h3><button type="button" onClick={onClose}><X size={17} /></button></header>}
        <div className="osb-modal-body">{children}</div>
        {actions && <footer>{actions}</footer>}
      </section>
    </div>
  )
}

function ErrorDialog({ error, onRetry, onDismiss }) {
  if (!error) return null
  return (
    <Modal
      title="Oops! Something went wrong"
      onClose={onDismiss}
      actions={<><button className="osb-btn outline" onClick={onRetry}>Retry</button><button className="osb-btn primary" onClick={onDismiss}>Dismiss</button></>}
    >
      <div className="osb-error-copy"><AlertCircle size={28} /><p>{error.message || String(error)}</p></div>
    </Modal>
  )
}

function PayoffGlyph({ tone = 'gain', kind = 'curve' }) {
  const paths = {
    curve: 'M2 28 L18 28 L31 10 L54 10',
    valley: 'M2 8 L23 28 L34 28 L54 8',
    peak: 'M2 28 L18 28 L28 8 L38 28 L54 28',
    range: 'M2 8 L15 26 L42 26 L54 8',
  }
  return (
    <svg className={`osb-payoff-glyph ${tone}`} viewBox="0 0 56 34" aria-hidden="true">
      <path className="baseline" d="M1 28 H55" />
      <path d={paths[kind] || paths.curve} />
    </svg>
  )
}

function Metric({ label, value, tone = '', help, extra }) {
  return (
    <div className={`osb-metric ${tone}`}>
      <span>{label}{help && <Tooltip text={help} />}{extra}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TargetControls({ instrument, spot, targetPrice, setTargetPrice, targetDate, setTargetDate, expiry, step }) {
  const today = todayIso()
  const maxDate = expiry || today
  const dayMs = 86400000
  const dayCount = Math.max(0, Math.round((new Date(maxDate) - new Date(today)) / dayMs))
  const selectedDay = Math.max(0, Math.round((new Date(targetDate) - new Date(today)) / dayMs))
  return (
    <div className="osb-target-controls">
      <div className="osb-target-row">
        <label>{instrument} Target</label>
        <button type="button" className="osb-link" onClick={() => setTargetPrice(spot)}>Reset</button>
        <Stepper value={Math.round(targetPrice || spot || 0)} onChange={setTargetPrice} min={1} step={step} ariaLabel={`${instrument} target`} />
        <span className={targetPrice >= spot ? 'gain' : 'loss'}>{spot ? `${(((targetPrice - spot) / spot) * 100).toFixed(2)}%` : '—'}</span>
        <input type="range" min={spot * 0.9} max={spot * 1.1} step={step} value={targetPrice || spot || 0} onChange={event => setTargetPrice(Number(event.target.value))} />
      </div>
      <div className="osb-target-row">
        <label>Date <Tooltip text="The hypothetical valuation date. Entry prices and expiry payoff remain unchanged." /></label>
        <button type="button" className="osb-link" onClick={() => setTargetDate(today)}>Reset</button>
        <button type="button" className="osb-icon-btn" onClick={() => setTargetDate(isoDate(new Date(new Date(targetDate).getTime() - dayMs)))} disabled={selectedDay <= 0}><ChevronLeft size={14} /></button>
        <strong>{new Date(`${targetDate}T15:30:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} 3:30 PM</strong>
        <button type="button" className="osb-icon-btn" onClick={() => setTargetDate(isoDate(new Date(new Date(targetDate).getTime() + dayMs)))} disabled={selectedDay >= dayCount}><ChevronRight size={14} /></button>
        <input type="range" min={0} max={dayCount} step={1} value={selectedDay} onChange={event => setTargetDate(isoDate(new Date(new Date(today).getTime() + Number(event.target.value) * dayMs)))} />
        <small>{selectedDay}d to target</small>
      </div>
    </div>
  )
}

export default function StrategyBuilderPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wsMetrics = useMarketStore(state => state.metrics)
  const wsAnalytics = useMarketStore(state => state.analytics)

  const [instrument, setInstrument] = useState('NIFTY')
  const [instrumentOpen, setInstrumentOpen] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [meta, setMeta] = useState(null)
  const [chain, setChain] = useState(null)
  const [context, setContext] = useState(null)
  const [templates, setTemplates] = useState([])
  const [category, setCategory] = useState('BULLISH')
  const [legs, setLegs] = useState([])
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [strategyName, setStrategyName] = useState('')
  const [configId, setConfigId] = useState(null)
  const [draftId, setDraftId] = useState(null)
  const [configs, setConfigs] = useState({ SAVED: [], DRAFT: [] })
  const [positions, setPositions] = useState({ single: [], strategies: [] })
  const [leftTab, setLeftTab] = useState('Ready-made')
  const [analyticsTab, setAnalyticsTab] = useState('Payoff Graph')
  const [payoffView, setPayoffView] = useState('Payoff Graph')
  const [analysis, setAnalysis] = useState(null)
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [simulationNonce, setSimulationNonce] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [multiplier, setMultiplier] = useState(1)
  const [targetPrice, setTargetPrice] = useState(0)
  const [targetDate, setTargetDate] = useState(todayIso())
  const [bookedPnl, setBookedPnl] = useState(false)
  const [manualEnabled, setManualEnabled] = useState(false)
  const [manualPnl, setManualPnl] = useState(0)
  const [unitMode, setUnitMode] = useState(() => localStorage.getItem('sf_strategy_unit') || 'LOTS')
  const [showManual, setShowManual] = useState(() => localStorage.getItem('sf_strategy_manual') !== '0')
  const [showSettings, setShowSettings] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showQuickChart, setShowQuickChart] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showCharges, setShowCharges] = useState(false)
  const [showOverflow, setShowOverflow] = useState(false)
  const [showManualDialog, setShowManualDialog] = useState(false)
  const [saveDialog, setSaveDialog] = useState(null)
  const [tradeDialog, setTradeDialog] = useState(false)
  const [setupTag, setSetupTag] = useState('')
  const [productType, setProductType] = useState('INTRADAY')
  const [executing, setExecuting] = useState(false)
  const [chainOverlay, setChainOverlay] = useState(false)
  const [chainCollapsed, setChainCollapsed] = useState(false)
  const [chainMode, setChainMode] = useState('Strikes')
  const [chainDataMode, setChainDataMode] = useState('LTP')
  const [stagedLegs, setStagedLegs] = useState([])
  const [pendingMode, setPendingMode] = useState(null)
  const [expandedLeg, setExpandedLeg] = useState(null)
  const [interval, setIntervalValue] = useState(STRIKE_STEPS.NIFTY)
  const [showPercent, setShowPercent] = useState(false)
  const [multiplyLot, setMultiplyLot] = useState(true)
  const [multiplyLots, setMultiplyLots] = useState(true)
  const [invertRisk, setInvertRisk] = useState(false)
  const [breakevenMode, setBreakevenMode] = useState('Expiry')
  const [oiMode, setOiMode] = useState('Bars')
  const [sdMode, setSdMode] = useState('Fixed')
  const [chartZoom, setChartZoom] = useState(1)
  const [invertChart, setInvertChart] = useState(false)
  const [errorState, setErrorState] = useState(null)
  const revision = useRef(0)
  const simulationAbort = useRef(null)
  const retryRef = useRef(null)

  const rows = useMemo(() => groupRows(chain), [chain])
  const spot = Number(meta?.spot ?? chain?.spot ?? context?.spot ?? 0)
  const changePct = Number(meta?.change_pct ?? chain?.change_pct ?? 0)
  const expiries = meta?.expiries || []
  const currentExpiry = expiry || meta?.expiry_date || chain?.expiry_date || ''
  const strikeStep = STRIKE_STEPS[instrument]
  const lotSize = Number(meta?.lot_size || chain?.lot_size || LOT_SIZES[instrument])
  const includedLegs = legs.filter(leg => leg.included)
  const displayName = activeTemplate?.name || strategyName || (legs.length ? 'Custom' : 'New Strategy')

  const reportError = useCallback((message, retry) => {
    retryRef.current = retry
    setErrorState(new Error(toDisplayMessage(message)))
  }, [])

  const refreshLibraries = useCallback(async () => {
    try {
      const [saved, drafts, livePositions, executed] = await Promise.all([
        listBuilderConfigurations('SAVED'),
        listBuilderConfigurations('DRAFT'),
        getPositions(),
        listStrategies('EXECUTED', 1, 100),
      ])
      setConfigs({ SAVED: saved.data || [], DRAFT: drafts.data || [] })
      setPositions({
        single: livePositions.data?.positions || [],
        strategies: executed.data?.strategies || [],
      })
    } catch {
      // These tabs retain their empty states when an optional list call fails.
    }
  }, [])

  useEffect(() => {
    getTemplates().then(response => setTemplates(response.data || []))
      .catch(() => reportError('Could not load ready-made strategies.', () => window.location.reload()))
    refreshLibraries()
  }, [refreshLibraries, reportError])

  const refreshMarket = useCallback(async () => {
    try {
      const [metricsResponse, chainResponse, contextResponse] = await Promise.all([
        getOptionMetrics(instrument, expiry || null),
        getOptionChainData(instrument, expiry || null),
        getStrategyMarketContext(instrument),
      ])
      setMeta(metricsResponse.data)
      setChain(chainResponse.data)
      setContext(contextResponse.data)
      setLastUpdated(new Date())
      if (!expiry && metricsResponse.data?.expiry_date) setExpiry(metricsResponse.data.expiry_date)
    } catch {
      reportError('Live Strategy Builder data is temporarily unavailable.', refreshMarket)
    }
  }, [instrument, expiry, reportError])

  useEffect(() => {
    refreshMarket()
    const timer = window.setInterval(refreshMarket, 30000)
    return () => window.clearInterval(timer)
  }, [refreshMarket])

  useEffect(() => {
    const metricSlot = wsMetrics[instrument]
    const chainSlot = wsAnalytics[instrument]
    if (metricSlot?.data && (!expiry || metricSlot.data.expiry_date === expiry)) setMeta(metricSlot.data)
    if (chainSlot?.data && (!expiry || chainSlot.data.expiry_date === expiry)) {
      setChain(chainSlot.data)
      setLastUpdated(new Date(chainSlot.at))
    }
  }, [wsMetrics, wsAnalytics, instrument, expiry])

  useEffect(() => {
    if (!spot) return
    setTargetPrice(value => value || spot)
  }, [spot])

  useEffect(() => {
    if (!currentExpiry) return
    setTargetDate(value => value > currentExpiry ? currentExpiry : value)
  }, [currentExpiry])

  useEffect(() => {
    if (!rows.length) return
    setLegs(current => current.map(leg => {
      if (leg.expiry !== currentExpiry || leg.type === 'FUT') return leg
      const row = rows.find(item => Number(item.strike) === Number(leg.strike))
      const quote = leg.type === 'CE' ? row?.ce : row?.pe
      if (!quote) return leg
      return {
        ...leg,
        liveLtp: quote.ltp,
        price: leg.priceOverridden ? leg.price : quote.ltp,
        iv: quote.iv ?? leg.iv,
      }
    }))
  }, [rows, currentExpiry])

  useEffect(() => {
    simulationAbort.current?.abort()
    if (!includedLegs.length) {
      setAnalysis(null)
      setAnalysisBusy(false)
      return
    }
    const controller = new AbortController()
    simulationAbort.current = controller
    const currentRevision = ++revision.current
    setAnalysisBusy(true)
    const timer = window.setTimeout(() => {
      simulateStrategy({
        revision: currentRevision,
        underlying: instrument,
        spot: spot || null,
        multiplier,
        target_price: targetPrice || spot,
        target_at: `${targetDate}T15:30:00+05:30`,
        manual_pnl: manualPnl,
        include_manual_pnl: manualEnabled && showManual,
        include_booked_pnl: bookedPnl,
        legs: legs.map(leg => ({
          client_id: leg.id,
          included: leg.included,
          action: leg.action,
          instrument_type: leg.type,
          strike: leg.type === 'FUT' ? null : Number(leg.strike),
          lots: Number(leg.lots),
          expiry: leg.expiry,
          entry_price: Number(leg.price),
          live_ltp: Number(leg.liveLtp || leg.price),
          iv: leg.iv == null ? null : Number(leg.iv),
          iv_override: leg.ivOverride == null ? null : Number(leg.ivOverride),
        })),
      }, controller.signal)
        .then(response => {
          if (response.data?.revision === revision.current) setAnalysis(response.data)
        })
        .catch(error => {
          if (error.code !== 'ERR_CANCELED') reportError('The current strategy could not be recalculated.', () => setSimulationNonce(value => value + 1))
        })
        .finally(() => {
          if (currentRevision === revision.current) setAnalysisBusy(false)
        })
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [legs, instrument, spot, multiplier, targetPrice, targetDate, manualPnl, manualEnabled, showManual, bookedPnl, simulationNonce, reportError]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeLeg = useCallback((strike, type, action, sourceRows = rows, selectedExpiry = currentExpiry) => {
    const row = sourceRows.find(item => Number(item.strike) === Number(strike))
    const quote = type === 'CE' ? row?.ce : row?.pe
    return {
      id: id(), included: true, action, type, strike: type === 'FUT' ? null : Number(strike),
      expiry: selectedExpiry, lots: 1, price: Number(quote?.ltp || context?.spot || 0),
      liveLtp: Number(quote?.ltp || context?.spot || 0), iv: quote?.iv || 18,
      ivOverride: null, priceOverridden: false,
    }
  }, [rows, currentExpiry, context])

  const updateLeg = (legId, patch, structural = false) => {
    setLegs(current => current.map(leg => leg.id === legId ? { ...leg, ...patch } : leg))
    if (structural) setActiveTemplate(null)
  }

  const loadTemplate = async template => {
    try {
      setAnalysisBusy(true)
      const response = await expandTemplate(template.id, instrument, currentExpiry)
      setLegs((response.data?.legs || []).map(leg => ({
        id: id(), included: true, action: leg.action, type: leg.instrument_type,
        strike: leg.strike, expiry: leg.expiry, lots: leg.lots,
        price: Number(leg.ltp || 0), liveLtp: Number(leg.ltp || 0),
        iv: leg.iv || 18, ivOverride: null, priceOverridden: false,
      })))
      setActiveTemplate(template)
      setStrategyName('')
      setConfigId(null)
      setDraftId(null)
      window.setTimeout(() => document.querySelector('.osb-leg-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    } catch {
      reportError(`Could not load ${template.name}.`, () => loadTemplate(template))
    }
  }

  const serializeState = () => ({
    version: 1, instrument, expiry: currentExpiry, legs, template_id: activeTemplate?.id || null,
    template_name: activeTemplate?.name || null, multiplier, target_price: targetPrice,
    target_date: targetDate, manual_enabled: manualEnabled, manual_pnl: manualPnl,
  })

  const restoreState = useCallback((state, record = {}) => {
    setInstrument(state.instrument || record.underlying || 'NIFTY')
    setExpiry(state.expiry || '')
    setLegs((state.legs || []).map(leg => ({ ...leg, id: leg.id || id() })))
    setActiveTemplate(state.template_id ? { id: state.template_id, name: state.template_name || 'Saved strategy' } : null)
    setMultiplier(state.multiplier || 1)
    setTargetPrice(state.target_price || 0)
    setTargetDate(state.target_date || todayIso())
    setManualEnabled(Boolean(state.manual_enabled))
    setManualPnl(Number(state.manual_pnl || 0))
    setStrategyName(record.name || state.name || '')
  }, [])

  useEffect(() => {
    const config = searchParams.get('config')
    const strategy = searchParams.get('strategy')
    if (config) {
      getBuilderConfiguration(config).then(response => {
        restoreState(response.data.state, response.data)
        response.data.kind === 'SAVED' ? setConfigId(response.data.id) : setDraftId(response.data.id)
      }).catch(() => reportError('The shared strategy could not be loaded.', () => window.location.reload()))
    } else if (strategy) {
      getStrategy(strategy).then(response => {
        const data = response.data
        restoreState({
          instrument: data.underlying,
          legs: (data.legs || []).map(leg => ({
            id: id(), included: leg.status !== 'CLOSED', action: leg.action,
            type: leg.instrument_type, strike: Number(leg.strike_price),
            expiry: leg.expiry_date, lots: leg.lots,
            price: Number(leg.entry_price || 0), liveLtp: Number(leg.entry_price || 0),
            iv: 18, ivOverride: null, priceOverridden: true,
          })),
        }, { name: data.name })
      }).catch(() => reportError('The strategy could not be loaded.', () => window.location.reload()))
    }
  }, [searchParams, restoreState, reportError])

  const persistConfiguration = async (kind, name, clone = false) => {
    const body = { kind, name: name || null, underlying: instrument, schema_version: 1, state: serializeState() }
    try {
      let response
      const existing = kind === 'SAVED' ? configId : draftId
      if (existing && !clone) response = await updateBuilderConfiguration(existing, { name: body.name, underlying: instrument, schema_version: 1, state: body.state })
      else response = await createBuilderConfiguration(body)
      if (kind === 'SAVED') {
        setConfigId(response.data.id)
        setStrategyName(response.data.name)
        toast.success('Strategy saved')
      } else {
        setDraftId(response.data.id)
        toast.success('Added to Draft Portfolios')
      }
      setSaveDialog(null)
      await refreshLibraries()
    } catch {
      reportError(`Could not save this ${kind === 'SAVED' ? 'strategy' : 'draft'}.`, () => persistConfiguration(kind, name, clone))
    }
  }

  const loadConfiguration = record => {
    restoreState(record.state, record)
    record.kind === 'SAVED' ? setConfigId(record.id) : setDraftId(record.id)
    setLeftTab(record.kind === 'SAVED' ? 'Saved Strategies' : 'Draft Portfolios')
  }

  const resetPrices = () => setLegs(current => current.map(leg => ({
    ...leg, price: Number(leg.liveLtp || leg.price), priceOverridden: false,
  })))

  const shiftSpread = direction => setLegs(current => current.map(leg => leg.type === 'FUT' ? leg : ({ ...leg, strike: leg.strike + direction * strikeStep })))
  const widenSpread = direction => {
    const strikes = legs.filter(leg => leg.type !== 'FUT').map(leg => leg.strike).sort((a, b) => a - b)
    const center = strikes.length ? (strikes[0] + strikes[strikes.length - 1]) / 2 : spot
    setLegs(current => current.map(leg => {
      if (leg.type === 'FUT') return leg
      const sign = leg.strike >= center ? 1 : -1
      return { ...leg, strike: Math.max(strikeStep, leg.strike + sign * direction * strikeStep) }
    }))
  }
  const moveHedge = direction => {
    const optionLegs = legs.filter(leg => leg.type !== 'FUT')
    const low = Math.min(...optionLegs.map(leg => leg.strike))
    const high = Math.max(...optionLegs.map(leg => leg.strike))
    setLegs(current => current.map(leg => {
      if (leg.action !== 'BUY' || ![low, high].includes(leg.strike)) return leg
      return { ...leg, strike: leg.strike + (leg.strike === high ? 1 : -1) * direction * strikeStep }
    }))
  }

  const openChain = () => {
    setStagedLegs(legs.map(leg => ({ ...leg })))
    setChainOverlay(true)
    setChainCollapsed(false)
  }
  const changeChainMode = mode => {
    if (stagedLegs.length && mode !== chainMode) setPendingMode(mode)
    else setChainMode(mode)
  }
  const addStaged = legOrLegs => setStagedLegs(current => [...current, ...(Array.isArray(legOrLegs) ? legOrLegs : [legOrLegs])])
  const addPair = (strikeA, typeA, strikeB, typeB, action) => addStaged([
    makeLeg(strikeA, typeA, action), makeLeg(strikeB, typeB, action),
  ])

  const execute = async () => {
    setExecuting(true)
    try {
      await executePreview({
        underlying: instrument,
        multiplier,
        name: displayName === 'Custom' ? null : displayName,
        setup_tag: setupTag,
        product_type: productType,
        legs: legs.map(leg => ({
          client_id: leg.id, included: leg.included, action: leg.action,
          instrument_type: leg.type, strike: leg.type === 'FUT' ? null : Number(leg.strike),
          lots: Number(leg.lots), expiry: leg.expiry, entry_price: Number(leg.price),
          live_ltp: Number(leg.liveLtp || leg.price), iv: Number(leg.iv || 18),
          iv_override: leg.ivOverride == null ? null : Number(leg.ivOverride),
        })),
      })
      toast.success('Paper strategy executed')
      navigate('/positions')
    } catch (error) {
      reportError(getApiErrorMessage(error, 'The strategy could not be executed.'), execute)
    } finally {
      setExecuting(false)
    }
  }

  const clearStrategy = () => {
    setLegs([]); setAnalysis(null); setActiveTemplate(null); setStrategyName('')
    setConfigId(null); setDraftId(null); setMultiplier(1); setManualPnl(0); setManualEnabled(false)
  }

  const chartData = useMemo(() => {
    const maxOi = Math.max(1, ...rows.flatMap(row => [row.ce?.oi || 0, row.pe?.oi || 0]))
    return (analysis?.curves || []).filter((_, index) => index % chartZoom === 0).map(point => {
      const row = rows.find(item => Number(item.strike) === Number(point.price))
      return { ...point, callOi: row?.ce?.oi || 0, putOi: row?.pe?.oi || 0, maxOi }
    })
  }, [analysis, rows, chartZoom])

  const historyData = useMemo(() => (context?.history || []).map(item => {
    const close = Number(item.close || item[4] || spot)
    const delta = Number(analysis?.greeks?.total?.delta || 0)
    const base = Math.abs(Number(analysis?.pricing?.net_price || 0))
    return {
      time: new Date(item.timestamp || item[0]).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      future: invertChart ? (spot * 2 - close) : close,
      strategy: base + (close - spot) * delta / Math.max(lotSize, 1),
    }
  }), [context, analysis, spot, lotSize, invertChart])

  const warnings = analysis?.warnings || []
  const priceDirection = analysis?.pricing?.direction === 'RECEIVE' ? 'Receive' : 'Pay'
  const premiumValue = Math.abs(Number(analysis?.pricing?.net_cashflow || 0))
  const riskValue = analysis?.metrics?.reward_risk
  const shownRisk = invertRisk && riskValue ? 1 / riskValue : riskValue
  const selectedBreakevens = analysis?.metrics?.breakevens?.[breakevenMode.toLowerCase()] || []

  const renderLegTable = () => (
    <div className="osb-leg-table-wrap">
      <table className="osb-leg-table">
        <thead><tr><th /><th>B/S</th><th>Expiry</th><th>Strike</th><th>Type</th><th>{unitMode === 'LOTS' ? 'Lots' : 'Qty'}</th><th>Price</th><th /><th /></tr></thead>
        <tbody>{legs.map(leg => (
          <Fragment key={leg.id}>
            <tr className={leg.included ? '' : 'excluded'}>
              <td><input type="checkbox" checked={leg.included} onChange={event => updateLeg(leg.id, { included: event.target.checked })} aria-label="Include leg" /></td>
              <td><button className={`osb-side ${leg.action === 'BUY' ? 'buy' : 'sell'}`} onClick={() => updateLeg(leg.id, { action: leg.action === 'BUY' ? 'SELL' : 'BUY' }, true)}>{leg.action[0]}</button></td>
              <td><select value={leg.expiry} onChange={event => updateLeg(leg.id, { expiry: event.target.value }, true)}>{[...new Set([leg.expiry, ...expiries])].filter(Boolean).map(value => <option key={value} value={value}>{dateLabel(value)}</option>)}</select></td>
              <td>{leg.type === 'FUT' ? '—' : <Stepper value={leg.strike} onChange={value => updateLeg(leg.id, { strike: value }, true)} min={strikeStep} step={strikeStep} ariaLabel="strike" />}</td>
              <td><select value={leg.type} onChange={event => updateLeg(leg.id, { type: event.target.value, strike: event.target.value === 'FUT' ? null : (leg.strike || Math.round(spot / strikeStep) * strikeStep) }, true)}><option>CE</option><option>PE</option><option>FUT</option></select></td>
              <td><Stepper value={unitMode === 'LOTS' ? leg.lots : leg.lots * lotSize} onChange={value => updateLeg(leg.id, { lots: unitMode === 'LOTS' ? value : Math.max(1, Math.round(value / lotSize)) })} min={unitMode === 'LOTS' ? 1 : lotSize} step={unitMode === 'LOTS' ? 1 : lotSize} ariaLabel="quantity" /></td>
              <td><input className="osb-price-input" type="number" value={leg.price} step="0.05" onChange={event => updateLeg(leg.id, { price: Number(event.target.value), priceOverridden: true })} /></td>
              <td><button className="osb-icon-btn" onClick={() => setExpandedLeg(expandedLeg === leg.id ? null : leg.id)} title="Leg details"><Menu size={14} /></button></td>
              <td><button className="osb-icon-btn danger" onClick={() => { setLegs(current => current.filter(item => item.id !== leg.id)); setActiveTemplate(null) }} title="Remove leg"><Trash2 size={14} /></button></td>
            </tr>
            {expandedLeg === leg.id && <tr key={`${leg.id}-detail`} className="osb-leg-detail"><td colSpan={9}><label>IV override <input type="number" value={leg.ivOverride ?? leg.iv ?? 18} onChange={event => updateLeg(leg.id, { ivOverride: Number(event.target.value) })} />%</label><span>Live LTP {cash(leg.liveLtp)}</span><span>{leg.priceOverridden ? 'What-if price active' : 'Following live LTP'}</span></td></tr>}
          </Fragment>
        ))}</tbody>
      </table>
    </div>
  )

  const renderReadyMade = () => (
    <div className="osb-tab-content">
      <div className="osb-helper-line"><span>Please click on a ready-made strategy to load it</span><a href="https://zerodha.com/varsity/module/option-strategies/" target="_blank" rel="noreferrer"><BookOpen size={14} /> Learn Options Strategies</a></div>
      <div className="osb-filter-row">
        <div>{CATEGORIES.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item[0] + item.slice(1).toLowerCase()}</button>)}</div>
        <select value={currentExpiry} onChange={event => setExpiry(event.target.value)}>{expiries.map(value => <option key={value} value={value}>{dateLabel(value)}</option>)}</select>
      </div>
      <div className="osb-template-grid">
        {templates.filter(item => item.category === category).map((template, index) => (
          <button key={template.id} className={`osb-template-card${activeTemplate?.id === template.id ? ' selected' : ''}`} onClick={() => loadTemplate(template)}>
            <PayoffGlyph tone={category === 'BEARISH' ? 'loss' : 'gain'} kind={['curve', 'valley', 'peak', 'range'][index % 4]} />
            <span>{template.name}</span>
            <small>{template.leg_count} leg{template.leg_count !== 1 ? 's' : ''}</small>
          </button>
        ))}
      </div>
    </div>
  )

  const renderPositions = () => (
    <div className="osb-tab-content">
      {!positions.single.length && !positions.strategies.length ? <div className="osb-list-empty"><Wallet size={28} /><b>No positions found</b></div> : (
        <div className="osb-library-list">
          {positions.single.map(position => <div key={position.id}><span className={`osb-side ${position.action === 'BUY' ? 'buy' : 'sell'}`}>{position.action[0]}</span><b>{position.instrument} {dateLabel(position.expiry_date)} {position.strike_price} {position.option_type}</b><span className={Number(position.unrealized_pnl) >= 0 ? 'gain' : 'loss'}>{cash(position.unrealized_pnl)}</span></div>)}
          {positions.strategies.map(strategy => <div key={strategy.id}><Layers size={16} /><b>{strategy.name || strategy.template_id || `${strategy.underlying} strategy`}</b><span>{strategy.legs?.length || 0} legs</span><span className={Number(strategy.position?.unrealized_pnl) >= 0 ? 'gain' : 'loss'}>{cash(strategy.position?.unrealized_pnl)}</span></div>)}
        </div>
      )}
      <p className="osb-updated">Prices last updated at {lastUpdated?.toLocaleTimeString('en-IN') || '—'}. (Prices are auto-refreshed every 30 seconds)</p>
      <details className="osb-important"><summary>Important info</summary><p>Positions shown here are StrikeFluency paper positions. Broker access remains read-only and no live orders are sent.</p></details>
    </div>
  )

  const renderLibrary = kind => {
    const items = configs[kind] || []
    return <div className="osb-tab-content">{!items.length ? <div className="osb-list-empty"><Save size={28} /><b>{kind === 'SAVED' ? 'No saved strategies' : 'No draft portfolios'}</b></div> : <div className="osb-library-list">{items.map(record => <button key={record.id} onClick={() => loadConfiguration(record)}><div><b>{record.name || `Draft · ${record.underlying}`}</b><small>{record.underlying} · {record.state?.legs?.length || 0} legs · Updated {new Date(record.updated_at).toLocaleString('en-IN')}</small></div><ChevronRight size={15} /></button>)}</div>}</div>
  }

  const renderPayoff = () => (
    <>
      <div className="osb-subtabs"><button className={payoffView === 'Payoff Graph' ? 'active' : ''} onClick={() => setPayoffView('Payoff Graph')}>Payoff Graph</button><button className={payoffView === 'Payoff Table' ? 'active' : ''} onClick={() => setPayoffView('Payoff Table')}>Payoff Table</button></div>
      {payoffView === 'Payoff Graph' ? (
        <>
          <div className="osb-chart-controls">
            <span>OI data at {Math.round(spot / strikeStep) * strikeStep}</span><span className="call">Call OI</span><span className="put">Put OI</span><span className="expiry">On Expiry</span><span className="target">On Target Date</span>
            <select value={sdMode} onChange={event => setSdMode(event.target.value)}><option>Fixed</option><option>Dynamic</option></select>
            <select value={oiMode} onChange={event => setOiMode(event.target.value)}><option>Bars</option><option>Off</option></select>
          </div>
          <div className="osb-payoff-chart">
            {analysisBusy && <span className="osb-chart-spinner"><Loader2 className="spin" size={18} /> Recalculating</span>}
            <button className="osb-zoom" onClick={() => setChartZoom(value => value === 1 ? 2 : value === 2 ? 4 : 1)}>{chartZoom === 1 ? 'Zoom In' : 'Zoom Out'}</button>
            <ResponsiveContainer width="100%" height={390}>
              <ComposedChart data={chartData} margin={{ top: 24, right: 34, left: 18, bottom: 8 }}>
                <defs>
                  <linearGradient id="osbGain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--gain)" stopOpacity=".24" /><stop offset="1" stopColor="var(--gain)" stopOpacity=".02" /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--osb-border)" />
                <XAxis dataKey="price" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="pnl" tickFormatter={value => `${Math.round(value / 1000)}k`} tick={{ fontSize: 10 }} label={{ value: 'Profit / loss (₹)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId="oi" orientation="right" hide={oiMode === 'Off'} tickFormatter={value => `${(value / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
                <ChartTooltip formatter={(value, key) => key.includes('Oi') ? Number(value).toLocaleString('en-IN') : cash(value)} />
                {oiMode !== 'Off' && <><Bar yAxisId="oi" dataKey="callOi" fill="var(--loss)" opacity={0.35} /><Bar yAxisId="oi" dataKey="putOi" fill="var(--gain)" opacity={0.35} /></>}
                <Area yAxisId="pnl" dataKey="expiry_pnl" stroke="var(--loss)" fill="url(#osbGain)" strokeWidth={2} />
                <Line yAxisId="pnl" type="monotone" dataKey="target_pnl" stroke="var(--primary)" strokeWidth={2} dot={false} />
                <ReferenceLine yAxisId="pnl" y={0} stroke="var(--text-muted)" />
                {spot > 0 && <ReferenceLine yAxisId="pnl" x={spot} stroke="var(--warn)" strokeWidth={2} label={{ value: `Current price: ${number(spot)}`, fill: 'var(--warn)', fontSize: 10 }} />}
                {analysis?.standard_deviation && [-2, -1, 1, 2].map(mult => <ReferenceLine key={mult} yAxisId="pnl" x={spot + mult * analysis.standard_deviation.one.points} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: `${mult}SD`, fontSize: 9, fill: 'var(--text-muted)' }} />)}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className={`osb-projected ${Number(analysis?.projected?.pnl) >= 0 ? 'gain' : 'loss'}`}>{Number(analysis?.projected?.pnl) >= 0 ? 'Projected profit' : 'Projected loss'}: {cash(Math.abs(analysis?.projected?.pnl || 0))} ({number(analysis?.projected?.percent)}%) <Tooltip text="Modelled P&L at the selected target price and date." /></div>
        </>
      ) : (
        <>
          <div className="osb-table-controls"><label>Target Interval <select value={interval} onChange={event => setIntervalValue(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><Toggle checked={showPercent} onChange={setShowPercent} label="Show %" /></div>
          <div className="osb-data-table-wrap"><table className="osb-data-table"><thead><tr><th>Target</th><th>On Target Date: {dateLabel(targetDate)}</th><th>On Expiry: {dateLabel(currentExpiry)}</th></tr></thead><tbody>{(analysis?.payoff_table || []).filter((_, i) => i % Math.max(1, Math.round(interval / strikeStep)) === 0).map(row => <tr key={row.target} className={row.is_spot ? 'spot' : ''}><td>{row.is_spot ? <input value={row.target} readOnly /> : number(row.target, 0)}</td><td className={row.target_pnl >= 0 ? 'gain' : 'loss'}>{showPercent && analysis?.funds?.funds_needed ? `${number(row.target_pnl / analysis.funds.funds_needed * 100)}%` : cash(row.target_pnl)}</td><td className={row.expiry_pnl >= 0 ? 'gain' : 'loss'}>{showPercent && analysis?.funds?.funds_needed ? `${number(row.expiry_pnl / analysis.funds.funds_needed * 100)}%` : cash(row.expiry_pnl)}</td></tr>)}</tbody></table></div>
        </>
      )}
      <TargetControls instrument={instrument} spot={spot} targetPrice={targetPrice} setTargetPrice={setTargetPrice} targetDate={targetDate} setTargetDate={setTargetDate} expiry={currentExpiry} step={strikeStep} />
    </>
  )

  const renderPnlTable = () => (
    <>
      <div className="osb-table-controls"><Toggle checked={multiplyLot} onChange={setMultiplyLot} label="Multiply by Lot Size" /><Toggle checked={multiplyLots} onChange={setMultiplyLots} label="Multiply by Number of Lots" /></div>
      <div className="osb-data-table-wrap"><table className="osb-data-table"><thead><tr><th>Instrument</th><th>Target P&L</th><th>Target Price</th><th>Entry Price</th><th>LTP</th></tr></thead><tbody>{(analysis?.pnl_rows || []).map(row => <tr key={row.client_id}><td>{row.instrument}</td><td className={row.target_pnl >= 0 ? 'gain' : 'loss'}>{cash(row.target_pnl)}</td><td>{number(row.target_price)}</td><td>{number(row.entry_price)}</td><td>{number(row.ltp)}</td></tr>)}<tr className="total"><td>Total <span>Projected</span></td><td className={Number(analysis?.projected?.pnl) >= 0 ? 'gain' : 'loss'}>{cash(analysis?.projected?.pnl)}</td><td colSpan={3} /></tr></tbody></table></div>
      <TargetControls instrument={instrument} spot={spot} targetPrice={targetPrice} setTargetPrice={setTargetPrice} targetDate={targetDate} setTargetDate={setTargetDate} expiry={currentExpiry} step={strikeStep} />
    </>
  )

  const renderGreeks = () => (
    <>
      <div className="osb-table-controls"><Toggle checked={multiplyLot} onChange={setMultiplyLot} label="Multiply by Lot Size" /><Toggle checked={multiplyLots} onChange={setMultiplyLots} label="Multiply by Number of Lots" /></div>
      <div className="osb-data-table-wrap"><table className="osb-data-table"><thead><tr><th>Instrument</th><th>Delta</th><th>Theta</th><th>Decay</th><th>Gamma</th><th>Vega</th></tr></thead><tbody>{(analysis?.greeks?.rows || []).map(row => <tr key={row.client_id}><td>{row.instrument}</td><td>{number(row.delta, 4)}</td><td>{number(row.theta, 4)}</td><td className={row.decay >= 0 ? 'gain' : 'loss'}>{cash(row.decay)}</td><td>{number(row.gamma, 6)}</td><td>{number(row.vega, 4)}</td></tr>)}<tr className="total"><td>Total</td>{['delta', 'theta', 'decay', 'gamma', 'vega'].map(key => <td key={key}>{number(analysis?.greeks?.total?.[key], key === 'gamma' ? 6 : 4)}</td>)}</tr></tbody></table></div>
      <TargetControls instrument={instrument} spot={spot} targetPrice={targetPrice} setTargetPrice={setTargetPrice} targetDate={targetDate} setTargetDate={setTargetDate} expiry={currentExpiry} step={strikeStep} />
    </>
  )

  const renderStrategyChart = () => (
    <>
      <div className="osb-table-controls"><Toggle checked={invertChart} onChange={setInvertChart} label="Invert Price" /><span className="osb-modelled">{context?.history_source === 'modelled' ? 'Modelled history' : context?.history_source}</span></div>
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={historyData} margin={{ top: 16, right: 34, left: 12, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--osb-border)" />
          <XAxis dataKey="time" tick={{ fontSize: 9 }} minTickGap={40} />
          <YAxis yAxisId="strategy" tick={{ fontSize: 10 }} label={{ value: 'Strategy Price', angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <YAxis yAxisId="future" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Future Price', angle: 90, position: 'insideRight', fontSize: 10 }} />
          <ChartTooltip />
          <Legend />
          <Line yAxisId="strategy" dataKey="strategy" name="Strategy Price (modelled)" stroke="var(--primary)" dot={false} strokeWidth={2} />
          <Line yAxisId="future" dataKey="future" name={`${instrument} FUT`} stroke="var(--warn)" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </>
  )

  return (
    <div className="osb-app">
      <div className="osb-controlbar">
        <div className="osb-instrument-wrap">
          <button className="osb-instrument-search" onClick={() => setInstrumentOpen(value => !value)}><Search size={16} /><b>{instrument}</b><strong>{number(spot)}</strong><span className={changePct >= 0 ? 'gain' : 'loss'}>{changePct >= 0 ? '+' : ''}{number(changePct)}%</span><ChevronDown size={14} /></button>
          {instrumentOpen && <div className="osb-instrument-menu">{INSTRUMENTS.map(item => <button key={item} onClick={() => { setInstrument(item); setExpiry(''); setLegs([]); setActiveTemplate(null); setInstrumentOpen(false); setIntervalValue(STRIKE_STEPS[item]) }}><b>{item}</b><span>Index options</span></button>)}</div>}
        </div>
        <div className="osb-popup-wrap"><button className="osb-icon-btn control" onClick={() => setShowQuickChart(value => !value)}><LineChartIcon size={16} /></button>{showQuickChart && <div className="osb-quick-chart"><header><b>{instrument} underlying</b><small>{context?.history_source}</small></header><ResponsiveContainer width="100%" height={180}><AreaChart data={context?.history || []}><XAxis dataKey="timestamp" hide /><YAxis domain={['auto', 'auto']} hide /><Area dataKey="close" stroke="var(--primary)" fill="var(--primary-bg)" /></AreaChart></ResponsiveContainer></div>}</div>
        <div className="osb-popup-wrap"><button className="osb-pill" onClick={() => setShowInfo(value => !value)}><Info size={14} /> Info</button>{showInfo && <div className="osb-info-pop"><b>Paper strategy workspace</b><p>All execution is virtual. Target-date prices use Black–Scholes with editable IV; modelled sources are labelled.</p></div>}</div>
        <div className="osb-popup-wrap"><button className="osb-settings-btn" onClick={() => setShowSettings(value => !value)}><Settings size={15} /> Settings</button>{showSettings && <div className="osb-settings-pop"><h4>Builder Settings</h4><div className="osb-radio-row"><label><input type="radio" checked={unitMode === 'LOTS'} onChange={() => { setUnitMode('LOTS'); localStorage.setItem('sf_strategy_unit', 'LOTS') }} /> Lots</label><label><input type="radio" checked={unitMode === 'QTY'} onChange={() => { setUnitMode('QTY'); localStorage.setItem('sf_strategy_unit', 'QTY') }} /> Qty</label></div><Toggle checked={showManual} onChange={value => { setShowManual(value); localStorage.setItem('sf_strategy_manual', value ? '1' : '0') }} label="Show Manual P/L" /></div>}</div>
        <span className="osb-last-update">Updated {lastUpdated?.toLocaleTimeString('en-IN') || '—'}</span>
      </div>

      <main className="osb-workspace">
        <section className="osb-left-pane">
          {!legs.length ? (
            <article className="osb-card osb-empty-builder">
              <span className="osb-empty-icon"><FileText size={38} /><i><Plus size={15} /></i></span>
              <h2>No Trades Added</h2>
              <button className="osb-btn primary wide" onClick={openChain}>Build a new custom strategy</button>
              <div className="osb-divider" />
              <div className="osb-manual-row"><label><input type="checkbox" checked={manualEnabled} onChange={event => setManualEnabled(event.target.checked)} /> Manual P/L <Tooltip text="Add a constant P&L adjustment to simulations." /></label><button disabled={!manualEnabled} onClick={() => setShowManualDialog(true)}>Add Manual P/L</button></div>
            </article>
          ) : (
            <article className="osb-card osb-leg-card">
              <header className="osb-strategy-header">
                <div><h2>New Strategy <button className="osb-link" onClick={() => setShowInsights(true)}>Insights</button></h2><p>{includedLegs.length} selected - {displayName}</p></div>
                <button className="osb-link" onClick={resetPrices}><RefreshCw size={13} /> Reset Prices</button>
              </header>
              {renderLegTable()}
              {activeTemplate && legs.length > 1 && <div className="osb-spread-controls"><label>Shift <Stepper value={0} onChange={value => shiftSpread(Math.sign(value))} min={-1} max={1} /></label><label>Width <Stepper value={0} onChange={value => widenSpread(Math.sign(value))} min={-1} max={1} /></label><label>Hedge <Stepper value={0} onChange={value => moveHedge(Math.sign(value))} min={-1} max={1} /></label></div>}
              <div className="osb-summary-row">
                <select value={multiplier} onChange={event => setMultiplier(Number(event.target.value))}>{[1, 2, 3, 4, 5, 10].map(value => <option key={value} value={value}>Multiplier x{value}</option>)}</select>
                <span>Price <b>{priceDirection} {number(Math.abs(analysis?.pricing?.net_price || 0))}</b></span>
                <span>Premium <b>{priceDirection} {cash(premiumValue)}</b></span>
                <button className="osb-link" onClick={() => setShowCharges(true)}><Calculator size={13} /> Charges</button>
              </div>
              <div className="osb-action-row">
                <button className="osb-btn outline" onClick={openChain}>Add/Edit</button>
                <button className="osb-btn outline" onClick={() => persistConfiguration('DRAFT', strategyName || `Draft · ${new Date().toLocaleString('en-IN')}`)}>Add to Drafts</button>
                <button className="osb-btn primary" onClick={() => setTradeDialog(true)} disabled={!includedLegs.length || analysisBusy}>{includedLegs.length === 1 ? (includedLegs[0].action === 'BUY' ? 'Buy' : 'Sell') : 'Trade All'}</button>
                <div className="osb-overflow"><button className="osb-more" onClick={() => setShowOverflow(value => !value)}><MoreHorizontal size={17} /></button>{showOverflow && <div><button onClick={() => configId ? persistConfiguration('SAVED', strategyName) : setSaveDialog({ kind: 'SAVED', clone: false })}>Save</button><button disabled={!strategyName} onClick={() => setSaveDialog({ kind: 'SAVED', clone: true })}>Save As</button><button disabled={!configId} onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/strategy-builder?config=${configId}`); toast.success('Private strategy link copied') }}>Share <ChevronRight size={13} /></button></div>}</div>
              </div>
              <div className="osb-manual-row"><label><input type="checkbox" checked={manualEnabled} onChange={event => setManualEnabled(event.target.checked)} /> Manual P/L <Tooltip text="Adds a constant simulation overlay without changing margin or Greeks." /></label><button disabled={!manualEnabled} onClick={() => setShowManualDialog(true)}>{manualPnl ? `Edit ${cash(manualPnl)}` : 'Add Manual P/L'}</button></div>
            </article>
          )}

          <article className="osb-card osb-bottom-tabs">
            <nav>{['Ready-made', 'Positions', 'Saved Strategies', 'Draft Portfolios'].map(item => <button key={item} className={leftTab === item ? 'active' : ''} onClick={() => setLeftTab(item)}>{item}</button>)}</nav>
            {leftTab === 'Ready-made' && renderReadyMade()}
            {leftTab === 'Positions' && renderPositions()}
            {leftTab === 'Saved Strategies' && renderLibrary('SAVED')}
            {leftTab === 'Draft Portfolios' && renderLibrary('DRAFT')}
          </article>
        </section>

        <section className="osb-right-pane">
          <div className="osb-top-metrics">
            <article className="osb-card osb-metrics-card">
              <Metric label="Max Profit" value={cash(analysis?.metrics?.max_profit)} tone="gain" />
              <Metric label="Max Loss" value={cash(analysis?.metrics?.max_loss)} tone="loss" />
              <Metric label="Reward / Risk" value={shownRisk == null ? '—' : number(shownRisk)} help="Maximum reward divided by maximum risk." extra={<button className="osb-invert" onClick={() => setInvertRisk(value => !value)}>1/x</button>} />
              <Metric label="POP" value={analysis?.metrics?.pop == null ? '—' : `${number(analysis.metrics.pop, 1)}%`} help="Modelled probability of finishing in profit." />
              <div className="osb-breakeven-metric"><span>Breakeven <div><button className={breakevenMode === 'Target' ? 'active' : ''} onClick={() => setBreakevenMode('Target')}>Target</button><button className={breakevenMode === 'Expiry' ? 'active' : ''} onClick={() => setBreakevenMode('Expiry')}>Expiry</button></div></span><strong>{selectedBreakevens.length ? selectedBreakevens.map(value => number(value)).join(' / ') : '—'}</strong></div>
              <Metric label="Time Value" value={cash(analysis?.metrics?.time_value)} help="Signed premium above intrinsic value." />
              <Metric label="Intrinsic Value" value={cash(analysis?.metrics?.intrinsic_value)} help="Signed intrinsic value at the current spot." />
            </article>
            <article className="osb-card osb-funds-card">
              <header><h3>Funds & Margins</h3><Settings size={15} /></header>
              <Metric label="Funds Needed" value={cash(analysis?.funds?.funds_needed)} help="Higher of margin or debit premium, plus estimated entry charges." />
              <Metric label="Margin Needed" value={cash(analysis?.funds?.margin_needed)} help="Estimated paper margin; not an exchange SPAN quote." />
              <Metric label="Margin Available" value={cash(analysis?.funds?.margin_available)} />
            </article>
          </div>

          <article className="osb-card osb-analytics-card">
            <header className="osb-analytics-tabs"><nav>{ANALYTICS_TABS.map(item => <button key={item} className={analyticsTab === item ? 'active' : ''} onClick={() => setAnalyticsTab(item)}>{item}</button>)}</nav><Toggle checked={bookedPnl} onChange={setBookedPnl} label={<>Add Booked P&L <Tooltip text="Adds current paper-position P&L to chart and table projections." /></>} /></header>
            <div className="osb-analytics-body">
              {!analysis && <div className="osb-analytics-empty"><BarChart3 size={34} /><b>Add a strategy to begin analysis</b><span>Payoff, risk, Greeks and margin will update here.</span></div>}
              {analysis && analyticsTab === 'Payoff Graph' && renderPayoff()}
              {analysis && analyticsTab === 'P&L Table' && renderPnlTable()}
              {analysis && analyticsTab === 'Greeks' && renderGreeks()}
              {analysis && analyticsTab === 'Strategy Chart' && renderStrategyChart()}
            </div>
          </article>

          <article className="osb-card osb-lower-panel">
            <header><h3>Strikewise IVs</h3><div><label>Offset <Stepper value={0} min={-10} max={10} step={0.5} onChange={value => setLegs(current => current.map(leg => ({ ...leg, ivOverride: Math.max(0.1, Number(leg.ivOverride ?? leg.iv ?? 18) + value) })))} /></label><button className="osb-link" onClick={() => setLegs(current => current.map(leg => ({ ...leg, ivOverride: null })))}>Reset IVs</button></div></header>
            <table className="osb-data-table"><thead><tr><th>Strike</th><th>Expiry</th><th>IV</th><th>Chg</th></tr></thead><tbody>{(analysis?.iv_rows || []).map(row => <tr key={row.client_id}><td>{row.strike} {row.type}</td><td>{dateLabel(row.expiry)}</td><td><Stepper value={row.iv} step={0.1} min={0.1} max={300} onChange={value => updateLeg(row.client_id, { ivOverride: value })} /></td><td className={row.change >= 0 ? 'gain' : 'loss'}>{row.change >= 0 ? '+' : ''}{number(row.change, 1)}</td></tr>)}</tbody></table>
          </article>

          <article className="osb-card osb-mini-greeks">
            <header><h3>Greeks</h3><div><Toggle checked={multiplyLot} onChange={setMultiplyLot} label="Lot Size" /><Toggle checked={multiplyLots} onChange={setMultiplyLots} label="Lots" /></div></header>
            <div>{['delta', 'theta', 'decay', 'gamma', 'vega'].map(key => <Metric key={key} label={key[0].toUpperCase() + key.slice(1)} value={number(analysis?.greeks?.total?.[key], key === 'gamma' ? 6 : 3)} />)}</div>
          </article>

          <div className="osb-two-panels">
            <article className="osb-card"><h3>Target Day Futures Prices <Tooltip text="Cost-of-carry estimate for the target date." /></h3><div className="osb-big-pair"><span>{analysis?.target_future?.label || 'FUT'}</span><b>{cash(analysis?.target_future?.price)}</b></div></article>
            <article className="osb-card"><h3>Standard Deviation <Tooltip text="Expected price range using current average IV." /></h3><table className="osb-data-table"><thead><tr><th>SD</th><th>Points</th><th>Price</th></tr></thead><tbody>{['one', 'two'].map((key, index) => <tr key={key}><td>{index + 1} SD</td><td>± {number(analysis?.standard_deviation?.[key]?.points)}</td><td>{number(analysis?.standard_deviation?.[key]?.lower)} / {number(analysis?.standard_deviation?.[key]?.upper)}</td></tr>)}</tbody></table></article>
          </div>
        </section>
      </main>

      {chainOverlay && <div className={`osb-chain-overlay${chainCollapsed ? ' collapsed' : ''}`}>
        <button className="osb-editor-peek" onClick={() => setChainCollapsed(value => !value)}>{chainCollapsed ? 'Show Chain «' : 'Show Editor »'}</button>
        {!chainCollapsed && <section>
          <header className="osb-chain-header"><button className="osb-instrument-search"><Search size={15} /><b>{instrument}</b><span>{number(spot)}</span></button><button onClick={() => setChainOverlay(false)}><X size={18} /></button></header>
          <nav className="osb-chain-tabs">{CHAIN_MODES.map(mode => <button key={mode} className={chainMode === mode ? 'active' : ''} onClick={() => changeChainMode(mode)}>{mode}</button>)}<Settings size={15} /></nav>
          <div className="osb-chain-toolbar"><select value={currentExpiry} onChange={event => setExpiry(event.target.value)}>{expiries.map(value => <option key={value} value={value}>{dateLabel(value)}</option>)}</select><div>{['LTP', 'OI', 'Greeks'].map(mode => <button key={mode} className={chainDataMode === mode ? 'active' : ''} onClick={() => setChainDataMode(mode)}>{mode}</button>)}</div></div>
          <div className="osb-overlay-table">
            {chainMode === 'Strikes' && <table className="osb-chain-table"><thead><tr><th>Delta</th><th>Call LTP</th><th>Call OI</th><th>Strike</th><th>IV</th><th>Put OI</th><th>Put LTP</th><th>Delta</th></tr></thead><tbody>{rows.map(row => <tr key={row.strike} className={Number(row.strike) === Number(chain?.atm_strike) ? 'atm' : ''}><td>{number(row.ce?.delta, 2)}</td><td><span className="osb-quick-actions"><button className="buy" onClick={() => addStaged(makeLeg(row.strike, 'CE', 'BUY'))}>B</button><button className="sell" onClick={() => addStaged(makeLeg(row.strike, 'CE', 'SELL'))}>S</button></span>{number(row.ce?.ltp)}</td><td><i className="oi call" style={{ '--oi': `${Math.min(100, (row.ce?.oi || 0) / Math.max(1, meta?.total_call_oi || 1) * 500)}%` }} />{(row.ce?.oi || 0).toLocaleString('en-IN')}</td><td><b>{row.strike}</b></td><td>{number(((row.ce?.iv || 0) + (row.pe?.iv || 0)) / 2, 1)}</td><td><i className="oi put" style={{ '--oi': `${Math.min(100, (row.pe?.oi || 0) / Math.max(1, meta?.total_put_oi || 1) * 500)}%` }} />{(row.pe?.oi || 0).toLocaleString('en-IN')}</td><td>{number(row.pe?.ltp)}<span className="osb-quick-actions"><button className="buy" onClick={() => addStaged(makeLeg(row.strike, 'PE', 'BUY'))}>B</button><button className="sell" onClick={() => addStaged(makeLeg(row.strike, 'PE', 'SELL'))}>S</button></span></td><td>{number(row.pe?.delta, 2)}</td></tr>)}</tbody></table>}
            {chainMode === 'Straddles' && <div className="osb-combo-list">{rows.map(row => <div key={row.strike}><b>{row.strike} Straddle</b><span>{cash((row.ce?.ltp || 0) + (row.pe?.ltp || 0))}</span><button className="buy" onClick={() => addPair(row.strike, 'CE', row.strike, 'PE', 'BUY')}>B</button><button className="sell" onClick={() => addPair(row.strike, 'CE', row.strike, 'PE', 'SELL')}>S</button></div>)}</div>}
            {chainMode === 'Strangles' && <div className="osb-combo-list">{rows.slice(0, Math.floor(rows.length / 2)).map((row, index) => { const peer = rows[rows.length - 1 - index]; return <div key={`${row.strike}-${peer.strike}`}><b>{row.strike} PE / {peer.strike} CE</b><span>{cash((row.pe?.ltp || 0) + (peer.ce?.ltp || 0))}</span><button className="buy" onClick={() => addPair(row.strike, 'PE', peer.strike, 'CE', 'BUY')}>B</button><button className="sell" onClick={() => addPair(row.strike, 'PE', peer.strike, 'CE', 'SELL')}>S</button></div> })}</div>}
            {chainMode === 'Futures' && <div className="osb-futures-list"><table className="osb-data-table"><thead><tr><th>Expiry</th><th>B/S</th><th>Price</th></tr></thead><tbody>{(context?.futures || []).map((future, index) => { const exp = future.expiry || future.expiry_date || expiries[index]; const price = future.price || future.quote?.last_price || spot; return <tr key={exp}><td>{dateLabel(exp)} ({future.days ?? Math.max(0, Math.round((new Date(exp) - new Date()) / 86400000))} Days)</td><td><button className="buy" onClick={() => addStaged({ ...makeLeg(null, 'FUT', 'BUY', rows, exp), price, liveLtp: price })}>B</button><button className="sell" onClick={() => addStaged({ ...makeLeg(null, 'FUT', 'SELL', rows, exp), price, liveLtp: price })}>S</button></td><td>{number(price)}</td></tr>})}</tbody></table><h3>Synthetic Futures <Tooltip text="Call-put synthetic at the ATM strike." /></h3><div className="osb-combo-list">{expiries.slice(0, 3).map(exp => { const atm = chain?.atm_strike || Math.round(spot / strikeStep) * strikeStep; return <div key={exp}><b>{dateLabel(exp)} Synthetic FUT *</b><span>{atm}</span><button className="buy" onClick={() => addStaged([makeLeg(atm, 'CE', 'BUY', rows, exp), makeLeg(atm, 'PE', 'SELL', rows, exp)])}>B</button><button className="sell" onClick={() => addStaged([makeLeg(atm, 'CE', 'SELL', rows, exp), makeLeg(atm, 'PE', 'BUY', rows, exp)])}>S</button></div>})}</div></div>}
          </div>
          <footer className="osb-chain-footer"><b>{stagedLegs.length} leg(s) selected</b><div><button className="osb-btn outline" onClick={() => setStagedLegs([])}>Clear All</button><button className="osb-btn primary" onClick={() => { setLegs(stagedLegs); setActiveTemplate(null); setChainOverlay(false) }}>Done</button></div></footer>
        </section>}
      </div>}

      {showInsights && <aside className="osb-insights"><header><div><span><Clock3 size={14} /> Decay</span><h2>Your warnings</h2></div><button onClick={() => setShowInsights(false)}><X /></button></header><div>{warnings.length ? warnings.map((warning, index) => <article key={warning}><b>{index === 0 && warning.includes('theta') ? 'Weekend theta bleed' : 'Strategy warning'}</b><p>{warning} Review the payoff and target-date projection before executing the paper strategy.</p></article>) : <div className="osb-list-empty"><Check size={30} /><b>No current warnings</b></div>}</div><button className="osb-btn outline wide" onClick={() => setShowInsights(false)}>Hide</button></aside>}

      {pendingMode && <Modal onClose={() => setPendingMode(null)} actions={<><button className="osb-btn outline" onClick={() => setPendingMode(null)}>Cancel</button><button className="osb-btn primary" onClick={() => { setStagedLegs([]); setChainMode(pendingMode); setPendingMode(null) }}>Proceed</button></>}><p>You are changing strategy type from <b>{chainMode}</b> to <b>{pendingMode}</b>. Existing overlay selections will be cleared.</p></Modal>}
      {showCharges && <Modal title="Charges breakdown" onClose={() => setShowCharges(false)} actions={<button className="osb-btn primary" onClick={() => setShowCharges(false)}>Done</button>}><div className="osb-charge-list">{Object.entries(analysis?.pricing?.charges || {}).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</span><b>{cash(value)}</b></div>)}</div></Modal>}
      {showManualDialog && <Modal title="Manual P/L" onClose={() => setShowManualDialog(false)} actions={<><button className="osb-btn outline" onClick={() => { setManualPnl(0); setShowManualDialog(false) }}>Clear</button><button className="osb-btn primary" onClick={() => setShowManualDialog(false)}>Apply</button></>}><label className="osb-field">Signed P&L amount (₹)<input autoFocus type="number" value={manualPnl} onChange={event => setManualPnl(Number(event.target.value))} /><small>Use a negative number for a manual loss.</small></label></Modal>}
      {saveDialog && <Modal title={saveDialog.clone ? 'Save strategy as' : 'Save strategy'} onClose={() => setSaveDialog(null)} actions={<><button className="osb-btn outline" onClick={() => setSaveDialog(null)}>Cancel</button><button className="osb-btn primary" disabled={!saveDialog.name?.trim()} onClick={() => persistConfiguration('SAVED', saveDialog.name, saveDialog.clone)}>Save</button></>}><label className="osb-field">Strategy name<input autoFocus maxLength={100} value={saveDialog.name ?? strategyName} onChange={event => setSaveDialog(current => ({ ...current, name: event.target.value }))} placeholder="e.g. NIFTY weekly iron condor" /></label></Modal>}
      {tradeDialog && <Modal title="Review paper execution" onClose={() => !executing && setTradeDialog(false)} actions={<><button className="osb-btn outline" disabled={executing} onClick={() => setTradeDialog(false)}>Cancel</button><button className="osb-btn primary" disabled={!setupTag || executing} onClick={execute}>{executing ? <><Loader2 className="spin" size={14} /> Executing…</> : 'Confirm Trade All'}</button></>}><div className="osb-trade-review"><div><span>Strategy</span><b>{displayName} · {includedLegs.length} legs</b></div><div><span>Estimated funds</span><b>{cash(analysis?.funds?.funds_needed)}</b></div><label className="osb-field">Setup tag<select value={setupTag} onChange={event => setSetupTag(event.target.value)}><option value="">Select setup</option>{SETUP_TAGS.map(tag => <option key={tag} value={tag}>{SETUP_TAG_LABELS[tag]}</option>)}</select></label><label className="osb-field">Product<select value={productType} onChange={event => setProductType(event.target.value)}><option value="INTRADAY">Intraday</option><option value="NRML">Positional</option></select></label><p><ShieldAlert size={16} /> Live paper fills are re-quoted by the server. What-if prices are never used as executable prices.</p></div></Modal>}
      <ErrorDialog error={errorState} onRetry={() => { setErrorState(null); retryRef.current?.() }} onDismiss={() => setErrorState(null)} />
    </div>
  )
}
