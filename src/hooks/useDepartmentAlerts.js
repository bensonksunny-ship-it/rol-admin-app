import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { getCellGroups, subscribeLatestCellReports, subscribeTasksByDepartment, subscribeFinanceExpenseByDept } from '../services/firestore'
import { cellWeekStart, computeMeetingDateISO, isRealCellReportSubmission } from '../utils/cellWeek'
import { normalizeDepartmentName } from '../constants/roles'
import { monthKeyOf } from '../utils/financeEntryLock'
import useFinanceMonthLocks from './useFinanceMonthLocks'
import useRibbonState from './useRibbonState'

const NEW_MEMBER_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

// "Got it" on new team members is saved per user in Firestore (useRibbonState);
// acknowledgements from the earlier device-only version still count.
const readLegacySeen = (dept) => { try { return Number(localStorage.getItem(`rol.deptRibbon.teamSeen.${dept}`)) || 0 } catch { return 0 } }

const ms = (d) => (d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : 0) || 0
const isOpenTask = (t) => !['Completed', 'Turned Down', 'Responded'].includes(t.status)

/**
 * Alerts for the DepartmentNotificationRibbon, built from data the department
 * already has:
 *  - team members added in the last 14 days (until "Got it" is pressed),
 *  - open department tasks past their deadline,
 *  - Cell only: cells whose meeting day this week has passed with no report,
 *  - the bell's finance items for this department (Finance Assistant bills awaiting
 *    confirmation, "file your expenses" reminders, unlocked expense months).
 *
 * team: the department's roster (needs createdAt). tasks: pass the loaded list, or
 * leave undefined to subscribe here. cell: { viewAll, myCellIds } scopes the
 * overdue-report alert for the Cell department.
 * open: { team(), tasks(), reports() } — tab switches for the quick actions.
 * Amber alerts also carry a `kind`: 'action' (pending work → the ribbon adds a 24h
 * "Remind me later") or 'info' (acknowledge-only → a permanent "Got it").
 * Each alert carries a `category` that picks its ribbon colour (RIBBON_CATEGORY_TONE):
 * overdue tasks are action items (blue); new members, cell reports and finance are
 * alerts & submissions (amber).
 * notif: MainLayout's Outlet context ({ notifications, handleNotifAction,
 * dismissNotification }) — the one bell feed, already permission-filtered and with
 * "Ignore" applied, so the ribbon never shows something the bell has hidden.
 * canConfirmExpenses: whoever DeptExpenseTab shows Approve / Confirm buttons to
 * (Founder, Senior Pastor, canManageDepartment). Pending bills — both the
 * department's own (Approve/Disapprove) and Finance Assistant entries
 * (Confirm/Reject) — are read directly for them rather than from the bell, whose
 * "Confirm Expense" item only covers the latter and only reaches holders of an
 * actual Director/Coordinator position in the department.
 */
const FINANCE_NOTIF_TYPES = ['expense_reminder', 'expense_unlock']

export default function useDepartmentAlerts({ department, team = [], tasks, cell = null, memberNoun = 'team member', open = {}, notif = null, canConfirmExpenses = false }) {
  const ribbonState = useRibbonState()
  const seenAt = Math.max(ribbonState.seenAt(`teamSeen.${department}`), readLegacySeen(department))

  const [ownTasks, setOwnTasks] = useState([])
  const needTasks = tasks === undefined && !!department
  useEffect(() => (needTasks ? subscribeTasksByDepartment(department, setOwnTasks) : undefined), [needTasks, department])
  const taskList = tasks ?? ownTasks

  const isCell = department === 'Cell' && !!cell
  const [cellGroups, setCellGroups] = useState([])
  const [reports, setReports] = useState([])
  useEffect(() => {
    if (!isCell) return undefined
    let cancelled = false
    getCellGroups('Cell').then((g) => { if (!cancelled) setCellGroups(g) }).catch(() => {})
    const unsub = subscribeLatestCellReports(200, setReports, () => setReports([]))
    return () => { cancelled = true; unsub?.() }
  }, [isCell])

  // The same per-department expense list DeptExpenseTab reads. Only months still
  // open for finance count (closed months can't be approved/confirmed any more) —
  // judged by the regular finance rule, not the Founder's exemption, so a Founder
  // isn't shown every never-approved bill from past years.
  const [deptBills, setDeptBills] = useState([])
  useEffect(() => {
    if (!canConfirmExpenses || !department) { setDeptBills([]); return undefined }
    return subscribeFinanceExpenseByDept(department, setDeptBills)
  }, [canConfirmExpenses, department])
  const { isLocked: isFinanceMonthLocked } = useFinanceMonthLocks(false)
  const openBills = deptBills.filter((e) => e.date && !isFinanceMonthLocked(monthKeyOf(e.date)))
  // Finance Assistant entries → Confirm/Reject; the department's own → Approve/Disapprove.
  const toConfirm = openBills.filter((e) => e.deptConfirmation === 'pending')
  const toApprove = openBills.filter((e) => !e.deptConfirmation && (e.status || 'pending') === 'pending')
  const billKey = [...toConfirm, ...toApprove].map((e) => `${e.id}:${e.amount}`).join('|')

  const viewAll = !!cell?.viewAll
  const myCellKey = (cell?.myCellIds || []).filter(Boolean).join('|')

  return useMemo(() => {
    const now = Date.now()
    const alerts = []

    // New team members
    const since = Math.max(now - NEW_MEMBER_DAYS * DAY_MS, seenAt)
    const fresh = team.filter((m) => !m.isFormer && m.status !== 'former' && m.status !== 'inactive' && ms(m.createdAt) > since)
    if (fresh.length) {
      const n = fresh.length
      const newest = Math.max(...fresh.map((m) => ms(m.createdAt)))
      alerts.push({
        id: 'new-members',
        category: 'member_added',
        kind: 'info',
        tone: 'sky',
        count: n,
        title: n === 1 ? `New ${memberNoun} added: ${fresh[0].name}` : `${n} new ${memberNoun}s assigned to ${department}`,
        detail: `Added in the last ${NEW_MEMBER_DAYS} days.`,
        items: n > 1 ? fresh.map((m) => m.name).filter(Boolean) : [],
        actions: [
          open.team && { label: 'View team', onClick: open.team, primary: true },
          { label: 'Got it', onClick: () => ribbonState.markSeen(`teamSeen.${department}`, newest) },
        ].filter(Boolean),
      })
    }

    // Overdue tasks
    const overdue = taskList.filter((t) => isOpenTask(t) && t.deadline && ms(t.deadline) < now)
    if (overdue.length) {
      const n = overdue.length
      alerts.push({
        id: 'overdue-tasks',
        category: 'task',
        tone: 'rose',
        count: n,
        title: n === 1 ? `Task overdue: ${overdue[0].taskTitle || overdue[0].title || 'Untitled task'}` : `${n} department tasks overdue`,
        detail: n === 1 ? `Due ${format(overdue[0].deadline, 'dd/MM/yyyy')}.` : '',
        items: n > 1 ? overdue.map((t) => t.taskTitle || t.title).filter(Boolean) : [],
        actions: open.tasks ? [{ label: 'View tasks', onClick: open.tasks, primary: true }] : [],
      })
    }

    // Cell reports overdue this week
    if (isCell && cellGroups.length) {
      const weekStart = cellWeekStart()
      const weekKey = format(weekStart, 'yyyy-MM-dd')
      const today = format(new Date(), 'yyyy-MM-dd')
      const mine = new Set(myCellKey ? myCellKey.split('|') : [])
      const submitted = new Set(
        reports.filter((r) => r.reportDate && String(r.reportDate).slice(0, 10) >= weekKey && isRealCellReportSubmission(r)).map((r) => r.cellId)
      )
      const late = cellGroups.filter((g) => {
        if (g.status === 'inactive' || !g.meetingDay) return false
        if (!viewAll && !mine.has(g.id) && !mine.has(g.cellId)) return false
        if (computeMeetingDateISO(g.meetingDay, weekStart) >= today) return false
        return !submitted.has(g.id) && !submitted.has(g.cellId)
      })
      if (late.length) {
        const n = late.length
        // The exact meeting date this week's missing report is for, e.g. "Wednesday, Oct 21".
        const metOn = (g) => format(parseISO(computeMeetingDateISO(g.meetingDay, weekStart)), 'EEEE, MMM d')
        const metOnShort = (g) => format(parseISO(computeMeetingDateISO(g.meetingDay, weekStart)), 'EEE, MMM d')
        alerts.push({
          id: 'cell-reports-overdue',
          category: 'general_alert',
          kind: 'action',
          tone: 'amber',
          count: n,
          title: n === 1 ? `Cell report overdue: ${late[0].cellName} | Met on ${metOn(late[0])}` : `${n} cell reports overdue this week`,
          badge: n === 1 ? `Met on ${metOn(late[0])}` : `Week of ${format(weekStart, 'dd/MM/yyyy')}`,
          detail: n === 1 ? (late[0].leader ? `Leader: ${late[0].leader}` : '') : 'The meeting day has passed with no report.',
          items: n > 1 ? late.filter((g) => g.cellName).map((g) => `${g.cellName} · ${metOnShort(g)}`) : [],
          actions: open.reports ? [{ label: 'Open reports', onClick: open.reports, primary: true }] : [],
        })
      }
    }

    // Finance — one card per kind, each opening the department's Finance → Expense
    // tab via the bell's own deep link (buildNotificationDeepLink).
    const deptKey = normalizeDepartmentName(department || '')
    const finance = (notif?.notifications || []).filter(
      (n) => FINANCE_NOTIF_TYPES.includes(n.type) && normalizeDepartmentName(n.department || '') === deptKey
    )
    const ofType = (type) => finance.filter((n) => n.type === type)
    const openFirst = (list) => () => notif?.handleNotifAction?.(list[0])
    const ignoreAll = (list) => () => list.forEach((n) => notif?.dismissNotification?.(n))

    const billLabel = (e) => `₹${Number(e.amount || 0).toLocaleString('en-IN')}${e.item ? ` · ${e.item}` : ''}${e.date ? ` (${format(e.date, 'dd/MM/yyyy')})` : ''}`
    const openExpenses = () => notif?.handleNotifAction?.({ type: 'expense_confirmation', department })

    if (toConfirm.length) {
      const n = toConfirm.length
      alerts.push({
        id: 'finance-confirm',
        category: 'expense_approval',
        kind: 'action',
        tone: 'amber',
        count: n,
        title: n === 1 ? 'Expense awaiting confirmation' : `${n} expenses awaiting confirmation`,
        detail: n === 1 ? `Finance Assistant entered ${billLabel(toConfirm[0])}.` : 'Entered by the Finance Assistant.',
        items: n > 1 ? toConfirm.map(billLabel) : [],
        actions: [{ label: 'Review expenses', onClick: openExpenses, primary: true }],
      })
    }

    if (toApprove.length) {
      const n = toApprove.length
      alerts.push({
        id: 'finance-approve',
        category: 'expense_approval',
        kind: 'action',
        tone: 'amber',
        count: n,
        title: n === 1 ? `Expense to approve: ${billLabel(toApprove[0])}` : `${n} expenses to approve`,
        detail: 'Approve or disapprove in Finance → Expense.',
        items: n > 1 ? toApprove.map(billLabel) : [],
        actions: [{ label: 'Review expenses', onClick: openExpenses, primary: true }],
      })
    }

    const reminders = ofType('expense_reminder')
    if (reminders.length) {
      alerts.push({
        id: 'finance-reminder',
        category: 'general_alert',
        kind: 'action',
        tone: 'sky',
        count: reminders.length,
        title: `File your ${department} expenses`,
        detail: reminders[0].body,
        actions: [
          { label: 'File expenses', onClick: openFirst(reminders), primary: true },
          notif?.dismissNotification && { label: 'Ignore', onClick: ignoreAll(reminders) },
        ].filter(Boolean),
      })
    }

    const unlocks = ofType('expense_unlock')
    if (unlocks.length) {
      alerts.push({
        id: 'finance-unlock',
        category: 'general_alert',
        kind: 'info',
        tone: 'emerald',
        count: unlocks.length,
        title: 'Expense entry unlocked',
        detail: unlocks[0].body,
        actions: [
          { label: 'Enter expenses', onClick: openFirst(unlocks), primary: true },
          // Info only — "Got it" is the bell's permanent per-user dismissal.
          notif?.dismissNotification && { label: 'Got it', onClick: ignoreAll(unlocks) },
        ].filter(Boolean),
      })
    }

    return alerts
  }, [team, taskList, seenAt, department, memberNoun, isCell, cellGroups, reports, viewAll, myCellKey, open.team, open.tasks, open.reports, notif, billKey]) // eslint-disable-line react-hooks/exhaustive-deps -- toConfirm/toApprove are tracked via billKey
}
