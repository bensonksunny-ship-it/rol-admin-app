import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, ListPlus, Check, X } from 'lucide-react'

export default function NotifPanel({ isDay, notifications, posStyle, onAction, onAddToTodo, onDismiss, onClose }) {
  const [pendingIds, setPendingIds] = useState(() => new Set())
  // This panel is portaled to document.body, so it's never a DOM descendant of
  // whatever trigger button opened it. Owning outside-click detection here, against
  // this root's own ref, means "is this click inside the panel" is a real DOM
  // containment check — not a race between a parent's raw document listener and
  // React's synthetic event dispatch (which don't reliably order against each other,
  // so a parent-side listener could fire — and close/unmount this panel — before a
  // button's own onClick runs, silently swallowing "+ Add to To-Do" / "Ignore").
  const panelRef = useRef(null)

  useEffect(() => {
    if (!onClose) return
    const close = (e) => {
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
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
  }

  const withPending = async (n, fn) => {
    if (!fn || pendingIds.has(n.id)) return
    setPendingIds((prev) => new Set(prev).add(n.id))
    try {
      await fn(n)
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(n.id); return next })
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      className="w-72 rounded-2xl overflow-hidden"
      style={{
        position: 'fixed',
        zIndex: 100,
        maxWidth: 'calc(100vw - 24px)',
        background: isDay ? 'rgba(255,255,255,0.97)' : 'rgba(15,23,42,0.97)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        border: isDay ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        ...posStyle,
      }}
    >
      <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isDay ? 'border-slate-100' : 'border-slate-700/60'}`}>
        <p className={`text-sm font-bold ${isDay ? 'text-slate-800' : 'text-slate-100'}`}>Notifications</p>
        {notifications.length > 0 && (
          <span className="text-xs font-semibold text-indigo-500">{notifications.length} pending</span>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className={`px-4 py-6 text-center ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>
          <Bell size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No new notifications</p>
        </div>
      ) : (
        <div className={`overflow-y-auto max-h-80 divide-y ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
          {notifications.map((n) => (
            <div key={n.id} className={`px-4 py-3 transition-colors ${isDay ? 'hover:bg-violet-50' : 'hover:bg-slate-800/50'}`}>
              <button
                type="button"
                onClick={() => onAction && onAction(n)}
                className="w-full text-left"
              >
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDay ? 'text-violet-600' : 'text-violet-400'}`}>{n.title}</p>
                <p className={`text-sm ${isDay ? 'text-slate-700' : 'text-slate-200'}`}>{n.body}</p>
                {n.cellName && <p className={`text-xs mt-0.5 ${isDay ? 'text-slate-400' : 'text-slate-500'}`}>{n.cellName}</p>}
                {n.sentAt && <p className={`text-[10px] mt-1 ${isDay ? 'text-slate-300' : 'text-slate-600'}`}>{fmtDate(n.sentAt)}</p>}
                <p className={`text-xs font-semibold mt-1.5 ${isDay ? 'text-violet-600' : 'text-violet-400'}`}>
                  {n.type === 'visitor_proposal' ? 'Tap to review →'
                    : n.type === 'dlight_consult' ? 'Tap to respond →'
                    : n.type === 'consult_response' ? 'Tap to review →'
                    : 'Tap to fill →'}
                </p>
              </button>
              {(onAddToTodo || onDismiss) && (
                <div className="flex items-center gap-1.5 mt-2">
                  {onAddToTodo && (
                    <button
                      type="button"
                      disabled={pendingIds.has(n.id) || n.addedToTodo}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); withPending(n, onAddToTodo) }}
                      className={`flex-1 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors disabled:opacity-70 ${
                        n.addedToTodo
                          ? (isDay ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/15 text-emerald-300')
                          : (isDay ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25')
                      }`}
                    >
                      {n.addedToTodo
                        ? <><Check size={12} strokeWidth={2.5} /> Added</>
                        : <><ListPlus size={12} strokeWidth={2} /> Add to To-Do</>}
                    </button>
                  )}
                  {onDismiss && (
                    <button
                      type="button"
                      disabled={pendingIds.has(n.id)}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); withPending(n, onDismiss) }}
                      className={`inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        isDay ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <X size={12} strokeWidth={2} /> Ignore
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
