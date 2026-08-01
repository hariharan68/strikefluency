import { useEffect, useState } from 'react'

// One source of truth for every avatar spot (top-bar trigger + dropdown, the
// Profile hero). Two independent slots can feed it:
//   • photoSrc  — the uploaded profile photo (data URI)
//   • presetSrc — a chosen preset illustration (data URI)
// Display rule (per product spec):
//   both set   → alternate every 160s (photo ⇄ preset), synced via wall-clock
//   one set    → show that one
//   none set   → the first letter of `name`
// Cycling is computed from Date.now() so all mounted avatars stay in step, and a
// timeout aligned to the next boundary flips them exactly on time.

const CYCLE_MS = 160_000
const initialOf = name => (name || '?').trim().charAt(0).toUpperCase() || '?'

function useCyclingSrc(photoSrc, presetSrc) {
  const both = Boolean(photoSrc && presetSrc)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!both) return undefined
    let timer
    const schedule = () => {
      const wait = CYCLE_MS - (Date.now() % CYCLE_MS)
      timer = setTimeout(() => { tick(n => n + 1); schedule() }, wait + 20)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [both])

  if (both) {
    // phase 0 → photo, phase 1 → preset
    return Math.floor(Date.now() / CYCLE_MS) % 2 === 0 ? photoSrc : presetSrc
  }
  return photoSrc || presetSrc || null
}

export default function Avatar({ name, photoSrc, presetSrc, src, className = '', ...rest }) {
  // `src` kept as a convenience alias for a single-image caller.
  const shown = useCyclingSrc(photoSrc || src, presetSrc)
  return (
    <span className={`sf-avatar ${className}`} aria-hidden="true" {...rest}>
      {shown
        ? <img className="sf-avatar-img" src={shown} alt="" draggable="false" />
        : initialOf(name)}
    </span>
  )
}
