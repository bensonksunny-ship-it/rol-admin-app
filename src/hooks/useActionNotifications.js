import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  subscribePCSFillInvitationsByCellId, subscribeCellVisitorProposals, subscribeCellDlightConsultTasks,
  subscribeDismissedNotificationIds, dismissNotification as dismissNotificationDoc,
  subscribeNotificationTodoAdditionIds, markNotificationAddedToTodo, createTask,
  subscribeSundayLeaderAssignmentNotifications,
} from '../services/firestore'
import { formatDisplayDate } from '../utils/date'
import { getDepartmentRole } from '../utils/access'
import { isCellDirectorInPositions } from '../utils/cellReportPermissions'

// Shared by the bell's "tap to act" navigation and by "+ Add to To-Do" (which stamps
// the resolved URL onto the created task's `deepLink` field) so both paths — acting on
// the live notification and acting later from the To-Do List card — land on the exact
// same screen, with only one place that knows how each notification type resolves.
function buildNotificationDeepLink(n) {
  if (n.type === 'pcs_fill') {
    return '/department/cell?tab=shepherdCare&openFillInvite=' + (n.inviteId || '')
  }
  if (n.type === 'visitor_proposal') {
    // Deep-link straight into the "Visitors from Cell Reports" row for this proposal
    // (DepartmentHub reads ?openVisitorProposalId=) instead of just the bare Visitor
    // Entry tab with that section collapsed.
    return `/department/d-light?tab=visitorEntry&openVisitorProposalId=${encodeURIComponent(n.id || '')}`
  }
  if (n.type === 'dlight_consult') {
    // Deep-link straight into the Respond modal: DepartmentHub reads
    // ?openConsultId= once the D-Light Hub's tasks have loaded (works whether
    // the user is already on the Hub or navigating there fresh).
    return `/department/d-light?tab=summary&openConsultId=${encodeURIComponent(n.id || '')}`
  }
  if (n.type === 'consult_response') {
    // Land on the Cell Hub's summary tab, where the Unassigned drawer (and the
    // recommendation shown against that person's row) live.
    return '/department/cell?tab=summary'
  }
  if (n.type === 'sunday_leader_assignment') {
    return '/department/sec-core?tab=sundayLeader'
  }
  return null
}

// Maps a bell notification's type onto the same taskType label used at the other
// createTask() call sites for that kind of action (see ToDoListCard.jsx's dedupe key),
// so a personal "+ Add to To-Do" copy of a notification merges into one row with any
// matching task rather than ever showing as a second entry for the same person.
function notificationTaskType(n) {
  if (n.type === 'sunday_leader_assignment') return `sundayLeaderAssignment:${n.date || ''}`
  return {
    pcs_fill: 'fillProfile',
    visitor_proposal: 'addToDLight',
    dlight_consult: 'cellAssignConsult',
    consult_response: 'cellAssignRecommendation',
  }[n.type] || n.type || 'task'
}

// Single source of truth for the app's cross-department "pending action" feed —
// PCS fill requests, D-Light visitor proposals, D-Light consult requests, and Cell's
// consult responses. Shared by the sidebar bell dropdown and My Workspace's header bell
// so there is exactly one place that owns this data, its dismissal state, and its
// deep-link navigation, per the notification pipeline's "no third parallel implementation" rule.
export default function useActionNotifications(userProfile, isFounder, uid) {
  const navigate = useNavigate()
  const [fillNotifications, setFillNotifications] = useState([])
  const [visitorProposalNotifications, setVisitorProposalNotifications] = useState([])
  const [dlightConsultNotifications, setDlightConsultNotifications] = useState([])
  const [consultResponseNotifications, setConsultResponseNotifications] = useState([])
  const [sundayLeaderNotifications, setSundayLeaderNotifications] = useState([])
  const [dismissedIds, setDismissedIds] = useState(new Set())
  const [addedToTodoIds, setAddedToTodoIds] = useState(new Set())
  // Optimistic hide — set synchronously the instant Ignore/Add-to-Todo is clicked, so
  // the item and the bell badge count update on the same tick instead of waiting on the
  // dismissed_notifications write to round-trip and its onSnapshot listener to fire.
  // Rolled back if the underlying write actually fails.
  const [optimisticHiddenIds, setOptimisticHiddenIds] = useState(() => new Set())

  useEffect(() => {
    const cellId = userProfile?.cellGroupId || userProfile?.cellId
    if (!cellId) return
    return subscribePCSFillInvitationsByCellId(cellId, (invites) => {
      setFillNotifications(invites.map((inv) => ({
        id: inv.id,
        inviteId: inv.id,
        type: 'pcs_fill',
        department: 'Cell',
        title: 'Profile Fill Request',
        body: `Fill profile for ${inv.personName || 'a member'}`,
        cellName: inv.cellName || '',
        sentAt: inv.sentAt,
        // Identity used both to dedupe To-Do rows for this person (ToDoListCard.jsx)
        // and, since it's the same field, to detect a re-sent invitation for someone
        // who already has one pending.
        personId: inv.visitorId || inv.pcsEntryId || '',
      })))
    })
  }, [userProfile?.cellGroupId, userProfile?.cellId])

  // D-Light: visitor proposals forwarded by Cell/Caring — surfaced so a D-Light user
  // doesn't have to already be on the Visitor Entry tab to know one arrived.
  useEffect(() => {
    const canSeeDLight = isFounder || !!getDepartmentRole(userProfile, 'D Light')
    if (!canSeeDLight) return
    return subscribeCellVisitorProposals((proposals) => {
      setVisitorProposalNotifications(proposals.map((p) => ({
        id: p.id,
        type: 'visitor_proposal',
        department: 'D Light',
        title: 'New Visitor to Register',
        body: `${p.visitorName || 'Someone'} was flagged for D-Light registration`,
        cellName: p.cellName || p.sentByName || '',
        sentAt: typeof p.createdAt?.toDate === 'function' ? p.createdAt.toDate() : p.createdAt,
        // Phone is the only stable identity cell_visitor_proposals carries — used for
        // To-Do dedupe (ToDoListCard.jsx), including merging with a PCS→D-Light forward
        // for the same person if both exist.
        personId: (p.phone || '').replace(/\s+/g, '') || p.visitorName || '',
      })))
    })
  }, [userProfile, isFounder])

  // D-Light: Cell Director consult requests ("Consult D Light Director").
  useEffect(() => {
    const canSeeDLight = isFounder || !!getDepartmentRole(userProfile, 'D Light')
    if (!canSeeDLight) return
    return subscribeCellDlightConsultTasks((consults) => {
      setDlightConsultNotifications(consults.map((t) => ({
        id: t.id,
        type: 'dlight_consult',
        department: 'D Light',
        title: 'Pending Consultation',
        body: `${t.consultPersonName || 'Someone'} needs a cell placement recommendation`,
        cellName: t.requestedBy || '',
        sentAt: typeof t.createdAt?.toDate === 'function' ? t.createdAt.toDate() : t.createdAt,
        // Used for To-Do dedupe (ToDoListCard.jsx) — same taskType as the underlying
        // cellAssignConsult task itself, so a personal "add to my to-do" copy of this
        // notification merges into one row with it instead of showing twice.
        consultPersonVisitorId: t.consultPersonVisitorId || '',
        consultPersonPhone: t.consultPersonPhone || '',
        personId: t.consultPersonVisitorId || t.consultPersonPhone || '',
      })))
    })
  }, [userProfile, isFounder])

  // Cell: D-Light's responses to consult requests this Director sent — the reverse
  // direction, filtered to 'Responded' so it only fires once there's a recommendation.
  useEffect(() => {
    const canSeeCell = isFounder || isCellDirectorInPositions(userProfile)
    if (!canSeeCell) return
    return subscribeCellDlightConsultTasks((consults) => {
      setConsultResponseNotifications(
        consults
          .filter((t) => t.status === 'Responded')
          .map((t) => ({
            id: t.id,
            type: 'consult_response',
            department: 'Cell',
            title: 'D-Light Recommendation',
            body: `${t.consultPersonName || 'Someone'}: ${t.recommendation || 'D-Light responded to your request'}`,
            cellName: '',
            sentAt: typeof t.respondedAt === 'string' ? new Date(t.respondedAt) : t.respondedAt,
            // Carried through onto the To-Do task (see addNotificationToTodo) so the
            // To-Do List card can offer one-tap "Assign to [recommended cell]" —
            // same fields CellDirectorCockpit's Unassigned drawer already uses.
            consultPersonName: t.consultPersonName || '',
            consultPersonPhone: t.consultPersonPhone || '',
            consultPersonVisitorId: t.consultPersonVisitorId || '',
            recommendation: t.recommendation || '',
            recommendedCellId: t.recommendedCellId || '',
            recommendedCellName: t.recommendedCellName || '',
            // Used for To-Do dedupe (ToDoListCard.jsx).
            personId: t.consultPersonVisitorId || t.consultPersonPhone || '',
          }))
      )
    })
  }, [userProfile, isFounder])

  // Sec-Core: a leader/co-leader assignment written to this uid via "Save Month
  // Schedule" (only created when the pool name resolves to an actual app account).
  useEffect(() => {
    if (!uid) { setSundayLeaderNotifications([]); return }
    return subscribeSundayLeaderAssignmentNotifications(uid, (docs) => {
      setSundayLeaderNotifications(docs.map((d) => ({
        id: d.id,
        type: 'sunday_leader_assignment',
        department: 'Sec-Core',
        title: d.role === 'coLeader' ? 'Assigned as Co-Leader' : 'Assigned as Sunday Leader',
        body: `You're scheduled for ${formatDisplayDate(d.date)}`,
        cellName: '',
        sentAt: typeof d.createdAt?.toDate === 'function' ? d.createdAt.toDate() : d.createdAt,
        // Used for To-Do dedupe (ToDoListCard.jsx) — scoped per date so next month's
        // assignment isn't merged with this one.
        date: d.date || '',
        personId: uid,
      })))
    })
  }, [uid])

  // Per-user "Ignore" state — hides an item from this feed everywhere it's rendered
  // without touching the underlying business record it was synthesized from.
  useEffect(() => {
    if (!uid) { setDismissedIds(new Set()); return }
    return subscribeDismissedNotificationIds(uid, setDismissedIds)
  }, [uid])

  // Per-user "already added to To-Do" state. Adding to the To-Do list also dismisses
  // the notification (below), so in practice this flag is only ever visible for the
  // instant between the task write and the dismissal round-tripping back down — it
  // exists mainly as a synchronous guard against double-submitting the same alert.
  useEffect(() => {
    if (!uid) { setAddedToTodoIds(new Set()); return }
    return subscribeNotificationTodoAdditionIds(uid, setAddedToTodoIds)
  }, [uid])

  const notifications = useMemo(
    () => [...fillNotifications, ...visitorProposalNotifications, ...dlightConsultNotifications, ...consultResponseNotifications, ...sundayLeaderNotifications]
      .filter((n) => !dismissedIds.has(n.id) && !optimisticHiddenIds.has(n.id))
      .map((n) => ({ ...n, addedToTodo: addedToTodoIds.has(n.id) })),
    [fillNotifications, visitorProposalNotifications, dlightConsultNotifications, consultResponseNotifications, sundayLeaderNotifications, dismissedIds, addedToTodoIds, optimisticHiddenIds]
  )

  const handleNotifAction = (n) => {
    const to = buildNotificationDeepLink(n)
    if (to) navigate(to)
  }

  const hideOptimistically = (id) => setOptimisticHiddenIds((prev) => new Set(prev).add(id))
  const unhideOptimistically = (id) => setOptimisticHiddenIds((prev) => {
    const next = new Set(prev)
    next.delete(id)
    return next
  })

  // Rolls back (and re-throws) on failure instead of swallowing the error — a caller
  // that awaits this now actually sees a permission-denied/offline/etc. failure
  // instead of the notification silently reappearing a moment after it looked gone.
  const dismissNotification = async (n) => {
    if (!uid || !n?.id) return
    hideOptimistically(n.id)
    try {
      await dismissNotificationDoc(uid, n.id)
    } catch (err) {
      unhideOptimistically(n.id)
      throw err
    }
  }

  // "+ Add to To-Do List" — writes straight into the same `tasks` collection My
  // Workspace's To-Do List subscribes to (live), tagged to this user via
  // assignedToUid, and stamps the notification's resolved deep link onto the task so
  // the To-Do List card can jump straight back to the right action modal/tab later.
  // Also dismisses the source notification (same as Ignore) so it doesn't linger in
  // the bell once it's been converted into a task — the addedToTodo flag still guards
  // against a duplicate task if this fires twice before the dismissal round-trips.
  const addNotificationToTodo = async (n) => {
    if (!uid || n.addedToTodo) return
    hideOptimistically(n.id)
    try {
      await createTask({
        taskTitle: n.body || n.title || 'Untitled',
        department: n.department || '',
        assignedToUid: uid,
        assignedPerson: userProfile?.displayName || userProfile?.email || '',
        priority: 'Medium',
        deadline: null,
        status: 'Pending',
        notes: n.title || '',
        sourceNotificationId: n.id,
        deepLink: buildNotificationDeepLink(n),
        personId: n.personId || '',
        taskType: notificationTaskType(n),
        // Cell-assignment recommendations get inline "Assign to [cell]" controls on
        // the To-Do List card (ToDoListCard.jsx) — sourceConsultTaskId lets it also
        // close out the original D-Light consult task once acted on.
        ...(n.type === 'consult_response' ? {
          cellAssignRecommendation: true,
          sourceConsultTaskId: n.id,
          consultPersonName: n.consultPersonName || '',
          consultPersonPhone: n.consultPersonPhone || '',
          consultPersonVisitorId: n.consultPersonVisitorId || '',
          recommendation: n.recommendation || '',
          recommendedCellId: n.recommendedCellId || '',
          recommendedCellName: n.recommendedCellName || '',
        } : {}),
      })
      await markNotificationAddedToTodo(uid, n.id)
      await dismissNotificationDoc(uid, n.id)
    } catch (err) {
      unhideOptimistically(n.id)
      throw err
    }
  }

  return {
    notifications,
    dlightConsultCount: dlightConsultNotifications.filter((n) => !dismissedIds.has(n.id) && !optimisticHiddenIds.has(n.id)).length,
    consultResponseCount: consultResponseNotifications.filter((n) => !dismissedIds.has(n.id) && !optimisticHiddenIds.has(n.id)).length,
    handleNotifAction,
    dismissNotification,
    addNotificationToTodo,
  }
}
