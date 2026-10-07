import { useEffect, useRef, useState } from 'react'

// Finger/mouse signature canvas. Calls onChange(dataUrl) after each stroke and
// onChange('') on Clear. Drawn at 2× for a crisp PNG; pointer events cover touch.
export default function SignaturePad({ onChange, height = 140 }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    c.width = rect.width * 2
    c.height = rect.height * 2
    const ctx = c.getContext('2d')
    ctx.scale(2, 2)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [])

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const start = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    const p = point(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    setEmpty(false)
    onChange?.(canvasRef.current.toDataURL('image/png'))
  }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setEmpty(true)
    onChange?.('')
  }

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none rounded-xl cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {empty && <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">Sign here</span>}
      </div>
      <button type="button" onClick={clear} className="mt-1 text-xs font-semibold text-slate-500 hover:text-slate-700">Clear signature</button>
    </div>
  )
}
