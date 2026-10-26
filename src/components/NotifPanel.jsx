import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, ListPlus, Check, X, ArrowRight, UserRound } from 'lucide-react'

export default function NotifPanel({ isDay, notifications, posStyle, onAction, onAddToTodo, onDismiss, onClose }) {
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const [actionError, setActionError] = useState(null)
  // This panel is portaled to document.body, so it's never a DOM descendant of
  // whatever trigger button opened it. Owning outside-click detection here, against
  // this root's own ref, means "is this click inside the panel" is a real DOM
  // containment check — not a race between a parent's raw document listener and
  // React's synthetic event dispatch (which don't reliably order against each other,
  // so a parent-side listener could fire — and close/unmount this panel — before a
  // button's own onClick runs, silently swallowing "Add to To-Do" / "Ignore").
  const panelRef = useRef(null)

  // Below the sm breakpoint (640px) this renders as a full-width bottom sheet instead
  // of the small w-72 box anchored to the bell button's bounding rect — that fixed-
  // width box routinely got squeezed/clipped against the mobile viewport edge with a
  // scroll-cramped list inside it. Desktop keeps the original anchored dropdown.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!onClose) return
    const close = (e) => {
      // The desktop backdrop closes on its own click (so that click is swallowed).
      if (e.target?.dataset?.notifBackdrop) return
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [onClose])

  const fmtDate = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return '' }
  }

  const actionLabel = (n) =>
    n.type === 'visitor_proposal' ? 'Tap to review'
      : n.type === 'dlight_consult' ? 'Tap to respond'
      : n.type === 'consult_response' ? 'Tap to review'
      : 'Tap to fill'

  const withPending = async (n, fn) => {
    if (!fn || pendingIds.has(n.id)) return
    setPendingIds((prev) => new Set(prev).add(n.id))
    setActionError(null)
    try {
      await fn(n)
    } catch (err) {
      // Surface the failure instead of letting the click look like it did nothing —
      // e.g. a permission-denied write previously just reverted silently a moment later.
      setActionError(err?.code || err?.message || 'Something went wrong. Please try again.')
      setTimeout(() => setActionError(null), 5000)
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(n.id); return next })
    }
  }

  // Glossy glass, not matte frosted-white: a top-to-bottom translucency gradient
  // (reads as a light source raking the surface) instead of one flat near-opaque
  // fill, a lighter backdrop blur so the page behind still shows through, and a
  // bright hairline + inset top highlight standing in for a specular sheen.
  const glassStyle = {
    // Near-opaque: at 62% the bright blue workspace ribbons behind the panel showed
    // through its lower half and read as if they were on top of it.
    background: isDay
      ? 'linear-gradient(to bottom, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.94) 100%)'
      : 'linear-gradient(to bottom, rgba(30,41,59,0.96) 0%, rgba(15,23,42,0.94) 100%)',
    backdropFilter: 'blur(12px) saturate(180%)',
    WebkitBackdropFilter: 'blur(12px) saturate(180%)',
    border: isDay ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.14)',
    boxShadow: isDay
      ? '0 16px 48px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)'
      : '0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12)',
  }

  const emptyState = (
    <div className={`px-4 py-8 text-center ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
      <Bell size={24} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">No new notifications</p>
    </div>
  )

  // Each notification as a self-contained card: department badge + timestamp on top,
  // bold title + full (never-truncated, word-wrapping) message body, then a spacious
  // three-button action bar — replaces the old whole-card-as-one-button plus tiny
  // nested text-link pattern.
  const cards = (
    <div className="space-y-3 p-3 pb-5">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`rounded-2xl border p-3 ${isDay ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isDay ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/15 text-violet-300'
            }`}>
              {n.department || 'Notification'}
            </span>
            {n.sentAt && (
              <span className={`text-[11px] shrink-0 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{fmtDate(n.sentAt)}</span>
            )}
          </div>
          <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>{n.title}</p>
          <p className={`text-sm mt-0.5 break-words ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>{n.body}</p>
          {/* Attribution: who raised it → who it is for. Falls back to the old
              cell-name line for any type that doesn't carry from/to yet. */}
          {(n.from || n.to) ? (
            <p className={`mt-2 pt-2 border-t flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs ${
              isDay ? 'border-slate-100 text-slate-500' : 'border-slate-700/60 text-slate-400'
            }`}>
              {n.from && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <UserRound size={12} className="shrink-0" aria-hidden />
                  <span>From:</span>
                  <span className={`font-semibold break-words ${isDay ? 'text-slate-700' : 'text-slate-200'}`}>{n.from}</span>
                </span>
              )}
              {n.to && (
                <span className="inline-flex items-center gap-1 min-w-0">
                  <ArrowRight size={12} className="shrink-0" aria-hidden />
                  <span>For:</span>
                  <span className={`font-semibold break-words ${isDay ? 'text-slate-700' : 'text-slate-200'}`}>{n.to}</span>
                </span>
              )}
            </p>
          ) : n.cellName && <p className={`text-xs mt-1 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{n.cellName}</p>}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {onAction && (
              <button
                type="button"
                onClick={() => onAction(n)}
                className={`flex-1 min-w-[8rem] whitespace-nowrap inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 rounded-full transition-colors ${
                  isDay ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-violet-500 text-white hover:bg-violet-400'
                }`}
              >
                {actionLabel(n)} <ArrowRight size={12} strokeWidth={2.5} />
              </button>
            )}
            {onAddToTodo && (
              <button
                type="button"
                disabled={pendingIds.has(n.id) || n.addedToTodo}
                onClick={() => withPending(n, onAddToTodo)}
                className={`inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 rounded-full transition-colors disabled:opacity-70 ${
                  n.addedToTodo
                    ? (isDay ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/15 text-emerald-300')
                    : (isDay ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25')
                }`}
              >
                {n.addedToTodo ? <><Check size={12} strokeWidth={2.5} /> Added</> : <><ListPlus size={12} strokeWidth={2} /> Add to To-Do</>}
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                disabled={pendingIds.has(n.id)}
                onClick={() => withPending(n, onDismiss)}
                className={`inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 rounded-full transition-colors disabled:opacity-50 ${
                  isDay ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <X size={12} strokeWidth={2} /> Ignore
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[99] bg-black/40" onClick={onClose} aria-hidden />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Notifications"
          className="fixed inset-x-0 bottom-0 z-[100] w-full max-h-[85vh] flex flex-col rounded-t-2xl overflow-hidden"
          style={glassStyle}
        >
          <div className={`shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Notifications</p>
              {notifications.length > 0 && (
                <span className="text-xs font-semibold text-indigo-500">{notifications.length} pending</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-colors ${
                isDay ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-600' : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
              }`}
            >
              <X size={16} />
            </button>
          </div>
          {actionError && (
            <p className="shrink-0 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border-b border-rose-100">
              {actionError}
            </p>
          )}
          {notifications.length === 0 ? emptyState : (
            <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-subtle ${isDay ? '' : 'scrollbar-dark'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {cards}
            </div>
          )}
        </div>
      </>,
      document.body
    )
  }

  // Desktop: anchored dropdown. Width and height are capped to the viewport (from the
  // panel's own top edge), and the header stays fixed while only the card list
  // scrolls, so the last card's action buttons are never cut off at the bottom.
  const PANEL_W = 384
  const top = posStyle?.top ?? 68
  const left = Math.max(12, Math.min(posStyle?.left ?? 12, window.innerWidth - PANEL_W - 12))
  return createPortal(
    <>
    {/* Transparent click-catcher: an outside click closes the panel without also
        landing on the dashboard card underneath. */}
    <div data-notif-backdrop="1" className="fixed inset-0 z-[99]" onClick={onClose} aria-hidden />
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className="w-96 rounded-2xl overflow-hidden flex flex-col"
      style={{
        position: 'fixed', zIndex: 100, maxWidth: 'calc(100vw - 24px)',
        maxHeight: `min(480px, calc(100vh - ${top}px - 16px))`,
        ...glassStyle, ...posStyle, top, left,
      }}
    >
      <div className={`shrink-0 px-4 py-2.5 flex items-center justify-between border-b ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
        <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Notifications</p>
        {notifications.length > 0 && (
          <span className="text-xs font-semibold text-indigo-500">{notifications.length} pending</span>
        )}
      </div>
      {actionError && (
        <p className="shrink-0 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 border-b border-rose-100">
          {actionError}
        </p>
      )}
      {notifications.length === 0 ? emptyState : (
        <div className={`flex-1 min-h-0 overflow-y-auto scrollbar-subtle ${isDay ? '' : 'scrollbar-dark'}`}>{cards}</div>
      )}
    </div>
    </>,
    document.body
  )
}
