import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'

export default function NotifPanel({ isDay, notifications, posStyle, onAction }) {
  const fmtDate = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
  }
  return createPortal(
    <div
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
        <div className={`overflow-y-auto max-h-72 divide-y ${isDay ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onAction && onAction(n)}
              className={`w-full text-left px-4 py-3 transition-colors ${isDay ? 'hover:bg-violet-50' : 'hover:bg-slate-800/50'}`}
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
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
