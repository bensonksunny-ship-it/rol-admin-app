import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'

// Rotating palette for the grid tiles — subpages aren't separate "apps" with their
// own brand color, so each tile's color comes from its position rather than a fixed
// per-subpage mapping. Keeps the grid visually varied like a real iOS folder.
const TILE_COLORS = [
  'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
  'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
]

function TileGrid({ items, onTap }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5">
      {items.map((item, i) => {
        const Icon = item.Icon
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onTap(item)}
            className="group flex flex-col items-center gap-1.5"
          >
            <span
              className="relative w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-150 group-hover:-translate-y-0.5 group-active:scale-95"
              style={{
                background: TILE_COLORS[i % TILE_COLORS.length],
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              }}
            >
              {Icon && <Icon size={22} className="text-white" strokeWidth={1.75} />}
              {/* Nested-folder indicator — same dot BottomTabBar/DepartmentDock use to
                  mark a tile that opens another grid instead of navigating straight there. */}
              {item.children?.length > 0 && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white opacity-70" />
              )}
            </span>
            <span className="text-[11px] font-medium text-slate-700 text-center leading-tight line-clamp-2">
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Centered "iOS App Folder" modal — replaces a small anchored popover/bottom-sheet
// with a true centered, frosted-glass folder matching Apple's Home Screen folder UI.
// Used by DepartmentDock (the single nav dock at every screen size, mobile included)
// so there's one folder look across the app regardless of screen size.
//
// Two levels deep: the top-level grid is this department's tabs (Hub, Cell Groups,
// Reports, Leader Entry, Operations, ...); tapping a tile whose subpage carries its own
// `children` (Operations → Expense/Team/Planning/...; Cell's Leader Entry → Shepherd
// Care/Mid-week) drills into that tile's own grid instead of navigating away, with a
// "← Back to Department" control to return. `initialChildKey` lets the caller open the
// modal already drilled into whichever category the user is currently viewing, so
// tapping the dock icon while on e.g. Operations → Team shows Operations' grid
// immediately rather than the top-level department grid.
//
// Light-styled only (no dark-mode variant): the dock this replaces never threaded the
// app's day/night toggle either, and Tailwind's `dark:` variant isn't wired to that
// toggle (it's class-based via a manual .dark selector, not the default media-query
// strategy) — real dark mode here would need theme state lifted to a shared context,
// which is separate plumbing beyond this component's scope.
export default function DepartmentFolderModal({ label, subpages, initialChildKey, onClose, onNavigate }) {
  const [openChild, setOpenChild] = useState(
    () => subpages.find((sp) => sp.key === initialChildKey && sp.children?.length > 0) || null
  )

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleTap = (item) => {
    if (item.children?.length > 0) setOpenChild(item)
    else onNavigate(item.to)
  }

  const gridLabel = openChild ? openChild.label : label
  const gridItems = openChild ? openChild.children : subpages

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={gridLabel}
        onClick={(e) => e.stopPropagation()}
        className="animate-folder-zoom-in rounded-3xl w-full max-w-sm p-6"
        style={{
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div className="relative mb-5">
          {openChild && (
            <button
              type="button"
              onClick={() => setOpenChild(null)}
              className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors -ml-1 pl-1 pr-2 py-1 rounded-full hover:bg-indigo-50"
            >
              <ChevronLeft size={14} strokeWidth={2.5} />
              Back to Department
            </button>
          )}
          <h2 className={`text-center text-lg font-bold text-slate-900 truncate ${openChild ? 'px-24' : ''}`}>
            {gridLabel}
          </h2>
        </div>

        <TileGrid items={gridItems} onTap={handleTap} />
      </div>
    </div>,
    document.body
  )
}
