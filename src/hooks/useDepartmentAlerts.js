import { useEffect, useMemo, useState } from 'react'
import { format, startOfWeek } from 'date-fns'
import { getCellGroups, subscribeLatestCellReports, subscribeTasksByDepartment } from '../services/firestore'
import { computeMeetingDateISO, isRealCellReportSubmission } from '../utils/cellWeek'

const NEW_MEMBER_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const seenKey = (dept) => `rol.deptRibbon.teamSeen.${dept}`
const readSeen = (dept) => { try { return Number(localStorage.getItem(seenKey(dept))) || 0 } catch { return 0 } }
const writeSeen = (dept, ms) => { try { localStorage.setItem(seenKey(dept), String(ms)) } catch { /* storage blocked */ } }

const ms = (d) => (d instanceof Date ? d.getTime() : d ? new Date(d).getTime() : 0) || 0
const isOpenTask = (t) => !['Completed', 'Turned Down', 'Responded'].includes(t.status)

/**
 * Alerts for the DepartmentNotificationRibbon, built from data the department
 * already has:
 *  - team members added in the last 14 days (until "Got it" is pressed),
 *  - open department tasks past their deadline,
 *  - Cell only: cells whose meeting day this week has passed with no report.
 *
 * team: the department's roster (needs createdAt). tasks: pass the loaded list, or
 * leave undefined to subscribe here. cell: { viewAll, myCellIds } scopes the
 * overdue-report alert for the Cell department.
 * open: { team(), tasks(), reports() } — tab switches for the quick actions.
 */
export default function useDepartmentAlerts({ department, team = [], tasks, cell = null, memberNoun = 'team member', open = {} }) {
  const [seenAt, setSeenAt] = useState(() => readSeen(department))
  useEffect(() => { setSeenAt(readSeen(department)) }, [department])

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
        tone: 'sky',
        count: n,
        title: n === 1 ? `New ${memberNoun} added: ${fresh[0].name}` : `${n} new ${memberNoun}s assigned to ${department}`,
        detail: `Added in the last ${NEW_MEMBER_DAYS} days.`,
        items: n > 1 ? fresh.map((m) => m.name).filter(Boolean) : [],
        actions: [
          open.team && { label: 'View team', onClick: open.team, primary: true },
          { label: 'Got it', onClick: () => { writeSeen(department, newest); setSeenAt(newest) } },
        ].filter(Boolean),
      })
    }

    // Overdue tasks
    const overdue = taskList.filter((t) => isOpenTask(t) && t.deadline && ms(t.deadline) < now)
    if (overdue.length) {
      const n = overdue.length
      alerts.push({
        id: 'overdue-tasks',
        tone: 'rose',
        count: n,
        title: n === 1 ? `Task overdue: ${overdue[0].taskTitle || overdue[0].title || 'Untitled task'}` : `${n} department tasks overdue`,
        detail: n === 1 ? `Due ${format(overdue[0].deadline, 'd MMM')}.` : '',
        items: n > 1 ? overdue.map((t) => t.taskTitle || t.title).filter(Boolean) : [],
        actions: open.tasks ? [{ label: 'View tasks', onClick: open.tasks, primary: true }] : [],
      })
    }

    // Cell reports overdue this week
    if (isCell && cellGroups.length) {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
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
        alerts.push({
          id: 'cell-reports-overdue',
          tone: 'amber',
          count: n,
          title: n === 1 ? `Cell report overdue: ${late[0].cellName}` : `${n} cell reports overdue this week`,
          detail: n === 1 ? `Met on ${late[0].meetingDay}${late[0].leader ? ` · ${late[0].leader}` : ''}.` : 'The meeting day has passed with no report.',
          items: n > 1 ? late.map((g) => g.cellName).filter(Boolean) : [],
          actions: open.reports ? [{ label: 'Open reports', onClick: open.reports, primary: true }] : [],
        })
      }
    }

    return alerts
  }, [team, taskList, seenAt, department, memberNoun, isCell, cellGroups, reports, viewAll, myCellKey, open.team, open.tasks, open.reports])
}
