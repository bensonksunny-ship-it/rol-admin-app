import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { CheckCircle2, Music2, PenSquare, X, Search, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import {
  getWorshipTeamMembers,
  getWorshipSongs,
  getAllWorshipSchedules,
  getWorshipScheduleByDate,
  setWorshipScheduleByDate,
} from '../../services/firestore'
import { hasFullWorshipAccess, hasWorshipRoleAccess, isWorshipLeader } from '../../utils/worshipAccess'
import UpcomingWorship from '../../pages/worship/UpcomingWorship'
import SongViewer from '../../pages/worship/SongViewer'

// Same "forthcoming Sunday" rule used by Assign/UpcomingWorship: today if it's Sunday
// before 6pm, otherwise the next Sunday. Duplicated here (rather than imported) so this
// widget stays self-contained, same convention as UpcomingWorship.jsx itself.
function getForthcomingSunday() {
  const now = new Date()
  const day = now.getDay()
  if (day === 0 && now.getHours() < 18) return format(now, 'yyyy-MM-dd')
  const daysTo = day === 0 ? 7 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return format(d, 'yyyy-MM-dd')
}

function isLeadVocalRole(role) {
  return /^lead vocal/i.test(String(role || '').trim())
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// Single unified "My Workspace" worship card — merges what used to be two stacked
// widgets (the "Share Your Song Setlist" banner and the "Hello {name}, you're
// assigned…" card) into one card so the workspace isn't showing two separate violet
// banners for what is, to the person looking at it, one topic: "what's going on with
// worship this week". "Share Setlist" surfaces as a badge in the shared header next to
// the greeting; its actual editor lives in the shared expanded body alongside the
// roster/status content that used to be the other widget's entire body.
//
// Puts "Upcoming Worship" straight on My Workspace for:
//   - anyone with account-level Worship access (Director/Founder/Admin, Worship
//     Leader, or Worship Member), same as before, OR
//   - anyone actually rostered on the worship team AND assigned in this coming
//     Sunday's schedule, regardless of what (if any) special position their account
//     holds. A vocalist/instrumentalist who is simply on the team roster previously
//     had no account-level Worship position at all, so the old `hasFullWorshipAccess
//     || hasWorshipRoleAccess` gate hid this widget from them entirely even on a
//     Sunday they're actually serving, OR
//   - anyone holding a Lead Vocal slot on any upcoming Sunday (not necessarily this
//     coming one) — they need a way in to share their setlist even if they're not
//     otherwise scheduled this week.
// No need to open the department dock's icon grid at all to see this Sunday's
// assignment/setlist. A quick read/practice surface only: "View Song" still opens the
// full arrangement, but there's no editing here — that stays inside the Worship
// department page itself.
export default function WorshipWorkspaceWidget() {
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const hasAccountWorshipAccess = hasFullWorshipAccess(userProfile) || hasWorshipRoleAccess(userProfile)
  // Any Worship Leader gets quick links straight into the Song Directory and a fresh
  // Design flow — the dock icon stays hidden for this role, so this widget is their
  // only path in without going through My Workspace. Previously this excluded a
  // Worship Leader who also happened to have full access (e.g. also Founder/Admin),
  // which meant some Worship Leader accounts never saw the shortcut at all.
  const isWorshipLeaderAccount = isWorshipLeader(userProfile)
  // "Distribute Plan to Team" (relocated here from the department page's Summary tab)
  // is a real distribution action, not a self-service one like Share Setlist — scoped
  // to who could actually manage the department page's Summary tab before (Director/
  // Founder/Admin) plus Worship Leader, not every rostered team member.
  const canDistributePlan = hasFullWorshipAccess(userProfile) || isWorshipLeaderAccount

  // Always collapsed on launch/reload — only the header banner ("Hello X, you're
  // assigned...") + "More" toggle shows until the user explicitly opens it, regardless
  // of whether they're scheduled this Sunday or have a setlist to share.
  const [expanded, setExpanded] = useState(false)
  const [allMembers, setAllMembers] = useState([])
  const [songs, setSongs] = useState([])
  // Every worship_schedule doc — feeds both "am I scheduled this coming Sunday" and
  // "which upcoming Sundays am I leading (Lead Vocal) on", one fetch instead of two.
  const [schedules, setSchedules] = useState([])
  const [viewingSong, setViewingSong] = useState(null)
  const [viewSongMode, setViewSongMode] = useState(null)
  // Overrides myWorshipMember's static profile positions when a caller (e.g. the
  // Combined Song Design & Parts card) already knows exactly which role(s) this
  // person is assigned for that specific song this week.
  const [viewSongPositions, setViewSongPositions] = useState(null)
  // "SONGS" header action menu (Worship Leader only) — Song Directory + Design My Song.
  const [songsMenuOpen, setSongsMenuOpen] = useState(false)
  // Song Directory now opens in-place as a full-screen overlay instead of navigating
  // away to /department/worship — Design My Song still deep-links there since it hands
  // off into the full Song Designer builder, a heavier flow this widget doesn't own.
  const [songDirectoryOpen, setSongDirectoryOpen] = useState(false)
  const [songDirectoryQuery, setSongDirectoryQuery] = useState('')
  const [distributing, setDistributing] = useState(false)

  // "Share Your Song Setlist" state — a self-service prompt for whoever is scheduled
  // as Lead Vocal (any Lead Vocal-N slot) on an upcoming Sunday, regardless of their
  // account role. Lets them pick their own songs/keys/notes for that date without
  // needing the Director to type it in on the Assign page. Writes straight to the
  // same worship_schedule document the Assign tab reads (read-fresh, merge, write),
  // so it's visible there the next time anyone opens/reloads that page.
  //
  // This also doubles as the "which date's roster/status am I viewing below" state —
  // defaults to the actual coming Sunday so that view is never lost, and a pill lets
  // the user switch to any Sunday they're leading beyond that.
  const [selectedDate, setSelectedDate] = useState(() => getForthcomingSunday())
  const [setlistRows, setSetlistRows] = useState([])
  const [loadingSetlistRows, setLoadingSetlistRows] = useState(false)
  const [searchOpenIdx, setSearchOpenIdx] = useState(null)
  const [sharingSetlist, setSharingSetlist] = useState(false)
  // `setlistShared` is the brief post-save "✓ Setlist Shared!" moment only — true for
  // a short window right after a successful save, then it flips back off on its own.
  const [setlistShared, setSetlistShared] = useState(false)
  // View-only by default — the song title/key rows render as plain text/badges, not
  // inputs, until this is explicitly toggled on via "Edit Setlist". `originalSetlistRows`
  // is a snapshot taken the moment editing starts, so "Cancel" can discard any
  // in-progress changes and restore exactly what was last loaded/saved.
  const [editingSetlist, setEditingSetlist] = useState(false)
  const [originalSetlistRows, setOriginalSetlistRows] = useState([])

  // Loaded for every signed-in user, not just accounts with a special Worship
  // position — an ordinary rostered team member needs this data just to find out
  // whether they're serving this Sunday, which is what decides whether this widget
  // shows for them at all (see canSeeWidget below).
  useEffect(() => {
    getWorshipTeamMembers('Worship').then(setAllMembers).catch(() => setAllMembers([]))
    getWorshipSongs().then(setSongs).catch(() => setSongs([]))
    getAllWorshipSchedules('Worship').then(setSchedules).catch(() => setSchedules([]))
  }, [])

  const myName = userProfile?.name?.trim().toLowerCase()
  const myWorshipMember = myName ? allMembers.find(m => m.name?.trim().toLowerCase() === myName) : null

  const forthcomingSunday = getForthcomingSunday()
  const scheduledMemberIds = useMemo(() => {
    const sch = schedules.find(s => s.date === forthcomingSunday)
    return new Set((sch?.assignments || []).map(a => a.memberId).filter(Boolean))
  }, [schedules, forthcomingSunday])
  const isScheduledThisSunday = !!myWorshipMember && scheduledMemberIds.has(myWorshipMember.id)
  const myFirstName = (myWorshipMember?.name || userProfile?.name || userProfile?.displayName || '').trim().split(/\s+/)[0]

  // Every upcoming (today or later) Sunday where I hold at least one Lead Vocal slot.
  const myLeadingDates = useMemo(() => {
    if (!myWorshipMember) return []
    const today = todayStr()
    return schedules
      .filter(s => s.date >= today && (s.assignments || []).some(a => a.memberId === myWorshipMember.id && isLeadVocalRole(a.role)))
      .map(s => s.date)
      .sort()
  }, [schedules, myWorshipMember])
  const canShareSetlist = myLeadingDates.length > 0
  // Song Directory access is purely the account-level Worship Leader role — a static
  // profile check, independent of this week's schedule/roster data entirely. Neither
  // "assigned Lead Vocal this Sunday" nor "is a Director/Founder/Admin" grants it on
  // their own: a Director only sees it if they *also* hold the Worship Leader role,
  // and a plain Worship Team Member never does, no matter what they're assigned this
  // week. Being independent of selectedDate/isScheduledThisSunday/etc. also means the
  // icon can't flicker away when toggling dates or switching card views.
  const showSongsAccess = isWorshipLeaderAccount

  // Every consecutive Sunday selectable in the pill bar, from the earliest relevant
  // date through the furthest Sunday this person leads — calendar math (+7 days), not
  // just whichever dates happen to already have a saved schedule doc. Previously this
  // only included the coming Sunday plus whatever's in myLeadingDates, which silently
  // skipped an in-between Sunday (e.g. 9 Aug) if nobody had been assigned to it yet.
  const selectableDates = useMemo(() => {
    const known = [forthcomingSunday, ...myLeadingDates]
    const earliest = known.reduce((min, d) => (d < min ? d : min), known[0])
    const furthest = known.reduce((max, d) => (d > max ? d : max), known[0])
    const dates = []
    const cursor = new Date(earliest + 'T12:00:00')
    while (format(cursor, 'yyyy-MM-dd') <= furthest) {
      dates.push(format(cursor, 'yyyy-MM-dd'))
      cursor.setDate(cursor.getDate() + 7)
    }
    return dates
  }, [forthcomingSunday, myLeadingDates])

  // Re-fetch fresh (not the possibly-stale bulk `schedules` snapshot) whenever the
  // selected date changes, so editing always starts from the latest saved data.
  useEffect(() => {
    if (!myWorshipMember) { setSetlistRows([]); return }
    let alive = true
    setLoadingSetlistRows(true)
    getWorshipScheduleByDate('Worship', selectedDate)
      .then(sch => {
        if (!alive) return
        const mine = (sch.assignments || []).filter(a => a.memberId === myWorshipMember.id && isLeadVocalRole(a.role))
        setSetlistRows(mine.map(a => ({ ...a })))
        setSetlistShared(false)
        setEditingSetlist(false)
      })
      .finally(() => { if (alive) setLoadingSetlistRows(false) })
    return () => { alive = false }
  }, [selectedDate, myWorshipMember])

  // Song Directory overlay — Esc closes it, same as clicking the backdrop or the X.
  useEffect(() => {
    if (!songDirectoryOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setSongDirectoryOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [songDirectoryOpen])

  const canSeeWidget = hasAccountWorshipAccess || isScheduledThisSunday || canShareSetlist
  if (!canSeeWidget) return null

  const openSongView = (song, mode = null, positions = null) => {
    setViewSongMode(mode)
    setViewSongPositions(positions)
    setViewingSong(song)
  }

  // Matches DepartmentWorship.jsx's canEditSong exactly (Director/Founder/Admin see
  // everything; a Worship Leader only their own designed songs) — gates "View Song"
  // (the full team arrangement) the same way it does on the Worship page itself.
  // Checks createdBy OR designedBy (either match grants access) rather than letting
  // the free-text designedBy credit field override a reliable createdBy match — see
  // canEditSong in DepartmentWorship.jsx for why.
  const canViewFullSong = (song) => {
    if (hasFullWorshipAccess(userProfile)) return true
    if (!isWorshipLeader(userProfile)) return false
    if (!myName) return false
    const designer = String(song?.designedBy || '').trim().toLowerCase()
    const creator = String(song?.createdBy || '').trim().toLowerCase()
    return myName === designer || myName === creator
  }

  const updateSetlistRow = (idx, patch) =>
    setSetlistRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  // Read-modify-write: fetch the latest doc right before saving and only touch this
  // person's own role rows, so a concurrent edit to someone else's role (e.g. the
  // Director assigning a different vocalist) in between isn't clobbered.
  const handleShareSetlist = async () => {
    setSharingSetlist(true)
    try {
      const fresh = await getWorshipScheduleByDate('Worship', selectedDate)
      const assignments = (fresh.assignments || []).map(a => {
        const mine = setlistRows.find(r => r.role === a.role)
        return mine ? { ...a, songName: mine.songName || '', songId: mine.songId || '', key: mine.key || '', notes: mine.notes || '' } : a
      })
      await setWorshipScheduleByDate('Worship', selectedDate, assignments, userProfile?.email)
      setEditingSetlist(false)
      setSetlistShared(true)
      setTimeout(() => setSetlistShared(false), 2500)
    } finally {
      setSharingSetlist(false)
    }
  }

  // Explicit Edit Setlist / Save Changes / Cancel toggle — view-only by default;
  // Cancel discards any in-progress edits by restoring the snapshot taken the moment
  // editing started, rather than re-fetching.
  const startEditingSetlist = () => {
    setOriginalSetlistRows(setlistRows.map(r => ({ ...r })))
    setEditingSetlist(true)
  }
  const cancelEditingSetlist = () => {
    setSetlistRows(originalSetlistRows.map(r => ({ ...r })))
    setEditingSetlist(false)
  }

  const highlighted = isScheduledThisSunday || canShareSetlist

  // "Distribute Plan to Team" — relocated from DepartmentWorship.jsx's Summary tab
  // (same canvas-drawn JPEG + download + WhatsApp-open flow, unchanged) so a Director/
  // Leader can share the formatted plan straight from My Workspace instead of having
  // to open the department page. Always fetches the selected date's plan fresh rather
  // than reusing the bulk `schedules` snapshot, matching the original's behavior.
  const generateAndSharePlan = async () => {
    setDistributing(true)
    try {
      const sunday = selectedDate
      const sch = await getWorshipScheduleByDate('Worship', sunday)
      const fas = sch?.assignments || []
      const assigned = fas.filter(a => a.memberId)
      const songLines = fas.filter(a => a.songName)
      const vocals = assigned.filter(a => /vocal|parts|choir/i.test(a.role))
      const band = assigned.filter(a => /guitar|bass|drum|keyboard/i.test(a.role))
      const tech = assigned.filter(a => /sound|media/i.test(a.role))
      const groups = [
        { label: 'VOCALS & CHOIR', items: vocals },
        { label: 'BAND', items: band },
        { label: 'TECH', items: tech },
        { label: 'SETLIST', items: songLines, isSongs: true },
      ].filter(g => g.items.length)

      const W = 800, PAD = 48
      const HEADER_H = 168, SECTION_H = 44, ROW_H = 38, GAP = 20, FOOTER_H = 60
      let contentH = GAP
      groups.forEach(g => { contentH += SECTION_H + g.items.length * ROW_H + GAP })
      const H = HEADER_H + contentH + FOOTER_H

      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#f5f3ff'
      ctx.fillRect(0, 0, W, H)

      const grad = ctx.createLinearGradient(0, 0, W, HEADER_H)
      grad.addColorStop(0, '#7c3aed')
      grad.addColorStop(1, '#5b21b6')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, HEADER_H)

      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.font = 'bold 18px Arial, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('ROL CHURCH', PAD, 52)

      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 34px Arial, sans-serif'
      ctx.fillText('SUNDAY WORSHIP PLAN', PAD, 100)

      ctx.fillStyle = 'rgba(255,255,255,0.82)'
      ctx.font = '22px Arial, sans-serif'
      ctx.fillText(format(new Date(sunday + 'T12:00:00'), 'EEEE, d MMMM yyyy'), PAD, 140)

      let y = HEADER_H + GAP
      groups.forEach((group, gi) => {
        if (gi > 0) y += GAP

        ctx.fillStyle = '#ede9fe'
        ctx.fillRect(0, y, W, SECTION_H - 6)
        ctx.fillStyle = '#6d28d9'
        ctx.font = 'bold 13px Arial, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(group.label, PAD, y + SECTION_H - 18)
        y += SECTION_H

        group.items.forEach((a, idx) => {
          ctx.fillStyle = idx % 2 === 0 ? '#fafafe' : '#ffffff'
          ctx.fillRect(0, y, W, ROW_H)

          if (group.isSongs) {
            ctx.fillStyle = '#a78bfa'
            ctx.font = 'bold 14px Arial, sans-serif'
            ctx.textAlign = 'right'
            ctx.fillText(String(idx + 1) + '.', PAD + 18, y + ROW_H - 11)
            ctx.fillStyle = '#1e1b4b'
            ctx.font = '600 16px Arial, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(a.songName || '', PAD + 28, y + ROW_H - 11)
            if (a.key) {
              const sw = ctx.measureText(a.songName || '').width
              ctx.fillStyle = '#94a3b8'
              ctx.font = '13px Arial, sans-serif'
              ctx.fillText(`(${a.key})`, PAD + 28 + sw + 8, y + ROW_H - 11)
            }
          } else {
            ctx.fillStyle = '#7c3aed'
            ctx.font = '13px Arial, sans-serif'
            ctx.textAlign = 'left'
            ctx.fillText(a.role.replace(/-\d+$/, ''), PAD, y + ROW_H - 11)
            ctx.fillStyle = '#111827'
            ctx.font = '600 16px Arial, sans-serif'
            ctx.fillText(a.memberName || '—', PAD + 220, y + ROW_H - 11)
          }
          y += ROW_H
        })
      })

      ctx.fillStyle = '#7c3aed'
      ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '14px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Generated by ROL Admin App', W / 2, H - FOOTER_H + 36)

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      const filename = `worship-plan-${sunday}.jpg`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      setTimeout(() => {
        if (isMobile) {
          window.location.href = 'whatsapp://'
        } else {
          window.open('https://web.whatsapp.com', '_blank')
        }
      }, 600)
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Could not generate plan image.')
    }
    setDistributing(false)
  }

  return (
    <>
      <div className={`w-full rounded-xl border shadow-sm overflow-hidden sm:max-w-2xl ${
        highlighted ? 'border-violet-300' : 'border-slate-200 bg-white'
      }`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded) } }}
          className={`w-full flex items-center justify-between gap-3 p-3 cursor-pointer transition-colors ${
            isScheduledThisSunday
              ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700'
              : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <span className={`min-w-0 text-sm font-bold ${isScheduledThisSunday ? 'text-white' : 'text-slate-800'}`}>
            {isScheduledThisSunday ? `Hello ${myFirstName || 'there'}, you are assigned for the worship team this week` : 'Upcoming Worship'}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {/* "SONGS" — quick access to both the Song Directory and the Design My Song
                flow for the Worship Leader position OR whoever is assigned Lead Vocal
                this coming Sunday, surfaced right in the shared header next to "More".
                Replaces the old "Share Setlist" badge here; the Share Your Song Setlist
                feature itself is unchanged and still lives in the expanded body below. */}
            {showSongsAccess && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setSongsMenuOpen(v => !v)}
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full transition-colors ${
                    isScheduledThisSunday ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
                  }`}
                >
                  Songs
                </button>
                {songsMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSongsMenuOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-full mt-1 z-20 flex items-center gap-1 p-1 bg-white rounded-xl border border-slate-200 shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setSongsMenuOpen(false); setSongDirectoryOpen(true) }}
                        title="Song Directory"
                        aria-label="Song Directory"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-indigo-700 hover:bg-indigo-50 transition-colors"
                      >
                        <Music2 size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSongsMenuOpen(false); navigate('/department/worship?tab=songsDirectory&newSong=1') }}
                        title="Design My Song"
                        aria-label="Design My Song"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-violet-700 hover:bg-violet-50 transition-colors"
                      >
                        <PenSquare size={17} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <span className={`flex items-center gap-1 text-xs ${isScheduledThisSunday ? 'text-white/90 font-semibold' : 'text-slate-400'}`}>
              {isScheduledThisSunday && 'More'}
              <span className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
            </span>
          </span>
        </div>
        {expanded && (
          <div className="border-t border-slate-100 bg-white p-4 space-y-4">
            {showSongsAccess && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSongDirectoryOpen(true)}
                  title="Song Directory" aria-label="Song Directory"
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors">
                  <Music2 size={18} />
                </button>
                <button type="button" onClick={() => navigate('/department/worship?tab=songsDirectory&newSong=1')}
                  title="Design My Song" aria-label="Design My Song"
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-50 border border-violet-100 text-violet-700 hover:bg-violet-100 transition-colors">
                  <PenSquare size={18} />
                </button>
              </div>
            )}

            {/* Your Song Setlist — view-only by default (formatted text/badges, never a
                stray editable input someone could accidentally type into); an explicit
                "Edit Setlist" toggle unlocks the song-name/key inputs, and the header
                button becomes "Save Changes"/"Cancel" while editing. */}
            {canShareSetlist && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Your Song Setlist</p>
                  {!editingSetlist ? (
                    <button
                      type="button"
                      onClick={startEditingSetlist}
                      className="text-xs font-semibold text-violet-600 bg-white border border-violet-200 hover:bg-violet-100 px-3 py-1.5 rounded-full transition-colors active:scale-95"
                    >
                      Edit Setlist
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelEditingSetlist}
                        disabled={sharingSetlist}
                        className="text-xs font-medium text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={sharingSetlist || loadingSetlistRows || setlistRows.length === 0}
                        onClick={handleShareSetlist}
                        className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-3 py-1.5 rounded-full transition-colors active:scale-95"
                      >
                        {sharingSetlist ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Viewing</span>
                  {selectableDates.map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`h-9 px-4 inline-flex items-center justify-center rounded-full text-sm font-semibold border transition-colors active:scale-95 ${
                        selectedDate === d
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400 hover:text-violet-700'
                      }`}
                    >
                      {d === forthcomingSunday ? 'Coming Sunday' : format(new Date(d + 'T12:00:00'), 'EEE d MMM')}
                    </button>
                  ))}
                </div>

                {loadingSetlistRows ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                ) : !editingSetlist ? (
                  /* View-only: formatted text cards — role badge, song title, key badge.
                     No inputs at all, so nothing here can be accidentally modified. */
                  <div className="space-y-1.5">
                    {setlistRows.map(row => (
                      <div
                        key={row.role}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">{row.role}</p>
                          <p className={`text-sm truncate ${row.songName ? 'font-semibold text-slate-800' : 'italic text-slate-400 font-normal'}`}>
                            {row.songName || 'No song set yet'}
                          </p>
                        </div>
                        {row.key && (
                          <span className="shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {row.key}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {setlistRows.map((row, idx) => {
                      const q = (row.songName || '').toLowerCase()
                      // Only suggest songs this person personally designed — everyone can still
                      // type any freeform song name (the <input> below has no such restriction),
                      // but the autocomplete/select-from-catalog path is scoped to their own
                      // designs so they're never offered another leader's song to pick. Matches
                      // on createdBy OR designedBy (either grants access) — see canEditSong in
                      // DepartmentWorship.jsx for why designedBy alone isn't reliable ownership.
                      const matches = songs
                        .filter(s => {
                          if (!myName) return false
                          const designer = String(s?.designedBy || '').trim().toLowerCase()
                          const creator = String(s?.createdBy || '').trim().toLowerCase()
                          return myName === designer || myName === creator
                        })
                        .filter(s => !q || s.title?.toLowerCase().includes(q))
                        .slice(0, 8)
                      const linkedSong = row.songId ? songs.find(s => s.id === row.songId) : null
                      return (
                        <div key={row.role} className="rounded-xl border border-slate-200 bg-white p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-600 mb-2">{row.role}</p>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={row.songName || ''}
                                placeholder="Search songs or type a name"
                                onChange={e => updateSetlistRow(idx, { songName: e.target.value, songId: '', key: '' })}
                                onFocus={() => setSearchOpenIdx(idx)}
                                onBlur={() => setTimeout(() => setSearchOpenIdx(i => (i === idx ? null : i)), 150)}
                                className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                              />
                              {searchOpenIdx === idx && matches.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                                  {matches.map(s => (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => { updateSetlistRow(idx, { songName: s.title, key: s.key || '', songId: s.id }); setSearchOpenIdx(null) }}
                                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2"
                                    >
                                      <span className="truncate font-medium text-slate-700">{s.title}</span>
                                      {s.key && <span className="text-xs text-indigo-600 font-semibold shrink-0">{s.key}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              value={row.key || ''}
                              placeholder="Key"
                              onChange={e => updateSetlistRow(idx, { key: e.target.value })}
                              className="w-16 px-2 py-1.5 text-sm text-center rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-200"
                            />
                          </div>
                          {linkedSong && (
                            <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[11px] font-semibold text-indigo-700">
                              ✓ Design linked{linkedSong.key ? ` · ${linkedSong.key}` : ''}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    <p className="text-[11px] text-slate-400 text-center">
                      The team will see this on the Assign page next time they open it.
                    </p>
                  </div>
                )}

                {setlistShared && (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 size={14} /> Setlist Shared!
                  </p>
                )}
              </div>
            )}

            <UpcomingWorship
              myWorshipMember={myWorshipMember}
              songs={songs}
              onViewSong={openSongView}
              canViewFullSong={canViewFullSong}
              selectedDate={selectedDate}
              canAssignTeam={canDistributePlan}
            />

            {/* Distribute Plan to Team — footer action, placed below the full roster so
                leaders review every song/team assignment before sending it out. */}
            {canDistributePlan && (
              <button
                type="button"
                disabled={distributing}
                onClick={generateAndSharePlan}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition active:scale-95"
              >
                <Send size={14} />
                {distributing ? 'Generating…' : 'Distribute Plan to Team'}
              </button>
            )}
          </div>
        )}
      </div>
      {/* Song Directory — opens in place as a full-screen overlay instead of navigating
          away from My Workspace to /department/worship. Search + browse + "View Song"/
          "My Part" only; adding/editing a song still hands off to the full Song
          Designer builder via "Design My Song" (a real page, not duplicated here). */}
      {songDirectoryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setSongDirectoryOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Song Directory"
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full sm:h-auto sm:max-h-[calc(100vh-3rem)] max-w-7xl mx-auto flex flex-col bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl border border-white/40 overflow-hidden"
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Music2 size={18} className="text-indigo-600" />
                <h2 className="text-base font-bold text-slate-800">Song Directory</h2>
              </div>
              <button
                type="button"
                onClick={() => setSongDirectoryOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 py-3 border-b border-slate-100">
              <div className="relative max-w-md">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={songDirectoryQuery}
                  onChange={(e) => setSongDirectoryQuery(e.target.value)}
                  placeholder="Search songs by title or artist…"
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {(() => {
                const q = songDirectoryQuery.trim().toLowerCase()
                const filtered = songs.filter(s =>
                  !q || s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
                )
                if (filtered.length === 0) {
                  return <p className="text-center text-sm text-slate-400 py-10">No songs found.</p>
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(song => (
                      <div key={song.id} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2 shadow-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{song.title}</p>
                          <p className="text-xs text-slate-400 truncate">{[song.artist, song.key].filter(Boolean).join(' · ')}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-auto">
                          {canViewFullSong(song) && (
                            <button
                              type="button"
                              onClick={() => { setSongDirectoryOpen(false); openSongView(song, 'full') }}
                              className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                            >
                              View Song
                            </button>
                          )}
                          {myWorshipMember && (
                            <button
                              type="button"
                              onClick={() => { setSongDirectoryOpen(false); openSongView(song, 'mine') }}
                              className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full hover:bg-emerald-100 transition-colors"
                            >
                              My Part
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
      {viewingSong && (
        <SongViewer
          song={viewingSong}
          canManage={false}
          myPositions={viewSongPositions || myWorshipMember?.positions || []}
          initialViewMode={viewSongMode}
          onClose={() => setViewingSong(null)}
          onEdit={() => {}}
        />
      )}
    </>
  )
}
