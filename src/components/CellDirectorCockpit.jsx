import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { format, startOfWeek } from 'date-fns'
import {
  getCellGroupMembers,
  getRecentSundayReports,
  getLatestCellReports,
  addCellGroupMember,
  updateCellGroupMember,
  deactivateCellGroupMember,
  transferCellMember,
  deleteCellMemberPendingChange,
  updateTask,
  createTask,
  subscribePCSReferralTasks,
  subscribeCellDlightConsultTasks,
  subscribeCellLeaderDirectorNotes,
  markCellLeaderDirectorNoteRead,
  dismissUnassignedPerson,
  undismissUnassignedPerson,
  subscribeCellUnassignedDismissals,
} from '../services/firestore'
import { totalAttendanceFromCellReport, weekStartKey } from '../utils/cellWeek'
import DirectorDashboardCellWidgets, { CellMemberGrowthChart } from './DirectorDashboard'

function initials(name) {
  return String(name || '')
    .split(' ')
    .slice(0, 2)
    .map((w) => (w[0] || '').toUpperCase())
    .join('')
}

const CHANGE_TYPE_STYLES = {
  add:        'bg-emerald-100 text-emerald-700',
  deactivate: 'bg-red-100 text-red-700',
  activate:   'bg-blue-100 text-blue-700',
  edit:       'bg-slate-100 text-slate-600',
  transfer:   'bg-indigo-100 text-indigo-700',
}

export function CellDirectorCockpit({
  userProfile,
  cellGroups,
  cellPendingChanges,
  loadingCellPending,
  onChangeResolved,
  tasks = [],
  onTaskUpdated,
  onNavigateToCellGroups,
  initialUnassignedFilter = false,
  onUnassignedFilterChange,
}) {
  const [cellMemberData, setCellMemberData] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)

  const [unassignedVisitors, setUnassignedVisitors] = useState([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(true)
  const [assignedNames, setAssignedNames] = useState(new Set())

  const [drawerOpen, setDrawerOpen] = useState(false)
  // Opens on mount when arriving via the Unassigned stat card's deep link
  // (?tab=summary&filter=unassigned) so the drawer is reachable/shareable as a URL,
  // not just a local click. Closing (either close button or backdrop) clears the
  // filter param back out through onUnassignedFilterChange.
  useEffect(() => {
    if (initialUnassignedFilter) setDrawerOpen(true)
  }, [initialUnassignedFilter])
  const openUnassignedDrawer = useCallback(() => {
    setDrawerOpen(true)
    onUnassignedFilterChange?.(true)
  }, [onUnassignedFilterChange])
  const closeUnassignedDrawer = useCallback(() => {
    setDrawerOpen(false)
    onUnassignedFilterChange?.(false)
  }, [onUnassignedFilterChange])
  const pendingChangesRef = useRef(null)
  const [pendingHighlight, setPendingHighlight] = useState(false)
  const focusPendingChanges = useCallback(() => {
    pendingChangesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingHighlight(true)
    setTimeout(() => setPendingHighlight(false), 1500)
  }, [])
  const [assignOpenName, setAssignOpenName] = useState(null)
  const [assignSelectedCellId, setAssignSelectedCellId] = useState('')
  const [assigning, setAssigning] = useState(false)
  // Sunday-attendance-derived rows have no backing doc — name is their only
  // identity — so dismissal there is necessarily name-keyed (see
  // cell_unassigned_dismissals below, whose doc id *is* the name key).
  const [dismissedNames, setDismissedNames] = useState(new Set())
  // PCS/D-Light-referral rows are backed by a real task doc, so their dismissal is
  // keyed by taskId instead — two referrals that happen to share a person's name
  // (duplicate submissions, etc.) must never share dismiss/undo state.
  const [dismissedTaskIds, setDismissedTaskIds] = useState(new Set())
  // Durable, cross-session dismissal record for Sunday-report-sourced cards (which
  // have no task/member doc of their own to persist a "handled" state onto).
  // `dismissedNames` above stays as the optimistic/instant local layer.
  const [persistedDismissedNames, setPersistedDismissedNames] = useState(new Set())
  useEffect(() => {
    const unsub = subscribeCellUnassignedDismissals(setPersistedDismissedNames)
    return unsub
  }, [])

  // "Undo" on a dismiss toast overrides persistedDismissedNames until the
  // subscription above confirms the durable record is actually gone (undismiss is
  // async, so there's a brief window where the old dismissal doc still exists).
  // Pruned here once that happens, so it never grows unbounded across a session.
  const [restoredNames, setRestoredNames] = useState(new Set())
  useEffect(() => {
    setRestoredNames((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((k) => persistedDismissedNames.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [persistedDismissedNames])


  // Live PCS referral tasks — independent of parent tasks prop so they update in real time
  const [livePcsTasks, setLivePcsTasks] = useState([])
  useEffect(() => {
    const unsub = subscribePCSReferralTasks(setLivePcsTasks)
    return unsub
  }, [])

  // Live "consult D Light Director" tasks — drives the row status badge
  const [dlightConsultTasks, setDlightConsultTasks] = useState([])
  useEffect(() => {
    const unsub = subscribeCellDlightConsultTasks(setDlightConsultTasks)
    return unsub
  }, [])

  // Live leader notes sent via "Message Cell Director" (the ! icon in MyFellowship) —
  // surfaced in Pending Member Changes alongside actual member-change requests, since
  // that's the one place directors already check for anything needing their attention.
  const [leaderNotes, setLeaderNotes] = useState([])
  const [resolvingNoteId, setResolvingNoteId] = useState(null)
  useEffect(() => {
    const unsub = subscribeCellLeaderDirectorNotes(setLeaderNotes)
    return unsub
  }, [])

  const dlightConsultByName = useMemo(() => {
    const m = new Map()
    for (const t of dlightConsultTasks) {
      const key = String(t.consultPersonName || '').trim().toLowerCase()
      if (key) m.set(key, t)
    }
    return m
  }, [dlightConsultTasks])

  const [consultOpenName, setConsultOpenName] = useState(null)
  const [consultNote, setConsultNote]         = useState('')
  const [sendingConsult, setSendingConsult]   = useState(false)

  const [toast, setToast] = useState(null)
  const showToast = useCallback((msg, type = 'success', action = null) => {
    setToast({ msg, type, action })
    setTimeout(() => setToast(null), action ? 6000 : 3500)
  }, [])

  const activeCells = useMemo(
    () => (cellGroups || []).filter((g) => g.status !== 'inactive'),
    [cellGroups]
  )

  useEffect(() => {
    if (activeCells.length === 0) {
      setCellMemberData([])
      setLoadingMembers(false)
      return
    }
    setLoadingMembers(true)
    Promise.all(
      activeCells.map(async (g) => {
        const members = await getCellGroupMembers(g.id)
        const active = members.filter((m) => m.status !== 'inactive')
        const rawName = g.cellName || g.id
        return {
          cellId: g.id,
          cellName: rawName.length > 14 ? `${rawName.slice(0, 12)}…` : rawName,
          memberCount: active.length,
          names: active
            .map((m) => String(m.name || '').trim().toLowerCase())
            .filter(Boolean),
        }
      })
    )
      .then(setCellMemberData)
      .catch(() => setCellMemberData([]))
      .finally(() => setLoadingMembers(false))
  }, [activeCells])

  const totalMembers = useMemo(
    () => cellMemberData.reduce((s, c) => s + c.memberCount, 0),
    [cellMemberData]
  )
  const memberNamesSet = useMemo(
    () => new Set(cellMemberData.flatMap((c) => c.names)),
    [cellMemberData]
  )

  // This week's cell reports — joined onto growthData so the chart can compare
  // active member count against who actually attended this week's meeting.
  const [weeklyReports, setWeeklyReports] = useState([])
  useEffect(() => {
    getLatestCellReports(500).then(setWeeklyReports).catch(() => setWeeklyReports([]))
  }, [])

  // Bucketed by cellId + the Monday-anchored week the report's own date falls
  // in — not by guessing an "expected" date from the cell's configured
  // meetingDay. That guess silently misses (shows 0 attended) for any cell
  // with a missing/wrong meetingDay or one that met on an unusual day.
  const reportsByCellWeek = useMemo(() => {
    const m = new Map()
    for (const r of weeklyReports) {
      if (!r?.cellId || !r?.reportDate) continue
      const wk = weekStartKey(String(r.reportDate).slice(0, 10))
      if (!m.has(r.cellId)) m.set(r.cellId, new Map())
      m.get(r.cellId).set(wk, r)
    }
    return m
  }, [weeklyReports])

  const currentWeekKey = useMemo(
    () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    []
  )

  const growthData = useMemo(
    () => cellMemberData.map(({ cellId, cellName, memberCount }) => {
      const cell = activeCells.find((c) => c.id === cellId)
      const report = reportsByCellWeek.get(cellId)?.get(currentWeekKey)
        || (cell && cell.cellId !== cellId ? reportsByCellWeek.get(cell.cellId)?.get(currentWeekKey) : null)
      return { cellName, memberCount, attended: totalAttendanceFromCellReport(report) }
    }),
    [cellMemberData, activeCells, reportsByCellWeek, currentWeekKey]
  )

  useEffect(() => {
    if (loadingMembers) return
    setLoadingUnassigned(true)
    getRecentSundayReports(8)
      .then((reports) => {
        const nameMap = new Map()
        for (const report of reports) {
          for (const raw of report.secondWeekAttendeesNames) {
            const key = raw.trim().toLowerCase()
            if (!key) continue
            if (!nameMap.has(key)) nameMap.set(key, { name: raw.trim(), weekCount: 0, nonCell: false })
            nameMap.get(key).weekCount++
          }
          for (const raw of (report.nonCell || [])) {
            const key = raw.trim().toLowerCase()
            if (!key) continue
            if (!nameMap.has(key)) nameMap.set(key, { name: raw.trim(), weekCount: 1, nonCell: true })
            else { nameMap.get(key).weekCount++; nameMap.get(key).nonCell = true }
          }
        }
        const unassigned = []
        for (const [key, entry] of nameMap) {
          if (!memberNamesSet.has(key)) unassigned.push(entry)
        }
        unassigned.sort((a, b) => b.weekCount - a.weekCount)
        setUnassignedVisitors(unassigned)
      })
      .catch(() => setUnassignedVisitors([]))
      .finally(() => setLoadingUnassigned(false))
  }, [loadingMembers, memberNamesSet])

  // PCS referrals merged into the unassigned list — derived from live listener, not prop.
  // Carries its own recommendation fields (rather than only ever being matched against
  // dlightConsultByName) because the To-Do List's "Add [Name] to a cell group" click now
  // opens DepartmentHub's Recommendation modal directly on *this same task doc*
  // (?openPcsReferralTaskId=, see ToDoListCard.jsx + DepartmentHub.jsx) — submitting it
  // writes recommendation/recommendedCellId/status:'Responded' straight onto here.
  const pcsReferrals = useMemo(() => {
    const mapped = livePcsTasks.map(t => ({
      id: t.id,
      name: t.pcsPersonName || (t.taskTitle || '').replace(/^Add /, '').replace(/ to a cell group$/, ''),
      phone: t.pcsPersonPhone || '',
      visitorId: t.pcsPersonVisitorId || '',
      taskId: t.id,
      source: 'pcs',
      status: t.status || 'Pending',
      recommendation: t.recommendation || '',
      recommendedCellId: t.recommendedCellId || '',
      recommendedCellName: t.recommendedCellName || '',
    }))
    // Client-side consolidation — two separate referral tasks can end up pointing at
    // the same person (submitted twice, referred from more than one flow, etc.).
    // Collapse to one row per person, keyed by whichever identifier is actually
    // present: visitorId is the strongest signal, phone next, name as the fallback
    // for referrals carrying neither.
    const seen = new Set()
    return mapped.filter((item) => {
      const dedupeKey = item.visitorId || item.phone || item.name.toLowerCase()
      if (seen.has(dedupeKey)) return false
      seen.add(dedupeKey)
      return true
    })
  }, [livePcsTasks])

  const visibleUnassigned = useMemo(() => {
    const isNameDismissed = (nameKey) =>
      (dismissedNames.has(nameKey) || persistedDismissedNames.has(nameKey)) && !restoredNames.has(nameKey)
    // Sunday-derived rows are already unique per name (nameMap merges duplicates at
    // the source above), so a stable synthetic id is safe here — there's no backing
    // doc to key off instead.
    const sundayItems = unassignedVisitors
      .filter(v => !assignedNames.has(v.name.toLowerCase()) && !isNameDismissed(v.name.toLowerCase()))
      .map(v => ({ ...v, source: 'sunday', id: `sunday-${v.name.toLowerCase()}` }))
    // PCS referrals come first; deduplicate against the Sunday list by name (cross-
    // source overlap — a PCS referral for someone who also showed up in Sunday
    // attendance shouldn't render twice).
    const sundayNames = new Set(sundayItems.map(v => v.name.toLowerCase()))
    const pcsItems = pcsReferrals.filter(
      r => !assignedNames.has(r.name.toLowerCase()) &&
           !dismissedTaskIds.has(r.taskId) &&
           !sundayNames.has(r.name.toLowerCase())
    )
    return [...pcsItems, ...sundayItems]
  }, [unassignedVisitors, pcsReferrals, assignedNames, dismissedNames, persistedDismissedNames, restoredNames, dismissedTaskIds])

  // Reverses a dismiss — used by the "Undo" action on the dismiss toast. Mirrors
  // handleRemove's own branch (task-backed vs. name-backed) in reverse.
  const handleUndismiss = useCallback(async (item) => {
    if (item.taskId) {
      setDismissedTaskIds(prev => {
        const next = new Set(prev)
        next.delete(item.taskId)
        return next
      })
      try {
        await updateTask(item.taskId, { status: 'Pending' })
        onTaskUpdated?.(item.taskId, { status: 'Pending' })
      } catch (err) {
        console.error('Failed to undo dismiss', item.name, err)
        showToast(`Failed to restore ${item.name}.`, 'error')
        setDismissedTaskIds(prev => new Set([...prev, item.taskId]))
      }
      return
    }
    const nameKey = item.name.toLowerCase()
    setDismissedNames(prev => {
      const next = new Set(prev)
      next.delete(nameKey)
      return next
    })
    setRestoredNames(prev => new Set([...prev, nameKey]))
    try {
      await undismissUnassignedPerson(nameKey)
    } catch (err) {
      console.error('Failed to undo dismiss', item.name, err)
      showToast(`Failed to restore ${item.name}.`, 'error')
      setDismissedNames(prev => new Set([...prev, nameKey]))
      setRestoredNames(prev => {
        const next = new Set(prev)
        next.delete(nameKey)
        return next
      })
    }
  }, [onTaskUpdated, showToast])

  // Dismisses a specific row by its record id (item.taskId for PCS/D-Light-referral
  // rows, item.name for Sunday-derived ones — see the id-scheme note on
  // dismissedTaskIds/dismissedNames above). Two rows that happen to share a display
  // name never share dismiss state, so removing one can't collide with the other.
  const handleRemove = useCallback(async (item) => {
    const isTaskBacked = Boolean(item.taskId)
    const identityKey = isTaskBacked ? item.taskId : item.name.toLowerCase()
    const setDismissed = isTaskBacked ? setDismissedTaskIds : setDismissedNames
    // Optimistic — instant removal from the list; reverted below if the backing
    // write fails, so a failed dismiss doesn't look like a successful one.
    setDismissed(prev => new Set([...prev, identityKey]))
    if (assignOpenName === item.name) setAssignOpenName(null)
    try {
      if (isTaskBacked) {
        await updateTask(item.taskId, { status: 'Completed' })
        onTaskUpdated?.(item.taskId, { status: 'Completed' })
      } else {
        // Sunday-attendance-derived card — no task/member doc to update, so
        // persist the dismissal itself (see cell_unassigned_dismissals).
        await dismissUnassignedPerson(identityKey, userProfile?.displayName || userProfile?.email || '')
      }
      showToast('Member removed from unassigned list', 'success', {
        label: 'Undo',
        onClick: () => handleUndismiss(item),
      })
    } catch (err) {
      console.error('Failed to dismiss unassigned person', item.name, err)
      showToast(`Failed to dismiss ${item.name}. Please try again.`, 'error')
      setDismissed(prev => {
        const next = new Set(prev)
        next.delete(identityKey)
        return next
      })
    }
  }, [assignOpenName, onTaskUpdated, showToast, userProfile, handleUndismiss])

  const handleApprove = useCallback(
    async (change) => {
      try {
        if (change.changeType === 'deactivate' && change.memberId) {
          await deactivateCellGroupMember(change.cellId, change.memberId, change.memberData?.name)
        } else if (change.changeType === 'activate' && change.memberId) {
          await updateCellGroupMember(change.cellId, change.memberId, { status: 'active' })
        } else if (change.changeType === 'edit' && change.memberId && change.memberData) {
          await updateCellGroupMember(change.cellId, change.memberId, { ...change.memberData })
        } else if (change.changeType === 'add' && change.memberData) {
          await addCellGroupMember(change.cellId, change.memberData)
        } else if (change.changeType === 'transfer' && change.memberId && change.toCellId) {
          await transferCellMember(change.cellId, change.memberId, change.toCellId)
        }
        await deleteCellMemberPendingChange(change.id)
        onChangeResolved(change.id)
        showToast(`${change.memberData?.name || 'Member'} — request approved.`)
      } catch {
        showToast('Approval failed. Please try again.', 'error')
      }
    },
    [onChangeResolved, showToast]
  )

  const handleReject = useCallback(
    async (change) => {
      try {
        await deleteCellMemberPendingChange(change.id)
        onChangeResolved(change.id)
        showToast(`Request for ${change.memberData?.name || 'member'} rejected.`)
      } catch {
        showToast('Rejection failed. Please try again.', 'error')
      }
    },
    [onChangeResolved, showToast]
  )

  const handleResolveNote = useCallback(
    async (note) => {
      setResolvingNoteId(note.id)
      try {
        await markCellLeaderDirectorNoteRead(note.id)
        showToast(`Note about ${note.memberName || 'member'} resolved.`)
      } catch {
        showToast('Failed to resolve note. Please try again.', 'error')
      } finally {
        setResolvingNoteId(null)
      }
    },
    [showToast]
  )

  const handleAssign = useCallback(
    async (item, cellIdOverride) => {
      const targetCellId = cellIdOverride || assignSelectedCellId
      if (!targetCellId) return
      setAssigning(true)
      try {
        await addCellGroupMember(targetCellId, {
          name: item.name,
          status: 'active',
          ...(item.phone ? { phone: item.phone } : {}),
          ...(item.visitorId ? { visitorId: item.visitorId } : {}),
        })
        // If this is a PCS referral task, mark it completed
        if (item.taskId) {
          await updateTask(item.taskId, { status: 'Completed' })
          onTaskUpdated?.(item.taskId, { status: 'Completed' })
        }
        // Close out any open D Light consult now that the member has a cell —
        // best-effort: the assignment above already succeeded, so a failure here
        // (e.g. offline) shouldn't surface as a failed assignment.
        const consultTask = dlightConsultByName.get(item.name.toLowerCase())
        if (consultTask) {
          try { await updateTask(consultTask.id, { status: 'Completed' }) } catch { /* non-fatal */ }
        }
        setAssignedNames((prev) => new Set([...prev, item.name.toLowerCase()]))
        // Patch the cell's roster locally so Total Members / growth chart / the
        // Sunday-visitor recompute all reflect the new member immediately —
        // without this they stay stale until the component remounts.
        setCellMemberData((prev) => prev.map((c) =>
          c.cellId === targetCellId
            ? { ...c, memberCount: c.memberCount + 1, names: [...c.names, item.name.toLowerCase()] }
            : c
        ))
        const cellName = activeCells.find((c) => c.id === targetCellId)?.cellName || 'cell'
        showToast(`${item.name} added to ${cellName}.`)
        setAssignOpenName(null)
        setAssignSelectedCellId('')
      } catch (err) {
        console.error('Failed to assign', item?.name, 'to cell', targetCellId, err)
        showToast('Failed to assign. Please try again.', 'error')
      } finally {
        setAssigning(false)
      }
    },
    [assignSelectedCellId, activeCells, onTaskUpdated, showToast, dlightConsultByName]
  )

  const handleSendConsult = useCallback(
    async (item) => {
      if (!consultNote.trim()) return
      setSendingConsult(true)
      try {
        const requestedByName = userProfile?.displayName || userProfile?.name || userProfile?.email || 'Cell Director'
        await createTask({
          taskTitle: `Cell assignment input needed: ${item.name}`,
          department: 'D Light',
          assignedPerson: '',
          priority: 'Medium',
          deadline: '',
          status: 'Pending',
          notes: `${requestedByName} (Cell Director) is requesting D-Light input on where to place ${item.name}. ${consultNote.trim()}`,
          createdBy: userProfile?.email || '',
          cellAssignConsult: true,
          consultPersonName: item.name,
          consultPersonPhone: item.phone || '',
          consultPersonVisitorId: item.visitorId || '',
          consultNote: consultNote.trim(),
          requestedBy: requestedByName,
          // Identity + action-kind pair the To-Do List dedupes on (ToDoListCard.jsx).
          personId: item.visitorId || item.phone || item.name,
          taskType: 'cellAssignConsult',
          // D-Light's recommendation is a departmental position, not shared team work —
          // Director only (matches the useActionNotifications.js bell-notification gate).
          visibleToRole: 'DIRECTOR',
        })
        showToast(`Requested D Light input for ${item.name}.`)
        setConsultOpenName(null)
        setConsultNote('')
      } catch (err) {
        console.error('Consult D Light error', err)
        showToast('Failed to send request. Please try again.', 'error')
      } finally {
        setSendingConsult(false)
      }
    },
    [consultNote, userProfile, showToast]
  )

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-semibold ${
          toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
        }`}>
          {toast.msg}
          {toast.action && (
            <button
              type="button"
              onClick={() => { toast.action.onClick(); setToast(null) }}
              className="text-xs font-bold underline underline-offset-2 hover:opacity-80 transition-opacity flex-shrink-0"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {/* ── Stat Cards — all four are clickable navigation triggers. ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={focusPendingChanges}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left cursor-pointer hover:border-amber-200 hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-base mb-3 group-hover:bg-amber-200 transition-colors">⏳</div>
          <p className="text-2xl font-black text-slate-800">{loadingCellPending ? '—' : cellPendingChanges.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Pending Approvals</p>
        </button>

        <button
          type="button"
          onClick={onNavigateToCellGroups}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left cursor-pointer hover:border-emerald-200 hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-base mb-3 group-hover:bg-emerald-200 transition-colors">🏘</div>
          <p className="text-2xl font-black text-slate-800">{activeCells.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Active Cells</p>
        </button>

        <button
          type="button"
          onClick={onNavigateToCellGroups}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left cursor-pointer hover:border-blue-200 hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-base mb-3 group-hover:bg-blue-200 transition-colors">👥</div>
          <p className="text-2xl font-black text-slate-800">{loadingMembers ? '—' : totalMembers}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Total Members</p>
        </button>

        <button
          type="button"
          onClick={openUnassignedDrawer}
          className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left cursor-pointer hover:border-violet-200 hover:shadow-md transition-all group"
        >
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-base mb-3 group-hover:bg-violet-200 transition-colors">🔍</div>
          <p className="text-2xl font-black text-slate-800">{loadingUnassigned ? '—' : visibleUnassigned.length}</p>
          <p className="text-xs font-medium text-slate-500 mt-0.5">Unassigned</p>
          <p className="text-xs text-violet-500 font-semibold mt-1">Tap to view →</p>
        </button>
      </div>

      {/* ── Pending Member Changes ── */}
      <div
        ref={pendingChangesRef}
        className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${
          pendingHighlight ? 'border-amber-300 ring-2 ring-amber-200' : 'border-slate-100'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800">Pending Member Changes</p>
          {!loadingCellPending && (cellPendingChanges.length + leaderNotes.length) > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {cellPendingChanges.length + leaderNotes.length}
            </span>
          )}
        </div>

        {loadingCellPending ? (
          <div className="px-5 py-6 text-sm text-slate-400 text-center">Loading…</div>
        ) : (cellPendingChanges.length + leaderNotes.length) === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-400 text-center">
            All caught up — no pending changes.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {leaderNotes.map((note) => (
              <div key={`note-${note.id}`} className="p-5 space-y-3 bg-amber-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {(note.memberName || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{note.memberName || 'Member'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        From {note.sentByName || 'Cell Leader'} · {note.cellName || '—'}
                        {note.sentAt ? ` · ${format(note.sentAt, 'd MMM, h:mm a')}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 uppercase tracking-wide bg-amber-100 text-amber-700">
                    Note
                  </span>
                </div>

                {note.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{tag}</span>
                    ))}
                  </div>
                )}

                {note.message && (
                  <div className="bg-amber-50 border-l-4 border-amber-300 rounded-r-lg px-3 py-2 text-xs text-amber-800 italic">
                    "{note.message}"
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={resolvingNoteId === note.id}
                    onClick={() => handleResolveNote(note)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {resolvingNoteId === note.id ? 'Resolving…' : 'Resolve'}
                  </button>
                </div>
              </div>
            ))}

            {cellPendingChanges.map((change) => (
              <div key={change.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {(change.memberData?.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{change.memberData?.name || '—'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {change.requestedBy || '—'} ·{' '}
                        {change.changeType === 'transfer'
                          ? `${change.cellName || '—'} → ${change.toCellName || '—'}`
                          : (change.cellName || '—')}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 uppercase tracking-wide ${CHANGE_TYPE_STYLES[change.changeType] || 'bg-slate-100 text-slate-600'}`}>
                    {change.changeType}
                  </span>
                </div>

                {change.reason && (
                  <div className="bg-amber-50 border-l-4 border-amber-300 rounded-r-lg px-3 py-2 text-xs text-amber-800 italic">
                    "{change.reason}"
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(change)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(change)}
                    className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cell Member Growth Chart ── */}
      {!loadingMembers && growthData.length > 0 && (
        <CellMemberGrowthChart cellMemberData={growthData} />
      )}

      {/* ── Attendance trends + missing reports ── */}
      <DirectorDashboardCellWidgets userProfile={userProfile} />

      {/* ── Unassigned Visitors Drawer — a centered modal (not a bottom sheet), so
          it stays reachable and doesn't get clipped at the bottom edge on short
          viewports. ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeUnassignedDrawer() }}
        >
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Unassigned</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Non-Cell Sunday attendees + repeat visitors + Caring PCS referrals not yet in a cell
                </p>
              </div>
              <button
                type="button"
                onClick={closeUnassignedDrawer}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* Drawer body */}
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {loadingUnassigned ? (
                <p className="text-sm text-slate-500 text-center py-10">Loading…</p>
              ) : visibleUnassigned.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No unassigned repeat visitors found.
                </p>
              ) : (
                visibleUnassigned.map((item) => {
                  const isPCS = item.source === 'pcs'
                  // A PCS referral now carries its own recommendation (submitted straight
                  // onto this same task doc via DepartmentHub's Recommendation modal —
                  // see openPcsReferralTaskId), not a separate D-Light consult task, so it
                  // is its own "consultTask" here rather than looked up by name.
                  const consultTask = isPCS
                    ? (item.status === 'Responded' ? item : null)
                    : dlightConsultByName.get(item.name.toLowerCase())
                  return (
                    <div key={item.id} className="relative">
                      <div className={`flex items-center gap-3 bg-white border rounded-2xl px-4 py-3 shadow-sm ${
                        isPCS ? 'border-indigo-100' : 'border-slate-100'
                      }`}>
                        <div className={`w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0 ${
                          isPCS ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {initials(item.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-slate-900 text-sm">{item.name}</p>
                            <span
                              title="Where this notification originated"
                              className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                                isPCS ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'
                              }`}
                            >
                              {isPCS ? 'From Caring (PCS)' : 'From Sunday Visitor Log'}
                            </span>
                            {!isPCS && item.nonCell && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                                Non-Cell
                              </span>
                            )}
                            {consultTask && (
                              <span
                                title={consultTask.status === 'Responded' ? consultTask.recommendation || (isPCS ? 'Recommendation submitted' : 'D Light responded') : 'Awaiting D Light Director input'}
                                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                                  consultTask.status === 'Responded'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-orange-100 text-orange-700'
                                }`}
                              >
                                {consultTask.status === 'Responded'
                                  ? (consultTask.recommendedCellName
                                      ? `Recommendation: ${consultTask.recommendedCellName}`
                                      : (isPCS ? 'Recommendation Submitted' : 'D-Light Responded'))
                                  : 'Pending D Light Input'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {isPCS
                              ? item.phone || 'PCS referral'
                              : `${item.weekCount} Sunday${item.weekCount !== 1 ? 's' : ''} attended`}
                          </p>
                          {consultTask?.status === 'Responded' && consultTask.recommendation && (
                            <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1 mt-1.5 italic">
                              "{consultTask.recommendation}"
                            </p>
                          )}
                          {consultTask?.status === 'Responded' && consultTask.recommendedCellId && (
                            <button
                              type="button"
                              disabled={assigning}
                              onClick={() => handleAssign(item, consultTask.recommendedCellId)}
                              className="mt-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                            >
                              {assigning ? 'Assigning…' : `Accept & Assign to ${consultTask.recommendedCellName || 'Cell'}`}
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignOpenName(assignOpenName === item.name ? null : item.name)
                            setAssignSelectedCellId('')
                            setConsultOpenName(null)
                            setConsultNote('')
                          }}
                          className={`px-3 py-1.5 text-white text-xs font-semibold rounded-xl flex-shrink-0 transition-colors ${
                            isPCS
                              ? 'bg-indigo-600 hover:bg-indigo-700'
                              : 'bg-violet-600 hover:bg-violet-700'
                          }`}
                        >
                          Assign {assignOpenName === item.name ? '▲' : '▼'}
                        </button>
                        <button
                          type="button"
                          title="Dismiss"
                          onClick={(e) => {
                            // Stops this from bubbling to anything listening further up the
                            // row/drawer (e.g. the backdrop's click-outside-to-close check).
                            e.stopPropagation()
                            handleRemove(item)
                          }}
                          className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 flex-shrink-0 transition-colors text-xs leading-none"
                        >
                          ✕
                        </button>
                      </div>

                      {assignOpenName === item.name && (
                        <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide px-3 py-2 border-b border-slate-100">
                            Choose a cell group
                          </p>
                          <div className="max-h-48 overflow-y-auto">
                            {activeCells.map((cell) => (
                              <button
                                key={cell.id}
                                type="button"
                                onClick={() => setAssignSelectedCellId(cell.id)}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors ${
                                  assignSelectedCellId === cell.id
                                    ? isPCS
                                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                      : 'bg-violet-50 text-violet-700 font-semibold'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span>{cell.cellName || cell.id}</span>
                                {assignSelectedCellId === cell.id && (
                                  <span className={isPCS ? 'text-indigo-600' : 'text-violet-600'}>✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="p-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleAssign(item)}
                              disabled={!assignSelectedCellId || assigning}
                              className={`w-full py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-colors ${
                                isPCS
                                  ? 'bg-indigo-600 hover:bg-indigo-700'
                                  : 'bg-violet-600 hover:bg-violet-700'
                              }`}
                            >
                              {assigning
                                ? 'Adding…'
                                : assignSelectedCellId
                                ? `Add to ${activeCells.find((c) => c.id === assignSelectedCellId)?.cellName || 'Cell'}`
                                : 'Select a cell first'}
                            </button>
                          </div>

                          <div className="p-3 border-t border-slate-100">
                            {consultTask ? (
                              <p className="text-xs text-slate-500 text-center">
                                {isPCS
                                  ? '✓ A recommendation has been submitted — see note above.'
                                  : (consultTask.status === 'Responded' ? '✓ D Light has responded — see note above.' : '⏳ Awaiting D Light Director input.')}
                              </p>
                            ) : consultOpenName === item.name ? (
                              <div className="space-y-2">
                                <textarea
                                  value={consultNote}
                                  onChange={(e) => setConsultNote(e.target.value)}
                                  placeholder="What input do you need from D Light? (e.g. best-fit cell, background context…)"
                                  rows={3}
                                  autoFocus
                                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSendConsult(item)}
                                    disabled={!consultNote.trim() || sendingConsult}
                                    className="flex-1 py-2 text-white text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 transition-colors"
                                  >
                                    {sendingConsult ? 'Sending…' : 'Send Request'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setConsultOpenName(null); setConsultNote('') }}
                                    className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setConsultOpenName(item.name); setConsultNote('') }}
                                className="w-full py-2 text-xs font-bold rounded-xl border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                Consult D Light Director
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              <p className="text-xs text-slate-400 text-center pt-2">
                Sunday visitors update when a Sunday Report is saved. Caring referrals appear when the Caring Director notifies from PCS.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
