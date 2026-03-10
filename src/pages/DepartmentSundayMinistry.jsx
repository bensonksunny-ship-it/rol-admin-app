import { useEffect, useState } from 'react'
import {
  getDepartmentEntries,
  addDepartmentEntry,
  getSundayPlan,
  setSundayPlanSection,
  getSundayMinistryTeamMembers,
  addSundayMinistryTeamMember,
  updateSundayMinistryTeamMember,
  deleteSundayMinistryTeamMember,
  getSundayMinistryBudgetItems,
  addSundayMinistryBudgetItem,
  updateSundayMinistryBudgetItem,
  deleteSundayMinistryBudgetItem,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'

const DEPARTMENT = 'Sunday Ministry'

export default function DepartmentSundayMinistry() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary')
  const [teamMembers, setTeamMembers] = useState([])
  const [formerMembers, setFormerMembers] = useState([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudget, setLoadingBudget] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [plan, setPlan] = useState(null)
  const [planNotes, setPlanNotes] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [editingBudgetItem, setEditingBudgetItem] = useState(null)
  const [budgetItemForm, setBudgetItemForm] = useState({
    category: '', subCategory: '', description: '', quantity: '', unitCost: '', totalCost: '', type: '', expectedDate: '',
  })
  const [newMember, setNewMember] = useState({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false })
  const [editMember, setEditMember] = useState(null)
  const [form, setForm] = useState({ period: format(new Date(), 'yyyy-MM'), plannedBudget: '', spent: '' })

  const isDirector = userProfile?.department === DEPARTMENT
  const canManage = isDirector || isFounder

  useEffect(() => {
    getDepartmentEntries(DEPARTMENT, { limit: 100 }).then(setEntries).catch(() => setEntries([])).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    Promise.all([
      getSundayMinistryTeamMembers({ former: false }).catch(() => []),
      getSundayMinistryTeamMembers({ former: true }).catch(() => []),
    ]).then(([current, former]) => {
      setTeamMembers(current)
      setFormerMembers(former)
    }).finally(() => setLoadingTeam(false))
  }, [])

  useEffect(() => {
    setLoadingBudget(true)
    getSundayMinistryBudgetItems().then(setBudgetItems).catch(() => setBudgetItems([])).finally(() => setLoadingBudget(false))
  }, [])

  useEffect(() => {
    getSundayPlan(selectedDate).then((p) => {
      setPlan(p || {})
      setPlanNotes(p?.[SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]?.notes ?? '')
    })
  }, [selectedDate])

  async function loadBudgetItems() {
    const items = await getSundayMinistryBudgetItems()
    setBudgetItems(items)
  }

  async function loadTeam() {
    const current = await getSundayMinistryTeamMembers({ former: false })
    const former = await getSundayMinistryTeamMembers({ former: true })
    setTeamMembers(current)
    setFormerMembers(former)
  }

  if (!canManage) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to the Sunday Ministry department page. Set your <strong>department</strong> to &quot;Sunday Ministry&quot; in Firestore or sign in as Founder.
      </div>
    )
  }

  const budget2026 = entries
    .filter((e) => e.type === 'budget' && typeof e.period === 'string' && e.period.startsWith('2026-'))
    .reduce((acc, e) => {
      acc.planned += e.data?.planned || 0
      acc.spent += e.data?.spent || 0
      return acc
    }, { planned: 0, spent: 0 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Sunday Ministry (Director)</h1>
        <p className="text-slate-500 mt-1">Plan, budget, team, and report. This page is for the Sunday Ministry director and Founder.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {['summary', 'planning', 'budget', 'team', 'report'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg capitalize ${
              activeTab === tab ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab === 'budget' ? 'Budget & Spending' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl shadow-lg p-6 text-white max-w-3xl">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-90">Budget 2026 (Sunday Ministry)</h2>
            <div className="mt-3 flex flex-wrap gap-8">
              <div><p className="text-xs opacity-80">Total planned</p><p className="text-2xl font-bold">{budget2026.planned.toLocaleString()} RM</p></div>
              <div><p className="text-xs opacity-80">Total spent</p><p className="text-2xl font-bold">{budget2026.spent.toLocaleString()} RM</p></div>
              <div><p className="text-xs opacity-80">Balance</p><p className="text-xl font-semibold">{(budget2026.planned - budget2026.spent).toLocaleString()} RM</p></div>
            </div>
          </div>
          <p className="text-sm text-slate-600">Team members: {teamMembers.length} active, {formerMembers.length} former. Use the Planning and Budget tabs to edit.</p>
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Sunday Ministry planning (syncs with Sunday Planning page)</h2>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <label className="text-sm text-slate-700">Date:</label>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-300" />
            <button type="button" onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">← Prev</button>
            <button type="button" onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))} className="px-3 py-2 rounded-lg border border-slate-300 text-sm">Next →</button>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault()
            setSavingPlan(true)
            try {
              await setSundayPlanSection(selectedDate, SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY, { notes: planNotes })
              setPlan((p) => ({ ...p, [SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]: { notes: planNotes } }))
            } finally {
              setSavingPlan(false)
            }
          }} className="space-y-3">
            <textarea value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} placeholder="Planning notes for Sunday Ministry team..." className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[140px]" rows={5} />
            <button type="submit" disabled={savingPlan} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">{savingPlan ? 'Saving...' : 'Save section'}</button>
          </form>
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Detailed budget (item list)</h2>
            {canManage && (
              <form onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const payload = {
                    category: budgetItemForm.category, subCategory: budgetItemForm.subCategory, description: budgetItemForm.description,
                    quantity: Number(budgetItemForm.quantity) || 0, unitCost: Number(budgetItemForm.unitCost) || 0,
                    totalCost: budgetItemForm.totalCost !== '' ? Number(budgetItemForm.totalCost) || 0 : (Number(budgetItemForm.quantity) || 0) * (Number(budgetItemForm.unitCost) || 0),
                    type: budgetItemForm.type, expectedDate: budgetItemForm.expectedDate,
                  }
                  if (editingBudgetItem) await updateSundayMinistryBudgetItem(editingBudgetItem.id, payload)
                  else await addSundayMinistryBudgetItem(payload, userProfile?.email)
                  setBudgetItemForm({ category: '', subCategory: '', description: '', quantity: '', unitCost: '', totalCost: '', type: '', expectedDate: '' })
                  setEditingBudgetItem(null)
                  await loadBudgetItems()
                } catch (err) {
                  console.error(err)
                  alert('Failed to save')
                }
              }} className="mb-4 grid grid-cols-1 md:grid-cols-8 gap-3 items-end">
                <input type="text" placeholder="Category" value={budgetItemForm.category} onChange={(e) => setBudgetItemForm((f) => ({ ...f, category: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300 text-sm" required />
                <input type="text" placeholder="Sub" value={budgetItemForm.subCategory} onChange={(e) => setBudgetItemForm((f) => ({ ...f, subCategory: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300 text-sm" />
                <input type="text" placeholder="Description" value={budgetItemForm.description} onChange={(e) => setBudgetItemForm((f) => ({ ...f, description: e.target.value }))} className="md:col-span-2 px-2 py-1.5 rounded border border-slate-300 text-sm" required />
                <input type="number" min="0" placeholder="Qty" value={budgetItemForm.quantity} onChange={(e) => setBudgetItemForm((f) => ({ ...f, quantity: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300 text-sm w-20" />
                <input type="number" min="0" step="0.01" placeholder="Unit RM" value={budgetItemForm.unitCost} onChange={(e) => setBudgetItemForm((f) => ({ ...f, unitCost: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300 text-sm w-24" />
                <input type="number" min="0" step="0.01" placeholder="Total RM" value={budgetItemForm.totalCost} onChange={(e) => setBudgetItemForm((f) => ({ ...f, totalCost: e.target.value }))} className="px-2 py-1.5 rounded border border-slate-300 text-sm w-24" />
                <div className="flex gap-2">
                  {editingBudgetItem && <button type="button" onClick={() => { setEditingBudgetItem(null); setBudgetItemForm({ category: '', subCategory: '', description: '', quantity: '', unitCost: '', totalCost: '', type: '', expectedDate: '' }) }} className="px-2 py-1.5 rounded border text-sm">Cancel</button>}
                  <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">{editingBudgetItem ? 'Update' : 'Add line'}</button>
                </div>
              </form>
            )}
            {loadingBudget ? <p className="text-slate-500">Loading...</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr><th className="text-left px-3 py-2">Category</th><th className="text-left px-3 py-2">Sub</th><th className="text-left px-3 py-2">Description</th><th className="text-right px-3 py-2">Total (RM)</th>{canManage && <th className="px-3 py-2">Action</th>}</tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {budgetItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">{item.category}</td><td className="px-3 py-2">{item.subCategory}</td>
                        <td className="px-3 py-2 max-w-xs truncate">{item.description}</td><td className="px-3 py-2 text-right font-medium">{item.totalCost?.toLocaleString() ?? 0}</td>
                        {canManage && (
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => { setEditingBudgetItem(item); setBudgetItemForm({ category: item.category || '', subCategory: item.subCategory || '', description: item.description || '', quantity: item.quantity != null ? String(item.quantity) : '', unitCost: item.unitCost != null ? String(item.unitCost) : '', totalCost: item.totalCost != null ? String(item.totalCost) : '', type: item.type || '', expectedDate: item.expectedDate || '' }) }} className="text-blue-600 text-xs mr-2">Edit</button>
                            <button type="button" onClick={async () => { if (!window.confirm('Delete?')) return; await deleteSundayMinistryBudgetItem(item.id); await loadBudgetItems(); if (editingBudgetItem?.id === item.id) setEditingBudgetItem(null) }} className="text-red-600 text-xs">Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Add budget / spending (per month)</h2>
            <form onSubmit={async (e) => {
              e.preventDefault()
              try {
                await addDepartmentEntry({ department: DEPARTMENT, period: form.period, type: 'budget', enteredBy: userProfile?.email || 'unknown', data: { planned: Number(form.plannedBudget) || 0, spent: Number(form.spent) || 0 } })
                setForm((f) => ({ ...f, plannedBudget: '', spent: '' }))
                setEntries(await getDepartmentEntries(DEPARTMENT, { limit: 100 }))
              } catch (err) { console.error(err); alert('Failed to save') }
            }} className="flex flex-wrap gap-4 items-end">
              <div><label className="block text-sm text-slate-700 mb-1">Period (month)</label><input type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300" /></div>
              <div><label className="block text-sm text-slate-700 mb-1">Planned (RM)</label><input type="number" min="0" value={form.plannedBudget} onChange={(e) => setForm((f) => ({ ...f, plannedBudget: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-32" /></div>
              <div><label className="block text-sm text-slate-700 mb-1">Spent (RM)</label><input type="number" min="0" value={form.spent} onChange={(e) => setForm((f) => ({ ...f, spent: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-32" /></div>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Save</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-3">Add team member</h3>
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!newMember.name.trim()) return
              try {
                await addSundayMinistryTeamMember({ name: newMember.name.trim(), memberSince: newMember.memberSince, isFormer: newMember.isFormer }, userProfile?.email)
                setNewMember({ name: '', memberSince: new Date().toISOString().slice(0, 10), isFormer: false })
                await loadTeam()
              } catch (err) { console.error(err); alert('Failed to add') }
            }} className="flex flex-wrap gap-3 items-end">
              <input type="text" placeholder="Name" value={newMember.name} onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300 w-40" />
              <input type="date" value={newMember.memberSince} onChange={(e) => setNewMember((m) => ({ ...m, memberSince: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-300" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newMember.isFormer} onChange={(e) => setNewMember((m) => ({ ...m, isFormer: e.target.checked }))} />Former</label>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Add</button>
            </form>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <h3 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Team</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="text-left px-5 py-3">Name</th><th className="text-left px-5 py-3">Member since</th><th className="text-left px-5 py-3">Status</th>{canManage && <th className="px-5 py-3">Action</th>}</tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {[...teamMembers, ...formerMembers].map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium">{m.name}</td>
                      <td className="px-5 py-3 text-slate-600">{m.memberSince ? formatDMY(m.memberSince) : ''}</td>
                      <td className="px-5 py-3">{m.isFormer ? 'Former' : 'Active'}</td>
                      {canManage && (
                        <td className="px-5 py-3">
                          <button type="button" onClick={() => setEditMember(m)} className="text-blue-600 text-xs mr-2">Edit</button>
                          <button type="button" onClick={async () => { if (!window.confirm('Remove member?')) return; await updateSundayMinistryTeamMember(m.id, { isFormer: true }); await loadTeam() }} className="text-slate-600 text-xs mr-2">Make former</button>
                          <button type="button" onClick={async () => { if (!window.confirm('Delete?')) return; await deleteSundayMinistryTeamMember(m.id); setEditMember(null); await loadTeam() }} className="text-red-600 text-xs">Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {editMember && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
                <h3 className="font-semibold mb-3">Edit member</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  try {
                    await updateSundayMinistryTeamMember(editMember.id, { name: editMember.name, memberSince: editMember.memberSince, isFormer: editMember.isFormer })
                    setEditMember(null)
                    await loadTeam()
                  } catch (err) { console.error(err); alert('Failed') }
                }} className="space-y-3">
                  <input type="text" value={editMember.name} onChange={(e) => setEditMember((m) => ({ ...m, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" required />
                  <input type="date" value={editMember.memberSince || ''} onChange={(e) => setEditMember((m) => ({ ...m, memberSince: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-slate-300" />
                  <label className="flex items-center gap-2"><input type="checkbox" checked={editMember.isFormer || false} onChange={(e) => setEditMember((m) => ({ ...m, isFormer: e.target.checked }))} />Former</label>
                  <div className="flex gap-2"><button type="button" onClick={() => setEditMember(null)} className="px-3 py-2 rounded border">Cancel</button><button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Save</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-semibold text-slate-800 border-b border-slate-200">Report (department entries)</h2>
          {loading ? <div className="p-8 text-center text-slate-500">Loading...</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="text-left px-5 py-3">Period / Type</th><th className="text-left px-5 py-3">Data</th><th className="text-left px-5 py-3">Entered by</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.filter((e) => e.type !== 'budget' || e.period).map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">{e.period || e.type}</td>
                      <td className="px-5 py-3 text-slate-600">{e.type === 'budget' ? `Planned: ${e.data?.planned ?? 0}, Spent: ${e.data?.spent ?? 0}` : e.type === 'team' ? (e.data?.notes || '—') : JSON.stringify(e.data || {})}</td>
                      <td className="px-5 py-3 text-slate-500">{e.enteredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
