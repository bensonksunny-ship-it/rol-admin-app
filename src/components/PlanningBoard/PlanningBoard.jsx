import { useState, useCallback, useRef, useEffect } from 'react'
import { Rnd } from 'react-rnd'
import {
  getDepartmentPlanningNotes,
  addDepartmentPlanningNote,
  updateDepartmentPlanningNote,
  deleteDepartmentPlanningNote,
} from '../../services/firestore'

const NOTE_BG_COLORS = [
  { name: 'yellow', class: 'bg-amber-100', border: 'border-amber-300' },
  { name: 'blue', class: 'bg-blue-100', border: 'border-blue-300' },
  { name: 'green', class: 'bg-emerald-100', border: 'border-emerald-300' },
  { name: 'white', class: 'bg-white', border: 'border-slate-300' },
]

const TEXT_COLORS = [
  { name: 'black', value: '#1e293b' },
  { name: 'red', value: '#dc2626' },
  { name: 'blue', value: '#2563eb' },
  { name: 'green', value: '#059669' },
]

const DEFAULT_SIZE = { width: 220, height: 200 }

function NoteCard({ note, canEdit, onUpdate, onDelete }) {
  const [rotation, setRotation] = useState(note.rotation || 0)
  const [bgColor, setBgColor] = useState(note.color || 'yellow')
  const contentRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const lastContentRef = useRef(note.content || '')

  const bgStyle = NOTE_BG_COLORS.find((c) => c.name === bgColor) || NOTE_BG_COLORS[0]

  const saveContent = useCallback(
    (newContent) => {
      if (!canEdit || newContent === lastContentRef.current) return
      lastContentRef.current = newContent
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        onUpdate(note.id, { content: newContent })
        saveTimeoutRef.current = null
      }, 600)
    },
    [canEdit, note.id, onUpdate]
  )

  useEffect(() => {
    lastContentRef.current = note.content || ''
    setRotation(note.rotation || 0)
    setBgColor(note.color || 'yellow')
  }, [note.id, note.rotation, note.color])

  useEffect(() => {
    if (!contentRef.current) return
    if ((note.content || '') !== contentRef.current.innerHTML) {
      contentRef.current.innerHTML = note.content || ''
    }
  }, [note.id, note.content])

  const handleDragStop = (e, d) => {
    if (!canEdit) return
    onUpdate(note.id, { position: { x: d.x, y: d.y } })
  }

  const handleResizeStop = (e, direction, ref, delta, position) => {
    if (!canEdit) return
    const width = ref.offsetWidth
    const height = ref.offsetHeight
    onUpdate(note.id, { size: { width, height }, position: { x: position.x, y: position.y } })
  }

  const applyFormat = (command, value = null) => {
    document.execCommand(command, false, value)
    contentRef.current?.focus()
  }

  const handleInput = () => {
    if (!contentRef.current) return
    saveContent(contentRef.current.innerHTML)
  }

  return (
    <Rnd
      position={{ x: note.position?.x ?? 20, y: note.position?.y ?? 20 }}
      size={{ width: note.size?.width ?? DEFAULT_SIZE.width, height: note.size?.height ?? DEFAULT_SIZE.height }}
      minWidth={120}
      minHeight={100}
      maxWidth={500}
      maxHeight={400}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      disableDragging={!canEdit}
      enableResizing={canEdit}
      bounds="parent"
      className="!absolute z-10"
      style={{ zIndex: 10 }}
    >
      <div
        className={`${bgStyle.class} ${bgStyle.border} border-2 rounded-lg shadow-md overflow-hidden flex flex-col h-full`}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {/* Toolbar */}
        {canEdit && (
          <div className="flex items-center justify-between gap-1 px-2 py-1 border-b border-slate-300/50 bg-white/50">
            <div className="flex items-center gap-0.5 flex-wrap">
              <button
                type="button"
                onClick={() => applyFormat('bold')}
                className="p-1 rounded hover:bg-slate-200 text-sm font-bold"
                title="Bold"
              >
                B
              </button>
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => applyFormat('foreColor', c.value)}
                  className="w-4 h-4 rounded border border-slate-300"
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-slate-500">Bg</label>
              <select
                value={bgColor}
                onChange={(e) => {
                  const v = e.target.value
                  setBgColor(v)
                  onUpdate(note.id, { color: v })
                }}
                className="text-xs rounded border border-slate-300 py-0.5"
              >
                {NOTE_BG_COLORS.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              <label className="text-xs text-slate-500">°</label>
              <input
                type="range"
                min="-12"
                max="12"
                value={rotation}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setRotation(v)
                  onUpdate(note.id, { rotation: v })
                }}
                className="w-12 h-1"
              />
            </div>
            <button
              type="button"
              onClick={() => onDelete(note.id)}
              className="p-1 rounded hover:bg-red-100 text-red-600 text-xs"
              title="Delete note"
            >
              ✕
            </button>
          </div>
        )}
        {/* Content */}
        <div className="flex-1 p-2 overflow-auto min-h-0">
          {canEdit ? (
            <div
              ref={contentRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              className="outline-none text-sm text-slate-800 min-h-[60px] prose prose-sm max-w-none"
              style={{ wordBreak: 'break-word' }}
            />
          ) : (
            <div
              className="text-sm text-slate-800 min-h-[60px] prose prose-sm max-w-none"
              style={{ wordBreak: 'break-word' }}
              dangerouslySetInnerHTML={{ __html: note.content || '' }}
            />
          )}
        </div>
      </div>
    </Rnd>
  )
}

export default function PlanningBoard({ department, canEdit }) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const loadNotes = useCallback(() => {
    if (!department) return
    setLoading(true)
    getDepartmentPlanningNotes(department)
      .then(setNotes)
      .finally(() => setLoading(false))
  }, [department])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleAddNote = async () => {
    if (!canEdit || !department) return
    setAdding(true)
    try {
      const id = await addDepartmentPlanningNote(department, {
        content: '',
        position: { x: 40 + notes.length * 30, y: 40 + notes.length * 25 },
        size: DEFAULT_SIZE,
        rotation: 0,
        color: 'yellow',
      })
      setNotes((prev) => [
        ...prev,
        {
          id,
          noteId: id,
          department,
          content: '',
          position: { x: 40 + prev.length * 30, y: 40 + prev.length * 25 },
          size: DEFAULT_SIZE,
          rotation: 0,
          color: 'yellow',
        },
      ])
    } catch (e) {
      console.error(e)
      alert('Failed to add note')
    }
    setAdding(false)
  }

  const handleUpdate = async (id, data) => {
    if (!canEdit) return
    try {
      await updateDepartmentPlanningNote(id, data)
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...data } : n)))
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async (id) => {
    if (!canEdit || !window.confirm('Delete this note?')) return
    try {
      await deleteDepartmentPlanningNote(id)
      setNotes((prev) => prev.filter((n) => n.id !== id))
    } catch (e) {
      console.error(e)
      alert('Failed to delete note')
    }
  }

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAddNote}
            disabled={adding}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add Note'}
          </button>
        </div>
      )}
      <div
        className="relative rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 min-h-[520px] w-full overflow-hidden"
        style={{ minHeight: 'min(720px, 70vh)' }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500">Loading board…</div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={canEdit}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
