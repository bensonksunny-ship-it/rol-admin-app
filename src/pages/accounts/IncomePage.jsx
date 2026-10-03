import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { format, addMonths, subMonths, startOfMonth } from 'date-fns'
import { useAuth } from '../../context/AuthContext'
import { canAccessAccountsEntry } from '../../utils/accountsEntryAccess'
import { INCOME_TYPES } from '../../constants/roles'
import {
  getFinanceIncome,
  createFinanceIncome,
  updateFinanceIncome,
  deleteFinanceIncome,
  batchUpdateFinanceIncome,
  createFinanceIncomeMany,
  deleteFinanceIncomeMany,
} from '../../services/firestore'
import { categorizeEntries, OTHER_INCOME_CATEGORY_OPTIONS, RSM_CATEGORY_OPTIONS, toDate } from './income/incomeCategorize'
import IncomeSummaryTable from './income/IncomeSummaryTable'
import OfferingMatrixTable from './income/OfferingMatrixTable'
import CategoryListTable from './income/CategoryListTable'
import { parseIncomePaste } from './income/incomePaste'

// Direct Excel paste (Ctrl+V on a card) per card: which columns the paste
// expects and the category its rows are filed under. Multi-category cards (RSM,
// Other Income) file pasted rows under their first category — change a row's
// category afterwards in that card's edit mode.
const PASTE_CONFIG = {
  offering: { kind: 'offering' },
  titheEnglish: { kind: 'list', category: 'Tithe - English' },
  titheTamil: { kind: 'list', category: 'Tithe - Tamil' },
  contribution: { kind: 'list', towards: true, category: 'Contribution' },
  supportFromROLCC: { kind: 'list', category: 'Support from ROLCC' },
  otherIncome: { kind: 'list', towards: true, category: OTHER_INCOME_CATEGORY_OPTIONS[0] },
  rsm: { kind: 'list', category: RSM_CATEGORY_OPTIONS[0] },
}

// Spreadsheet-shaped clipboard text: more than one line, or tab / 2+-space
// separated columns. Excel appends a trailing newline even to a single cell, so
// that's trimmed first — a lone value pastes normally into whatever input has focus.
function isTabularPaste(text) {
  const t = String(text || '').replace(/[\r\n]+$/, '')
  return /[\t\n\r]/.test(t) || /\S\s{2,}\S/.test(t)
}

function isoToLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: INCOME_TYPES[0],
  amount: '',
  giverName: '',
  towards: '',
}

// Card titles, used in the per-section Save toasts.
const SECTION_TITLES = {
  offering: 'Offering',
  titheEnglish: 'Tithe - English',
  titheTamil: 'Tithe - Tamil',
  contribution: 'Contribution',
  supportFromROLCC: 'Support from ROLCC',
  otherIncome: 'Other Income',
  rsm: 'RSM',
}

const DRAFT_FIELDS = ['date', 'category', 'giverName', 'towards', 'amount']

// An entry's editable fields as form strings — the baseline a card's draft is
// compared against to decide what actually changed.
function entryToDraft(entry) {
  return {
    date: format(toDate(entry.date), 'yyyy-MM-dd'),
    category: entry.category || '',
    giverName: entry.giverName || '',
    towards: entry.towards || '',
    amount: String(entry.amount ?? ''),
  }
}

function draftFieldChanged(field, original, next) {
  if (field === 'amount') return Number(original) !== Number(next)
  if (field === 'date') return original !== next
  return String(original).trim() !== String(next).trim()
}

export default function IncomePage({ controlledMonth, onMonthChange } = {}) {
  const { userProfile, hasPermission, isFounder } = useAuth()
  const [internalMonth, setInternalMonth] = useState(startOfMonth(new Date()))
  const activeMonth = controlledMonth || internalMonth
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [addingSection, setAddingSection] = useState(null)
  const [addingCell, setAddingCell] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [editSections, setEditSections] = useState({})
  const [expandedCard, setExpandedCard] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loadError, setLoadError] = useState('')
  // Per-card bulk edit: { [section]: { [entryId]: { field: value } } } — only
  // touched fields are stored; untouched rows read straight from `entries`.
  const [drafts, setDrafts] = useState({})
  const [savingSections, setSavingSections] = useState({})
  // Sections that saved successfully in the last few seconds — drives the card's
  // inline "Saved" badge (alongside the page toast).
  const [justSavedSections, setJustSavedSections] = useState({})
  const [toast, setToast] = useState(null)
  // Rows from a paste that need a decision before saving (dated outside the month,
  // or look like duplicates) plus rows that couldn't be read — mirrors the Expense
  // page's date-mismatch "Save Anyway" gate. { section, pending: [], invalid: [] }
  const [pasteReview, setPasteReview] = useState(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    // Drafts belong to the month they were typed in.
    setDrafts({})
    setEditSections({})
    undoStackRef.current = []
    load()
  }, [activeMonth, canAccess])

  // Ctrl+Z / Cmd+Z anywhere inside the Income tab (a card, a cell, a bulk-edit
  // input) reverts the most recent bulk edit or paste — see handleUndo. The
  // inline add/edit form opts out (data-native-undo) so its inputs keep the
  // browser's own text undo, as does any Ctrl+Z when there's nothing to undo.
  const pageRef = useRef(null)
  const undoStackRef = useRef([])
  const undoHandlerRef = useRef(null)
  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const root = pageRef.current
      if (!root || !(root.contains(e.target) || root.contains(document.activeElement))) return
      if (e.target.closest?.('[data-native-undo]')) return
      if (!undoStackRef.current.length) return
      e.preventDefault()
      undoHandlerRef.current?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!openMenuId) return
    function handleClickOutside(e) {
      if (!e.target.closest('[data-row-menu]')) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

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

  const categorized = categorizeEntries(entries)
  const offeringEntries = [...categorized.englishOffering, ...categorized.tamilOffering, ...categorized.onlineOffering]
  const rowActionProps = { openMenuId, setOpenMenuId, deletingId, setDeletingId, onEdit: handleEdit, onDelete: handleDelete }
  const inlineFormProps = {
    editingId,
    form,
    onFormChange: (field, value) => setForm(f => ({ ...f, [field]: value })),
    onSave: handleSave,
    onCancel: closeInlineForm,
    saving,
    formError,
  }

  const sectionEntries = { offering: offeringEntries, ...categorized }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  function draftFor(section, entry) {
    return { ...entryToDraft(entry), ...(drafts[section]?.[entry.id] || {}) }
  }

  function setDraftField(section, id, field, value) {
    // Undo history: one step per field edit. Consecutive keystrokes in the same
    // field (within a second) coalesce, so Ctrl+Z reverts the whole typed value
    // rather than one character at a time. `prev` undefined = field wasn't edited.
    const stack = undoStackRef.current
    const top = stack[stack.length - 1]
    const now = Date.now()
    if (top?.type === 'draft' && top.section === section && top.id === id && top.field === field && now - top.at < 1000) {
      top.at = now
    } else {
      const patch = drafts[section]?.[id]
      stack.push({ type: 'draft', section, id, field, prev: patch && field in patch ? patch[field] : undefined, at: now })
    }
    setDrafts(prev => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [id]: { ...(prev[section]?.[id] || {}), [field]: value } },
    }))
  }

  // Reverts the most recent undoable action (LIFO across all cards):
  //  - a bulk-edit field change → restore its previous draft value (or drop it, so
  //    the cell shows the saved value again); dirty counts/Save re-derive from drafts.
  //  - a paste → its rows were saved immediately, so undoing deletes exactly those
  //    entries (after a confirm) and removes them from the tables and totals.
  async function handleUndo() {
    const action = undoStackRef.current.pop()
    if (!action) return
    const title = SECTION_TITLES[action.section] || 'Income'

    if (action.type === 'draft') {
      const { section, id, field, prev } = action
      setDrafts(d => {
        const patch = { ...(d[section]?.[id] || {}) }
        if (prev === undefined) delete patch[field]
        else patch[field] = prev
        const sectionDrafts = { ...(d[section] || {}) }
        if (Object.keys(patch).length) sectionDrafts[id] = patch
        else delete sectionDrafts[id]
        return { ...d, [section]: sectionDrafts }
      })
      showToast(`${title}: edit undone`)
      return
    }

    if (action.type === 'paste') {
      const n = action.ids.length
      if (!window.confirm(`Undo paste? This deletes the ${n} ${n === 1 ? 'entry' : 'entries'} just pasted into ${title}.`)) {
        undoStackRef.current.push(action) // kept, so Ctrl+Z can still undo it later
        return
      }
      try {
        await deleteFinanceIncomeMany(action.ids)
        const removed = new Set(action.ids)
        setEntries(prev => prev.filter(e => !removed.has(e.id)))
        setDrafts(d => Object.fromEntries(Object.entries(d).map(([section, patches]) => [
          section,
          Object.fromEntries(Object.entries(patches || {}).filter(([id]) => !removed.has(id))),
        ])))
        // Bulk edits recorded against the deleted rows can no longer be undone.
        undoStackRef.current = undoStackRef.current.filter(a => !(a.type === 'draft' && removed.has(a.id)))
        showToast(`${title}: paste undone — ${n} ${n === 1 ? 'entry' : 'entries'} removed`)
      } catch (err) {
        console.error(`Failed to undo ${title} paste:`, err)
        undoStackRef.current.push(action)
        showToast(
          err?.code === 'permission-denied'
            ? `You don't have permission to delete ${title} entries.`
            : `${title}: could not undo the paste. Try again.`,
          'error'
        )
      }
    }
  }
  undoHandlerRef.current = handleUndo

  // [{ id, data }] where data holds only the fields that differ from the saved entry.
  function sectionChanges(section) {
    const patches = drafts[section] || {}
    return (sectionEntries[section] || []).flatMap(entry => {
      const patch = patches[entry.id]
      if (!patch) return []
      const original = entryToDraft(entry)
      const data = {}
      DRAFT_FIELDS.forEach(f => {
        if (f in patch && draftFieldChanged(f, original[f], patch[f])) data[f] = patch[f]
      })
      return Object.keys(data).length ? [{ id: entry.id, data }] : []
    })
  }

  function sectionProps(section) {
    return {
      draftFor: entry => draftFor(section, entry),
      onDraftChange: (id, field, value) => setDraftField(section, id, field, value),
      dirtyCount: sectionChanges(section).length,
      sectionSaving: !!savingSections[section],
      justSaved: !!justSavedSections[section],
      onSaveSection: () => handleSaveSection(section),
      onCancelSection: () => closeSection(section),
    }
  }

  // Ctrl+V on a card. Spreadsheet-shaped text is parsed into entries; clean rows
  // dated in this month save straight away, everything else waits in pasteReview.
  function handleTablePaste(section, e, anchor = null) {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') ?? ''
    if (!isTabularPaste(text)) return // single value → normal paste into the focused input
    e.preventDefault()
    if (savingSections[section]) return
    const { rows } = parseIncomePaste(text, {
      ...PASTE_CONFIG[section],
      activeMonth,
      existing: entries,
      anchor: section === 'offering' ? anchor : null,
    })
    const title = SECTION_TITLES[section] || 'Income'
    if (!rows.length) {
      showToast(`${title}: nothing to paste — no rows found in the copied cells.`, 'error')
      return
    }
    const ready = rows.filter(r => r.status === 'ok')
    const pending = rows.filter(r => r.status === 'outOfMonth' || r.status === 'duplicate')
    const invalid = rows.filter(r => r.status === 'invalid')
    if (ready.length) persistPastedRows(section, ready)
    if (pending.length || invalid.length) setPasteReview({ section, pending, invalid })
  }

  // Optimistic: rows dated in this month appear in their table (and every total)
  // immediately under temporary ids, then one atomic batch write persists them all.
  // If the write fails, the temporary rows are pulled back out — nothing is left
  // looking saved when it isn't.
  async function persistPastedRows(section, rows) {
    const title = SECTION_TITLES[section] || 'Income'
    const payloads = rows.map(r => ({ date: r.iso, category: r.category, amount: r.amount, giverName: r.name, towards: r.towards }))
    const stamp = Date.now()
    const temps = payloads.map((p, i) => ({ ...p, id: `pending-paste-${stamp}-${i}`, date: isoToLocalDate(p.date) }))
    const y = activeMonth.getFullYear(), m = activeMonth.getMonth()
    const inMonth = temps.filter(t => t.date.getFullYear() === y && t.date.getMonth() === m)
    const tempIds = new Set(temps.map(t => t.id))
    setEntries(prev => [...prev, ...inMonth])
    try {
      const ids = await createFinanceIncomeMany(payloads)
      const realId = Object.fromEntries(temps.map((t, i) => [t.id, ids[i]]))
      setEntries(prev => prev.map(e => (tempIds.has(e.id) ? { ...e, id: realId[e.id] } : e)))
      // Undoable via Ctrl+Z (handleUndo) — all created ids, including other months'.
      undoStackRef.current.push({ type: 'paste', section, ids })
      const elsewhere = temps.length - inMonth.length
      showToast(`${title}: ${temps.length} pasted ${temps.length === 1 ? 'entry' : 'entries'} saved${elsewhere ? ` (${elsewhere} under other months)` : ''}`)
    } catch (err) {
      console.error(`Failed to save pasted ${title} income:`, err)
      setEntries(prev => prev.filter(e => !tempIds.has(e.id)))
      showToast(
        err?.code === 'permission-denied'
          ? `You don't have permission to save ${title}.`
          : `${title}: paste could not be saved — nothing was saved. Try pasting again.`,
        'error'
      )
    }
  }

  function closeSection(section) {
    // Saved or cancelled — this card's bulk-edit steps have nothing left to revert.
    undoStackRef.current = undoStackRef.current.filter(a => !(a.type === 'draft' && a.section === section))
    setDrafts(prev => ({ ...prev, [section]: {} }))
    setEditSections(prev => ({ ...prev, [section]: false }))
    setOpenMenuId(null)
    setDeletingId(null)
  }

  async function handleSaveSection(section) {
    if (savingSections[section]) return
    const title = SECTION_TITLES[section] || 'Section'
    const changes = sectionChanges(section)
    if (!changes.length) { closeSection(section); return }
    const invalid = changes.find(({ data }) =>
      ('date' in data && !data.date) ||
      ('amount' in data && (data.amount === '' || isNaN(Number(data.amount)) || Number(data.amount) < 0))
    )
    if (invalid) {
      showToast(`${title}: every row needs a date and an amount of 0 or more.`, 'error')
      return
    }
    setSavingSections(prev => ({ ...prev, [section]: true }))
    try {
      await batchUpdateFinanceIncome(changes)
      const byId = Object.fromEntries(changes.map(c => [c.id, c.data]))
      setEntries(prev => prev.map(e => {
        const data = byId[e.id]
        if (!data) return e
        const next = { ...e, ...data }
        if ('amount' in data) next.amount = Number(data.amount) || 0
        if ('date' in data) {
          const [y, m, d] = data.date.split('-').map(Number)
          next.date = new Date(y, m - 1, d)
        }
        ;['giverName', 'towards', 'category'].forEach(k => { if (k in data) next[k] = String(data[k]).trim() })
        return next
      }))
      closeSection(section)
      showToast(`${title} saved (${changes.length} ${changes.length === 1 ? 'change' : 'changes'})`)
      setJustSavedSections(prev => ({ ...prev, [section]: true }))
      setTimeout(() => setJustSavedSections(prev => ({ ...prev, [section]: false })), 4000)
    } catch (err) {
      console.error(`Failed to save ${title} income:`, err)
      showToast(
        err?.code === 'permission-denied'
          ? `You don't have permission to save ${title}.`
          : `Failed to save ${title}. Your edits are kept — try again.`,
        'error'
      )
    } finally {
      setSavingSections(prev => ({ ...prev, [section]: false }))
    }
  }

  function toggleSection(key) {
    if (editSections[key]) {
      // "Done" with unsaved edits in this card — confirm before discarding them.
      if (sectionChanges(key).length && !window.confirm(`Discard unsaved changes in ${SECTION_TITLES[key] || 'this section'}?`)) return
      closeSection(key)
      return
    }
    setEditSections(prev => ({ ...prev, [key]: true }))
    setOpenMenuId(null)
    setDeletingId(null)
  }

  function toggleExpandCard(key) {
    setExpandedCard(prev => (prev === key ? null : key))
  }

  function prevMonth() {
    if (onMonthChange) onMonthChange(subMonths(activeMonth, 1))
    else setInternalMonth(m => subMonths(m, 1))
  }
  function nextMonth() {
    if (onMonthChange) onMonthChange(addMonths(activeMonth, 1))
    else setInternalMonth(m => addMonths(m, 1))
  }

  function validate() {
    if (!form.date) return 'Date is required.'
    if (form.amount === '' || Number(form.amount) < 0) return 'Amount must be 0 or greater.'
    return ''
  }

  async function handleSave() {
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError('')
    setSaving(true)
    try {
      const payload = {
        date: form.date,
        category: form.category,
        amount: Number(form.amount),
        giverName: form.giverName.trim(),
        towards: form.towards.trim(),
      }
      if (editingId) {
        await updateFinanceIncome(editingId, payload)
      } else {
        await createFinanceIncome(payload)
      }
      closeInlineForm()
      await load()
    } catch {
      setSaveError('Failed to save. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(entry) {
    setAddingSection(null)
    setAddingCell(null)
    setEditingId(entry.id)
    setFormError('')
    setForm({
      date: entry.date instanceof Date
        ? format(entry.date, 'yyyy-MM-dd')
        : format(new Date(entry.date), 'yyyy-MM-dd'),
      category: entry.category || INCOME_TYPES[0],
      amount: String(entry.amount ?? ''),
      giverName: entry.giverName || '',
      towards: entry.towards || '',
    })
  }

  function handleAddForCategory(section, category) {
    setEditingId(null)
    setFormError('')
    setAddingSection(section)
    setAddingCell(null)
    setForm({ ...EMPTY_FORM, category })
  }

  function handleAddOfferingCell(date, category) {
    setEditingId(null)
    setFormError('')
    setAddingSection('offering')
    setAddingCell({ date, category })
    setForm({ ...EMPTY_FORM, date, category })
  }

  function closeInlineForm() {
    setEditingId(null)
    setAddingSection(null)
    setAddingCell(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleDelete(id) {
    try {
      await deleteFinanceIncome(id)
      setDeletingId(null)
      setEntries(prev => prev.filter(e => e.id !== id))
      undoStackRef.current = undoStackRef.current.filter(a => !(a.type === 'draft' && a.id === id))
      setDrafts(prev => Object.fromEntries(Object.entries(prev).map(([section, patches]) => {
        const { [id]: _removed, ...rest } = patches || {}
        return [section, rest]
      })))
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  return (
    <div ref={pageRef} className="max-w-[250mm] mx-auto space-y-5 pb-12">

      {/* Per-section Save feedback (names the card that was saved). */}
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

      {/* Load error */}
      {loadError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button type="button" onClick={load} className="text-xs text-red-600 font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">{saveError}</p>
        </div>
      )}

      {/* Paste review — same gate as the Expense page's date-mismatch warning: rows
          dated outside this month (or matching an existing entry) are held until the
          user picks "Skip" or "Save Anyway"; unreadable rows are listed, never dropped silently. */}
      {pasteReview && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3 max-h-[85vh] flex flex-col">
            <p className="text-sm font-semibold text-amber-700">
              ⚠ {SECTION_TITLES[pasteReview.section]}: some pasted rows need a look
            </p>
            <div className="text-sm text-slate-600 space-y-2 overflow-y-auto">
              {pasteReview.pending.some(r => r.status === 'outOfMonth') && (
                <p>
                  {pasteReview.pending.filter(r => r.status === 'outOfMonth').length} dated outside {format(activeMonth, 'MMMM yyyy')}.
                  "Save Anyway" files them under their own month (open that month to see them).
                </p>
              )}
              {pasteReview.pending.some(r => r.status === 'duplicate') && (
                <p>{pasteReview.pending.filter(r => r.status === 'duplicate').length} look like entries already saved (same date, amount and name).</p>
              )}
              {pasteReview.pending.length > 0 && (
                <ul className="text-xs border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {pasteReview.pending.map(r => (
                    <li key={r.key} className="px-3 py-1.5 flex items-center justify-between gap-2">
                      <span className="text-slate-700">
                        {format(isoToLocalDate(r.iso), 'dd/MM/yyyy')}
                        {r.name ? ` · ${r.name}` : ''}
                        {pasteReview.section === 'offering' ? ` · ${r.category.replace(' Offering', '')}` : ''}
                      </span>
                      <span className="tabular-nums font-medium text-slate-800">₹{r.amount.toLocaleString('en-IN')}</span>
                      <span className={`text-[10px] font-semibold ${r.status === 'duplicate' ? 'text-slate-500' : 'text-amber-600'}`}>
                        {r.status === 'duplicate' ? 'Duplicate' : 'Other month'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {pasteReview.invalid.length > 0 && (
                <div>
                  <p className="text-red-700">{pasteReview.invalid.length} {pasteReview.invalid.length === 1 ? 'row' : 'rows'} could not be read and {pasteReview.invalid.length === 1 ? 'was' : 'were'} not saved:</p>
                  <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                    {pasteReview.invalid.map(r => <li key={r.key}>Line {r.line}: {r.message}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              {pasteReview.pending.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPasteReview(null)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-colors"
                  >
                    Skip {pasteReview.pending.length === 1 ? 'it' : 'these'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { const { section, pending } = pasteReview; setPasteReview(null); persistPastedRows(section, pending) }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors"
                  >
                    Save Anyway
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPasteReview(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:border-slate-300 transition-colors"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <h2 className="text-sm font-semibold text-slate-600">Income Breakdown</h2>

      {loading && (
        <div className="text-center text-sm text-slate-500 py-2">Loading…</div>
      )}

      <IncomeSummaryTable entries={entries} />

      <OfferingMatrixTable
        entries={offeringEntries}
        activeMonth={activeMonth}
        editMode={!!editSections.offering}
        onToggleEdit={() => toggleSection('offering')}
        {...sectionProps('offering')}

        onPaste={(e, anchor) => handleTablePaste('offering', e, anchor)}
        addingCell={addingCell}
        onAddCell={handleAddOfferingCell}
        {...inlineFormProps}
        {...rowActionProps}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CategoryListTable
          title="Tithe - English"
          accent="indigo"
          entries={categorized.titheEnglish}
          isExpanded={expandedCard === 'titheEnglish'}
          onToggleExpand={() => toggleExpandCard('titheEnglish')}
          editMode={!!editSections.titheEnglish}
          onToggleEdit={() => toggleSection('titheEnglish')}
          {...sectionProps('titheEnglish')}

          onPaste={e => handleTablePaste('titheEnglish', e)}
          isAdding={addingSection === 'titheEnglish'}
          onAddNew={() => handleAddForCategory('titheEnglish', 'Tithe - English')}
          categoryOptions={['Tithe - English']}
          {...inlineFormProps}
          {...rowActionProps}
        />
        <CategoryListTable
          title="Tithe - Tamil"
          accent="violet"
          entries={categorized.titheTamil}
          isExpanded={expandedCard === 'titheTamil'}
          onToggleExpand={() => toggleExpandCard('titheTamil')}
          editMode={!!editSections.titheTamil}
          onToggleEdit={() => toggleSection('titheTamil')}
          {...sectionProps('titheTamil')}

          onPaste={e => handleTablePaste('titheTamil', e)}
          isAdding={addingSection === 'titheTamil'}
          onAddNew={() => handleAddForCategory('titheTamil', 'Tithe - Tamil')}
          categoryOptions={['Tithe - Tamil']}
          {...inlineFormProps}
          {...rowActionProps}
        />
        <CategoryListTable
          title="Contribution"
          accent="amber"
          entries={categorized.contribution}
          towardsColumn
          isExpanded={expandedCard === 'contribution'}
          onToggleExpand={() => toggleExpandCard('contribution')}
          editMode={!!editSections.contribution}
          onToggleEdit={() => toggleSection('contribution')}
          {...sectionProps('contribution')}

          onPaste={e => handleTablePaste('contribution', e)}
          isAdding={addingSection === 'contribution'}
          onAddNew={() => handleAddForCategory('contribution', 'Contribution')}
          categoryOptions={['Contribution']}
          {...inlineFormProps}
          {...rowActionProps}
        />
        <CategoryListTable
          title="Support from ROLCC"
          accent="teal"
          entries={categorized.supportFromROLCC}
          isExpanded={expandedCard === 'supportFromROLCC'}
          onToggleExpand={() => toggleExpandCard('supportFromROLCC')}
          editMode={!!editSections.supportFromROLCC}
          onToggleEdit={() => toggleSection('supportFromROLCC')}
          {...sectionProps('supportFromROLCC')}

          onPaste={e => handleTablePaste('supportFromROLCC', e)}
          isAdding={addingSection === 'supportFromROLCC'}
          onAddNew={() => handleAddForCategory('supportFromROLCC', 'Support from ROLCC')}
          categoryOptions={['Support from ROLCC']}
          {...inlineFormProps}
          {...rowActionProps}
        />
        <CategoryListTable
          title="Other Income"
          accent="rose"
          entries={categorized.otherIncome}
          towardsColumn
          isExpanded={expandedCard === 'otherIncome'}
          onToggleExpand={() => toggleExpandCard('otherIncome')}
          editMode={!!editSections.otherIncome}
          onToggleEdit={() => toggleSection('otherIncome')}
          {...sectionProps('otherIncome')}

          onPaste={e => handleTablePaste('otherIncome', e)}
          isAdding={addingSection === 'otherIncome'}
          onAddNew={() => handleAddForCategory('otherIncome', OTHER_INCOME_CATEGORY_OPTIONS[0])}
          categoryOptions={OTHER_INCOME_CATEGORY_OPTIONS}
          {...inlineFormProps}
          {...rowActionProps}
        />
        <CategoryListTable
          title="RSM"
          accent="cyan"
          entries={categorized.rsm}
          isExpanded={expandedCard === 'rsm'}
          onToggleExpand={() => toggleExpandCard('rsm')}
          editMode={!!editSections.rsm}
          onToggleEdit={() => toggleSection('rsm')}
          {...sectionProps('rsm')}

          onPaste={e => handleTablePaste('rsm', e)}
          isAdding={addingSection === 'rsm'}
          onAddNew={() => handleAddForCategory('rsm', RSM_CATEGORY_OPTIONS[0])}
          categoryOptions={RSM_CATEGORY_OPTIONS}
          {...inlineFormProps}
          {...rowActionProps}
        />
      </div>
    </div>
  )
}
