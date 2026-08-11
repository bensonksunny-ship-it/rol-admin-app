import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  getBoardMeeting,
  subscribeToBoardPoints,
  subscribeToDirectorBoard,
} from '../services/firestore'
import { formatCountdown } from '../utils/date'

// Full-screen "keynote" display for the extended-display half of the dual-screen
// Board Agenda presentation — no MainLayout chrome. "Which point is active" and its
// timer live directly on that point's own board_meeting_points doc (isActive/
// presentStatus/presentStartedAt/presentPausedElapsedSeconds), the same fields
// BoardAgendaTab's Live Controls bar writes to (Firestore-synced, not
// BroadcastChannel, so this survives a reload/crash independently of the
// controller tab). See docs/superpowers/specs/
// 2026-08-10-board-agenda-live-point-redesign.md.
export default function BoardPresentView() {
  const { meetingId } = useParams()
  const [meeting, setMeeting] = useState(null)
  const [points, setPoints] = useState([])
  const [members, setMembers] = useState([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    getBoardMeeting(meetingId).then(setMeeting).catch(() => setMeeting(null))
  }, [meetingId])

  useEffect(() => {
    return subscribeToBoardPoints(setPoints)
  }, [])

  useEffect(() => {
    return subscribeToDirectorBoard((d) => setMembers(d.members || []), () => setMembers([]))
  }, [])

  // Only accepted (Sl No + Time Allotted) points ever go live — matches the
  // controller's fixedPoints, which is the only set stagePoint can choose from.
  const fixedPoints = useMemo(
    () => (meeting ? points.filter(p => p.meetingDate === meeting.date && p.slNo && p.allottedTime) : []),
    [points, meeting]
  )
  const activePoint = fixedPoints.find(p => p.isActive) || null

  useEffect(() => {
    if (activePoint?.presentStatus !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activePoint?.presentStatus])

  const activeDirectorByDept = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const map = {}
    members.forEach(m => {
      if ((m.type && m.type !== 'director') || !m.department) return
      if (m.to && m.to < today) return
      if (!map[m.department]) map[m.department] = m.name
    })
    return map
  }, [members])

  const remainingSeconds = activePoint
    ? (Number(activePoint.durationMinutes) || 0) * 60
      - (activePoint.presentPausedElapsedSeconds || 0)
      - (activePoint.presentStatus === 'running' && activePoint.presentStartedAt?.toMillis ? (now - activePoint.presentStartedAt.toMillis()) / 1000 : 0)
    : null
  const isOvertime = remainingSeconds != null && remainingSeconds < 0

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex items-center justify-center p-12">
      {activePoint ? (
        <div className="max-w-5xl w-full text-center space-y-8">
          <div className="space-y-2">
            <p className="text-2xl sm:text-3xl font-bold text-indigo-300 uppercase tracking-widest">{activePoint.department}</p>
            <p className="text-lg sm:text-xl text-slate-400">
              {activeDirectorByDept[activePoint.department] || 'Director not assigned'}
            </p>
          </div>

          <p className="text-4xl sm:text-6xl font-black leading-tight">{activePoint.point}</p>

          <p className={`text-7xl sm:text-9xl font-black font-mono tabular-nums ${isOvertime ? 'text-red-500' : 'text-emerald-400'}`}>
            {remainingSeconds != null ? formatCountdown(remainingSeconds) : '—:—'}
          </p>
          {isOvertime && (
            <p className="text-xl sm:text-2xl font-bold text-red-500 uppercase tracking-widest">Overtime</p>
          )}
        </div>
      ) : (
        <div className="max-w-2xl w-full text-center space-y-4">
          <p className="text-3xl sm:text-4xl font-black">Waiting for the next point…</p>
          {meeting && (
            <p className="text-lg sm:text-xl text-slate-400">
              {meeting.title || 'Board Meeting'}
              {meeting.date && ` • ${format(new Date(meeting.date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
