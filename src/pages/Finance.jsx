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
  getFinanceVoucherRequests,
  createFinanceVoucherRequest,
  approveFinanceVoucherRequest,
  rejectFinanceVoucherRequest,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { INCOME_TYPES, EXPENSE_CATEGORIES, DEPARTMENT_TAGS } from '../constants/roles'
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
  const [form, setForm] = useState({
    type: 'income',
    date: format(new Date(), 'yyyy-MM-dd'),
    category: INCOME_TYPES[0],
    departmentTag: DEPARTMENT_TAGS[0],
    amount: '',
    description: '',
    submittedBy: '',
  })
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
  const [budgetXlsxRows, setBudgetXlsxRows] = useState(null)
  const [budgetXlsxError, setBudgetXlsxError] = useState('')
  const [importingBudgetXlsx, setImportingBudgetXlsx] = useState(false)
  const [budgetXlsxResult, setBudgetXlsxResult] = useState(null)

  // Persistent date for all entry modals
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  // All-time balance (not affected by year/month filter)
  const [allTimeBalance, setAllTimeBalance] = useState(null)

  // Voucher requests
  const [voucherRequests, setVoucherRequests] = useState([])
  const [loadingVouchers, setLoadingVouchers] = useState(true)
  const [showVoucherPanel, setShowVoucherPanel] = useState(false)

  // Voucher request modal
  const [voucherModal, setVoucherModal] = useState(false)
  const [voucherForm, setVoucherForm] = useState({
    date: '',
    category: EXPENSE_CATEGORIES[0],
    departmentTag: DEPARTMENT_TAGS[0],
    amount: '',
    description: '',
  })
  const [submittingVoucher, setSubmittingVoucher] = useState(false)

  const canEnter = hasPermission('enterFinance')

  useEffect(() => {
    load()
  }, [year, month])

  useEffect(() => {
    if (tab === 'budget') loadBudget()
  }, [tab])

  useEffect(() => {
    Promise.all([getFinanceIncome({}), getFinanceExpense({})])
      .then(([inc, exp]) => {
        const totalInc = inc.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        const totalExp = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
        setAllTimeBalance(totalInc - totalExp)
      })
      .catch(() => setAllTimeBalance(0))
  }, [])

  useEffect(() => {
    loadVouchers()
  }, [])

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

  async function handleBudgetXlsxFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setBudgetXlsxError('')
    setBudgetXlsxRows(null)
    setBudgetXlsxResult(null)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!raw.length) { setBudgetXlsxError('No data found in the file.'); return }

      const norm = (key) => String(key).toLowerCase().replace(/[\s_\-]/g, '')
      const rows = raw.map((row, i) => {
        const r = {}
        for (const [k, v] of Object.entries(row)) r[norm(k)] = v
        const category = String(r['category'] ?? '').trim()
        const subCategory = String(r['subcategory'] ?? r['subcat'] ?? r['subcategory'] ?? '').trim()
        const description = String(r['description'] ?? r['desc'] ?? '').trim()
        const quantity = Number(r['quantity'] ?? r['qty'] ?? 0) || 0
        const unitCost = Number(r['unitcost'] ?? r['unit'] ?? r['unitcostrs'] ?? 0) || 0
        const totalCost = quantity * unitCost
        const priority = String(r['priority'] ?? 'Medium').trim() || 'Medium'
        const type = String(r['type'] ?? 'Recurring').trim() || 'Recurring'
        const justification = String(r['justification'] ?? '').trim()
        const rawDate = r['expecteddate'] ?? r['expected'] ?? r['date'] ?? ''
        let expectedDate = ''
        if (rawDate instanceof Date) expectedDate = format(rawDate, 'yyyy-MM-dd')
        else if (rawDate) { const d = new Date(rawDate); if (!isNaN(d)) expectedDate = format(d, 'yyyy-MM-dd') }
        const error = !category ? 'Missing category' : ''
        return { _row: i + 2, category, subCategory, description, quantity, unitCost, totalCost, priority, type, justification, expectedDate, _valid: !error, _error: error }
      })
      if (rows.every(r => !r._valid)) {
        setBudgetXlsxError('Could not parse rows. Make sure the file has a "Category" column.')
        return
      }
      setBudgetXlsxRows(rows)
    } catch (err) {
      console.error(err)
      setBudgetXlsxError('Failed to read file. Make sure it is a valid .xlsx or .xls file.')
    }
  }

  async function handleImportBudgetAll() {
    const valid = (budgetXlsxRows || []).filter(r => r._valid)
    if (!valid.length) return
    setImportingBudgetXlsx(true)
    let imported = 0, failed = 0
    for (const row of valid) {
      try {
        const { _row, _valid, _error, ...payload } = row
        const id = await addFinanceBudgetItem(payload, userProfile?.email || 'unknown')
        setBudgetItems(prev => [...prev, { id, ...payload }])
        imported++
      } catch { failed++ }
    }
    setImportingBudgetXlsx(false)
    setBudgetXlsxRows(null)
    setBudgetXlsxResult({ imported, failed, skipped: (budgetXlsxRows || []).filter(r => !r._valid).length })
  }

  async function loadVouchers() {
    setLoadingVouchers(true)
    try {
      const list = await getFinanceVoucherRequests('pending')
      setVoucherRequests(list)
    } catch (e) {
      console.error(e)
    }
    setLoadingVouchers(false)
  }

  const totalIncome = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const totalExpense = expense.reduce((s, e) => s + (Number(e.amount) || 0), 0)

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

  const recentTransactions = [
    ...income.map((i) => ({ ...i, _type: 'income' })),
    ...expense.map((e) => ({ ...e, _type: 'expense' })),
  ]
    .sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0)
      const db2 = b.date ? new Date(b.date) : new Date(0)
      return db2 - da
    })
    .slice(0, 20)

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount) || 0,
        description: form.description || '',
        departmentTag: form.departmentTag || '',
        submittedBy: form.submittedBy || userProfile?.name || userProfile?.email || '',
      }
      if (form.type === 'income') {
        await createFinanceIncome(payload)
      } else {
        await createFinanceExpense({ ...payload, voucherRequestId: null })
      }
      setSelectedDate(form.date)
      setModal(null)
      load()
      Promise.all([getFinanceIncome({}), getFinanceExpense({})])
        .then(([inc, exp]) => {
          setAllTimeBalance(
            inc.reduce((s, i) => s + (Number(i.amount) || 0), 0) -
            exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
          )
        })
        .catch(() => {})
    } catch (err) {
      console.error(err)
      alert('Failed to save')
    }
  }

  async function handleApproveVoucher(request) {
    const approvedBy = userProfile?.name || userProfile?.email || 'Finance'
    try {
      await approveFinanceVoucherRequest(request.id, approvedBy)
      setVoucherRequests((prev) => prev.filter((r) => r.id !== request.id))
      load()
      setAllTimeBalance(null)
      Promise.all([getFinanceIncome({}), getFinanceExpense({})])
        .then(([inc, exp]) => {
          setAllTimeBalance(
            inc.reduce((s, i) => s + (Number(i.amount) || 0), 0) -
            exp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
          )
        })
        .catch(() => {})
    } catch (err) {
      console.error(err)
      alert('Failed to approve voucher')
    }
  }

  async function handleRejectVoucher(request) {
    const rejectedBy = userProfile?.name || userProfile?.email || 'Finance'
    try {
      await rejectFinanceVoucherRequest(request.id, rejectedBy)
      setVoucherRequests((prev) => prev.filter((r) => r.id !== request.id))
    } catch (err) {
      console.error(err)
      alert('Failed to reject voucher')
    }
  }

  async function handleVoucherSubmit(e) {
    e.preventDefault()
    setSubmittingVoucher(true)
    try {
      await createFinanceVoucherRequest({
        ...voucherForm,
        submittedBy: userProfile?.name || userProfile?.email || 'Unknown',
        submittedByUid: userProfile?.id || userProfile?.uid || '',
      })
      setVoucherModal(false)
      setVoucherForm({
        date: selectedDate,
        category: EXPENSE_CATEGORIES[0],
        departmentTag: DEPARTMENT_TAGS[0],
        amount: '',
        description: '',
      })
      loadVouchers()
    } catch (err) {
      console.error(err)
      alert('Failed to submit voucher request')
    }
    setSubmittingVoucher(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Church Finance</h1>
          <p className="text-slate-500 mt-1">Income, expenses, and balance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEnter && (
            <>
              <button
                onClick={() => {
                  setForm({
                    type: 'income',
                    date: selectedDate,
                    category: INCOME_TYPES[0],
                    departmentTag: DEPARTMENT_TAGS[0],
                    amount: '',
                    description: '',
                    submittedBy: userProfile?.name || userProfile?.email || '',
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
                    date: selectedDate,
                    category: EXPENSE_CATEGORIES[0],
                    departmentTag: DEPARTMENT_TAGS[0],
                    amount: '',
                    description: '',
                    submittedBy: userProfile?.name || userProfile?.email || '',
                  })
                  setModal('form')
                }}
                className="px-4 min-h-[44px] py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 active:bg-red-800 transition-colors"
              >
                + Expense
              </button>
            </>
          )}
          <button
            onClick={() => {
              setVoucherForm({
                date: selectedDate,
                category: EXPENSE_CATEGORIES[0],
                departmentTag: DEPARTMENT_TAGS[0],
                amount: '',
                description: '',
              })
              setVoucherModal(true)
            }}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600"
          >
            📋 Request Voucher
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3">
        <span className="text-indigo-500 text-lg">📅</span>
        <div className="flex-1">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Entry Date</p>
          <p className="text-xs text-indigo-500 mt-0.5">Selected date is used when you add a transaction or voucher</p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-indigo-300 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-blue-900">
            {allTimeBalance === null ? '—' : `RM ${allTimeBalance.toLocaleString()}`}
          </div>
          <div className="text-xs font-semibold text-blue-700 mt-1">💰 Current Balance</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-emerald-900">RM {totalIncome.toLocaleString()}</div>
          <div className="text-xs font-semibold text-emerald-700 mt-1">📈 This Period Income</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-red-900">RM {totalExpense.toLocaleString()}</div>
          <div className="text-xs font-semibold text-red-700 mt-1">📉 This Period Expenses</div>
        </div>
        <button
          type="button"
          onClick={() => setShowVoucherPanel((v) => !v)}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center hover:bg-amber-100 transition-all"
        >
          <div className="text-2xl font-black text-amber-900">
            {loadingVouchers ? '—' : voucherRequests.length}
          </div>
          <div className="text-xs font-semibold text-amber-700 mt-1">⏳ Pending Vouchers</div>
          <div className="text-xs text-amber-400 mt-0.5">tap to review ↗</div>
        </button>
      </div>

      {showVoucherPanel && canEnter && (
        <div className="bg-white border border-amber-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            ⏳ Pending Voucher Requests
            {voucherRequests.length > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {voucherRequests.length}
              </span>
            )}
          </h3>
          {loadingVouchers ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : voucherRequests.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-2xl p-5 text-center text-sm text-slate-400">
              No pending voucher requests.
            </div>
          ) : (
            voucherRequests.map((req) => (
              <div key={req.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">RM {req.amount.toLocaleString()}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      👤 {req.submittedBy || '—'} · 🏷 {req.departmentTag || '—'} · {req.category || '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {req.date ? formatDMY(req.date) : '—'}
                      {req.description ? ` · ${req.description}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApproveVoucher(req)}
                    className="flex-1 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition"
                  >
                    ✓ Approve — Move to Expenses
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectVoucher(req)}
                    className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

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

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide">
        {[['overview','Overview'],['income','Income'],['expense','Expense'],['budget','Budget']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 text-sm">Recent Transactions</h2>
              <p className="text-xs text-slate-500 mt-0.5">Last 20 entries — income and expenses</p>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="px-5 py-5 text-center text-sm text-slate-400">No transactions recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 px-5 py-3 border-l-4 ${
                      tx._type === 'income'
                        ? 'border-emerald-400'
                        : tx.isReversal
                        ? 'border-orange-400'
                        : 'border-red-400'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          tx._type === 'income'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {tx._type === 'income' ? 'INCOME' : tx.isReversal ? 'REVERSAL' : 'EXPENSE'}
                        </span>
                        <span className="text-xs text-slate-600 font-medium">{tx.category || '—'}</span>
                        {tx.departmentTag && (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            {tx.departmentTag}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{tx.date ? formatDMY(tx.date) : '—'}</span>
                        {tx.submittedBy && (
                          <span className="text-xs text-slate-500">· {tx.submittedBy}</span>
                        )}
                        {tx.description && (
                          <span className="text-xs text-slate-500 truncate max-w-[160px]">· {tx.description}</span>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-bold flex-shrink-0 ${
                      tx._type === 'income' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {tx._type === 'income' ? '+' : '−'} RM {(Number(tx.amount) || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900 mb-4">Income vs Expense</h2>
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
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900 mb-4">Income by Type</h2>
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
                <p className="text-slate-500 py-5 text-center">No income data</p>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm lg:col-span-2">
              <h2 className="font-semibold text-slate-900 mb-4">Expense by Category</h2>
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
                <p className="text-slate-500 py-5 text-center">No expense data</p>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'income' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-100">
            {income.length === 0 ? (
              <p className="px-4 py-5 text-center text-slate-500 text-sm">No income records</p>
            ) : income.map((i) => (
              <div key={i.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-emerald-600 text-sm">RM {(Number(i.amount) || 0).toLocaleString()}</span>
                  <span className="text-xs text-slate-500">{formatDMY(i.date)}</span>
                </div>
                <div className="text-sm text-slate-700">{i.category || '—'}{i.departmentTag ? ` · ${i.departmentTag}` : ''}</div>
                {i.description && <div className="text-xs text-slate-500">{i.description}</div>}
                {i.submittedBy && <div className="text-xs text-slate-500">by {i.submittedBy}</div>}
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Type</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Department</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Amount</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Description</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Submitted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {income.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">{formatDMY(i.date)}</td>
                    <td className="px-5 py-3 text-slate-600">{i.category || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{i.departmentTag || '—'}</td>
                    <td className="px-5 py-3 font-medium text-emerald-600">RM {(Number(i.amount) || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-slate-600">{i.description || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{i.submittedBy || '—'}</td>
                  </tr>
                ))}
                {income.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-5 text-center text-slate-500">No income records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'expense' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-100">
            {expense.length === 0 ? (
              <p className="px-4 py-5 text-center text-slate-500 text-sm">No expense records</p>
            ) : expense.map((e) => (
              <div key={e.id} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-red-600 text-sm">RM {(Number(e.amount) || 0).toLocaleString()}</span>
                  <span className="text-xs text-slate-500">{formatDMY(e.date)}</span>
                </div>
                <div className="text-sm text-slate-700">{e.category || '—'}{e.departmentTag ? ` · ${e.departmentTag}` : ''}</div>
                {e.description && <div className="text-xs text-slate-500">{e.description}</div>}
                {e.submittedBy && <div className="text-xs text-slate-500">by {e.submittedBy}</div>}
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Date</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Category</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Department</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Amount</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Description</th>
                  <th className="text-left px-5 py-3 text-sm font-medium text-slate-600">Submitted By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {expense.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-800">{formatDMY(e.date)}</td>
                    <td className="px-5 py-3 text-slate-600">{e.category || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{e.departmentTag || '—'}</td>
                    <td className="px-5 py-3 font-medium text-red-600">RM {(Number(e.amount) || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-slate-600">{e.description || '—'}</td>
                    <td className="px-5 py-3 text-slate-500 text-xs">{e.submittedBy || '—'}</td>
                  </tr>
                ))}
                {expense.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-5 text-center text-slate-500">No expense records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'budget' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {budgetXlsxResult && (
            <div className="flex items-center justify-between gap-3 bg-emerald-50 border-b border-emerald-200 px-5 py-3">
              <p className="text-sm text-emerald-800 font-medium">
                Imported {budgetXlsxResult.imported} {budgetXlsxResult.imported === 1 ? 'row' : 'rows'}
                {budgetXlsxResult.skipped > 0 && ` · ${budgetXlsxResult.skipped} skipped`}
                {budgetXlsxResult.failed > 0 && ` · ${budgetXlsxResult.failed} failed`}
              </p>
              <button type="button" onClick={() => setBudgetXlsxResult(null)} className="text-emerald-600 hover:text-emerald-800 text-lg leading-none">×</button>
            </div>
          )}
          {budgetXlsxError && (
            <div className="px-5 py-2 border-b border-red-200 bg-red-50">
              <p className="text-xs font-medium text-red-600">{budgetXlsxError}</p>
            </div>
          )}
          {canEnter && (
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-end gap-2">
              <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700 transition-colors">
                📊 Import Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBudgetXlsxFile} />
              </label>
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
            <div className="px-5 py-5 text-center text-slate-500">Loading budget…</div>
          ) : budgetItems.length === 0 ? (
            <p className="px-5 py-5 text-center text-slate-500">No budget items. Add a row to get started.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {budgetItems.map((row) => {
                  const totalCost = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0)
                  return (
                    <div key={row.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-semibold text-slate-800 text-sm">{row.category || '—'}</span>
                          {row.subCategory && <span className="text-slate-500 text-xs"> · {row.subCategory}</span>}
                        </div>
                        <span className="font-bold text-slate-800 text-sm flex-shrink-0">₹ {totalCost.toLocaleString()}</span>
                      </div>
                      {row.description && <div className="text-xs text-slate-600">{row.description}</div>}
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                        {row.quantity && <span>Qty: {row.quantity}</span>}
                        {row.unitCost != null && row.unitCost !== '' && <span>Unit: ₹{Number(row.unitCost).toLocaleString()}</span>}
                        {row.priority && <span>{row.priority}</span>}
                        {row.type && <span>{row.type}</span>}
                        {row.expectedDate && <span>{formatDMY(row.expectedDate)}</span>}
                      </div>
                      {row.justification && <div className="text-xs text-slate-500 italic">{row.justification}</div>}
                      {canEnter && (
                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBudgetId(row.id)
                              setBudgetForm({
                                category: row.category || '', subCategory: row.subCategory || '',
                                description: row.description || '', quantity: row.quantity ?? '',
                                unitCost: row.unitCost ?? '', priority: row.priority || 'Medium',
                                type: row.type || 'Recurring', justification: row.justification || '',
                                expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd'),
                              })
                              setModal('budgetForm')
                            }}
                            className="text-blue-600 text-sm hover:underline"
                          >Edit</button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('Delete this budget row?')) return
                              await deleteFinanceBudgetItem(row.id)
                              setBudgetItems((prev) => prev.filter((r) => r.id !== row.id))
                            }}
                            className="text-red-600 text-sm hover:underline"
                          >Delete</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Category</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Sub-Category</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Description</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Qty</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Unit (₹)</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Total (₹)</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Priority</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Type</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Justification</th>
                      <th className="text-left px-5 py-3 font-medium text-slate-600">Expected</th>
                      {canEnter && <th className="text-left px-5 py-3 font-medium text-slate-600">Actions</th>}
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
                          <td className="px-5 py-3 text-slate-600">{row.unitCost != null && row.unitCost !== '' ? `₹ ${Number(row.unitCost).toLocaleString()}` : '—'}</td>
                          <td className="px-5 py-3 font-medium text-slate-800">₹ {totalCost.toLocaleString()}</td>
                          <td className="px-5 py-3 text-slate-600">{row.priority || '—'}</td>
                          <td className="px-5 py-3 text-slate-600">{row.type || '—'}</td>
                          <td className="px-5 py-3 text-slate-600 max-w-[200px] truncate" title={row.justification || ''}>{row.justification || '—'}</td>
                          <td className="px-5 py-3 text-slate-600">{row.expectedDate ? formatDMY(row.expectedDate) : '—'}</td>
                          {canEnter && (
                            <td className="px-5 py-3 text-sm space-x-2">
                              <button type="button" onClick={() => { setEditingBudgetId(row.id); setBudgetForm({ category: row.category || '', subCategory: row.subCategory || '', description: row.description || '', quantity: row.quantity ?? '', unitCost: row.unitCost ?? '', priority: row.priority || 'Medium', type: row.type || 'Recurring', justification: row.justification || '', expectedDate: row.expectedDate ? (typeof row.expectedDate === 'string' ? row.expectedDate : format(new Date(row.expectedDate), 'yyyy-MM-dd')) : format(new Date(), 'yyyy-MM-dd') }); setModal('budgetForm') }} className="text-blue-600 hover:underline">Edit</button>
                              <button type="button" onClick={async () => { if (!window.confirm('Delete this budget row?')) return; await deleteFinanceBudgetItem(row.id); setBudgetItems((prev) => prev.filter((r) => r.id !== row.id)) }} className="text-red-600 hover:underline">Delete</button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {budgetXlsxRows && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col sm:max-w-3xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="font-semibold text-slate-800">Budget Excel Preview</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {budgetXlsxRows.filter(r => r._valid).length} valid · {budgetXlsxRows.filter(r => !r._valid).length} skipped
                </p>
              </div>
              <button type="button" onClick={() => setBudgetXlsxRows(null)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Sub-Category</th>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium text-right">Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Unit (₹)</th>
                    <th className="px-4 py-2 font-medium text-right">Total (₹)</th>
                    <th className="px-4 py-2 font-medium">Priority</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Expected</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {budgetXlsxRows.map((row) => (
                    <tr key={row._row} className={row._valid ? '' : 'bg-red-50/60'}>
                      <td className="px-4 py-2 text-slate-800 font-medium">{row.category || '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{row.subCategory || '—'}</td>
                      <td className="px-4 py-2 text-slate-600 max-w-[140px] truncate">{row.description || '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-600">{row.quantity}</td>
                      <td className="px-4 py-2 text-right text-slate-600">₹{Number(row.unitCost).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-800">₹{Number(row.totalCost).toLocaleString()}</td>
                      <td className="px-4 py-2 text-slate-600">{row.priority}</td>
                      <td className="px-4 py-2 text-slate-600">{row.type}</td>
                      <td className="px-4 py-2 text-slate-500">{row.expectedDate || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {row._valid
                          ? <span className="text-emerald-600">✓</span>
                          : <span className="text-red-500">{row._error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <p className="text-xs text-slate-500">
                Columns: <span className="font-mono">Category, Sub-Category, Description, Quantity, Unit Cost, Priority, Type, Justification, Expected Date</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setBudgetXlsxRows(null)} className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImportBudgetAll}
                  disabled={importingBudgetXlsx || !budgetXlsxRows.some(r => r._valid)}
                  className="px-4 min-h-[44px] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {importingBudgetXlsx ? 'Importing…' : `Import ${budgetXlsxRows.filter(r => r._valid).length} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === 'budgetForm' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">
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
                  className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
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
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Add {form.type === 'income' ? 'Income' : 'Expense'}
              </h2>
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'income', category: INCOME_TYPES[0] }))}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    form.type === 'income' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: 'expense', category: EXPENSE_CATEGORIES[0] }))}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold transition-all ${
                    form.type === 'expense' ? 'bg-white shadow-sm text-red-700' : 'text-slate-500'
                  }`}
                >
                  Expense
                </button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, date: e.target.value }))
                    if (e.target.value) setSelectedDate(e.target.value)
                  }}
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                <select
                  value={form.departmentTag}
                  onChange={(e) => setForm((f) => ({ ...f, departmentTag: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {DEPARTMENT_TAGS.map((d) => (
                    <option key={d} value={d}>{d}</option>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Submitted By</label>
                <input
                  type="text"
                  value={form.submittedBy}
                  onChange={(e) => setForm((f) => ({ ...f, submittedBy: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
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
                  className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {voucherModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">📋 Request a Voucher</h2>
              <p className="text-xs text-slate-500 mt-1">Submit an expense for Finance team approval</p>
            </div>
            <form onSubmit={handleVoucherSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                <input
                  type="date"
                  value={voucherForm.date}
                  onChange={(e) => {
                    setVoucherForm((f) => ({ ...f, date: e.target.value }))
                    if (e.target.value) setSelectedDate(e.target.value)
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category *</label>
                <select
                  value={voucherForm.category}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                <select
                  value={voucherForm.departmentTag}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, departmentTag: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                >
                  {DEPARTMENT_TAGS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={voucherForm.amount}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={voucherForm.description}
                  onChange={(e) => setVoucherForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 resize-none"
                  placeholder="What is this expense for?"
                />
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
                Submitted by: <strong>{userProfile?.name || userProfile?.email || 'You'}</strong>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submittingVoucher}
                  className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
                >
                  {submittingVoucher ? 'Submitting…' : 'Submit for Approval'}
                </button>
                <button
                  type="button"
                  onClick={() => setVoucherModal(false)}
                  className="px-4 min-h-[44px] py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-colors"
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
