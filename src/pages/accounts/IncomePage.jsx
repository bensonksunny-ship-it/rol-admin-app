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
} from '../../services/firestore'
import { categorizeEntries, OTHER_INCOME_CATEGORY_OPTIONS, RSM_CATEGORY_OPTIONS } from './income/incomeCategorize'
import IncomeSummaryTable from './income/IncomeSummaryTable'
import OfferingMatrixTable from './income/OfferingMatrixTable'
import CategoryListTable from './income/CategoryListTable'

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  category: INCOME_TYPES[0],
  amount: '',
  giverName: '',
  towards: '',
}

export default function IncomePage({ controlledMonth } = {}) {
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
  const [openMenuId, setOpenMenuId] = useState(null)
  const [loadError, setLoadError] = useState('')

  const canAccess = canAccessAccountsEntry(userProfile, hasPermission, isFounder)

  useEffect(() => {
    if (!canAccess) return
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

  function toggleSection(key) {
    setEditSections(prev => ({ ...prev, [key]: !prev[key] }))
    setOpenMenuId(null)
    setDeletingId(null)
  }

  function prevMonth() { setInternalMonth(m => subMonths(m, 1)) }
  function nextMonth() { setInternalMonth(m => addMonths(m, 1)) }

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
    } catch {
      setSaveError('Failed to delete. Please try again.')
      setTimeout(() => setSaveError(''), 4000)
    }
  }

  return (
    <div className="max-w-[210mm] mx-auto space-y-5 pb-12">

      {/* Month picker — hidden when month is controlled by parent */}
      {!controlledMonth && (
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
          editMode={!!editSections.titheEnglish}
          onToggleEdit={() => toggleSection('titheEnglish')}
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
          editMode={!!editSections.titheTamil}
          onToggleEdit={() => toggleSection('titheTamil')}
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
          editMode={!!editSections.contribution}
          onToggleEdit={() => toggleSection('contribution')}
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
          editMode={!!editSections.supportFromROLCC}
          onToggleEdit={() => toggleSection('supportFromROLCC')}
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
          editMode={!!editSections.otherIncome}
          onToggleEdit={() => toggleSection('otherIncome')}
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
          editMode={!!editSections.rsm}
          onToggleEdit={() => toggleSection('rsm')}
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
