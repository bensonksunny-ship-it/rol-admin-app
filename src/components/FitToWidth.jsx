import { useEffect, useRef, useState } from 'react'

/**
 * Shows a fixed-width document sheet (e.g. a 210mm A4 page) scaled down to fit the
 * available width, so it never runs off the right edge of a phone screen. The
 * sheet keeps its real size — only its rendering is scaled — so set `active` to
 * false while capturing it for a PDF (html2canvas measures the on-screen box).
 */
export default function FitToWidth({ active = true, children, className = '' }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(null)

  const measure = () => {
    const outer = outerRef.current, inner = innerRef.current
    if (!outer || !inner) return
    const natural = inner.scrollWidth
    const cs = getComputedStyle(outer)
    const available = outer.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
    const s = active && natural > 0 && available > 0 ? Math.min(1, available / natural) : 1
    setScale(s)
    setHeight(s < 1 ? inner.scrollHeight * s : null)
  }

  // ResizeObserver fires once on observe and again whenever either box changes
  // size (screen rotation, content growing), so it covers the initial measure too.
  useEffect(() => {
    const ro = new ResizeObserver(() => measure())
    if (outerRef.current) ro.observe(outerRef.current)
    if (innerRef.current) ro.observe(innerRef.current)
    return () => ro.disconnect()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={outerRef} className={`fit-to-width w-full overflow-hidden ${className}`} style={height != null ? { height } : undefined}>
      <div
        ref={innerRef}
        className="fit-to-width-inner"
        style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left', width: 'max-content' } : { width: 'max-content', margin: '0 auto' }}
      >
        {children}
      </div>
    </div>
  )
}
