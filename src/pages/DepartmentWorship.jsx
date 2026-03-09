import { useEffect, useState } from 'react'
import { getDepartmentEntries, addDepartmentEntry } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { format, subMonths } from 'date-fns'

const DEPARTMENT = 'Worship'
const PERIOD = format(new Date(), 'yyyy-MM')

export default function DepartmentWorship() {
  const { userProfile, hasPermission } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('entry')
  const [form, setForm] = useState({
    type: 'team',
    period: PERIOD,
    teamNotes: '',
    plannedBudget: '',
    spent: '',
    participantsCount: '',
    activityNotes: '',
  })

  const isDirector = userProfile?.department === DEPARTMENT
  const isPastor = hasPermission('viewDepartmentInsights')

  useEffect(() => {
    getDepartmentEntries(DEPARTMENT, { limit: 100 }).then(setEntries).finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      department: DEPARTMENT,
      period: form.period,
      type: form.type,
      enteredBy: userProfile?.email || 'unknown',
      data: {},
    }
    if (form.type === 'team') payload.data = { notes: form.teamNotes }
    if (form.type === 'budget') payload.data = { planned: Number(form.plannedBudget) || 0, spent: Number(form.spent) || 0 }
    if (form.type === 'participation') payload.data = { count: Number(form.participantsCount) || 0, notes: form.activityNotes }
    try {
      await addDepartmentEntry(payload)
      setForm((f) => ({ ...f, teamNotes: '', plannedBudget: '', spent: '', participantsCount: '', activityNotes: '' }))
      setEntries(await getDepartmentEntries(DEPARTMENT, { limit: 100 }))
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  // Build charts for pastor insights
  const last6Months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), 'yyyy-MM'))
  const participationByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'participation')
    const total = items.reduce((s, e) => s + (e.data?.count || 0), 0)
    return { period, participants: total }
  })
  const budgetByMonth = last6Months.map((period) => {
    const items = entries.filter((e) => e.period === period && e.type === 'budget')
    const planned = items.reduce((s, e) => s + (e.data?.planned || 0), 0)
    const spent = items.reduce((s, e) => s + (e.data?.spent || 0), 0)
    return { period, planned, spent }
  })

  const canEnter = isDirector
  const canViewInsights = isPastor

  if (!canEnter && !canViewInsights) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Worship department page. Ask an admin to set your <strong>department</strong> to &quot;Worship&quot; in Firestore (users collection) to enter data, or use a role that can view insights.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Worship Department</h1>
        <p className="text-slate-500 mt-1">
          {isDirector && 'Plan your team, budget, and participation. Data is visible to the pastor for insights.'}
          {isPastor && !isDirector && 'Insights from Worship director entries – participation, budget, and activity.'}
          {isPastor && isDirector && 'Enter data as director; view insights below.'}
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {canEnter && (
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'entry' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Data entry
          </button>
        )}
        {canViewInsights && (
          <button
            type="button"
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
              activeTab === 'insights' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Insights (pastor)
          </button>
        )}
      </div>

      {activeTab === 'entry' && canEnter && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Add entry</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                >
                  <option value="team">Team planning</option>
                  <option value="budget">Budget / money spent</option>
                  <option value="participation">Participation (number of people)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Period (month)</label>
                <input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              {form.type === 'team' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team / assignments notes</label>
                  <textarea
                    value={form.teamNotes}
                    onChange={(e) => setForm((f) => ({ ...f, teamNotes: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    rows={3}
                    placeholder="e.g. Lead: John, Keys: Mary, Drums: ..."
                  />
                </div>
              )}
              {form.type === 'budget' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Planned budget (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.plannedBudget}
                      onChange={(e) => setForm((f) => ({ ...f, plannedBudget: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Money spent (RM)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.spent}
                      onChange={(e) => setForm((f) => ({ ...f, spent: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </>
              )}
              {form.type === 'participation' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Number of people participating</label>
                    <input
                      type="number"
                      min="0"
                      value={form.participantsCount}
                      onChange={(e) => setForm((f) => ({ ...f, participantsCount: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Activity notes (optional)</label>
                    <textarea
                      value={form.activityNotes}
                      onChange={(e) => setForm((f) => ({ ...f, activityNotes: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      rows={2}
                    />
                  </div>
                </>
              )}
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                Save entry
              </button>
            </form>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Recent entries (your data → pastor sees this)</h2>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No entries yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Period</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Details</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Entered by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.slice(0, 20).map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-800">{e.period}</td>
                        <td className="px-5 py-3 text-slate-600 capitalize">{e.type}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {e.type === 'team' && (e.data?.notes || '—')}
                          {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                          {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{e.enteredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'insights' && canViewInsights && (
        <div className="space-y-6">
          <p className="text-slate-600">Analytics from Worship director entries. Same data they enter, aggregated for you.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Participation over time</h2>
              {participationByMonth.some((p) => p.participants > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={participationByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="participants" stroke="#1e40af" strokeWidth={2} name="Participants" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">No participation data yet.</p>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">Budget vs spent (by month)</h2>
              {budgetByMonth.some((b) => b.planned > 0 || b.spent > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={budgetByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="planned" fill="#10b981" name="Planned (RM)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="spent" fill="#ef4444" name="Spent (RM)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-slate-500 py-8 text-center">No budget data yet.</p>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">All Worship entries (activity)</h2>
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No entries yet from the director.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Period</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Details</th>
                      <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Entered by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-800">{e.period}</td>
                        <td className="px-5 py-3 text-slate-600 capitalize">{e.type}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {e.type === 'team' && (e.data?.notes || '—')}
                          {e.type === 'budget' && `Planned: ${e.data?.planned ?? 0} RM, Spent: ${e.data?.spent ?? 0} RM`}
                          {e.type === 'participation' && `${e.data?.count ?? 0} people`}
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-sm">{e.enteredBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
