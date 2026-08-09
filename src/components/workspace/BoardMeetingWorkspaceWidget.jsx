import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribeToDirectorBoard, subscribeToBoardMeetings } from '../../services/firestore'
import BoardPointsModal from '../BoardPointsModal'

// Single-banner idiom matching WorshipWorkspaceWidget's assignment header — one
// violet/indigo pill scoped to the single next upcoming meeting, not an expandable
// multi-meeting list. Self-hides entirely (no empty-state) unless the signed-in user
// is an active Director Board roster member with at least one upcoming scheduled
// meeting, same gating idiom as canSeeWidget there.
export default function BoardMeetingWorkspaceWidget() {
  const { userProfile } = useAuth()
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
    return meetings.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  }, [meetings])

  const canSeeWidget = isRosterMember && upcomingMeetings.length > 0
  if (!canSeeWidget) return null

  const nextMeeting = upcomingMeetings[0]

  return (
    <>
      <div className="w-full rounded-xl border border-violet-300 shadow-sm overflow-hidden sm:max-w-2xl">
        <div className="w-full flex items-center justify-between gap-3 p-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
          <span className="min-w-0 text-sm font-bold text-white truncate">
            Hello {myFirstName}, you are invited to the Director Board Meeting on{' '}
            {format(new Date(nextMeeting.date + 'T00:00:00'), 'd MMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setPointsMeetingId(nextMeeting.id)}
            className="flex items-center gap-1 shrink-0 text-white/90 hover:text-white font-semibold text-xs transition-colors"
          >
            More
            <ChevronRight size={14} />
          </button>
        </div>
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
