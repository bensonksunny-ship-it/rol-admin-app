import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { getFinanceIncome, getFinanceExpense } from '../../services/firestore'

export default function TallyPage() {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [activeMonth, setActiveMonth] = useState(startOfMonth(new Date()))
  const [incomeEntries, setIncomeEntries] = useState([])
  const [expenseEntries, setExpenseEntries] = useState([])
  const [loading, setLoading] = useState(false)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    try {
      const [income, expense] = await Promise.all([
        getFinanceIncome({ year: activeMonth.getFullYear(), month: activeMonth.getMonth() }),
        getFinanceExpense({ year: activeMonth.getFullYear(), month: activeMonth.getMonth() }),
      ])
      setIncomeEntries(income)
      setExpenseEntries(expense.filter(e => e.status !== 'pending'))
    } catch {
      // stays empty on error
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = incomeEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalExpense = expenseEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const balance = totalIncome - totalExpense

  function prevMonth() { setActiveMonth(m => subMonths(m, 1)) }
  function nextMonth() { setActiveMonth(m => addMonths(m, 1)) }

  function fmtDate(d) {
    try { return format(d instanceof Date ? d : new Date(d), 'dd/MM/yyyy') } catch { return '—' }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker */}
      <div className="flex items-center justify-center gap-4 py-2">
        <button type="button" onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
        <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
        <button type="button" onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium text-slate-500">Total Income</p>
          <p className="text-lg font-bold text-emerald-600 mt-1">₹{totalIncome.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400 mt-0.5">{incomeEntries.length} {incomeEntries.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium text-slate-500">Total Expense</p>
          <p className="text-lg font-bold text-red-500 mt-1">₹{totalExpense.toLocaleString('en-IN')}</p>
          <p className="text-xs text-slate-400 mt-0.5">{expenseEntries.length} {expenseEntries.length === 1 ? 'entry' : 'entries'}</p>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 ${balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs font-medium text-slate-500">Balance</p>
          <p className={`text-lg font-bold mt-1 ${balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {balance < 0 ? '−' : ''}₹{Math.abs(balance).toLocaleString('en-IN')}
          </p>
          <p className={`text-xs mt-0.5 font-medium ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {balance >= 0 ? 'Surplus' : 'Deficit'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Expense table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-red-50/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800">Expense</h3>
              <span className="text-sm font-bold text-red-700">₹{totalExpense.toLocaleString('en-IN')}</span>
            </div>
            {expenseEntries.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No expenses recorded for this month.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-center w-10">No.</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Bill No</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenseEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-700">{fmtDate(entry.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.department || entry.category}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.item || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.billNo || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">₹{Number(entry.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-red-100 bg-red-50/40">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-red-700 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">₹{totalExpense.toLocaleString('en-IN')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Net balance footer */}
          <div className={`rounded-xl border shadow-sm px-5 py-4 flex items-center justify-between ${balance >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div>
              <p className="text-sm font-semibold text-slate-700">Net Balance</p>
              <p className="text-xs text-slate-500 mt-0.5">Income − Expense</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {balance < 0 ? '−' : ''}₹{Math.abs(balance).toLocaleString('en-IN')}
              </p>
              <p className={`text-xs font-medium mt-0.5 ${balance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {balance >= 0 ? 'Surplus' : 'Deficit'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
