import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Save,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react'
import { EMOTION_LABELS, MISTAKE_LABELS, SETUP_TAG_LABELS } from '../../utils/constants'
import { formatCurrency, formatDate, formatDuration } from '../../utils/formatters'

const number = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const signedMoney = value => `${number(value) >= 0 ? '+' : '-'}${formatCurrency(Math.abs(number(value)))}`

function DetailItem({ label, value, tone = '' }) {
  return (
    <div className="journal-detail-item">
      <span>{label}</span>
      <strong className={tone}>{value ?? '—'}</strong>
    </div>
  )
}

function EmptySelection() {
  return (
    <div className="journal-detail-empty">
      <span><FileText size={24} /></span>
      <strong>Select a trade to review</strong>
      <p>Choose a closed trade from the list to inspect its execution, discipline, psychology, and lessons.</p>
    </div>
  )
}

export default function TradeDetailPanel({ entry, onSave, onClose }) {
  const [tab, setTab] = useState('overview')
  const [emotion, setEmotion] = useState('')
  const [mistake, setMistake] = useState('NONE')
  const [thesis, setThesis] = useState('')
  const [review, setReview] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEmotion(entry?.emotion_tag || '')
    setMistake(entry?.mistake_category || 'NONE')
    setThesis(entry?.pre_trade_thesis || '')
    setReview(entry?.post_trade_review || '')
    setTab('overview')
  }, [entry?.id])

  const reviewProgress = useMemo(() => {
    if (!entry) return 0
    const completed = [
      Boolean(emotion),
      mistake !== 'NONE',
      Boolean(thesis.trim()),
      Boolean(review.trim()),
    ].filter(Boolean).length
    return Math.round(completed / 4 * 100)
  }, [entry, emotion, mistake, thesis, review])

  if (!entry) return <EmptySelection />

  const pnl = number(entry.pnl ?? entry.net_pnl)
  const charges = number(entry.brokerage)
  const grossPnl = pnl + charges
  const isGain = pnl > 0
  const isLoss = pnl < 0
  const setup = SETUP_TAG_LABELS[entry.setup_tag] || entry.setup_tag || 'Unclassified'
  const reviewStatus = entry.is_reviewed ? 'Reviewed' : reviewProgress ? 'Review started' : 'Needs review'
  const violations = Array.isArray(entry.violations_attempted) ? entry.violations_attempted : []

  const persist = async markReviewed => {
    setSaving(true)
    try {
      await onSave?.(entry.id, {
        emotion_tag: emotion,
        mistake_category: mistake,
        pre_trade_thesis: thesis,
        post_trade_review: review,
        is_reviewed: markReviewed,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="journal-detail-panel">
      <header className="journal-detail-header">
        <div>
          <div className="journal-detail-contract">
            <span className={`journal-option-pill ${entry.option_type === 'PE' ? 'pe' : ''}`}>{entry.option_type || 'OPT'}</span>
            <h2>{entry.instrument || 'Instrument'} {entry.strike_price != null ? Math.round(number(entry.strike_price)) : ''}</h2>
          </div>
          <p>
            <span className={`journal-side-pill ${entry.action === 'SELL' ? 'sell' : ''}`}>{entry.action || 'BUY'}</span>
            {entry.quantity || 0} lot{number(entry.quantity) === 1 ? '' : 's'} · {entry.product_type === 'NRML' ? 'Carry-forward' : 'Intraday'}
          </p>
        </div>
        <div className="journal-detail-header-actions">
          <span className={`journal-review-status ${entry.is_reviewed ? 'reviewed' : 'pending'}`}>
            {entry.is_reviewed ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
            {reviewStatus}
          </span>
          <button type="button" onClick={onClose} className="journal-detail-close" aria-label="Close trade details">
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="journal-detail-result">
        <div>
          <span>Net realized P&amp;L</span>
          <strong className={isGain ? 'gain' : isLoss ? 'loss' : ''}>{signedMoney(pnl)}</strong>
          <small>{isGain ? 'Winning trade' : isLoss ? 'Losing trade' : 'Breakeven trade'}</small>
        </div>
        <div className="journal-detail-score">
          <span>Rule adherence</span>
          <strong className={entry.is_discipline_compliant ? 'gain' : 'loss'}>
            {entry.is_discipline_compliant ? '100%' : '0%'}
          </strong>
          <small>{entry.is_discipline_compliant ? 'Plan compliant' : `${violations.length || 1} rule issue${violations.length === 1 ? '' : 's'}`}</small>
        </div>
      </div>

      <nav className="journal-detail-tabs" aria-label="Selected trade details">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          Review <span>{reviewProgress}%</span>
        </button>
      </nav>

      <div className="journal-detail-body">
        {tab === 'overview' ? (
          <>
            <section className="journal-detail-section">
              <header><CircleDollarSign size={16} /><span><strong>Execution</strong><small>Actual closed-trade values</small></span></header>
              <div className="journal-detail-grid">
                <DetailItem label="Entry price" value={formatCurrency(entry.entry_price)} />
                <DetailItem label="Exit price" value={entry.exit_price == null ? '—' : formatCurrency(entry.exit_price)} />
                <DetailItem label="Gross P&L" value={signedMoney(grossPnl)} tone={grossPnl >= 0 ? 'gain' : 'loss'} />
                <DetailItem label="Charges" value={formatCurrency(charges)} />
                <DetailItem label="Net P&L" value={signedMoney(pnl)} tone={pnl >= 0 ? 'gain' : 'loss'} />
                <DetailItem label="Holding time" value={formatDuration(entry.duration_minutes)} />
              </div>
            </section>

            <section className="journal-detail-section">
              <header><Target size={16} /><span><strong>Trade context</strong><small>Setup, exit, and timing</small></span></header>
              <div className="journal-detail-grid">
                <DetailItem label="Setup" value={setup} />
                <DetailItem label="Exit reason" value={entry.exit_reason?.replaceAll('_', ' ') || '—'} />
                <DetailItem label="Trade date" value={entry.trade_date || '—'} />
                <DetailItem label="Recorded" value={formatDate(entry.created_at)} />
              </div>
            </section>

            <section className="journal-detail-section">
              <header><ShieldCheck size={16} /><span><strong>Discipline review</strong><small>Rule-gate result captured at execution</small></span></header>
              <div className={`journal-discipline-callout ${entry.is_discipline_compliant ? 'compliant' : 'violation'}`}>
                {entry.is_discipline_compliant ? <CheckCircle2 size={19} /> : <AlertTriangle size={19} />}
                <div>
                  <strong>{entry.is_discipline_compliant ? 'All active discipline checks passed' : 'A discipline issue was recorded'}</strong>
                  <p>
                    {entry.is_discipline_compliant
                      ? 'This trade was accepted without a recorded rule violation.'
                      : violations.length
                        ? violations.map(value => value.replaceAll('_', ' ')).join(' · ')
                        : 'Review the execution and document what should change next time.'}
                  </p>
                </div>
              </div>
            </section>

            <section className="journal-detail-section">
              <header><FileText size={16} /><span><strong>Trade plan</strong><small>Your thesis before entry</small></span></header>
              <div className="journal-readonly-note">
                {entry.pre_trade_thesis || 'No pre-trade thesis has been recorded. Open Review to document the setup and invalidation.'}
              </div>
            </section>

            <button type="button" className="journal-review-cta" onClick={() => setTab('review')}>
              <Brain size={16} />
              {entry.is_reviewed ? 'Update trade review' : 'Review this trade'}
            </button>
          </>
        ) : (
          <form className="journal-review-form" onSubmit={event => { event.preventDefault(); persist(entry.is_reviewed) }}>
            <section className="journal-review-progress">
              <div>
                <span>Review completeness</span>
                <strong>{reviewProgress}%</strong>
              </div>
              <i><span style={{ width: `${reviewProgress}%` }} /></i>
              <p>Capture context, psychology, mistakes, and one actionable lesson.</p>
            </section>

            <section className="journal-detail-section">
              <header><Target size={16} /><span><strong>Plan and context</strong><small>What made this trade valid?</small></span></header>
              <label className="journal-review-field">
                <span>Pre-trade thesis</span>
                <textarea
                  value={thesis}
                  onChange={event => setThesis(event.target.value)}
                  placeholder="Setup, market context, entry trigger, invalidation, and intended exit..."
                  rows={4}
                />
              </label>
            </section>

            <section className="journal-detail-section">
              <header><Brain size={16} /><span><strong>Psychology</strong><small>How did you feel during execution?</small></span></header>
              <div className="journal-choice-grid">
                {Object.entries(EMOTION_LABELS).map(([key, option]) => (
                  <button
                    type="button"
                    key={key}
                    className={emotion === key ? 'active' : ''}
                    style={{ '--choice-color': option.color }}
                    onClick={() => setEmotion(key)}
                    aria-pressed={emotion === key}
                  >
                    {emotion === key && <Check size={13} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="journal-detail-section">
              <header><AlertTriangle size={16} /><span><strong>Mistake pattern</strong><small>Name the behaviour, not the outcome</small></span></header>
              <div className="journal-choice-grid">
                {Object.entries(MISTAKE_LABELS).map(([key, option]) => (
                  <button
                    type="button"
                    key={key}
                    className={mistake === key ? 'active' : ''}
                    style={{ '--choice-color': option.color }}
                    onClick={() => setMistake(key)}
                    aria-pressed={mistake === key}
                  >
                    {mistake === key && <Check size={13} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="journal-detail-section">
              <header><FileText size={16} /><span><strong>Lesson and next action</strong><small>Turn the trade into a repeatable improvement</small></span></header>
              <label className="journal-review-field">
                <span>Post-trade review</span>
                <textarea
                  value={review}
                  onChange={event => setReview(event.target.value)}
                  placeholder="What went well? What went wrong? Why did it happen? What will you do differently?"
                  rows={6}
                />
              </label>
            </section>

            <div className="journal-review-actions">
              <button type="submit" className="journal-save-draft" disabled={saving}>
                <Save size={15} /> {saving ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" className="journal-complete-review" disabled={saving} onClick={() => persist(!entry.is_reviewed)}>
                <CheckCircle2 size={15} />
                {entry.is_reviewed ? 'Reopen review' : 'Mark review complete'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
