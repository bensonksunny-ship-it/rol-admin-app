// Scheduled call / meeting for the membership pipeline: the cell leader's Stage 5
// call (membershipPipeline.cellLeaderVerification.scheduledCall) and the deacon's
// Stage 6 interview (membershipPipeline.deaconInterview.scheduledInterview).
// Shape: { at: 'YYYY-MM-DDTHH:MM', date, time, mode: 'phone' | 'in_person',
//          phone, location, notes, scheduledBy, updatedAt }.

export const MEETING_MODES = [
  { value: 'phone', label: '📞 Phone Call' },
  { value: 'in_person', label: '🤝 Face-to-Face' },
]

/** "Sat, 10 Oct 2026, 12:00 pm · 📞 Phone Call" for a saved schedule, or ''. */
export function scheduleSummary(s) {
  if (!s?.at) return ''
  const d = new Date(s.at)
  if (isNaN(d.getTime())) return ''
  const when = d.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  const mode = MEETING_MODES.find((m) => m.value === s.mode)?.label || ''
  return [when, mode].filter(Boolean).join(' · ')
}

/** Phone number or place, whichever the mode uses. */
export const scheduleWhere = (s) => (s?.mode === 'in_person' ? s.location : s?.phone) || ''
