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

  const myFirstName = (userProfile?.displayName || userProfile?.name || '').split(' ')[0] || 'there'
  const myUid = userProfile?.id || ''
  const myEmail = (userProfile?.email || '').trim().toLowerCase()

  // Strict identity match — a roster entry's stored userId/email (resolved once,
  // server-side, when a director adds/edits that entry — see DirectorBoardTab's
  // resolveAccount) against this signed-in account's own uid/email. Deliberately
  // NOT a display-name comparison: two different people can share a display name,
  // which let an unrelated account see another director's meeting invite.
  const myRosterEntry = useMemo(() => {
    if (!myUid && !myEmail) return null
    const today = format(new Date(), 'yyyy-MM-dd')
    return members.find((m) => {
      if (m.to && m.to < today) return false
      return (!!myUid && m.userId === myUid) || (!!myEmail && (m.email || '').toLowerCase() === myEmail)
    }) || null
  }, [members, myUid, myEmail])
  const isRosterMember = !!myRosterEntry

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
          // The department this board member represents (per their roster entry,
          // set by whoever added them) — not a guess from this account's own
          // departments[], which can lag a step behind a freshly assigned role (see
          // firestore.rules' canAccessDept comment). board_meeting_points' `create`
          // rule is intentionally open to any signed-in account (not gated on
          // canAccessDept(department)) precisely because this value doesn't
          // necessarily match this account's own department access — see the rule's
          // comment in firestore.rules.
          department={myRosterEntry?.department || userProfile?.departments?.[0] || 'Sec-Core'}
          userEmail={userProfile?.email}
          userId={myUid}
          displayName={userProfile?.displayName || userProfile?.name || ''}
          meetingId={pointsMeetingId}
          onClose={() => setPointsMeetingId(null)}
        />
      )}
    </>
  )
}
