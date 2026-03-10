import { useEffect, useState } from 'react'
import { getTasks, createTask, updateTask, deleteTask } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { DEPARTMENTS, TASK_STATUS, TASK_PRIORITY } from '../constants/roles'
import { format } from 'date-fns'
import { formatDMY } from '../utils/date'

export default function Tasks() {
  const { hasPermission } = useAuth()
  const [allTasks, setAllTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({
    taskTitle: '',
    department: '',
    assignedPerson: '',
    priority: 'Medium',
    deadline: '',
    status: 'Pending',
    notes: '',
  })

  const canEdit = hasPermission('tasks')

  useEffect(() => {
    loadTasks()
  }, [])


  async function loadTasks() {
    setLoading(true)
    const data = await getTasks()
    setAllTasks(data)
    setLoading(false)
  }

  const tasks = allTasks.filter((t) => {
    if (filterDept && t.department !== filterDept) return false
    if (filterStatus && t.status !== filterStatus) return false
    return true
  })

  function openAdd() {
    setForm({
      taskTitle: '',
      department: '',
      assignedPerson: '',
      priority: 'Medium',
      deadline: '',
      status: 'Pending',
      notes: '',
    })
    setModal('add')
  }

  function openEdit(t) {
    setForm({
      id: t.id,
      taskTitle: t.taskTitle || '',
      department: t.department || '',
      assignedPerson: t.assignedPerson || '',
      priority: t.priority || 'Medium',
      deadline: t.deadline ? format(new Date(t.deadline), 'yyyy-MM-dd') : '',
      status: t.status || 'Pending',
      notes: t.notes || '',
    })
    setModal('edit')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (modal === 'add') {
        await createTask({
          taskTitle: form.taskTitle,
          department: form.department,
          assignedPerson: form.assignedPerson,
          priority: form.priority,
          deadline: form.deadline || null,
          status: form.status,
          notes: form.notes,
        })
      } else {
        await updateTask(form.id, {
          taskTitle: form.taskTitle,
          department: form.department,
          assignedPerson: form.assignedPerson,
          priority: form.priority,
          deadline: form.deadline || null,
          status: form.status,
          notes: form.notes,
        })
      }
      setModal(null)
      loadTasks()
    } catch (err) {
      console.error(err)
      alert('Failed to save task')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      loadTasks()
      setModal(null)
    } catch (err) {
      console.error(err)
      alert('Failed to delete')
    }
  }

  const pending = tasks.filter((t) => t.status === 'Pending' || t.status === 'In Progress')
  const completed = tasks.filter((t) => t.status === 'Completed')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Task Management</h1>
          <p className="text-slate-500 mt-1">SP Office coordination – replace Excel workflow</p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            + Add Task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Completed</p>
          <p className="text-2xl font-bold text-emerald-600">{completed.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        >
          <option value="">All statuses</option>
          {Object.values(TASK_STATUS).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No tasks match filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Task</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Department</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Assigned</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Priority</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Deadline</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Status</th>
                  {canEdit && <th className="px-5 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">{t.taskTitle}</td>
                    <td className="px-5 py-3 text-slate-600">{t.department || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{t.assignedPerson || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                        {t.priority || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDMY(t.deadline)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          t.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : t.status === 'In Progress'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3">
                        <button
                          onClick={() => openEdit(t)}
                          className="text-blue-600 hover:underline text-sm mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold">{modal === 'add' ? 'Add Task' : 'Edit Task'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Task Title *</label>
                <input
                  value={form.taskTitle}
                  onChange={(e) => setForm((f) => ({ ...f, taskTitle: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="">Select</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assigned Person</label>
                <input
                  value={form.assignedPerson}
                  onChange={(e) => setForm((f) => ({ ...f, assignedPerson: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  >
                    {TASK_PRIORITY.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  {Object.values(TASK_STATUS).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {modal === 'edit' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(form.id)}
                    className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 ml-auto"
                  >
                    Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
