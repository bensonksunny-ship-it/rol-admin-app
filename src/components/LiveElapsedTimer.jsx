import { useState, useEffect } from 'react'

/**
 * Live elapsed clock since startedAtMs.
 * Colors: green → amber at 80% of plannedMinutes → red when over.
 */
export default function LiveElapsedTimer({ startedAtMs, plannedMinutes = null, label = null }) {
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    if (!startedAtMs) { setSecs(0); return }
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAtMs])

  if (!startedAtMs) return null

  const mm = Math.floor(secs / 60).toString().padStart(2, '0')
  const ss = (secs % 60).toString().padStart(2, '0')
  const plannedSecs = plannedMinutes ? plannedMinutes * 60 : null
  const pct = plannedSecs ? secs / plannedSecs : null

  let bg, textColor, borderColor, barColor
  if (pct === null || pct < 0.8) {
    bg = '#f0fdf4'; textColor = '#15803d'; borderColor = '#86efac'; barColor = '#22c55e'
  } else if (pct < 1) {
    bg = '#fffbeb'; textColor = '#b45309'; borderColor = '#fcd34d'; barColor = '#f59e0b'
  } else {
    bg = '#fef2f2'; textColor = '#b91c1c'; borderColor = '#fca5a5'; barColor = '#ef4444'
  }

  return (
    <div style={{
      background: bg,
      border: `2px solid ${borderColor}`,
      borderRadius: 16,
      padding: '12px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      minWidth: 140,
    }}>
      {label && (
        <span style={{ fontSize: 11, fontWeight: 600, color: textColor, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      )}
      <span style={{ fontFamily: 'monospace', fontSize: 40, fontWeight: 800, color: textColor, lineHeight: 1 }}>
        {mm}:{ss}
      </span>
      {plannedMinutes && (
        <span style={{ fontSize: 12, color: textColor, opacity: 0.65 }}>
          of {plannedMinutes} min planned
        </span>
      )}
      {plannedSecs && (
        <div style={{ width: '100%', height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (pct ?? 0) * 100)}%`,
            height: '100%',
            background: barColor,
            borderRadius: 4,
            transition: 'width 0.8s linear',
          }} />
        </div>
      )}
    </div>
  )
}
