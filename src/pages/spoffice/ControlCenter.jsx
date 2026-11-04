import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format, addDays } from 'date-fns'
import { CalendarClock, ClipboardList, ListChecks, Users } from 'lucide-react'
import {
  subscribeToSpOfficeSchedule, updateSpOfficeScheduleItem,
  subscribeApplicationsByStatus,
  subscribeSpOfficeFollowUps, createTask, updateTask, markTaskCompleted,
  subscribeToBoardMeetings, subscribeToBoardPoints,
} from '../../services/firestore'
import { APPLICATION_TYPES, APPLICATION_TYPE_KEYS, isOfficeReady, needsOfficePrep } from '../../utils/pastoralApplications'
import { DEPARTMENT_LIST } from '../../constants/departments'
import { formatDMY, formatDisplayDate } from '../../utils/date'
import DateInput from '../../components/DateInput'

const todayStr = () => format(new Date(), 'yyyy-MM-dd')
const byTime = (a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
const DONE_TASK = ['Completed', 'Turned Down', 'Dismissed']
const EMPTY_FOLLOW_UP = { taskTitle: '', department: '', assignedPerson: '', deadline: '', notes: '' }

function Section({ icon, title, badge, action, children }) {
  const Icon = icon
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Icon size={16} className="text-indigo-500 shrink-0" />
        <h3 className="text-sm font-bold text-slate-800 flex-1">{title}</h3>
        {badge}
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ children }) => <p className="px-4 py-6 text-sm text-slate-400 text-center">{children}</p>
const linkBtn = 'text-xs font-semibold text-indigo-600 hover:underline'

/**
 * SP Office → Control Center (the department's home tab): the office secretary's
 * workspace at a glance — the Senior Pastor's diary for today and tomorrow,
 * applications waiting to be prepared, follow-ups the office has given other
 * departments, and upcoming Director Board meetings. Each section links to its
 * full page (Daily Schedule, Applications) where there is one.
 */
export default function ControlCenter({ canEdit, userProfile, onOpenTab }) {
  const who = userProfile?.displayName || userProfile?.email || ''
  return (
    <div className="space-y-4">
      <div className="px-1">
        <h2 className="text-lg font-bold text-slate-900">SP Office Control Center</h2>
        <p className="text-sm text-slate-500">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DiarySection canEdit={canEdit} who={who} onOpen={() => onOpenTab('dailySchedule')} />
        <ApplicationsSection onOpen={(params) => onOpenTab('applications', params)} />
        <FollowUpSection canEdit={canEdit} who={who} />
        <BoardMeetingsSection />
      </div>
    </div>
  )
}

function DiarySection({ canEdit, who, onOpen }) {
  const today = todayStr()
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const [items, setItems] = useState({ [today]: [], [tomorrow]: [] })
  const [error, setError] = useState('')
  useEffect(() => {
    const subs = [today, tomorrow].map((d) => subscribeToSpOfficeSchedule(d,
      (list) => setItems((prev) => ({ ...prev, [d]: list })),
      () => setError('Could not load the diary.')))
    return () => subs.forEach((u) => u())
  }, [today, tomorrow])

  const toggleDone = (item) => updateSpOfficeScheduleItem(item.id, { done: !item.done }, who).catch(() => setError('Could not update the item.'))

  const day = (dateStr, label) => {
    const list = [...(items[dateStr] || [])].sort(byTime)
    return (
      <div>
        <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {list.length === 0 ? (
          <p className="px-4 pb-2 text-sm text-slate-400">Nothing scheduled.</p>
        ) : (
          <ul className="pb-1">
            {list.map((it) => (
              <li key={it.id} className="px-4 py-1.5 flex items-start gap-3">
                <input type="checkbox" checked={!!it.done} disabled={!canEdit} onChange={() => toggleDone(it)}
                  className="mt-1 h-4 w-4 accent-indigo-600" aria-label={`Mark ${it.title} done`} />
                <span className="text-xs font-semibold text-slate-500 tabular-nums w-24 shrink-0 pt-0.5">
                  {it.startTime || '—'}{it.endTime ? `–${it.endTime}` : ''}
                </span>
                <span className={`text-sm flex-1 ${it.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                  {it.title}
                  {it.notes && <span className="block text-xs text-slate-400">{it.notes}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const left = (items[today] || []).filter((i) => !i.done).length
  return (
    <Section icon={CalendarClock} title="Senior Pastor's Diary"
      badge={<span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{left} left today</span>}
      action={<button type="button" onClick={onOpen} className={linkBtn}>Open diary →</button>}>
      {day(today, 'Today')}
      {day(tomorrow, 'Tomorrow')}
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
    </Section>
  )
}

function ApplicationsSection({ onOpen }) {
  const [apps, setApps] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    const unsubs = APPLICATION_TYPE_KEYS.map((type) => subscribeApplicationsByStatus(type, ['submitted'],
      (list) => setApps((prev) => ({ ...prev, [type]: list })),
      () => { setApps((prev) => ({ ...prev, [type]: [] })); setError('Some applications could not be loaded.') }))
    return () => unsubs.forEach((u) => u())
  }, [])
  const submitted = APPLICATION_TYPE_KEYS.flatMap((type) => (apps[type] || []).map((app) => ({ type, app })))
  const toPrepare = submitted.filter(({ app }) => needsOfficePrep(app))
    .sort((a, b) => (a.app.submittedAt?.getTime?.() || 0) - (b.app.submittedAt?.getTime?.() || 0))
  const ready = submitted.filter(({ app }) => isOfficeReady(app)).length
  return (
    <Section icon={ClipboardList} title="Applications to prepare"
      badge={<span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${toPrepare.length ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{toPrepare.length}</span>}
      action={<button type="button" onClick={() => onOpen()} className={linkBtn}>Open desk →</button>}>
      {toPrepare.length === 0 ? <Empty>Nothing waiting to be prepared.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {toPrepare.slice(0, 5).map(({ type, app }) => {
            const t = APPLICATION_TYPES[type]
            return (
              <li key={`${type}-${app.id}`}>
                <button type="button" onClick={() => onOpen({ openApp: `${type}:${app.id}` })}
                  className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50">
                  <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{t.title(app) || 'Applicant'}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.cls}`}>{t.short}</span>
                  <span className="text-xs text-slate-400 tabular-nums">{app.submittedAt ? formatDMY(app.submittedAt) : ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
        {ready} ready for approval{toPrepare.length > 5 ? ` · ${toPrepare.length - 5} more to prepare` : ''}
      </p>
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
    </Section>
  )
}

function FollowUpSection({ canEdit, who }) {
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [form, setForm] = useState(null) // null = closed; else the draft (with optional id when editing)
  const [saving, setSaving] = useState(false)
  useEffect(() => subscribeSpOfficeFollowUps(setTasks, () => setError('Could not load follow-ups — the SP Office access rules may not be live yet.')), [])

  const today = todayStr()
  const isOverdue = (t) => t.deadline && format(t.deadline, 'yyyy-MM-dd') < today
  const open = useMemo(() => tasks.filter((t) => !DONE_TASK.includes(t.status))
    .sort((a, b) => (Number(isOverdue(b)) - Number(isOverdue(a))) || ((a.deadline?.getTime?.() ?? Infinity) - (b.deadline?.getTime?.() ?? Infinity))), [tasks]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = tasks.filter((t) => DONE_TASK.includes(t.status))
    .sort((a, b) => (b.completedAt?.getTime?.() || 0) - (a.completedAt?.getTime?.() || 0)).slice(0, 10)
  const overdueCount = open.filter(isOverdue).length

  const save = async () => {
    if (!form.taskTitle.trim() || !form.department) { setError('Give the follow-up a title and a department.'); return }
    setSaving(true); setError('')
    const data = {
      taskTitle: form.taskTitle.trim(),
      department: form.department,
      assignedPerson: form.assignedPerson.trim(),
      deadline: form.deadline || null,
      notes: form.notes.trim(),
    }
    try {
      if (form.id) await updateTask(form.id, data)
      else await createTask({ ...data, priority: 'Medium', status: 'Pending', spOfficeFollowUp: true, createdBy: who })
      setForm(null)
    } catch (e) {
      console.error('SP Office follow-up save', e)
      setError('Could not save the follow-up.')
    }
    setSaving(false)
  }

  const row = (t) => (
    <li key={t.id} className="px-4 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${DONE_TASK.includes(t.status) ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.taskTitle || 'Untitled'}</p>
        <p className="text-xs text-slate-500">
          {[t.department, t.assignedPerson, t.status && t.status !== 'Pending' ? t.status : ''].filter(Boolean).join(' · ')}
        </p>
        {t.notes && <p className="text-xs text-slate-400 truncate">{t.notes}</p>}
      </div>
      {t.deadline && (
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${!DONE_TASK.includes(t.status) && isOverdue(t) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {!DONE_TASK.includes(t.status) && isOverdue(t) ? 'Overdue · ' : 'Due '}{formatDMY(t.deadline)}
        </span>
      )}
      {canEdit && !DONE_TASK.includes(t.status) && (
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={() => setForm({ id: t.id, taskTitle: t.taskTitle || '', department: t.department || '', assignedPerson: t.assignedPerson || '', deadline: t.deadline ? format(t.deadline, 'yyyy-MM-dd') : '', notes: t.notes || '' })}
            className="px-2 py-1 text-[11px] rounded-lg border border-slate-300 font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
          <button type="button" onClick={() => markTaskCompleted(t.id).catch(() => setError('Could not mark it done.'))}
            className="px-2 py-1 text-[11px] rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">Done</button>
        </div>
      )}
    </li>
  )

  return (
    <Section icon={ListChecks} title="Follow-up desk"
      badge={overdueCount > 0 && <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">{overdueCount} overdue</span>}
      action={canEdit && <button type="button" onClick={() => { setError(''); setForm({ ...EMPTY_FOLLOW_UP }) }} className={linkBtn}>+ New</button>}>
      {open.length === 0 ? <Empty>No open follow-ups.</Empty> : <ul className="divide-y divide-slate-100">{open.map(row)}</ul>}
      <div className="px-4 py-2 border-t border-slate-100">
        <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
          {showDone ? 'Hide completed' : `Show recently completed (${done.length})`}
        </button>
      </div>
      {showDone && done.length > 0 && <ul className="divide-y divide-slate-100 bg-slate-50/50">{done.map(row)}</ul>}
      {error && !form && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}

      {form && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-slate-900">{form.id ? 'Edit follow-up' : 'New follow-up'}</p>
            <p className="text-xs text-slate-500">It appears on that department's To-Do on their My Workspace. You'll see here when they mark it done.</p>
            <input value={form.taskTitle} onChange={(e) => setForm((f) => ({ ...f, taskTitle: e.target.value }))} autoFocus
              placeholder="What needs to be done" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
            <select value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white">
              <option value="">Department…</option>
              {DEPARTMENT_LIST.filter((d) => d.name !== 'SP Office').map((d) => <option key={d.slug} value={d.name}>{d.name}</option>)}
            </select>
            <input value={form.assignedPerson} onChange={(e) => setForm((f) => ({ ...f, assignedPerson: e.target.value }))}
              placeholder="Person responsible (optional)" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Due date (optional)</label>
              <DateInput value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
              placeholder="Notes (optional)" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm resize-none" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="button" disabled={saving} onClick={save} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Section>
  )
}

function BoardMeetingsSection() {
  const [meetings, setMeetings] = useState([])
  const [points, setPoints] = useState([])
  const [error, setError] = useState('')
  useEffect(() => subscribeToBoardMeetings(setMeetings, () => setError('Could not load board meetings.')), [])
  useEffect(() => subscribeToBoardPoints(setPoints), [])
  const today = todayStr()
  const upcoming = meetings.filter((m) => m.date && m.date >= today && m.status !== 'cancelled').slice(0, 3)
  const pointsFor = (m) => points.filter((p) => (p.meetingId ? p.meetingId === m.id : p.meetingDate === m.date))
  return (
    <Section icon={Users} title="Director Board meetings">
      {upcoming.length === 0 ? <Empty>No upcoming board meetings.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {upcoming.map((m) => {
            const ps = pointsFor(m)
            const pending = ps.filter((p) => p.status === 'pending').length
            return (
              <li key={m.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{m.title || 'Director Board Meeting'}</p>
                <p className="text-xs text-slate-500">
                  {[formatDisplayDate(m.date), m.time, m.venue].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ps.length} agenda point{ps.length === 1 ? '' : 's'}{pending ? ` · ${pending} awaiting Sec-Core review` : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="px-4 pb-3 text-xs text-red-600">{error}</p>}
    </Section>
  )
}
