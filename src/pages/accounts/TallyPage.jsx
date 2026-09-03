import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import {
  getFinanceIncome,
  getFinanceExpense,
  getFinanceTallyAnchors,
  setFinanceTallyAnchor,
  deleteFinanceTallyAnchor,
} from '../../services/firestore'

const EPOCH = new Date(2000, 0, 1)

function inr(n) {
  const v = Math.round(Number(n) || 0)
  return `${v < 0 ? '−' : ''}₹${Math.abs(v).toLocaleString('en-IN')}`
}

function sumIncome(rows) {
  return rows.reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

// Expense excludes still-pending payout requests — matches the Expense tab's own
// "Entered" total (only approved/entered spending counts against the balance).
function sumExpense(rows) {
  return rows.filter(e => e.status !== 'pending').reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

export default function TallyPage({ controlledMonth, onMonthChange } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const monthKey = format(activeMonth, 'yyyy-MM')

  const [incomeEntries, setIncomeEntries] = useState([])
  const [expenseEntries, setExpenseEntries] = useState([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [anchor, setAnchor] = useState(null) // the finance_tally doc for THIS month, or null
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Manual-entry editor
  const [editing, setEditing] = useState(false)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const anchors = await getFinanceTallyAnchors()
      const sorted = [...anchors].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      const thisAnchor = sorted.find(a => a.monthKey === monthKey) || null
      // Most recent anchor at or before this month — the carry-forward baseline.
      const baseAnchor = [...sorted].reverse().find(a => a.monthKey <= monthKey) || null

      const monthStart = startOfMonth(activeMonth)

      // This month's ledger (drives the tables + totals).
      const [income, expense] = await Promise.all([
        getFinanceIncome({ year: activeMonth.getFullYear(), month: activeMonth.getMonth() }),
        getFinanceExpense({ year: activeMonth.getFullYear(), month: activeMonth.getMonth() }),
      ])
      setIncomeEntries(income)
      setExpenseEntries(expense.filter(e => e.status !== 'pending'))

      // Opening balance.
      let opening
      if (baseAnchor && baseAnchor.monthKey === monthKey) {
        opening = Number(baseAnchor.openingBalance) || 0
      } else {
        const rangeStart = baseAnchor
          ? startOfMonth(new Date(Number(baseAnchor.monthKey.slice(0, 4)), Number(baseAnchor.monthKey.slice(5, 7)) - 1, 1))
          : EPOCH
        const priorEnd = new Date(monthStart.getTime() - 1)
        const [priorIncome, priorExpense] = await Promise.all([
          getFinanceIncome({ startDate: rangeStart, endDate: priorEnd }),
          getFinanceExpense({ startDate: rangeStart, endDate: priorEnd }),
        ])
        const base = baseAnchor ? Number(baseAnchor.openingBalance) || 0 : 0
        opening = base + sumIncome(priorIncome) - sumExpense(priorExpense)
      }

      setAnchor(thisAnchor)
      setOpeningBalance(opening)
    } catch (err) {
      console.error('[Tally] load failed', err)
      setLoadError('Could not load this month’s tally.')
      setIncomeEntries([])
      setExpenseEntries([])
      setAnchor(null)
      setOpeningBalance(0)
    } finally {
      setLoading(false)
    }
  }

  const totalIncome = sumIncome(incomeEntries)
  const totalExpense = sumExpense(expenseEntries)
  const closing = openingBalance + totalIncome - totalExpense
  const isManual = !!anchor

  function changeMonth(delta) {
    const next = delta < 0 ? subMonths(activeMonth, 1) : addMonths(activeMonth, 1)
    if (onMonthChange) onMonthChange(next)
    else setInternalMonth(next)
  }

  function startEdit() {
    setDraftAmount(isManual ? String(anchor.openingBalance ?? '') : String(Math.round(openingBalance)))
    setDraftNote(isManual ? (anchor.note || '') : '')
    setEditing(true)
  }

  async function saveManual() {
    setSaving(true)
    try {
      await setFinanceTallyAnchor(monthKey, {
        openingBalance: Number(draftAmount) || 0,
        note: draftNote.trim(),
        updatedBy: userProfile?.name || userProfile?.displayName || userProfile?.email || '',
      })
      setEditing(false)
      await load()
    } catch (err) {
      console.error('[Tally] save anchor failed', err)
      setLoadError('Could not save the manual opening balance.')
    } finally {
      setSaving(false)
    }
  }

  async function resetToAuto() {
    setSaving(true)
    try {
      await deleteFinanceTallyAnchor(monthKey)
      setEditing(false)
      await load()
    } catch (err) {
      console.error('[Tally] delete anchor failed', err)
      setLoadError('Could not reset to the automatic balance.')
    } finally {
      setSaving(false)
    }
  }

  function fmtDate(d) {
    try { return format(d instanceof Date ? d : new Date(d), 'dd/MM/yyyy') } catch { return '—' }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Month picker — hidden when a parent owns it without syncing (not the case here) */}
      {(!controlledMonth || onMonthChange) && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
          <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{loadError}</div>
      )}

      {/* Opening balance */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-slate-500">Opening Balance</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isManual ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {isManual ? 'Manual' : 'Auto'}
              </span>
            </div>
            <p className="text-lg font-bold text-slate-800 mt-1">{inr(openingBalance)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isManual
                ? `Set manually${anchor.updatedBy ? ` by ${anchor.updatedBy}` : ''}`
                : 'Carried forward from earlier months'}
            </p>
            {isManual && anchor.note && (
              <p className="text-xs text-slate-500 mt-1 italic">“{anchor.note}”</p>
            )}
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
            >
              {isManual ? 'Edit' : 'Set manually'}
            </button>
          )}
        </div>

        {editing && (
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs text-slate-500">
              Override the opening balance for {format(activeMonth, 'MMMM yyyy')}. Later months
              carry forward from this figure.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-600">
                Opening balance (₹)
                <input
                  type="number"
                  value={draftAmount}
                  onChange={e => setDraftAmount(e.target.value)}
                  className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="0"
                />
              </label>
              <label className="text-xs font-medium text-slate-600 flex-1 min-w-[12rem]">
                Note (optional)
                <input
                  type="text"
                  value={draftNote}
                  onChange={e => setDraftNote(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                  placeholder="e.g. bank statement carry-over"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveManual}
                disabled={saving}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              {isManual && (
                <button
                  type="button"
                  onClick={resetToAuto}
                  disabled={saving}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 ml-auto"
                >
                  Reset to auto
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tally strip */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-xs font-medium text-slate-500">Opening</p>
            <p className="text-base font-bold text-slate-700 mt-1">{inr(openingBalance)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">+ Income</p>
            <p className="text-base font-bold text-emerald-600 mt-1">{inr(totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">− Expense</p>
            <p className="text-base font-bold text-red-500 mt-1">{inr(totalExpense)}</p>
          </div>
          <div className={`rounded-lg py-1 ${closing >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className="text-xs font-medium text-slate-500">= Closing</p>
            <p className={`text-base font-bold mt-1 ${closing >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(closing)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Income table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-800">Income</h3>
              <span className="text-sm font-bold text-emerald-700">{inr(totalIncome)}</span>
            </div>
            {incomeEntries.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">No income recorded for this month.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 text-center w-10">No.</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Giver</th>
                      <th className="px-4 py-3">Towards</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {incomeEntries.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3 text-slate-700">{fmtDate(entry.date)}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.category || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.giverName || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{entry.towards || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{inr(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-emerald-100 bg-emerald-50/40">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-emerald-700 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">{inr(totalIncome)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Expense table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-red-50/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800">Expense</h3>
              <span className="text-sm font-bold text-red-700">{inr(totalExpense)}</span>
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
                        <td className="px-4 py-3 text-right font-medium text-slate-800">{inr(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-red-100 bg-red-50/40">
                      <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-red-700 uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{inr(totalExpense)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Net balance footer */}
          <div className={`rounded-xl border shadow-sm px-5 py-4 flex items-center justify-between ${closing >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <div>
              <p className="text-sm font-semibold text-slate-700">Closing Balance</p>
              <p className="text-xs text-slate-500 mt-0.5">Opening + Income − Expense</p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold ${closing >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{inr(closing)}</p>
              <p className={`text-xs font-medium mt-0.5 ${closing >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {closing >= 0 ? 'Surplus' : 'Deficit'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
