import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  subscribeWorklistSheets,
  createWorklistSheet,
  updateWorklistCell,
  clearWorklistRow,
  deleteWorklistSheet,
} from '../services/firestore'

const BLOCK_STYLES = {
  green: {
    border: 'border-emerald-400',
    header: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  yellow: {
    border: 'border-amber-400',
    header: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  },
  red: {
    border: 'border-rose-500',
    header: 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300',
  },
  blue: {
    border: 'border-blue-400',
    header: 'bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300',
  },
}

function EditableCell({ value, type, onCommit, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => { setDraft(value || '') }, [value])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full h-full min-h-[28px] text-left px-1.5 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded truncate"
        title={value || placeholder}
      >
        {value || <span className="text-slate-300 dark:text-slate-600">{placeholder}</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== (value || '')) onCommit(draft) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) }
      }}
      className="w-full h-full min-h-[28px] px-1.5 py-1 text-xs rounded border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
    />
  )
}

function WorklistBlock({ sheetId, block, blockIndex }) {
  const style = BLOCK_STYLES[block.color] || BLOCK_STYLES.blue

  return (
    <div className={`rounded-xl border-2 ${style.border} overflow-hidden bg-white dark:bg-slate-900`}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className={style.header}>
            <th className="w-8 px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-[10px]">No</th>
            <th className="w-24 px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-[10px]">Date</th>
            <th className="px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-[10px]">Work</th>
            <th className="w-24 px-1.5 py-1.5 text-left font-bold uppercase tracking-wide text-[10px]">RMRK</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={row.no} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-1.5 py-1 text-slate-400 dark:text-slate-500 font-mono">{row.no}</td>
              <td>
                <EditableCell
                  type="date"
                  value={row.date}
                  placeholder="—"
                  onCommit={(v) => updateWorklistCell(sheetId, blockIndex, rowIndex, 'date', v)}
                />
              </td>
              <td>
                <EditableCell
                  type="text"
                  value={row.work}
                  placeholder="Add task…"
                  onCommit={(v) => updateWorklistCell(sheetId, blockIndex, rowIndex, 'work', v)}
                />
              </td>
              <td>
                <EditableCell
                  type="date"
                  value={row.doneDate}
                  placeholder="—"
                  onCommit={(v) => updateWorklistCell(sheetId, blockIndex, rowIndex, 'doneDate', v)}
                />
              </td>
              <td className="px-1 text-center">
                {(row.date || row.work || row.doneDate) && (
                  <button
                    type="button"
                    title="Clear row"
                    onClick={() => clearWorklistRow(sheetId, blockIndex, rowIndex)}
                    className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400"
                  >
                    <X size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SheetTab({ sheet, active, onSelect, onDelete }) {
  const [armed, setArmed] = useState(false)

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold cursor-pointer transition-colors ${
        active
          ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-md'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
      onClick={onSelect}
    >
      {sheet.label}
      <button
        type="button"
        title={armed ? 'Click again to delete' : 'Delete sheet'}
        onClick={(e) => {
          e.stopPropagation()
          if (armed) { onDelete(); setArmed(false) }
          else { setArmed(true); setTimeout(() => setArmed(false), 3000) }
        }}
        className={`rounded-full p-0.5 ${
          armed ? 'bg-rose-500 text-white' : active ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-rose-500'
        }`}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export default function WorklistSheet() {
  const { isFounder } = useAuth()
  const [sheets, setSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)

  useEffect(() => {
    if (!isFounder) return
    const unsub = subscribeWorklistSheets((list) => {
      setSheets(list)
      setLoading(false)
      setActiveId((prev) => (prev && list.some((s) => s.id === prev)) ? prev : (list[0]?.id || null))
    })
    return unsub
  }, [isFounder])

  if (!isFounder) {
    return (
      <div className="p-6 text-slate-600">
        <p className="font-semibold text-slate-800 mb-2">Worklist Sheet</p>
        <p>Only Founder can access this page.</p>
      </div>
    )
  }

  const activeSheet = sheets.find((s) => s.id === activeId) || null

  const handleAddSheet = async () => {
    const nextOrder = (sheets.reduce((max, s) => Math.max(max, s.order || 0), 0)) + 1
    const id = await createWorklistSheet(nextOrder, `Sheet ${nextOrder}`)
    setActiveId(id)
  }

  const handleDeleteSheet = (sheetId) => {
    deleteWorklistSheet(sheetId)
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Worklist Sheet</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Personal task tracker</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {sheets.map((sheet) => (
              <SheetTab
                key={sheet.id}
                sheet={sheet}
                active={sheet.id === activeId}
                onSelect={() => setActiveId(sheet.id)}
                onDelete={() => handleDeleteSheet(sheet.id)}
              />
            ))}
            <button
              type="button"
              onClick={handleAddSheet}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <Plus size={14} /> Add Sheet
            </button>
          </div>

          {activeSheet ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeSheet.blocks.map((block, blockIndex) => (
                <WorklistBlock
                  key={block.color}
                  sheetId={activeSheet.id}
                  block={block}
                  blockIndex={blockIndex}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500 mb-3">No sheets yet.</p>
              <button
                type="button"
                onClick={handleAddSheet}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-blue-500 shadow-md hover:shadow-lg"
              >
                <Plus size={16} /> Create your first sheet
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
