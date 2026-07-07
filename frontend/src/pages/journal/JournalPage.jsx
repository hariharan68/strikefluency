import { useEffect, useState } from 'react'
import useJournal from '../../hooks/useJournal'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { EMOTION_LABELS, MISTAKE_LABELS, SETUP_TAG_LABELS } from '../../utils/constants'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { updateEntry } from '../../api/journal'
import { useToast } from '../../components/common/Toast'

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style }}>
    {children}
  </div>
)

function JournalRow({ entry, onSave }) {
  const [open, setOpen] = useState(false)
  const [emotion, setEmotion] = useState(entry.emotion_tag || '')
  const [mistake, setMistake] = useState(entry.mistake_category || 'NONE')
  const [notes, setNotes] = useState(entry.review_notes || '')
  const [saving, setSaving] = useState(false)
  const { success } = useToast()
  const pnl = entry.net_pnl ?? 0
  const isGain = pnl > 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateEntry(entry.id, { emotion_tag: emotion, mistake_category: mistake, review_notes: notes })
      success('Journal entry updated')
      onSave?.()
    } catch {}
    setSaving(false)
  }

  return (
    <>
      <tr onClick={() => setOpen(o => !o)} className="chain-row" style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}>
        <td style={{ padding: '10px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: entry.option_type === 'CE' ? '#eff6ff' : '#fef2f2', color: entry.option_type === 'CE' ? '#2563eb' : '#dc2626' }}>
              {entry.option_type}
            </span>
            <span className="num" style={{ color: '#1e293b', fontSize: 13, fontWeight: 600 }}>{entry.instrument} {entry.strike_price}</span>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{entry.action}</span>
          </div>
        </td>
        <td className="num" style={{ padding: '10px 10px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>{entry.entry_price?.toFixed(2)}</td>
        <td className="num" style={{ padding: '10px 10px', textAlign: 'right', color: '#64748b', fontSize: 12 }}>{entry.exit_price?.toFixed(2) || '—'}</td>
        <td className="num" style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 600, color: isGain ? '#16a34a' : pnl < 0 ? '#dc2626' : '#64748b' }}>
          {pnl !== 0 ? (isGain ? '+' : '') + formatCurrency(pnl) : '—'}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
          {entry.setup_tag ? <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12, fontWeight: 500 }}>{SETUP_TAG_LABELS[entry.setup_tag] || entry.setup_tag}</span> : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
          {emotion ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f1f5f9', color: EMOTION_LABELS[emotion]?.color || '#64748b', fontWeight: 500 }}>{EMOTION_LABELS[emotion]?.label || emotion}</span> : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
        </td>
        <td className="num" style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 11 }}>{formatDate(entry.created_at)}</td>
        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
          {open ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} style={{ padding: '0 16px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, paddingTop: 14 }}>
              <div>
                <label className="sf-label">Emotion During Trade</label>
                <select className="sf-input" value={emotion} onChange={e => setEmotion(e.target.value)}>
                  <option value="">— none —</option>
                  {Object.entries(EMOTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="sf-label">Mistake Made</label>
                <select className="sf-input" value={mistake} onChange={e => setMistake(e.target.value)}>
                  {Object.entries(MISTAKE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="sf-label">Review Notes</label>
                <textarea className="sf-input" style={{ resize: 'vertical', minHeight: 64 }}
                  placeholder="What did you learn from this trade?" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={handleSave} disabled={saving} className="sf-btn-primary" style={{ height: 34, padding: '0 18px', fontSize: 12 }}>
                {saving ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const ITEMS = 15

export default function JournalPage() {
  const { entries, total, loading, loadJournal } = useJournal()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('ALL')

  useEffect(() => {
    loadJournal(page, filter !== 'ALL' ? { status: filter } : {})
  }, [page, filter])

  const wins = entries.filter(e => (e.net_pnl ?? 0) > 0).length
  const losses = entries.filter(e => (e.net_pnl ?? 0) < 0).length
  const totalPnl = entries.reduce((s, e) => s + (e.net_pnl ?? 0), 0)
  const pages = Math.ceil(total / ITEMS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats strip */}
      <Card>
        <div style={{ display: 'flex' }}>
          {[
            { label: 'Total Entries', value: total, color: '#1e293b' },
            { label: 'Winners', value: wins, color: '#16a34a' },
            { label: 'Losers', value: losses, color: '#dc2626' },
            { label: 'Net P&L (page)', value: (totalPnl >= 0 ? '+' : '') + formatCurrency(totalPnl), color: totalPnl >= 0 ? '#16a34a' : '#dc2626' },
          ].map((item, i) => (
            <div key={i} style={{ flex: 1, padding: '16px 20px', borderRight: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{item.label}</div>
              <div className="num" style={{ color: item.color, fontSize: 20, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
          {/* Filter */}
          <div style={{ padding: '16px 16px', display: 'flex', alignItems: 'center', gap: 4 }}>
            {['ALL', 'CLOSED', 'OPEN'].map(f => (
              <button key={f} onClick={() => { setFilter(f); setPage(1) }}
                className="toggle-btn"
                style={{ minWidth: 60, fontSize: 11, background: filter === f ? '#3b82f6' : 'transparent', color: filter === f ? '#fff' : '#64748b', border: 'none' }}>
                {f}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <span style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Trade Journal — click row to add review</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📔</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>No journal entries yet. Place a trade first!</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Position', 'Entry', 'Exit', 'P&L', 'Setup', 'Emotion', 'Date', ''].map((h, i) => (
                  <th key={i} style={{ padding: '8px 16px', textAlign: i >= 1 && i < 4 ? 'right' : i === 4 || i === 5 ? 'center' : 'left', color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => <JournalRow key={entry.id} entry={entry} onSave={() => loadJournal(page)} />)}
            </tbody>
          </table>
        )}
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <span style={{ color: '#64748b', fontSize: 12 }}>Page {page} of {pages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="sf-btn-outline">← Prev</button>
              <button onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages} className="sf-btn-outline">Next →</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
