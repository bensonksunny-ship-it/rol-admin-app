import { useEffect } from 'react'

// Fires `handler` on the first mousedown/touchstart whose target lands outside
// `ref`'s node. `active` lets the caller skip attaching the listener entirely
// (e.g. while the thing being watched is already closed, or while a nested overlay
// that should own its own dismissal is open) rather than attaching it unconditionally
// and re-checking on every event.
export default function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return
    const handlePointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler(e)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [ref, handler, active])
}
