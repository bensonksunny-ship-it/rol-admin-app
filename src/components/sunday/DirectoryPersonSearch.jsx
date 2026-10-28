import { useEffect, useRef, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { getMergedPeopleDirectory } from '../../services/firestore'

// The whole church directory — the same merged list as the People Directory page
// (people, cell members, PCS incl. inactive, ministry & worship teams, D-Light
// visitors, Sunday attendance), one entry per distinct name. Loaded once and shared
// by every search box; refreshed after 5 minutes so new names show up.
const TTL_MS = 5 * 60 * 1000
let cache = null // { at, promise }

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

function loadDirectory() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const promise = getMergedPeopleDirectory()
      .then(({ people }) => {
        const byName = new Map()
        for (const p of people || []) {
          const name = String(p.name || '').trim()
          const key = norm(name)
          if (!key || byName.has(key)) continue
          const detail = p.membershipStatus === 'member' || p.pcs?.membershipStatus === 'member' ? 'Member'
            : p.cells?.find((c) => c.status !== 'inactive')?.cellName || p.deptTeams?.[0]?.department || ''
          byName.set(key, {
            id: p._key || key,
            name,
            detail: String(detail || ''),
            key,
            aliases: (p.aliases || []).map(norm).filter(Boolean),
          })
        }
        return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
      })
    promise.catch(() => { cache = null })
    cache = { at: Date.now(), promise }
  }
  return cache.promise
}

// Letters of `q` appear in order in `s` ("swt" → "sweety").
function isSubsequence(q, s) {
  let i = 0
  for (const ch of s) if (ch === q[i] && ++i === q.length) return true
  return q.length === 0
}

/**
 * Rank of a directory entry for a query (lower is better), or -1 for no match.
 * Case- and accent-insensitive; every typed word must match somewhere.
 */
function rank(p, term, words) {
  const hay = [p.key, ...p.aliases]
  if (hay.some((h) => h.startsWith(term))) return 0 // "sw" → "Sweety Thomas"
  const tokens = hay.flatMap((h) => h.split(' '))
  if (words.every((w) => tokens.some((t) => t.startsWith(w)))) return 1 // "th sw" → "Sweety Thomas"
  if (words.every((w) => hay.some((h) => h.includes(w)))) return 2 // "eet" → "Sweety"
  const compact = term.replace(/ /g, '')
  if (compact.length >= 2 && hay.some((h) => isSubsequence(compact, h.replace(/ /g, '')))) return 3 // typo-ish / initials
  return -1
}

/**
 * Search the whole People Directory by name and pick someone for a programme item
 * (used when no department roster fills the item in). Every match is listed — the
 * list scrolls, nothing is cut off. A name that isn't in the directory (e.g. a guest
 * speaker) can still be added as typed.
 */
export default function DirectoryPersonSearch({ onPick, exclude = [], placeholder = 'Search people directory…', disabled = false, compact = false }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [people, setPeople] = useState(null) // null = not loaded yet
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function focus() {
    setOpen(true)
    if (people === null) {
      setError('')
      loadDirectory().then(setPeople).catch(() => { setPeople([]); setError('Could not load the People Directory.') })
    }
  }

  const taken = new Set(exclude.map(norm))
  const term = norm(q)
  const words = term.split(' ').filter(Boolean)
  const matches = term && people
    ? people
      .filter((p) => !taken.has(p.key))
      .map((p) => ({ p, r: rank(p, term, words) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
      .map((x) => x.p)
    : []
  const exact = matches.some((p) => p.key === term)
  const options = [...matches.map((p) => ({ ...p, kind: 'person' })), ...(term && !exact && !taken.has(term) ? [{ id: '__typed', name: q.trim(), kind: 'typed' }] : [])]

  function pick(o) {
    if (!o) return
    onPick(o.name)
    setQ(''); setActive(0); setOpen(false)
  }

  function move(delta) {
    setActive((i) => {
      const n = Math.max(0, Math.min(options.length - 1, i + delta))
      listRef.current?.querySelector(`[data-i="${n}"]`)?.scrollIntoView({ block: 'nearest' })
      return n
    })
  }

  return (
    <div ref={boxRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 ${compact ? 'h-7' : 'py-1.5'} focus-within:ring-2 focus-within:ring-indigo-200`}>
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input value={q} disabled={disabled} placeholder={placeholder} onFocus={focus}
          onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
            else if (e.key === 'Enter') { e.preventDefault(); pick(options[active]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          className="flex-1 min-w-0 bg-transparent outline-none text-xs sm:text-sm placeholder:text-slate-400 disabled:opacity-50" />
      </div>
      {open && term && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg min-w-[15rem]">
          {people !== null && !error && (
            <p className="px-3 py-1 text-[11px] text-slate-400 border-b border-slate-100">
              {matches.length} match{matches.length === 1 ? '' : 'es'} in the directory
            </p>
          )}
          <ul ref={listRef} className="max-h-72 overflow-y-auto py-1">
            {people === null && <li className="px-3 py-2 text-xs text-slate-400">Loading the whole directory…</li>}
            {error && <li className="px-3 py-2 text-xs text-red-600">{error}</li>}
            {options.map((o, i) => (
              <li key={o.id} data-i={i}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${i === active ? 'bg-indigo-50' : ''}`}>
                  {o.kind === 'typed'
                    ? <><UserPlus className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="text-slate-600">Add “{o.name}” <span className="text-[11px] text-slate-400">(not in directory)</span></span></>
                    : <><span className="font-medium text-slate-800 truncate">{o.name}</span>{o.detail && <span className="ml-auto text-[11px] text-slate-400 shrink-0 truncate max-w-[45%]">{o.detail}</span>}</>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
