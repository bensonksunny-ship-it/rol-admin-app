import { Bell } from 'lucide-react'

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return '' }
}

function actionLabel(type) {
  if (type === 'visitor_proposal') return 'Tap to review →'
  if (type === 'dlight_consult') return 'Tap to respond →'
  if (type === 'consult_response') return 'Tap to review →'
  return 'Tap to fill →'
}

// Unified cross-department "pending action" feed — the same data (and same deep-link
// navigation) that already drives the sidebar's notification bell, shown here as a
// persistent list instead of a transient popover. See useActionNotifications.
export default function PendingActionsCard({ notifications, onAction }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center flex-shrink-0">
            <Bell size={18} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">Pending Actions</p>
            <p className="text-xs text-slate-400 mt-0.5">{notifications.length} pending</p>
          </div>
        </div>
      </div>
      {notifications.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">No pending actions 🎉</p>
      ) : (
        <div className="divide-y divide-slate-50 overflow-y-auto max-h-80">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onAction(n)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                {n.department && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 flex-shrink-0">
                    [{n.department}]
                  </span>
                )}
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 truncate">{n.title}</p>
              </div>
              <p className="text-sm text-slate-700 mt-0.5">{n.body}</p>
              <div className="flex items-center justify-between mt-1">
                {n.cellName ? <p className="text-xs text-slate-400">{n.cellName}</p> : <span />}
                {n.sentAt && <p className="text-[10px] text-slate-300">{fmtDate(n.sentAt)}</p>}
              </div>
              <p className="text-xs font-semibold mt-1 text-violet-600">{actionLabel(n.type)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
