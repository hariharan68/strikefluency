import { EMOTION_LABELS } from '../../utils/constants'

export default function EmotionTagPicker({ value, onChange }) {
  return (
    <div>
      <label style={{ color: '#6B7280', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
        Emotion
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(EMOTION_LABELS).map(([key, { label, color }]) => {
          const isSelected = value === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(isSelected ? null : key)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'Inter,sans-serif',
                cursor: 'pointer',
                border: `1px solid ${isSelected ? color : '#E5E7EB'}`,
                background: isSelected ? color + '20' : 'transparent',
                color: isSelected ? color : '#717784',
                transition: 'all 0.15s'
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
