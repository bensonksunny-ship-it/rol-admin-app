import { useState, useEffect, useRef } from 'react'

/**
 * A text input that lets the user type freely OR pick a name from
 * a pre-loaded list of people (e.g. all church members / users).
 *
 * Props:
 *   value      – controlled string value
 *   onChange   – called with the new string whenever it changes
 *   people     – array of { id, name } objects to search from
 *   placeholder
 *   label
 */
export default function PersonSearchInput({ value, onChange, people = [], placeholder = 'Search or type name', label }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // Keep query in sync when value is changed externally (e.g. form reset)
  useEffect(() => { setQuery(value || '') }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q.length > 0
    ? people.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 20)
    : []

  const handleInput = (val) => {
    setQuery(val)
    onChange(val)
    setOpen(true)
  }

  const handleSelect = (person) => {
    setQuery(person.name)
    onChange(person.name)
    setOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (query.trim()) setOpen(true) }}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        />
        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); onChange(''); setOpen(false) }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none"
          >×</button>
        )}
      </div>

      {/* Dropdown — inner list scrolls on its own (max-h-80) so the "keep typing"
          footer note stays pinned below it instead of scrolling away with a long
          match list. */}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border-b border-slate-100 dark:border-slate-700 last:border-0 flex items-center gap-2.5"
              >
                <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {(p.name || '?')[0].toUpperCase()}
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 px-3 py-1.5 border-t border-slate-100 dark:border-slate-700">
            Or keep typing to enter a custom name
          </p>
        </div>
      )}
    </div>
  )
}
