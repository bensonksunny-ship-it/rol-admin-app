import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { subscribeToDirectorBoard, subscribeToBoardMeetings } from '../../services/firestore'
import BoardPointsModal from '../BoardPointsModal'

// Same collapsed/expanded card idiom as WorshipWorkspaceWidget.jsx — a highlighted
// header row (gradient when there's something to act on) that expands into a body
// with per-item action cards. Self-hides entirely (no empty-state) unless the signed-
// in user is an active Director Board roster member with at least one upcoming
// scheduled meeting, same gating idiom as canSeeWidget there.
export default function BoardMeetingWorkspaceWidget() {
  const { userProfile } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState([])
  const [meetings, setMeetings] = useState([])
  const [pointsMeetingId, setPointsMeetingId] = useState(null)

  useEffect(() => {
    const unsub = subscribeToDirectorBoard((d) => setMembers(d.members || []), () => setMembers([]))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToBoardMeetings(setMeetings, () => setMeetings([]))
    return unsub
  }, [])

  const myName = (userProfile?.displayName || userProfile?.name || '').trim().toLowerCase()
  const myFirstName = (userProfile?.displayName || userProfile?.name || '').split(' ')[0] || 'there'

  const isRosterMember = useMemo(() => {
    if (!myName) return false
    const today = format(new Date(), 'yyyy-MM-dd')
    return members.some((m) => (m.name || '').trim().toLowerCase() === myName && (!m.to || m.to >= today))
  }, [members, myName])

  const upcomingMeetings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return meetings.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [meetings])

  const canSeeWidget = isRosterMember && upcomingMeetings.length > 0
  if (!canSeeWidget) return null

  const nextMeeting = upcomingMeetings[0]

  return (
    <>
      <div className="w-full rounded-xl border border-amber-300 shadow-sm overflow-hidden sm:max-w-2xl">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } }}
          className="w-full flex items-center justify-between gap-3 p-3 cursor-pointer transition-colors bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
        >
          <span className="min-w-0 text-sm font-bold text-white truncate">
            Hello {myFirstName}, a Board Meeting is scheduled — {nextMeeting.title || 'Board Meeting'} on{' '}
            {format(new Date(nextMeeting.date + 'T00:00:00'), 'd MMM')}
          </span>
          <span className="flex items-center gap-2 shrink-0 text-white/90 font-semibold text-xs">
            More
            <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
          </span>
        </div>

        {expanded && (
          <div className="border-t border-slate-100 bg-white p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Upcoming Board Meetings</p>
            {upcomingMeetings.map((m) => (
              <div key={m.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.title || 'Board Meeting'}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {format(new Date(m.date + 'T00:00:00'), 'EEE, d MMM yyyy')}
                    {m.time ? ` · ${m.time}` : ''}
                    {m.venue ? ` · ${m.venue}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPointsMeetingId(m.id)}
                  className="flex-shrink-0 text-xs font-semibold text-amber-700 bg-white border border-amber-300 hover:bg-amber-100 px-3 py-1.5 rounded-full transition-colors active:scale-95"
                >
                  Submit Point
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pointsMeetingId && (
        <BoardPointsModal
          department={userProfile?.departments?.[0] || 'Sec-Core'}
          userEmail={userProfile?.email}
          meetingId={pointsMeetingId}
          onClose={() => setPointsMeetingId(null)}
        />
      )}
    </>
  )
}
