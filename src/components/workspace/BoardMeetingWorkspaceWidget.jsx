import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribeToDirectorBoard, subscribeToBoardMeetings } from '../../services/firestore'
import BoardPointsModal from '../BoardPointsModal'

// Single-banner idiom matching WorshipWorkspaceWidget's assignment header — one
// violet/indigo pill scoped to the single next upcoming meeting, not an expandable
// multi-meeting list. Self-hides entirely (no empty-state) unless the signed-in
// user is meant to be at the meeting — an active Director Board roster member, the
// current Chairman of the Board, or the Founder — and there's at least one upcoming
// scheduled meeting.
export default function BoardMeetingWorkspaceWidget() {
  const { userProfile, isFounder } = useAuth()
  const [members, setMembers] = useState([])
  const [chairman, setChairman] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [pointsMeetingId, setPointsMeetingId] = useState(null)

  useEffect(() => {
    const unsub = subscribeToDirectorBoard(
      (d) => { setMembers(d.members || []); setChairman(d.chairman || null) },
      () => { setMembers([]); setChairman(null) }
    )
    return unsub
  }, [])

  useEffect(() => {
    const unsub = subscribeToBoardMeetings(setMeetings, () => setMeetings([]))
    return unsub
  }, [])

  const myFirstName = (userProfile?.displayName || userProfile?.name || '').split(' ')[0] || 'there'
  const myUid = userProfile?.id || ''
  const myEmail = (userProfile?.email || '').trim().toLowerCase()
  const myName = (userProfile?.displayName || userProfile?.name || '').trim().toLowerCase()

  // Does a Director Board entry (a roster member, or the Chairman record) refer to
  // this signed-in account?
  //
  // Preferred: strict identity — the entry's stored userId/email (resolved once,
  // server-side, when a director adds/edits that entry — see DirectorBoardTab's
  // resolveAccount) against this account's own uid/email.
  //
  // Fallback: a display-name match, but ONLY for entries that were never linked to
  // an account (no userId AND no email). resolveAccount silently fails whenever the
  // roster name doesn't exactly match a user_directory entry, leaving those rows
  // with empty userId/email — and a strict-only match then shows the invite to
  // nobody. Restricting the name fallback to unlinked rows keeps the original
  // guarantee that a display-name twin can't see a *linked* director's invite
  // (the reason strict matching was introduced); DirectorBoardTab still surfaces
  // "⚠ Account not linked" so an admin can link the row properly.
  const matchesMe = useMemo(() => {
    const hasIdentity = myUid || myEmail || myName
    return (e) => {
      if (!e || !hasIdentity) return false
      if ((!!myUid && e.userId === myUid) || (!!myEmail && (e.email || '').toLowerCase() === myEmail)) return true
      return !e.userId && !e.email && !!myName && (e.name || '').trim().toLowerCase() === myName
    }
  }, [myUid, myEmail, myName])

  const myRosterEntry = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return members.filter((m) => !(m.to && m.to < today)).find(matchesMe) || null
  }, [members, matchesMe])
  const isChairman = useMemo(() => matchesMe(chairman), [chairman, matchesMe])

  const upcomingMeetings = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return meetings.filter((m) => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  }, [meetings])

  const canSeeWidget = (!!myRosterEntry || isChairman || isFounder) && upcomingMeetings.length > 0
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
