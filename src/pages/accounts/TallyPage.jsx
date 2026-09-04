import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { normalizeDepartmentName } from '../../constants/roles'
import {
  getFinanceIncome,
  getFinanceExpense,
  getFinanceTallyAnchors,
  setFinanceTallyAnchor,
  deleteFinanceTallyAnchor,
} from '../../services/firestore'

const EPOCH = new Date(2000, 0, 1)

// The church's Account Sheet lists spend under these 16 fixed departments, in this
// order. `match` bridges the app's own longer category names (Cell Ministry, Sunday
// Ministry, River Kids / Junior Church, Building, General Affairs, …) — as stored on
// finance_expense records — to the sheet's short labels. Anything unmatched rolls into
// an "Other / Unallocated" row so the grid always reconciles to Total Expense.
const DEPT_ROWS = [
  { label: 'Worship', match: ['worship'] },
  { label: 'Cell', match: ['cell', 'cell ministry'] },
  { label: 'Caring', match: ['caring'] },
  { label: 'Sunday M', match: ['sunday ministry', 'sunday m', 'sunday'] },
  { label: 'D Light', match: ['d light', 'd-light', 'dlight'] },
  { label: 'Junior C', match: ['junior church', 'river kids', 'junior c'] },
  { label: 'Outreach', match: ['outreach'] },
  { label: 'Build C', match: ['building', 'building care', 'build c'] },
  { label: 'Event M', match: ['event m', 'event management', 'events', 'event-m'] },
  { label: 'Mission', match: ['mission', 'missions'] },
  { label: 'Media', match: ['media'] },
  { label: 'Accounts', match: ['accounts', 'account', 'finance'] },
  { label: 'Human Resources', match: ['human resources', 'hr'] },
  { label: 'Gen Affairs', match: ['general affairs', 'gen affairs'] },
  { label: 'Thunderstorm', match: ['thunderstorm'] },
  { label: 'SP Office', match: ['sp office', 'senior pastor office', "senior pastor's office"] },
]

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

// Bucket this month's expense entries into the 16 sheet departments + "Other".
function groupByDepartment(rows) {
  const totals = new Map(DEPT_ROWS.map(r => [r.label, 0]))
  let other = 0
  for (const e of rows) {
    const key = String(normalizeDepartmentName(e.department || e.category || '')).trim().toLowerCase()
    const row = DEPT_ROWS.find(r => r.label.toLowerCase() === key || r.match.includes(key))
    if (row) totals.set(row.label, totals.get(row.label) + (Number(e.amount) || 0))
    else other += Number(e.amount) || 0
  }
  return { totals, other }
}

export default function TallyPage({ controlledMonth, onMonthChange } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const monthKey = format(activeMonth, 'yyyy-MM')
  const sheetRef = useRef(null)

  const [incomeEntries, setIncomeEntries] = useState([])
  const [expenseEntries, setExpenseEntries] = useState([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [anchor, setAnchor] = useState(null) // the finance_tally doc for THIS month, or null
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  // Manual previous-balance editor
  const [editing, setEditing] = useState(false)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Departmental Expense breakdown — collapsed to just its total until clicked open.
  const [deptOpen, setDeptOpen] = useState(false)

  // PDF export
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    load()
    setEditing(false)
    setPdfError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonth, canAccess])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      // Anchors are optional — if the read fails (e.g. rules not yet deployed) fall
      // back to a pure automatic carry-forward rather than erroring the whole sheet.
      let anchors = []
      try {
        anchors = await getFinanceTallyAnchors()
      } catch (err) {
        console.warn('[Tally] anchors unavailable, using auto carry-forward only', err)
      }
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

      // Previous / opening balance.
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
      setLoadError('Could not load this month’s account sheet.')
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
  const availableBalance = openingBalance + totalIncome
  const currentBalance = availableBalance - totalExpense
  const isManual = !!anchor
  const { totals: deptTotals, other: deptOther } = groupByDepartment(expenseEntries)

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
      setLoadError('Could not save the manual previous balance.')
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

  async function handleDownloadPdf() {
    if (!sheetRef.current) return
    setDownloading(true)
    setPdfError('')
    try {
      const [{ jsPDF }, html2canvasMod] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      const html2canvas = html2canvasMod.default || html2canvasMod
      // The PDF always shows the full departmental breakdown, regardless of the
      // on-screen collapsed state.
      const wasDeptOpen = deptOpen
      if (!wasDeptOpen) setDeptOpen(true)
      // Pin the sheet to full A4 width for the capture even on a narrow screen where
      // it renders shrunk (max-w-full), then restore.
      const el = sheetRef.current
      const prevWidth = el.style.width
      const prevMaxWidth = el.style.maxWidth
      el.style.width = '210mm'
      el.style.maxWidth = 'none'
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
      let canvas
      try {
        canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      } finally {
        el.style.width = prevWidth
        el.style.maxWidth = prevMaxWidth
      }
      const doc = new jsPDF('p', 'mm', 'a4')
      const PAGE_W = 210
      const PAGE_H = 297
      const margin = 8
      let w = PAGE_W - margin * 2
      let h = (canvas.height / canvas.width) * w
      if (h > PAGE_H - margin * 2) {
        h = PAGE_H - margin * 2
        w = (canvas.width / canvas.height) * h
      }
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', (PAGE_W - w) / 2, margin, w, h)
      doc.save(`account-sheet-${monthKey}.pdf`)
      if (!wasDeptOpen) setDeptOpen(false)
    } catch (err) {
      console.error('[Tally] PDF export failed', err)
      setPdfError('Could not generate the PDF. Try again.')
    } finally {
      setDownloading(false)
    }
  }

  function fmtDate(d) {
    try { return format(d instanceof Date ? d : new Date(d), 'dd/MM/yyyy') } catch { return '—' }
  }

  const tallyRows = [
    { label: 'Income of the Month', value: totalIncome },
    { label: 'Previous Balance', value: openingBalance, badge: isManual ? 'Manual' : 'Auto' },
    { label: 'Available Balance', value: availableBalance, strong: true },
    { label: 'Total Expense', value: totalExpense, negative: true },
    { label: 'Current Balance', value: currentBalance, strong: true, signed: true },
  ]

  return (
    <div className="space-y-5 pb-12">

      {/* ── Toolbar (not part of the export) ── */}
      {(!controlledMonth || onMonthChange) && (
        <div className="flex items-center justify-center gap-4 py-1">
          <button type="button" onClick={() => changeMonth(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Previous month">‹</button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">{format(activeMonth, 'MMMM yyyy')}</span>
          <button type="button" onClick={() => changeMonth(1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none" aria-label="Next month">›</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={editing ? () => setEditing(false) : startEdit}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          {editing ? 'Close' : isManual ? 'Edit previous balance' : 'Set previous balance'}
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading || loading}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {downloading ? 'Generating PDF…' : '⬇ Download PDF'}
        </button>
      </div>

      {(loadError || pdfError) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{loadError || pdfError}</div>
      )}

      {/* Previous-balance editor */}
      {editing && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
          <p className="text-xs text-slate-500">
            Override the previous (opening) balance for {format(activeMonth, 'MMMM yyyy')}.
            Later months carry forward from this figure. Leave it unset to roll over
            automatically from earlier months.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-medium text-slate-600">
              Previous balance (₹)
              <input
                type="number"
                value={draftAmount}
                onChange={e => setDraftAmount(e.target.value)}
                className="mt-1 block w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
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
            <button type="button" onClick={saveManual} disabled={saving} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">
              Cancel
            </button>
            {isManual && (
              <button type="button" onClick={resetToAuto} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 ml-auto">
                Reset to auto
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* ══ Account Sheet — the export target, A4-width ══ */}
          <div className="overflow-x-auto">
          <div ref={sheetRef} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5 mx-auto w-[210mm] max-w-full">
            <div className="border-b border-slate-100 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">River Of Life Community Church</p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">Account Sheet</h2>
              <p className="text-xs font-medium text-slate-500">{format(activeMonth, 'MMMM yyyy')}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Tally table */}
              <div className="rounded-lg border border-slate-200 overflow-hidden self-start">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tally</h3>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {tallyRows.map(r => (
                      <tr key={r.label} className={r.strong ? 'bg-slate-50/70' : ''}>
                        <td className={`px-4 py-2.5 ${r.strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                          {r.label}
                          {r.badge && (
                            <span className={`ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${r.badge === 'Manual' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                              {r.badge}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${
                          r.strong
                            ? `font-bold ${r.signed ? (r.value >= 0 ? 'text-emerald-700' : 'text-red-600') : 'text-slate-900'}`
                            : r.negative ? 'text-red-600' : 'text-slate-800'
                        }`}>
                          {inr(r.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isManual && anchor.note && (
                  <p className="px-4 py-2 text-[11px] text-slate-400 italic border-t border-slate-100">“{anchor.note}”</p>
                )}
              </div>

              {/* Departmental expense table — collapsed to its total until opened */}
              <div className="rounded-lg border border-slate-200 overflow-hidden self-start">
                <button
                  type="button"
                  onClick={() => setDeptOpen(o => !o)}
                  aria-expanded={deptOpen}
                  className="w-full px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 text-left hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    <span className={`inline-block transition-transform ${deptOpen ? 'rotate-90' : ''}`}>▸</span>
                    Departmental Expense
                  </span>
                  <span className="text-sm font-bold text-red-600 tabular-nums">{inr(totalExpense)}</span>
                </button>
                {deptOpen && (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {DEPT_ROWS.map(r => (
                        <tr key={r.label}>
                          <td className="px-4 py-2 text-slate-600">{r.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-800">{inr(deptTotals.get(r.label))}</td>
                        </tr>
                      ))}
                      {deptOther > 0 && (
                        <tr>
                          <td className="px-4 py-2 text-slate-500 italic">Other / Unallocated</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-800">{inr(deptOther)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/70 border-t border-slate-200">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">Total</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-red-600">{inr(totalExpense)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

          </div>
          </div>

          {/* ── Month detail (screen only) ── */}
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
        </>
      )}
    </div>
  )
}
