import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Floating hover label for a slim icon rail. Portaled to <body> and positioned via
// getBoundingClientRect (same pattern as NotifPanel/MessagesPanel) so it's never
// clipped by the rail's own scrollable/fixed-width container.
export default function RailTooltip({ label, children }) {
  const [pos, setPos] = useState(null)
  const wrapRef = useRef(null)

  const show = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 })
  }
  const hide = () => setPos(null)

  return (
    <div
      ref={wrapRef}
      className="relative flex-shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && label && createPortal(
        <span
          className="fixed z-[200] -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 shadow-lg pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          {label}
        </span>,
        document.body
      )}
    </div>
  )
}
