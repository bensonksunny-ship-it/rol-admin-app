import { useEffect, useState } from 'react'
import rolccLogo from '../assets/rolcc_logo BW.JPG'

const SIZE = 104
const STROKE = 5
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Launch splash screen shown by ProtectedRoute while the initial auth check +
 * Firestore profile fetch (AuthContext's `loading`) are in flight. There's no
 * multi-step progress signal to hook a real percentage to — just one boolean
 * that flips when everything resolves — so the ring eases up toward ~92% on
 * its own (a standard "still working" indicator, same idea as a GitHub/YouTube
 * top-loading-bar) and only snaps to 100% once `ready` actually goes true,
 * holding that frame briefly so the user sees "100%" before `onFinished` fires
 * and the caller swaps in the real app.
 */
export default function SplashScreen({ ready = false, onFinished }) {
  const [progress, setProgress] = useState(4)

  useEffect(() => {
    if (ready) return
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p
        const step = Math.max(0.4, (92 - p) * 0.06)
        return Math.min(92, p + step)
      })
    }, 120)
    return () => clearInterval(id)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => onFinished?.(), 350)
    return () => clearTimeout(t)
  }, [ready, onFinished])

  // Snaps straight to 100 the instant `ready` flips, rather than waiting on the
  // interval above to catch up — computed at render time so there's no extra
  // setState call inside the effect.
  const displayProgress = ready ? 100 : progress
  const dashOffset = CIRCUMFERENCE * (1 - displayProgress / 100)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-white dark:bg-slate-900">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-700"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            className="text-indigo-500 dark:text-indigo-400"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.25s ease-out' }}
          />
        </svg>
        <img
          src={rolccLogo}
          alt="River Of Life"
          className="absolute inset-0 m-auto w-14 h-14 rounded-full object-cover shadow-sm"
        />
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
        {Math.round(displayProgress)}%
      </p>
    </div>
  )
}
