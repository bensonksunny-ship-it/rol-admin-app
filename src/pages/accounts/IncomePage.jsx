import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { getFinanceIncome, applyFinanceIncomeOps } from '../../services/firestore'
import { categorizeEntries, matchesCategory, OTHER_INCOME_CATEGORY_OPTIONS, RSM_CATEGORY_OPTIONS, toDate } from './income/incomeCategorize'
import IncomeSummaryTable from './income/IncomeSummaryTable'
import OfferingMatrixTable from './income/OfferingMatrixTable'
import CategoryListTable from './income/CategoryListTable'
import PasteReviewDialog from './income/PasteReviewDialog'

// The list-style Income sections, in page order. `categories[0]` is what new
// rows and pasted rows are filed under; multi-category sections get a Category column.
const LIST_SECTIONS = [
  { key: 'titheEnglish', title: 'Tithe - English', accent: 'indigo', categories: ['Tithe - English'] },
  { key: 'titheTamil', title: 'Tithe - Tamil', accent: 'violet', categories: ['Tithe - Tamil'] },
  { key: 'contribution', title: 'Contribution', accent: 'amber', categories: ['Contribution'], towards: true },
  { key: 'supportFromROLCC', title: 'Support from ROLCC', accent: 'teal', categories: ['Support from ROLCC'] },
  { key: 'otherIncome', title: 'Other Income', accent: 'rose', categories: OTHER_INCOME_CATEGORY_OPTIONS, towards: true, customCategory: true },
  { key: 'rsm', title: 'RSM', accent: 'cyan', categories: RSM_CATEGORY_OPTIONS },
]

const SECTION_TITLES = { offering: 'Offering', ...Object.fromEntries(LIST_SECTIONS.map(s => [s.key, s.title])) }

function isoToLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function hasOps(ops) {
  return !!(ops?.creates?.length || ops?.updates?.length || ops?.deletes?.length)
}

// A saved entry's field in the form applyFinanceIncomeOps takes (date as yyyy-MM-dd).
function entryField(entry, key) {
  if (key === 'date') return format(toDate(entry.date), 'yyyy-MM-dd')
  if (key === 'amount') return Number(entry.amount) || 0
  return entry[key] ?? ''
}

// Everything needed to re-create a deleted entry (undo), minus id/bookkeeping.
const NOT_RECREATED = new Set(['id', '_key', 'date', 'createdAt', 'updatedAt'])
function entryToCreate(entry) {
  const rest = Object.fromEntries(Object.entries(entry).filter(([k]) => !NOT_RECREATED.has(k)))
  return { ...rest, date: entryField(entry, 'date'), amount: Number(entry.amount) || 0, _key: entry.id }
}

export default function IncomePage({ controlledMonth, onMonthChange } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState(null)
  // Per-section write status for the "Saving… / Saved" header badge.
  const [busy, setBusy] = useState({})
  const [justSaved, setJustSaved] = useState({})
  // Pasted rows that need a decision before saving (dated outside the month, or
  // apparently already entered) plus lines that couldn't be read.
  // { section, ops, rows: [], invalid: [] }
  const [pasteReview, setPasteReview] = useState(null)

  const entriesRef = useRef(entries)
  entriesRef.current = entries
  // Writes run one at a time, in order, so an edit to a just-created row waits for
  // its create. idMap: temporary id (shown while a create is in flight) → real id.
  const opChainRef = useRef(Promise.resolve())
  const idMapRef = useRef(new Map())
  const undoStackRef = useRef([])
  const undoHandlerRef = useRef(null)
  const pageRef = useRef(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    undoStackRef.current = []
    load()
  }, [activeMonth, canAccess])

  // Ctrl+Z / Cmd+Z inside the Income tab reverts the most recent saved edit, paste
  // or delete (LIFO across sections). A cell being typed in keeps the browser's own
  // text undo until it's left.
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const root = pageRef.current
      if (!root || !(root.contains(e.target) || root.contains(document.activeElement))) return
      if (e.target.dataset?.dirty === 'true') return
      if (!undoStackRef.current.length) return
      e.preventDefault()
      undoHandlerRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!canAccess) return <Navigate to="/" replace />

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const data = await getFinanceIncome({
        year: activeMonth.getFullYear(),
        month: activeMonth.getMonth(),
      })
      setEntries(data)
    } catch (err) {
      console.error('Failed to load income:', err)
      setLoadError('Failed to load entries. Please refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function inActiveMonth(date) {
    return date.getFullYear() === activeMonth.getFullYear() && date.getMonth() === activeMonth.getMonth()
  }

  // The one write path for every grid: a cell edit, paste, row delete or undo.
  // ops = { creates: [{ date, category, amount, giverName, towards, _key? }],
  //         updates: [{ id, data }], deletes: [id] }.
  // The change shows immediately (creates under a temporary id — `_key` when the
  // grid supplies one, so its row isn't remounted), then one atomic batch saves
  // it. A failed save reloads the month so nothing looks saved that isn't.
  function applyOps(section, ops, { label, undoable = true } = {}) {
    if (!hasOps(ops)) return
    const title = SECTION_TITLES[section] || 'Income'
    const updates = ops.updates || []
    const deletes = ops.deletes || []
    const stamp = Date.now()
    const temps = (ops.creates || []).map((c, i) => {
      const { _key, ...payload } = c
      return { key: _key || `tmp-${stamp}-${i}`, payload }
    })

    // Inverse, captured from the state the user is looking at.
    const byId = new Map(entriesRef.current.map(e => [e.id, e]))
    const inverse = {
      creates: deletes.map(id => byId.get(id)).filter(Boolean).map(entryToCreate),
      updates: updates
        .filter(u => byId.has(u.id))
        .map(({ id, data }) => ({ id, data: Object.fromEntries(Object.keys(data).map(k => [k, entryField(byId.get(id), k)])) })),
      deletes: temps.map(t => t.key),
    }

    setEntries(prev => {
      const del = new Set(deletes)
      const upd = new Map(updates.map(u => [u.id, u.data]))
      const next = prev.filter(e => !del.has(e.id)).map(e => {
        const data = upd.get(e.id)
        if (!data) return e
        const patched = { ...e, ...data }
        if ('date' in data) patched.date = isoToLocalDate(data.date)
        if ('amount' in data) patched.amount = Number(data.amount) || 0
        return patched
      }).filter(e => inActiveMonth(toDate(e.date)))
      temps.forEach(t => {
        const date = isoToLocalDate(t.payload.date)
        if (inActiveMonth(date)) next.push({ ...t.payload, id: t.key, _key: t.key, date, amount: Number(t.payload.amount) || 0 })
      })
      return next
    })
    setBusy(b => ({ ...b, [section]: (b[section] || 0) + 1 }))

    opChainRef.current = opChainRef.current.then(async () => {
      const resolve = id => idMapRef.current.get(id) || id
      try {
        const ids = await applyFinanceIncomeOps({
          creates: temps.map(t => t.payload),
          updates: updates.map(u => ({ id: resolve(u.id), data: u.data })),
          deletes: deletes.map(resolve),
        })
        temps.forEach((t, i) => idMapRef.current.set(t.key, ids[i]))
        if (temps.length) setEntries(prev => prev.map(e => (idMapRef.current.has(e.id) ? { ...e, id: idMapRef.current.get(e.id) } : e)))
        if (undoable) undoStackRef.current.push({ section, ops: inverse })
        if (label) showToast(label)
        setJustSaved(s => ({ ...s, [section]: Date.now() }))
        setTimeout(() => setJustSaved(s => (Date.now() - (s[section] || 0) >= 1900 ? { ...s, [section]: 0 } : s)), 2000)
      } catch (err) {
        console.error(`Failed to save ${title} income:`, err)
        showToast(
          err?.code === 'permission-denied'
            ? `You don't have permission to save ${title}.`
            : `${title}: the change could not be saved. The table has been reloaded — please re-enter it.`,
          'error'
        )
        await load()
      } finally {
        setBusy(b => ({ ...b, [section]: Math.max(0, (b[section] || 0) - 1) }))
      }
    })
  }

  function handleUndo() {
    const action = undoStackRef.current.pop()
    if (!action) return
    applyOps(action.section, action.ops, { label: `${SECTION_TITLES[action.section] || 'Income'}: undone`, undoable: false })
  }
  undoHandlerRef.current = handleUndo

  // A grid's paste: clean rows save straight away; rows dated outside this month
  // wait for a corrected date and apparent duplicates for a tick
  // (PasteReviewDialog); unreadable lines are listed, never dropped silently.
  function handlePastePlan(section, plan) {
    const title = SECTION_TITLES[section]
    if (hasOps(plan.ops)) {
      const n = (plan.ops.creates?.length || 0) + (plan.ops.updates?.length || 0) + (plan.ops.deletes?.length || 0)
      applyOps(section, plan.ops, { label: `${title}: pasted (${n} ${n === 1 ? 'change' : 'changes'}) — Ctrl+Z to undo` })
    }
    if (plan.heldRows.length || plan.invalid.length) {
      setPasteReview({ section, rows: plan.heldRows, invalid: plan.invalid })
    } else if (!hasOps(plan.ops)) {
      showToast(`${title}: nothing to paste — the copied cells match what's already there.`, 'error')
    }
  }

  // Saves the rows kept in PasteReviewDialog, each with its (corrected) date.
  function savePasteReview(section, chosen) {
    const ops = { creates: [], updates: [], deletes: [] }
    chosen.forEach(({ row, date }) => {
      if (row.op.type === 'update') {
        ops.updates.push({ id: row.op.id, data: { ...row.op.data, date } })
      } else if (row.cell) {
        // Offering: the corrected date's cell takes this amount (merging any entries already there).
        const [first, ...rest] = entriesRef.current.filter(e => entryField(e, 'date') === date && matchesCategory(e, row.category))
        if (!first) ops.creates.push({ ...row.op.data, date })
        else {
          ops.updates.push({ id: first.id, data: { amount: row.amount } })
          ops.deletes.push(...rest.map(e => e.id))
        }
      } else {
        ops.creates.push({ ...row.op.data, date })
      }
    })
    applyOps(section, ops, { label: `${SECTION_TITLES[section]}: ${chosen.length} ${chosen.length === 1 ? 'row' : 'rows'} saved — Ctrl+Z to undo` })
  }

  function prevMonth() {
    if (onMonthChange) onMonthChange(subMonths(activeMonth, 1))
    else setInternalMonth(m => subMonths(m, 1))
  }
  function nextMonth() {
    if (onMonthChange) onMonthChange(addMonths(activeMonth, 1))
    else setInternalMonth(m => addMonths(m, 1))
  }

  const categorized = categorizeEntries(entries)
  const offeringEntries = [...categorized.englishOffering, ...categorized.tamilOffering, ...categorized.onlineOffering]
  const monthKey = format(activeMonth, 'yyyy-MM')

  function gridProps(section) {
    return {
      activeMonth,
      saveState: busy[section] ? 'saving' : justSaved[section] ? 'saved' : null,
      onApply: (ops, opts) => applyOps(section, ops, opts),
      onPastePlan: plan => handlePastePlan(section, plan),
      onError: msg => showToast(msg, 'error'),
    }
  }

  return (
    <div ref={pageRef} className="max-w-[250mm] mx-auto space-y-5 pb-12">

      {toast && (
        <div
          role="status"
          className={`fixed top-4 right-4 z-[60] px-5 py-3 rounded-2xl text-white shadow-xl text-sm font-semibold ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Month picker — hidden when a parent owns the picker (controlledMonth with no
          onMonthChange, e.g. EntryPage); shown when the parent syncs month via onMonthChange
          (DepartmentHub's accounts tabs) so this page's own picker drives the shared param. */}
      {(!controlledMonth || onMonthChange) && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="text-base font-semibold text-slate-800 w-36 text-center">
            {format(activeMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition text-lg leading-none"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {pasteReview && (
        <PasteReviewDialog
          title={SECTION_TITLES[pasteReview.section]}
          activeMonth={activeMonth}
          rows={pasteReview.rows}
          invalid={pasteReview.invalid}
          onCancel={() => setPasteReview(null)}
          onSave={chosen => { const { section } = pasteReview; setPasteReview(null); savePasteReview(section, chosen) }}
        />
      )}

      <h2 className="text-sm font-semibold text-slate-600">Income Breakdown</h2>

      {loading && (
        <div className="text-center text-sm text-slate-500 py-2">Loading…</div>
      )}

      <IncomeSummaryTable entries={entries} />

      {/* Keyed by month so grid-local state (unsaved new rows, row order) starts fresh. */}
      <OfferingMatrixTable key={`offering-${monthKey}`} entries={offeringEntries} {...gridProps('offering')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LIST_SECTIONS.map(s => (
          <CategoryListTable
            key={`${s.key}-${monthKey}`}
            title={s.title}
            accent={s.accent}
            entries={categorized[s.key]}
            categoryOptions={s.categories}
            customCategory={!!s.customCategory}
            towardsColumn={!!s.towards}
            {...gridProps(s.key)}
          />
        ))}
      </div>
    </div>
  )
}
