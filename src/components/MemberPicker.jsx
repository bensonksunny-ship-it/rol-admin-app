import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

// Two-letter initials for the avatar circle (first + last name, or the first two
// letters when there's only one word).
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ name, tint, className }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ${tint} ${className}`}>
      {initialsOf(name)}
    </span>
  )
}

/**
 * Rich replacement for a native <select> when assigning a person to a role.
 * The trigger and every option carry an avatar, a name, and an optional secondary
 * detail line; the panel is portalled to <body> with fixed positioning so an
 * ancestor's `overflow` can't clip it. The empty state gets a dashed coral
 * treatment so an unfilled slot reads as deliberately open, not broken.
 *
 * Extracted from DepartmentWorship.jsx so the Media Assign tab can share it.
 * Worship-specific bits (role-family hue, "Worship Director" detail line, the
 * Director badge) are now props: `tint`, `getDetail`, `getBadges`.
 *
 * `members` is the role-scoped candidate list (only volunteers tagged for this
 * slot). Pass `allMembers` too and the panel gets a "+ Show all department
 * members" toggle for the odd case where someone not pre-assigned to the role
 * needs to cover it. If the current selection isn't in `members` the panel opens
 * showing the full list so the assigned name still resolves.
 *
 * @param {string} value - selected member id
 * @param {Array<{id, name}>} members - role-scoped candidates
 * @param {(id: string, name: string) => void} onChange
 * @param {Array<{id, name}>} [allMembers] - full fallback list for the "show all" toggle
 * @param {string} [showAllLabel]
 * @param {string} [showScopedLabel]
 * @param {string} [tint] - avatar background utility class
 * @param {(m) => string} [getDetail] - secondary line under the name
 * @param {(m) => Array<{label, className}>} [getBadges] - pills after the name
 * @param {string} [emptyLabel]
 */
export default function MemberPicker({
  value,
  members,
  onChange,
  allMembers,
  showAllLabel = '+ Show all department members',
  showScopedLabel = 'Show only members assigned to this role',
  tint = 'bg-slate-400',
  getDetail = () => '',
  getBadges = () => [],
  emptyLabel = 'Not assigned',
}) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  const fullList = Array.isArray(allMembers) && allMembers.length ? allMembers : members
  const hasFallback = Array.isArray(allMembers) && allMembers.length > members.length
  // The assigned person might not be tagged for this role — resolve the trigger
  // label against the full list, and force the panel to the full list so the
  // selected row is visible and can be changed.
  const selected = fullList.find((m) => m.id === value)
  const selectedOutOfScope = !!value && !members.some((m) => m.id === value) && fullList.some((m) => m.id === value)
  const list = showAll || selectedOutOfScope ? fullList : members

  useEffect(() => {
    if (!open) return

    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setCoords({ left: r.left, top: r.bottom + 6, width: r.width })
    }
    place()

    // Page scroll shifts the anchor button, so the fixed panel has to be
    // re-anchored — NOT closed. Scrolling inside the panel's own options list is
    // ignored (its onScroll/onWheel also stopPropagation).
    const onScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return
      place()
    }
    const onPointerDown = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
      setShowAll(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setShowAll(false) } }

    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
    }
  }, [open])

  const pick = (m) => {
    onChange(m?.id || '', m?.name || '')
    setOpen(false)
    setShowAll(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (open) setShowAll(false); setOpen((v) => !v) }}
        className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left transition-colors ${
          selected
            ? 'border border-slate-300 bg-white hover:border-indigo-400'
            : 'border border-dashed border-rose-300 bg-rose-50/60 hover:bg-rose-50'
        }`}
      >
        {selected ? (
          <>
            <Avatar name={selected.name} tint={tint} className="w-7 h-7 text-[10px]" />
            <span className="flex-1 min-w-0 truncate font-semibold text-slate-800">{selected.name}</span>
          </>
        ) : (
          <>
            <span className="inline-flex w-7 h-7 items-center justify-center rounded-full border border-dashed border-rose-300 text-rose-400 shrink-0 text-xs">—</span>
            <span className="flex-1 font-semibold text-rose-500">{emptyLabel}</span>
          </>
        )}
        <ChevronDown size={15} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${selected ? 'text-slate-400' : 'text-rose-400'}`} />
      </button>

      {open && coords && createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="fixed z-[61] max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ left: coords.left, top: coords.top, width: Math.max(coords.width, 250) }}
            onWheel={(e) => e.stopPropagation()}
            onScroll={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-colors hover:bg-rose-50 ${!value ? 'bg-rose-50 ring-1 ring-inset ring-rose-200' : ''}`}
            >
              <span className="inline-flex w-8 h-8 items-center justify-center rounded-full border border-dashed border-rose-300 text-rose-400 shrink-0">—</span>
              <span className="flex-1 font-semibold text-rose-500">{emptyLabel}</span>
              {!value && <CheckCircle2 size={15} className="shrink-0 text-rose-400" />}
            </button>

            {list.map((m) => {
              const detail = getDetail(m)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pick(m)}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-colors hover:bg-indigo-50 ${value === m.id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''}`}
                >
                  <Avatar name={m.name} tint={tint} className="w-8 h-8 text-[11px]" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-slate-800 truncate">{m.name}</span>
                    {detail && <span className="block text-xs text-slate-500 truncate">{detail}</span>}
                  </span>
                  {getBadges(m).map((b, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset shrink-0 ${b.className}`}
                    >
                      {b.label}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                  {value === m.id && <CheckCircle2 size={15} className="shrink-0 text-indigo-500" />}
                </button>
              )
            })}

            {list.length === 0 && (
              <p className="px-3 py-3 text-xs text-slate-400">
                {hasFallback ? 'No members are assigned to this role yet.' : 'No eligible members.'}
              </p>
            )}

            {hasFallback && !selectedOutOfScope && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1 w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                {showAll ? showScopedLabel : showAllLabel}
              </button>
            )}
          </div>,
        document.body
      )}
    </>
  )
}
