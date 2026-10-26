import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckSquare } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { subscribeTasksForDepartments, markTaskCompleted } from '../../services/firestore'
import { getDepartmentIcon } from '../../constants/departments'
import { taskDeepLink, myTaskDepartmentNames, isTaskForViewer, isActiveTask, dedupeTasks, createdMs } from '../../utils/todoTasks'
import useRibbonState from '../../hooks/useRibbonState'
import DepartmentNotificationRibbon from '../DepartmentNotificationRibbon'

const personOf = (t) => t.consultPersonName || t.memberName || t.pcsPersonName || ''

// Actionable To-Do kinds, each folded into one yellow ribbon ("7 cell assignment
// inputs pending") — one task reads as its own title. Anything else on the To-Do
// List shares the last, catch-all ribbon.
const KINDS = [
  {
    key: 'cellAssignConsult',
    match: (t) => t.cellAssignConsult || t.taskType === 'cellAssignConsult',
    dept: 'D Light',
    one: (t) => `Cell assignment input needed: ${personOf(t) || t.taskTitle}`,
    many: (n) => `${n} cell assignment inputs pending`,
    link: '/department/d-light?tab=summary',
  },
  {
    key: 'addToDLight',
    match: (t) => t.taskType === 'addToDLight' || (t.pcsReferral && t.department === 'D Light'),
    dept: 'D Light',
    one: (t) => `Add ${personOf(t) || 'person'} to D-Light`,
    many: (n) => `${n} people to add to D-Light`,
    link: '/department/d-light?tab=visitorEntry',
  },
  {
    key: 'addToCellGroup',
    match: (t) => t.taskType === 'addToCellGroup' || (t.pcsReferral && t.department === 'Cell'),
    dept: 'Cell',
    one: (t) => `Add ${personOf(t) || 'person'} to a cell group`,
    many: (n) => `${n} people waiting for a cell group`,
    link: '/department/cell',
  },
  {
    key: 'other',
    match: () => true,
    dept: null,
    one: (t) => t.taskTitle || t.title || 'To-Do item',
    many: (n) => `${n} To-Do items pending`,
    link: '/tasks',
  },
]

/**
 * The To-Do List's actionable items as compact, half-width yellow ribbons on My
 * Workspace — same tasks, scoping and dedupe as ToDoListCard (utils/todoTasks).
 * Every ribbon opens a popup with "Remind me later" (24h, saved per user). A single
 * task also gets "Mark complete" (completes it and its duplicates, like the To-Do
 * List's ✓); a group gets "Got it", which hides it until a newer task of that kind
 * arrives — each person in a group still needs their own decision, so a group is
 * never completed in one tap.
 */
export default function TodoAlertRibbons() {
  const { user, userProfile, isFounder } = useAuth()
  const navigate = useNavigate()
  const ribbonState = useRibbonState()
  const [tasks, setTasks] = useState([])
  const [doneIds, setDoneIds] = useState(() => new Set())

  const myDepts = useMemo(() => myTaskDepartmentNames(userProfile), [userProfile])
  useEffect(
    () => subscribeTasksForDepartments(isFounder ? null : myDepts, setTasks),
    [isFounder, myDepts]
  )

  const uid = user?.uid
  const open = useMemo(
    () => dedupeTasks(
      tasks.filter((t) => isActiveTask(t) && isTaskForViewer(t, { uid, isFounder, userProfile })),
      doneIds
    ),
    [tasks, uid, isFounder, userProfile, doneIds]
  )

  const complete = (t) => {
    const ids = t.mergedTaskIds || [t.id]
    setDoneIds((prev) => new Set([...prev, ...ids]))
    Promise.all(ids.map((id) => markTaskCompleted(id))).catch(() => {
      setDoneIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
    })
  }

  const groups = []
  const left = [...open]
  KINDS.forEach((kind) => {
    const mine = left.filter(kind.match)
    mine.forEach((t) => left.splice(left.indexOf(t), 1))
    const seenKey = `todo.${kind.key}`
    const fresh = mine.filter((t) => createdMs(t) > ribbonState.seenAt(seenKey))
    if (!fresh.length) return
    const n = fresh.length
    const first = fresh[0]
    const go = (to) => () => navigate(to)
    const newest = Math.max(...fresh.map(createdMs))
    groups.push({
      kind,
      alert: {
        id: `todo-${kind.key}`,
        category: 'general_alert',
        kind: 'action',
        tone: 'amber',
        count: n,
        title: n === 1 ? kind.one(first) : kind.many(n),
        detail: n === 1 ? (first.notes || '') : '',
        items: n > 1 ? fresh.map((t) => personOf(t) || t.taskTitle).filter(Boolean) : [],
        actions: n === 1
          ? [
            { label: 'Open', onClick: go(taskDeepLink(first)), primary: true },
            { label: 'Mark complete', onClick: () => complete(first) },
          ]
          : [
            { label: 'Open', onClick: go(kind.link), primary: true },
            { label: 'Got it', onClick: () => ribbonState.markSeen(seenKey, newest) },
          ],
      },
    })
  })

  if (!groups.length) return null
  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ kind, alert }) => (
        <DepartmentNotificationRibbon
          key={kind.key}
          asModal
          flat
          icon={kind.dept ? getDepartmentIcon(kind.dept) : CheckSquare}
          departmentName={kind.dept ? `${kind.dept} · To-Do` : 'To-Do'}
          storageKey="todo"
          alerts={[alert]}
        />
      ))}
    </div>
  )
}
