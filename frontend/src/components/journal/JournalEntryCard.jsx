import { useState } from 'react'
import { formatPnL, formatDate } from '../../utils/formatters'
import { EMOTION_LABELS, MISTAKE_LABELS } from '../../utils/constants'
import TradeDetailPanel from './TradeDetailPanel'
import ReviewNotesForm from './ReviewNotesForm'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function JournalEntryCard({ entry, onSaveReview }) {
  const [expanded, setExpanded] = useState(false)
  const pnl = formatPnL(entry.net_pnl ?? 0)
  const emotion = entry.emotion_tag ? EMOTION_LABELS[entry.emotion_tag] : null
  const mistake = entry.mistake_category ? MISTAKE_LABELS[entry.mistake_category] : null

  return (
    <div style={{
      background: '#0e121b',
      border: '1px solid #2b303b',
      borderRadius: 12,
      overflow: 'hidden'
    }}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left'
        }}
      >
        {/* PnL indicator */}
        <div style={{
          width: 4,
          height: 36,
          borderRadius: 2,
          background: pnl.isPositive ? '#3ee089' : '#e93544',
          flexShrink: 0
        }} />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
              {entry.instrument} {entry.strike} {entry.option_type}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 12,
              background: entry.action === 'BUY' ? 'rgba(51,92,255,0.2)' : 'rgba(233,53,68,0.2)',
              color: entry.action === 'BUY' ? '#335cff' : '#ff6875'
            }}>
              {entry.action}
            </span>
            {emotion && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: emotion.color + '20', color: emotion.color
              }}>
                {emotion.label}
              </span>
            )}
            {mistake && mistake.label !== 'None' && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                background: mistake.color + '20', color: mistake.color
              }}>
                {mistake.label}
              </span>
            )}
          </div>
          <div style={{ color: '#717784', fontSize: 12, marginTop: 3 }}>
            {formatDate(entry.placed_at || entry.created_at)} · {entry.lots} lot{entry.lots !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ color: pnl.color, fontSize: 15, fontWeight: 500 }}>{pnl.signed}</span>
          {expanded ? <ChevronUp size={16} color="#717784" /> : <ChevronDown size={16} color="#717784" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          borderTop: '1px solid #2b303b',
          padding: '16px',
          background: '#181b25'
        }}>
          <TradeDetailPanel entry={entry} />
          {entry.review_notes && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#0e121b', borderRadius: 8 }}>
              <div style={{ color: '#717784', fontSize: 12, marginBottom: 4 }}>Review Notes</div>
              <div style={{ color: '#99a0ae', fontSize: 13 }}>{entry.review_notes}</div>
            </div>
          )}
          {onSaveReview && (
            <ReviewNotesForm
              entry={entry}
              onSave={(data) => onSaveReview(entry.id, data)}
            />
          )}
        </div>
      )}
    </div>
  )
}
