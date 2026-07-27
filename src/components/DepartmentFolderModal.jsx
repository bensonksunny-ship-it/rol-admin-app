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
              className="relative w-14 h-14 rounded-2xl flex items-center justify-center transition-[transform,filter] duration-150 group-hover:-translate-y-0.5 group-hover:brightness-110 group-active:scale-95"
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
            <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 text-center leading-tight line-clamp-2">
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Centered "iOS App Folder" modal — a true centered card over the page, styled after
// Apple's Liquid Glass: highly translucent, thin glass border with an inner highlight,
// and a soft (not opaque) backdrop tint, rather than the earlier heavy frosted-white
// fill that fully masked whatever was behind it. Used by DepartmentDock (the single
// nav dock at every screen size, mobile included) so there's one folder look across
// the app regardless of screen size.
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
// `dark:` classes here are real — the app wires Tailwind's dark variant to its own
// .dark toggle via @custom-variant in index.css, so this needs no isDay prop; the OS/
// in-app theme flips it automatically.
export default function DepartmentFolderModal({ label, subpages, initialChildKey, onClose, onNavigate }) {
  const [openChild, setOpenChild] = useState(
    () => subpages.find((sp) => sp.key === initialChildKey && sp.children?.length > 0) || null
  )

  // Drives the enter/exit transition: false → true right after mount (so the CSS
  // transition actually has a starting frame to animate from), then false again on
  // close, with the real onClose deferred until that closing transition finishes —
  // otherwise the whole thing would just vanish on backdrop-click/Escape.
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const requestClose = () => {
    setClosing(true)
    setTimeout(onClose, 180)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTap = (item) => {
    if (item.children?.length > 0) setOpenChild(item)
    else onNavigate(item.to)
  }

  const gridLabel = openChild ? openChild.label : label
  const gridItems = openChild ? openChild.children : subpages
  const shown = visible && !closing

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/10 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={gridLabel}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm p-6 rounded-3xl border border-white/60 dark:border-white/10
          bg-white/40 dark:bg-slate-900/40 backdrop-blur-md
          shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.5)]
          dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]
          transition-all duration-200 ease-out ${
          shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="flex flex-col pt-2 pb-3 px-2 mb-2">
          {openChild && (
            <button
              type="button"
              onClick={() => setOpenChild(null)}
              className="inline-flex items-center gap-0.5 self-start text-xs font-medium text-indigo-500 dark:text-indigo-300 hover:underline mb-1 cursor-pointer transition-colors"
            >
              <ChevronLeft size={12} strokeWidth={2.5} />
              Back to Department
            </button>
          )}
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">
            {gridLabel}
          </h2>
        </div>

        <TileGrid items={gridItems} onTap={handleTap} />
      </div>
    </div>,
    document.body
  )
}
