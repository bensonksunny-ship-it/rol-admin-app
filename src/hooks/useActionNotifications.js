import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  subscribePCSFillInvitationsByCellId, subscribeCellVisitorProposals, subscribeCellDlightConsultTasks,
  subscribeDismissedNotificationIds, dismissNotification as dismissNotificationDoc, createTask,
} from '../services/firestore'
import { getDepartmentRole } from '../utils/access'
import { isCellDirectorInPositions } from '../utils/cellReportPermissions'

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
  const [dismissedIds, setDismissedIds] = useState(new Set())

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
          }))
      )
    })
  }, [userProfile, isFounder])

  // Per-user "Ignore" state — hides an item from this feed everywhere it's rendered
  // without touching the underlying business record it was synthesized from.
  useEffect(() => {
    if (!uid) { setDismissedIds(new Set()); return }
    return subscribeDismissedNotificationIds(uid, setDismissedIds)
  }, [uid])

  const notifications = useMemo(
    () => [...fillNotifications, ...visitorProposalNotifications, ...dlightConsultNotifications, ...consultResponseNotifications]
      .filter((n) => !dismissedIds.has(n.id)),
    [fillNotifications, visitorProposalNotifications, dlightConsultNotifications, consultResponseNotifications, dismissedIds]
  )

  const handleNotifAction = (n) => {
    if (n.type === 'pcs_fill') {
      navigate('/department/cell?tab=leaderEntry&openFillInvite=' + (n.inviteId || ''))
    } else if (n.type === 'visitor_proposal') {
      navigate('/department/d-light?tab=visitorEntry')
    } else if (n.type === 'dlight_consult') {
      // Deep-link straight into the Respond modal: DepartmentHub reads
      // ?openConsultId= once the D-Light Hub's tasks have loaded (works whether
      // the user is already on the Hub or navigating there fresh).
      navigate(`/department/d-light?tab=summary&openConsultId=${encodeURIComponent(n.id || '')}`)
    } else if (n.type === 'consult_response') {
      // Land on the Cell Hub's summary tab, where the Unassigned drawer (and the
      // recommendation shown against that person's row) live.
      navigate('/department/cell?tab=summary')
    }
  }

  const dismissNotification = (n) => {
    if (!uid || !n?.id) return
    dismissNotificationDoc(uid, n.id).catch(() => {})
  }

  // "+ Add to To-Do List" — drops the notification into the same `tasks` collection
  // My Workspace's To-Do List card already reads from, then dismisses it from the bell
  // so it doesn't linger as both a task and an open alert.
  const addNotificationToTodo = async (n) => {
    await createTask({
      taskTitle: n.body || n.title || 'Untitled',
      department: n.department || '',
      assignedPerson: userProfile?.displayName || userProfile?.email || '',
      priority: 'Medium',
      deadline: null,
      status: 'Pending',
      notes: n.title || '',
    })
    dismissNotification(n)
  }

  return {
    notifications,
    dlightConsultCount: dlightConsultNotifications.filter((n) => !dismissedIds.has(n.id)).length,
    consultResponseCount: consultResponseNotifications.filter((n) => !dismissedIds.has(n.id)).length,
    handleNotifAction,
    dismissNotification,
    addNotificationToTodo,
  }
}
