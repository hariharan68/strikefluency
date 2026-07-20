export default function DisciplineScoreRing({ score = 0, size = 120 }) {
  const r = 54
  const cx = 60
  const cy = 60
  const circumference = 2 * Math.PI * r
  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = circumference - (clampedScore / 100) * circumference

  const color = clampedScore >= 80 ? '#3ee089' : clampedScore >= 50 ? '#e97d35' : '#e93544'

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    >
      {/* Background ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="8"
      />
      {/* Score ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      {/* Score text */}
      <text
        x={cx} y={cy - 4}
        textAnchor="middle"
        fill="var(--text)"
        fontSize="22"
        fontWeight="500"
        fontFamily="Inter,sans-serif"
      >
        {clampedScore}
      </text>
      <text
        x={cx} y={cy + 14}
        textAnchor="middle"
        fill="var(--text-muted)"
        fontSize="10"
        fontFamily="Inter,sans-serif"
      >
        /100
      </text>
    </svg>
  )
}
