import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// A single ⋮ button that opens an Edit/Delete dropdown, used for every saved-row
// actions cell across the Accounts "paste-friendly ledger" pages (ExpensePage,
// SavingsPage, …). Only one instance is ever "open" at a time (tracked by menuKey
// against the page-level openKey).
const ACTION_MENU_WIDTH = 140
const ACTION_MENU_HEIGHT = 92 // approx height of the two-item menu, used to flip it upward near the viewport bottom

// Renders its dropdown into document.body via a portal, positioned with `fixed`
// coordinates computed from the trigger button — this is what actually fixes
// clipping: a card's `overflow-hidden` and a table's horizontal-scroll wrapper
// (`overflow-x-auto`, which forces overflow-y to clip too, per the CSS spec) both
// clip any *descendant* absolutely-positioned popover regardless of z-index. A
// portaled element isn't a descendant of either, so it can't be clipped by them.
//
// The portaled dropdown carries `data-row-menu-overlay="true"`. Any page that also
// has its own click-outside-to-collapse handler on an expandable card MUST exempt
// elements matching `[data-row-menu-overlay]` in that handler (e.g.
// `if (event.target.closest?.('[data-row-menu-overlay]')) return`) — otherwise a
// click on Edit/Delete registers as "outside the card" (since the portal renders
// into document.body, not inside the card's DOM subtree) and the card collapses
// before the click can take effect. See ExpensePage.jsx's own click-outside
// handler for a working example.
export default function RowActionsMenu({ menuKey, openKey, onOpen, onClose, onEdit, onDelete }) {
  const isOpen = openKey === menuKey
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [coords, setCoords] = useState(null)

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const openUpward = rect.bottom + ACTION_MENU_HEIGHT > window.innerHeight
    setCoords({
      top: openUpward ? rect.top - ACTION_MENU_HEIGHT - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - ACTION_MENU_WIDTH, window.innerWidth - ACTION_MENU_WIDTH - 8)),
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(e) {
      if (buttonRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      onClose()
    }
    function handleReposition() { onClose() }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen, onClose])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? onClose() : onOpen(menuKey))}
        title="Actions"
        className="w-6 h-6 flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-base leading-none transition-colors"
      >
        ⋮
      </button>
      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          data-row-menu-overlay="true"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: ACTION_MENU_WIDTH }}
          className="z-[999] bg-white rounded-lg border border-slate-100 shadow-xl py-1"
        >
          <button
            type="button"
            onClick={() => { onClose(); onEdit(); }}
            className="w-full flex items-center gap-2 text-left py-2.5 px-4 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-base">✏️</span> Edit
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onDelete(); }}
            className="w-full flex items-center gap-2 text-left py-2.5 px-4 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <span className="text-base">🗑️</span> Delete
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
