import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

function timeAgo(date, now) {
  if (!date) return ''
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

const TONES = {
  synced: { dot: 'bg-emerald-500', ring: 'border-emerald-200 bg-emerald-50 text-emerald-800', pulse: true },
  connecting: { dot: 'bg-sky-500', ring: 'border-sky-200 bg-sky-50 text-sky-800', pulse: true },
  stale: { dot: 'bg-amber-500', ring: 'border-amber-200 bg-amber-50 text-amber-800', pulse: false },
  offline: { dot: 'bg-amber-500', ring: 'border-amber-200 bg-amber-50 text-amber-800', pulse: false },
  error: { dot: 'bg-red-500', ring: 'border-red-200 bg-red-50 text-red-800', pulse: false },
}

// Sync pill + manual refresh for the RFF pages — takes the object returned by
// useRFFData() as-is.
export default function RFFSyncStatus({ rff }) {
  const { status, source, lastSyncedAt, refreshing, refresh, error } = rff
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Until the external RFF app is configured (VITE_RFF_FIREBASE_*), say so plainly
  // instead of a green "synced" — the numbers are this app's own local RFF data.
  const notConnected = source !== 'external'
  const label = notConnected ? 'RFF app not connected — showing local data' : {
    synced: 'Synced with RFF app',
    connecting: 'Connecting to RFF app…',
    stale: 'Showing last synced data',
    offline: 'Offline — showing last synced data',
    error: 'Not synced with RFF app',
  }[status]
  const tone = notConnected ? TONES.offline : (TONES[status] || TONES.connecting)

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${tone.ring}`}
          title={lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleString('en-IN')}` : undefined}
          role="status"
        >
          <span className="relative flex w-2 h-2">
            {tone.pulse && <span className={`absolute inset-0 rounded-full ${tone.dot} opacity-60 animate-ping`} />}
            <span className={`relative w-2 h-2 rounded-full ${tone.dot}`} />
          </span>
          <span className="whitespace-nowrap">{label}</span>
          {(status === 'synced' || status === 'stale') && lastSyncedAt && (
            <span className="hidden sm:inline font-normal opacity-70 whitespace-nowrap">· {timeAgo(lastSyncedAt, now)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh RFF data"
          title="Refresh now"
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all active:scale-95 disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>
      {status === 'error' && error && <p className="text-[11px] text-red-600 max-w-xs text-right">{error}</p>}
      {status === 'stale' && error && <p className="text-[11px] text-amber-700 max-w-xs text-right">{error}</p>}
    </div>
  )
}
