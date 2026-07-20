import { useState } from 'react'
import EmotionTagPicker from './EmotionTagPicker'
import MistakeCategoryPicker from './MistakeCategoryPicker'
import Button from '../common/Button'

export default function ReviewNotesForm({ entry, onSave }) {
  const [emotion, setEmotion] = useState(entry?.emotion_tag || null)
  const [mistake, setMistake] = useState(entry?.mistake_category || null)
  const [notes, setNotes] = useState(entry?.review_notes || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        emotion_tag: emotion,
        mistake_category: mistake,
        review_notes: notes
      })
    } catch {} finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
      <EmotionTagPicker value={emotion} onChange={setEmotion} />
      <MistakeCategoryPicker value={mistake} onChange={setMistake} />

      <div>
        <label style={{ color: 'var(--text-sub)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
          Review Notes
        </label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="What did you learn? What could you improve?"
          rows={3}
          style={{
            width: '100%',
            background: 'var(--border)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 14px',
            color: 'var(--text)',
            fontSize: 14,
            fontFamily: 'Inter,sans-serif',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? 'Saving...' : 'Save Review'}
      </Button>
    </div>
  )
}
