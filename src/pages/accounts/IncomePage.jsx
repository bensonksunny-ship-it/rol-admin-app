import { useState, useEffect } from 'react'
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
} from '../../services/firestore'
import { categorizeEntries, OTHER_INCOME_CATEGORY_OPTIONS, RSM_CATEGORY_OPTIONS, toDate } from './income/incomeCategorize'
import IncomeSummaryTable from './income/IncomeSummaryTable'
import OfferingMatrixTable from './income/OfferingMatrixTable'
import CategoryListTable from './income/CategoryListTable'
import PasteIncomeModal from './income/PasteIncomeModal'

// "Paste from Excel" config per card: which columns the paste expects and which
// categories its rows can be filed under.
const PASTE_CONFIG = {
  offering: { title: 'Offering', kind: 'offering' },
  titheEnglish: { title: 'Tithe - English', kind: 'list', categoryOptions: ['Tithe - English'] },
  titheTamil: { title: 'Tithe - Tamil', kind: 'list', categoryOptions: ['Tithe - Tamil'] },
  contribution: { title: 'Contribution', kind: 'list', towards: true, categoryOptions: ['Contribution'] },
  supportFromROLCC: { title: 'Support from ROLCC', kind: 'list', categoryOptions: ['Support from ROLCC'] },
  otherIncome: { title: 'Other Income', kind: 'list', towards: true, categoryOptions: OTHER_INCOME_CATEGORY_OPTIONS },
  rsm: { title: 'RSM', kind: 'list', categoryOptions: RSM_CATEGORY_OPTIONS },
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
  const [toast, setToast] = useState(null)
  const [pasteSection, setPasteSection] = useState(null)

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
    // Drafts belong to the month they were typed in.
    setDrafts({})
    setEditSections({})
    load()
  }, [activeMonth, canAccess])

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
    setDrafts(prev => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [id]: { ...(prev[section]?.[id] || {}), [field]: value } },
    }))
  }

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
      onSaveSection: () => handleSaveSection(section),
      onCancelSection: () => closeSection(section),
    }
  }

  // Pasted rows are already persisted by PasteIncomeModal's batch write; merge the
  // ones dated in the month being viewed straight into state so the tables update
  // without a reload. Rows saved under another month show up when that month is opened.
  function handlePasteSaved(created) {
    const section = pasteSection
    setPasteSection(null)
    const y = activeMonth.getFullYear(), m = activeMonth.getMonth()
    const inMonth = created.filter(e => e.date.getFullYear() === y && e.date.getMonth() === m)
    setEntries(prev => [...prev, ...inMonth])
    const elsewhere = created.length - inMonth.length
    showToast(`${SECTION_TITLES[section] || 'Income'}: ${created.length} ${created.length === 1 ? 'entry' : 'entries'} saved${elsewhere ? ` (${elsewhere} in other months)` : ''}`)
  }

  function closeSection(section) {
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
    <div className="max-w-[250mm] mx-auto space-y-5 pb-12">

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

      {pasteSection && (
        <PasteIncomeModal
          key={pasteSection}
          {...PASTE_CONFIG[pasteSection]}
          activeMonth={activeMonth}
          existing={entries}
          onClose={() => setPasteSection(null)}
          onSaved={handlePasteSaved}
        />
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

        onPasteClick={() => setPasteSection('offering')}
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

          onPasteClick={() => setPasteSection('titheEnglish')}
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

          onPasteClick={() => setPasteSection('titheTamil')}
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

          onPasteClick={() => setPasteSection('contribution')}
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

          onPasteClick={() => setPasteSection('supportFromROLCC')}
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

          onPasteClick={() => setPasteSection('otherIncome')}
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

          onPasteClick={() => setPasteSection('rsm')}
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
