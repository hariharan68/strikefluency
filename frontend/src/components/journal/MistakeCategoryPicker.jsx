import { MISTAKE_LABELS } from '../../utils/constants'

export default function MistakeCategoryPicker({ value, onChange }) {
  return (
    <div>
      <label style={{ color: 'var(--text-sub)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
        Mistake Category
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(MISTAKE_LABELS).map(([key, { label, color }]) => {
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
                border: `1px solid ${isSelected ? color : 'var(--border)'}`,
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
