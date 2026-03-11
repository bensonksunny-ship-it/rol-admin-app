import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  getFinanceIncome,
  getFinanceExpense,
  createFinanceIncome,
  createFinanceExpense,
  getFinanceBudgetItems,
  addFinanceBudgetItem,
  updateFinanceBudgetItem,
  deleteFinanceBudgetItem,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { INCOME_TYPES, EXPENSE_CATEGORIES } from '../constants/roles'
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import { formatDMY } from '../utils/date'

const PIE_COLORS = ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#10b981', '#34d399', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#a78bfa', '#6366f1']

export default function Finance() {
  const { hasPermission, userProfile } = useAuth()
  const [income, setIncome] = useState([])
  const [expense, setExpense] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ type: 'income', date: format(new Date(), 'yyyy-MM-dd'), category: '', amount: '', description: '' })
  const [budgetItems, setBudgetItems] = useState([])
  const [loadingBudget, setLoadingBudget] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState(null)
  const [budgetForm, setBudgetForm] = useState({
    category: '',
    subCategory: '',
    description: '',
    quantity: '',
    unitCost: '',
    priority: 'Medium',
    type: 'Recurring',
    justification: '',
    expectedDate: format(new Date(), 'yyyy-MM-dd'),
  })

  const canEnter = hasPermission('enterFinance')

  useEffect(() => {
    load()
  }, [year, month])

  useEffect(() => {
    if (tab === 'budget') loadBudget()
  }, [tab])

  async function load() {
    setLoading(true)
    const filters = { year }
    if (month !== '') filters.month = parseInt(month, 10)
    const [inc, exp] = await Promise.all([
      getFinanceIncome(filters),
      getFinanceExpense(filters),
    ])
    setIncome(inc)
    setExpense(exp)
    setLoading(false)
  }

  async function loadBudget() {
    setLoadingBudget(true)
    try {
      const list = await getFinanceBudgetItems()
      setBudgetItems(list)
    } catch (e) {
      console.error(e)
    }
    setLoadingBudget(false)
  }

  const totalIncome = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalExpense = expense.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance = totalIncome - totalExpense

  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date(),
  }).reverse()

  const incomeVsExpenseChart = last6Months.map((m) => {
    const start = startOfMonth(m)
    const end = endOfMonth(m)
    const inc = income
      .filter((i) => i.date && new Date(i.date) >= start && new Date(i.date) <= end)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const exp = expense
      .filter((e) => e.date && new Date(e.date) >= start && new Date(e.date) <= end)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { month: format(m, 'MMM'), income: inc, expense: exp }
  })

  const incomeByType = INCOME_TYPES.map((type) => ({
    name: type,
    value: income.filter((i) => i.category === type).reduce((s, i) => s + (Number(i.amount) || 0), 0),
  })).filter((x) => x.value > 0)

  const expenseByCat = EXPENSE_CATEGORIES.map((cat) => ({
    name: cat,
    value: expense.filter((e) => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  })).filter((x) => x.value > 0)

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (form.type === 'income') {
        await createFinanceIncome({
          date: form.date,
          category: form.category,
          amount: Number(form.amount) || 0,
          description: form.description || '',
        })
      } else {
        await createFinanceExpense({
          date: form.date,
          category: form.category,
          amount: Number(form.amount) || 0,
          description: form.description || '',
        })
      }
      setModal(null)
      load()
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Church Finance</h1>
          <p className="text-slate-500 mt-1">Income, expenses, and balance</p>
        </div>
        {canEnter && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setForm({
                  type: 'income',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  category: INCOME_TYPES[0],
                  amount: '',
                  description: '',
                })
                setModal('form')
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            >
              + Income
            </button>
            <button
              onClick={() => {
                setForm({
                  type: 'expense',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  category: EXPENSE_CATEGORIES[0],
                  amount: '',
                  description: '',
                })
                setModal('form')
              }}
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700"
            >
              + Expense
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-slate-300"
        >
          {[year, year - 1, year - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300"
        >
          <option value="">All months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>{format(new Date(year, i), 'MMMM')}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Income</p>
          <p className="text-2xl font-bold text-emerald-600">RM {totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Expense</p>
          <p className="text-2xl font-bold text-red-600">RM {totalExpense.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm text-slate-500">Balance</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
            RM {balance.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            tab === 'overview' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('income')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            tab === 'income' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Income
        </button>
        <button
          onClick={() => setTab('expense')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            tab === 'expense' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Expense
        </button>
        <button
          onClick={() => setTab('budget')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            tab === 'budget' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Budget
        </button>
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Income vs Expense</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={incomeVsExpenseChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="income" fill="#10b981" name="Income" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-4">Income by Type</h2>
            {incomeByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={incomeByType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {incomeByType.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `RM ${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 py-8 text-center">No income data</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
            <h2 className="font-semibold text-slate-800 mb-4">Expense by Category</h2>
            {expenseByCat.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={expenseByCat}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {expenseByCat.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `RM ${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-500 py-8 text-center">No expense data</p>
            )}
          </div>
        </div>
      )}

      {tab === 'income' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Amount</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {income.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">
                      {formatDMY(i.date)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{i.category || '—'}</td>
                    <td className="px-5 py-3 font-medium text-emerald-600">
                      RM {(Number(i.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{i.description || '—'}</td>
                  </tr>
                ))}
                {income.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No income records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'expense' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Category</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Amount</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expense.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">
                      {formatDMY(e.date)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{e.category || '—'}</td>
                    <td className="px-5 py-3 font-medium text-red-600">
                      RM {(Number(e.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{e.description || '—'}</td>
                  </tr>
                ))}
                {expense.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      No expense records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'budget' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {canEnter && (
            <div className="px-5 py-3 border-b border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingBudgetId(null)
                  setBudgetForm({
                    category: '',
                    subCategory: '',
                    description: '',
                    quantity: '',
                    unitCost: '',
                    priority: 'Medium',
                    type: 'Recurring',
                    justification: '',
                    expectedDate: format(new Date(), 'yyyy-MM-dd'),
                  })
                  setModal('budgetForm')
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
              >
                + Add row
              </button>
            </div>
          )}
          {loadingBudget ? (
            <div className="px-5 py-8 text-center text-slate-500">Loading budget…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Category</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Sub-Category</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Description</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Quantity</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Unit Cost (₹)</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Total Cost (₹)</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Priority</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Type</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Justification</th>
                    <th className="text-left px-5 py-3 font-medium text-slate-600">Expected Date</th>
                    {canEnter && (
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {budgetItems.map((row) => {
                    const totalCost = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0)
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 text-slate-800">{row.category || '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{row.subCategory || '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{row.description || '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{row.quantity ?? '—'}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {row.unitCost != null && row.unitCost !== '' ? `₹ ${Number(row.unitCost).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-5 py-3 font-medium text-slate-800">
                          ₹ {totalCost.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{row.priority || '—'}</td>
                        <td className="px-5 py-3 text-slate-600">{row.type || '—'}</td>
                        <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate" title={row.justification || ''}>
                          {row.justification || '—'}
                        </td>
                        <td className="px-5 py-3 text-slate-600">
                          {row.expectedDate ? formatDMY(row.expectedDate) : '—'}
                        </td>
                        {canEnter && (
                          <td className="px-5 py-3 text-sm space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBudgetId(row.id)
                                setBudgetForm({
                                  category: row.category || '',
                                  subCategory: row.subCategory || '',
                                  description: row.description || '',
                                  quantity: row.quantity ?? '',
                                  unitCost: row.unitCost ?? '',
                                  priority: row.priority || 'Medium',
                                  type: row.type || 'Recurring',
                                  justification: row.justification || '',
                                  expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
                                })
                                setModal('budgetForm')
                              }}
                              className="text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!window.confirm('Delete this budget row?')) return
                                await deleteFinanceBudgetItem(row.id)
                                setBudgetItems((prev) => prev.filter((r) => r.id !== row.id))
                              }}
                              className="text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {budgetItems.length === 0 && (
                    <tr>
                      <td colSpan={canEnter ? 11 : 10} className="px-5 py-8 text-center text-slate-500">
                        No budget items. Add a row to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal === 'budgetForm' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingBudgetId ? 'Edit row' : 'Add row'}
              </h2>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                try {
                  const quantity = Number(budgetForm.quantity) || 0
                  const unitCost = Number(budgetForm.unitCost) || 0
                  const payload = {
                    ...budgetForm,
                    quantity,
                    unitCost,
                    totalCost: quantity * unitCost,
                  }
                  if (editingBudgetId) {
                    await updateFinanceBudgetItem(editingBudgetId, payload)
                    setBudgetItems((prev) =>
                      prev.map((r) =>
                        r.id === editingBudgetId ? { ...r, ...payload, totalCost: quantity * unitCost } : r
                      )
                    )
                  } else {
                    const id = await addFinanceBudgetItem(payload, userProfile?.email || 'unknown')
                    setBudgetItems((prev) => [...prev, { id, ...payload, totalCost: quantity * unitCost }])
                  }
                  setModal(null)
                  setEditingBudgetId(null)
                } catch (err) {
                  console.error(err)
                  alert('Failed to save')
                }
              }}
              className="p-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                  <input
                    type="text"
                    value={budgetForm.category}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sub-Category</label>
                  <input
                    type="text"
                    value={budgetForm.subCategory}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, subCategory: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={budgetForm.description}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={budgetForm.quantity}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budgetForm.unitCost}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, unitCost: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                    required
                  />
                </div>
              </div>
              <div className="text-sm text-slate-600">
                Total Cost (₹): ₹ {((Number(budgetForm.quantity) || 0) * (Number(budgetForm.unitCost) || 0)).toLocaleString()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={budgetForm.priority}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={budgetForm.type}
                    onChange={(e) => setBudgetForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  >
                    <option value="Recurring">Recurring</option>
                    <option value="Project">Project</option>
                    <option value="Asset">Asset</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Justification</label>
                <input
                  type="text"
                  value={budgetForm.justification}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, justification: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expected Date</label>
                <input
                  type="date"
                  value={budgetForm.expectedDate}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, expectedDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  {editingBudgetId ? 'Update' : 'Add row'}
                </button>
                <button
                  type="button"
                  onClick={() => { setModal(null); setEditingBudgetId(null) }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === 'form' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold">
                Add {form.type === 'income' ? 'Income' : 'Expense'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {form.type === 'income' ? 'Type' : 'Category'} *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {(form.type === 'income' ? INCOME_TYPES : EXPENSE_CATEGORIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
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
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
