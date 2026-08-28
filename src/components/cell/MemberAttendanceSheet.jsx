import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import MemberFormFields from './MemberFormFields'
import { memberToForm } from '../../utils/cellMemberForm'

const STATUSES = [
  { key: 'present', label: 'Present' },
  { key: 'absent',  label: 'Absent' },
  { key: 'excused', label: 'Excused' },
]

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?'
}

// Per-member sheet opened from the Mid-week Attendance grid: set this week's
// attendance status (+ reason / follow-up note) and edit the member's profile,
// both without leaving the meeting view. The two blocks save independently.
export default function MemberAttendanceSheet({
  member, detail, present, savingProfile,
  onSaveAttendance, onSaveProfile, onClose,
}) {
  const [status, setStatus] = useState(detail?.status || (present ? 'present' : 'absent'))
  const [reason, setReason] = useState(detail?.reason || '')
  const [note, setNote]     = useState(detail?.note || '')
  const [form, setForm]     = useState(() => memberToForm(member))

  const showReason = status === 'absent' || status === 'excused'

  return (
    <>
      <motion.div
        key="mas-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      <motion.div
        key="mas-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none"
      >
        <div className="w-full max-w-[480px] max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
            <span className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {initials(member?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{member?.name || 'Member'}</p>
              <p className="text-xs text-slate-400">Attendance &amp; profile</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 active:scale-90 transition-all flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Attendance block */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">This Week</p>

              <div className="grid grid-cols-3 gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatus(s.key)}
                    className={`min-h-[44px] rounded-2xl text-sm font-semibold border transition-colors ${
                      status === s.key
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {showReason && (
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={status === 'excused' ? 'Reason for excusal' : 'Reason for absence'}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Follow-up note (optional)"
                rows={2}
                className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />

              <button
                type="button"
                onClick={() => onSaveAttendance(status, reason, note)}
                className="w-full min-h-[44px] rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all"
              >
                Save attendance
              </button>
            </div>

            <div className="border-t border-slate-100" />

            {/* Profile block */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Profile</p>
              <MemberFormFields form={form} onChange={setForm} />
              <button
                type="button"
                onClick={() => onSaveProfile(form)}
                disabled={savingProfile}
                className="w-full min-h-[44px] rounded-2xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 active:scale-95 transition-all disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
