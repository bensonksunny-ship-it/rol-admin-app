import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'

// Rotating palette for the grid tiles — subpages aren't separate "apps" with their
// own brand color, so each tile's color comes from its position rather than a fixed
// per-subpage mapping. Keeps the grid visually varied like a real iOS folder.
// Bright, saturated gradients (not muted/pastel) so tiles pop against the
// glassmorphism sheet background, each paired with a matching-hue drop shadow.
const TILE_STYLES = [
  { gradient: 'from-blue-500 to-indigo-600', shadow: 'shadow-indigo-500/30' },
  { gradient: 'from-emerald-400 to-teal-500', shadow: 'shadow-emerald-500/30' },
  { gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30' },
  { gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/30' },
  { gradient: 'from-cyan-400 to-sky-600', shadow: 'shadow-cyan-500/30' },
  { gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/30' },
  { gradient: 'from-red-500 to-rose-600', shadow: 'shadow-red-500/30' },
  { gradient: 'from-teal-400 to-emerald-600', shadow: 'shadow-teal-500/30' },
  { gradient: 'from-orange-400 to-amber-600', shadow: 'shadow-orange-500/30' },
]

function TileGrid({ items, onTap }) {
  // Fixed-width tiles in a wrapping flex row (not a CSS grid) so every row — including
  // a partial last row — centers itself via justify-center instead of a lone leftover
  // tile sitting stuck on the grid's left edge. ~3 columns fit per row at this menu's
  // width; a short list of 1-2 tiles centers too.
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-5">
      {items.map((item, i) => {
        const Icon = item.Icon
        const style = TILE_STYLES[i % TILE_STYLES.length]
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onTap(item)}
            className="group flex flex-col items-center gap-1.5 basis-24 shrink-0"
          >
            <span
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-[transform,filter] duration-150 group-hover:-translate-y-0.5 group-hover:brightness-110 group-active:scale-95 bg-gradient-to-br ${style.gradient} shadow-md ${style.shadow}`}
            >
              {Icon && <Icon size={22} className="text-white" strokeWidth={1.75} />}
              {/* Nested-folder indicator — same dot BottomTabBar/DepartmentDock use to
                  mark a tile that opens another grid instead of navigating straight there. */}
              {item.children?.length > 0 && (
                <span
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white opacity-70"
                />
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

// One department's section within the unified menu — no card, no background panel,
// no border box around it; just an inline icon+text divider followed directly by its
// icon grid, flush with every other section in the same single flat container.
// Drilling into a tile that carries its own `children` (Operations →
// Expense/Team/Planning/...; Cell's Leader Entry → Shepherd Care/Mid-week; Finance →
// Expense/Budget/Payout) swaps this section's grid for that child grid plus a
// "← Back" row, scoped to just this department so other sections are unaffected.
function DepartmentSection({ dept, openChild, onOpenChild, onNavigate }) {
  const DeptIcon = dept.Icon
  const gridItems = openChild ? openChild.children : dept.subpages

  const handleTap = (item) => {
    if (item.children?.length > 0) onOpenChild(item)
    else onNavigate(item.to)
  }

  return (
    <div>
      <div className="flex items-center gap-2 pb-2.5 mb-3.5 border-b border-slate-300/60 dark:border-white/15">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6357c9 0%, #8b7ff0 100%)', boxShadow: '0 2px 8px rgba(99,87,201,0.4)' }}
        >
          <DeptIcon size={15} className="text-white" strokeWidth={2} />
        </span>
        <span className="text-sm font-extrabold uppercase tracking-wide text-slate-800 dark:text-slate-100">{dept.label}</span>
      </div>
      {openChild && (
        <button
          type="button"
          onClick={() => onOpenChild(null)}
          className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-lg border border-indigo-200/70 dark:border-indigo-400/25 bg-indigo-50/80 dark:bg-indigo-500/10 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 active:scale-95 mb-3 transition-all"
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
          Back to {dept.label}
        </button>
      )}
      <TileGrid items={gridItems} onTap={handleTap} />
    </div>
  )
}

// Unified, single flat "master menu" — one centered overlay, one container, no nested
// per-department cards/panels/borders inside it. Every accessible department is just
// an inline icon+text divider followed directly by its icon grid, all sharing the
// same flat surface — no collapse arrows, no subpage-count badges, no per-department
// box to open/close. This is the single destination the dock's one nameless launcher
// button opens (no more separate isolated popup per department either).
//
// `activeKey`/`activeChildKey` let the caller (DepartmentDock) pass in whichever
// department/nested category the user is currently viewing, so that department's
// section opens already drilled into that child grid (Operations, Leader Entry, ...)
// instead of its own top-level tiles.
//
// `dark:` classes here are real — the app wires Tailwind's dark variant to its own
// .dark toggle via @custom-variant in index.css, so this needs no isDay prop; the OS/
// in-app theme flips it automatically.
export default function DepartmentFolderModal({ departments, activeKey, activeChildKey, onClose, onNavigate }) {
  const [openChildByDept, setOpenChildByDept] = useState(() => {
    if (!activeKey || !activeChildKey) return {}
    const dept = departments.find((d) => d.key === activeKey)
    const child = dept?.subpages.find((sp) => sp.key === activeChildKey && sp.children?.length > 0)
    return child ? { [activeKey]: child } : {}
  })

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
        aria-label="Departments"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-sm p-5 rounded-3xl border border-white/40 dark:border-white/15
          bg-white/25 dark:bg-white/10 backdrop-blur-2xl shadow-2xl
          transition-all duration-200 ease-out ${
          shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <button
          type="button"
          onClick={requestClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/5 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto -mx-1 px-1 scrollbar-hide">
          {departments.map((dept) => (
            <DepartmentSection
              key={dept.key}
              dept={dept}
              openChild={openChildByDept[dept.key] || null}
              onOpenChild={(child) => setOpenChildByDept((prev) => ({ ...prev, [dept.key]: child }))}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
