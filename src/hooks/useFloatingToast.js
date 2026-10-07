import { useCallback, useEffect, useRef, useState } from 'react'

/** Small transient toast state — `const [toast, showToast] = useFloatingToast()`
 *  then render `<FloatingToast toast={toast} />` (components/FloatingToast.jsx). */
export default function useFloatingToast(durationMs = 3500) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const showToast = useCallback((msg, tone = 'success') => {
    clearTimeout(timer.current)
    setToast({ msg, tone, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), durationMs)
  }, [durationMs])
  useEffect(() => () => clearTimeout(timer.current), [])
  return [toast, showToast]
}
