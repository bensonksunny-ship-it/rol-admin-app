import { useEffect, useRef, useState } from 'react'

// Cell components for the Income tab grids (OfferingMatrixTable,
// CategoryListTable): an always-editable cell that saves when you leave it.
// Keyboard movement and multi-cell paste live in gridUtils.js.

export const gridInputClass =
  'block w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-300 ' +
  'focus:bg-white focus:ring-2 focus:ring-inset focus:ring-indigo-500 read-only:text-slate-600 disabled:text-slate-300'

// One editable cell. Holds its own text while focused and commits on blur — so
// Tab, Enter, the arrow keys and clicking away all save the edit. `display` is
// how the saved value reads when the cell isn't focused (e.g. "1,200" for 1200).
// onCommit(text) returns false to reject the edit, snapping the cell back.
// data-r / data-c place the cell for handleGridKeyDown and grid paste.
export function GridCell({
  r, c, value, display, onCommit, onLiveChange, align = 'left', placeholder,
  readOnly = false, disabled = false, inputMode, ariaLabel, className = '', padClass = 'px-2 py-1.5',
}) {
  const ref = useRef(null)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value)
  const prevValue = useRef(value)

  // Follow the saved value (a commit, a paste, Ctrl+Z) unless mid-edit here.
  useEffect(() => {
    setText(t => (t === prevValue.current ? value : t))
    prevValue.current = value
  }, [value])

  // Select the whole cell on entry, so typing replaces it (as in Excel). Runs
  // after the focused render swaps the formatted text for the raw value.
  useEffect(() => {
    if (focused && ref.current && document.activeElement === ref.current) ref.current.select()
  }, [focused])

  const dirty = focused && text !== value

  return (
    <input
      ref={ref}
      type="text"
      data-r={r}
      data-c={c}
      data-dirty={dirty ? 'true' : undefined}
      inputMode={inputMode}
      aria-label={ariaLabel}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      value={focused ? text : (display ?? value)}
      onFocus={() => { setText(value); setFocused(true) }}
      onChange={e => { setText(e.target.value); onLiveChange?.(e.target.value) }}
      onBlur={() => {
        setFocused(false)
        onLiveChange?.(null)
        if (readOnly || text === value) return
        if (onCommit(text) === false) setText(value)
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          setText(value)
          onLiveChange?.(null)
          requestAnimationFrame(() => ref.current?.select())
        }
      }}
      className={`${gridInputClass} ${padClass} ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
    />
  )
}

// Same keyboard contract for a <select> cell (multi-category sections).
export function GridSelect({ r, c, value, options, onCommit, disabled = false, ariaLabel, padClass = 'px-2 py-1.5' }) {
  const opts = !value || options.includes(value) ? options : [value, ...options]
  return (
    <select
      data-r={r}
      data-c={c}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={e => onCommit(e.target.value)}
      className={`${gridInputClass} ${padClass} cursor-pointer`}
    >
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// Header status for a section: "Saving…" while its writes are in flight,
// then a short-lived "Saved".
export function SaveStatus({ state }) {
  if (state === 'saving') return <span className="text-[11px] font-medium text-slate-400">Saving…</span>
  if (state === 'saved') return <span className="text-[11px] font-medium text-emerald-600">Saved</span>
  return null
}
