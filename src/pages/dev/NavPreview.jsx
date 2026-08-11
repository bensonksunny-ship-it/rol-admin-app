import { useEffect, useMemo, useState, useRef } from 'react'
import { ChevronDown, MoreHorizontal, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDepartmentByName, getDepartmentPath, getDepartmentIcon } from '../../constants/departments'
import { getDepartmentSubpages, myDepartmentNames } from '../../utils/departmentSubpages'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'

// ─────────────────────────────────────────────────────────────────────────────
// THROWAWAY comparison prototype — not part of the real app, not linked from
// anywhere in the real nav. Built to let us evaluate two desktop nav patterns
// side by side, using the signed-in user's *real* accessible departments/tabs
// (same `myDepartmentNames` + `getDepartmentSubpages` helpers DepartmentDock
// already uses) instead of fake sample data. Clicking a department/tab here
// only updates local demo state — it never navigates — so both options stay
// interactive without leaving the page. Delete this file + its App.jsx route
// once the real design is picked.
// ─────────────────────────────────────────────────────────────────────────────

const OVERFLOW_AT = 7 // how many top-level links show before the rest collapse into "More"

function displayDeptName(name) {
  return name === 'Event M' ? 'Event Management' : name
}

function useTiles() {
  const { userProfile, isFounder } = useAuth()
  return useMemo(() => {
    const names = myDepartmentNames(userProfile, isFounder)
    return names.map((name) => {
      const dept = getDepartmentByName(name)
      return {
        key: name,
        label: displayDeptName(name),
        to: getDepartmentPath(name),
        Icon: getDepartmentIcon(name),
        subpages: dept ? getDepartmentSubpages(dept.slug, userProfile) : [],
      }
    })
  }, [userProfile, isFounder])
}

function useOutsideClick(onOutside) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onOutside() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

// ── Option A: persistent top navbar, subpages in a hover/click mega-menu ────

function TopNavbarMegaMenu({ tiles, activeKey, activeChildKey, onSelect }) {
  const [openKey, setOpenKey] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const menuRef = useOutsideClick(() => { setOpenKey(null); setMoreOpen(false) })

  const visible = tiles.slice(0, OVERFLOW_AT)
  const overflow = tiles.slice(OVERFLOW_AT)

  const DeptLink = ({ tile }) => {
    const isActive = tile.key === activeKey
    const isOpen = openKey === tile.key
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenKey((k) => (k === tile.key ? null : tile.key))}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            isActive
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tile.label}
          {tile.subpages.length > 0 && (
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {isOpen && tile.subpages.length > 0 && (
          <div className="absolute left-0 top-full mt-2 z-30 w-64 bg-white rounded-2xl border border-slate-200 shadow-xl p-2">
            {tile.subpages.map((sp) => {
              const SpIcon = sp.Icon
              const isSpActive = tile.key === activeKey && sp.key === activeChildKey
              return (
                <button
                  key={sp.key}
                  type="button"
                  onClick={() => { onSelect(tile.key, sp.key); setOpenKey(null) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors ${
                    isSpActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SpIcon size={15} className="text-slate-400 flex-shrink-0" />
                  {sp.label}
                  {sp.children?.length > 0 && <span className="ml-auto text-[10px] text-slate-300">▸</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={menuRef} className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-2">
        <img src={rolccLogo} alt="" className="w-7 h-7 rounded-lg object-contain flex-shrink-0 mr-2" />
        <span className="font-black text-sm text-slate-800 mr-4 flex-shrink-0">River Of Life</span>

        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {visible.map((tile) => <DeptLink key={tile.key} tile={tile} />)}

          {overflow.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <MoreHorizontal size={16} /> More
              </button>
              {moreOpen && (
                <div className="absolute left-0 top-full mt-2 z-30 w-56 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 max-h-80 overflow-y-auto">
                  {overflow.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      onClick={() => { onSelect(tile.key, tile.subpages[0]?.key || null); setMoreOpen(false) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors ${
                        tile.key === activeKey ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <tile.Icon size={15} className="text-slate-400 flex-shrink-0" />
                      {tile.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  )
}

// ── Option B: two persistent rows — departments on row 1, that department's
// subpages as a tab strip on row 2 (only rendered when it has subpages). ────

function TwoRowTabBar({ tiles, activeKey, activeChildKey, onSelect }) {
  const activeTile = tiles.find((t) => t.key === activeKey) || null

  return (
    <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-2">
        <img src={rolccLogo} alt="" className="w-7 h-7 rounded-lg object-contain flex-shrink-0 mr-2" />
        <span className="font-black text-sm text-slate-800 mr-4 flex-shrink-0">River Of Life</span>

        <nav className="flex items-center gap-4 overflow-x-auto scrollbar-hide h-full">
          {tiles.map((tile) => {
            const isActive = tile.key === activeKey
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => onSelect(tile.key, tile.subpages[0]?.key || null)}
                className={`relative h-full flex items-center px-1 text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tile.label}
                {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />}
              </button>
            )
          })}
        </nav>
      </div>

      {activeTile && activeTile.subpages.length > 0 && (
        <div className="max-w-6xl mx-auto px-6 h-10 flex items-center gap-4 overflow-x-auto scrollbar-hide bg-slate-50/70 border-t border-slate-100">
          {activeTile.subpages.map((sp) => {
            const isSpActive = sp.key === activeChildKey
            return (
              <button
                key={sp.key}
                type="button"
                onClick={() => onSelect(activeTile.key, sp.key)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isSpActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-200/70'
                }`}
              >
                {sp.label}
                {sp.children?.length > 0 && <span className="text-[9px] opacity-60">▸</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared "page content" placeholder below whichever navbar is active ──────

function ContentPlaceholder({ tiles, activeKey, activeChildKey }) {
  const activeTile = tiles.find((t) => t.key === activeKey)
  const activeChild = activeTile?.subpages.find((sp) => sp.key === activeChildKey)
  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Simulated page content</p>
        <p className="text-lg font-semibold text-slate-700">
          {activeTile ? displayDeptName(activeTile.key) : 'Pick a department above'}
          {activeChild ? ` — ${activeChild.label}` : ''}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Real content isn't wired up here — this box just reflects what's selected in the nav above.
        </p>
      </div>
    </div>
  )
}

export default function NavPreview() {
  const tiles = useTiles()
  const { isFounder } = useAuth()
  const [mode, setMode] = useState('A')
  // ProtectedRoute already withholds this page until userProfile has loaded, so
  // `tiles` is populated by the time this first runs — no effect needed to "catch up"
  // once data arrives.
  const [activeKey, setActiveKey] = useState(() => tiles[0]?.key ?? null)
  const [activeChildKey, setActiveChildKey] = useState(() => tiles[0]?.subpages[0]?.key ?? null)

  const handleSelect = (deptKey, childKey) => {
    setActiveKey(deptKey)
    setActiveChildKey(childKey)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Dev-only banner */}
      <div className="bg-amber-400 text-amber-950 text-xs font-bold text-center py-1.5 px-4">
        🚧 Nav pattern comparison prototype — not part of the live app, nothing here navigates
      </div>

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft size={15} /> Back to My Workspace
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {tiles.length} accessible department{tiles.length !== 1 ? 's' : ''}{isFounder ? ' (Founder — sees all)' : ''}
            </span>
            <div className="flex items-center rounded-full border border-slate-200 p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setMode('A')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  mode === 'A' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Option A — Mega-menu
              </button>
              <button
                type="button"
                onClick={() => setMode('B')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                  mode === 'B' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Option B — Two-row tabs
              </button>
            </div>
          </div>
        </div>
      </div>

      {tiles.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-16">No accessible departments found for this account.</p>
      ) : mode === 'A' ? (
        <>
          <TopNavbarMegaMenu tiles={tiles} activeKey={activeKey} activeChildKey={activeChildKey} onSelect={handleSelect} />
          <ContentPlaceholder tiles={tiles} activeKey={activeKey} activeChildKey={activeChildKey} />
        </>
      ) : (
        <>
          <TwoRowTabBar tiles={tiles} activeKey={activeKey} activeChildKey={activeChildKey} onSelect={handleSelect} />
          <ContentPlaceholder tiles={tiles} activeKey={activeKey} activeChildKey={activeChildKey} />
        </>
      )}
    </div>
  )
}
