/** yyyy-MM-dd → DD/MM/YYYY ('' when not a full date). */
const toDMY = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
// Classes that size/space/colour the text, copied onto the visible DD/MM/YYYY overlay.
const TEXT_CLASS = /^(?:[a-z]+:)?(?:p[xylrtb]?-|text-|font-|leading-|tracking-)/

/**
 * Drop-in for <input type="date">: the browser's own date box shows MM/DD/YYYY or
 * DD/MM/YYYY depending on the device language, so the value is shown here as
 * DD/MM/YYYY over a native input whose own text is transparent. Clicking opens the
 * native calendar; value / onChange stay yyyy-MM-dd exactly like the native input.
 * Any other `type` renders a plain <input>, so dynamic-type form fields can use it.
 */
export default function DateInput({ type = 'date', className = '', style, ...props }) {
  if (type !== 'date') return <input type={type} className={className} style={style} {...props} />

  const { value, defaultValue, placeholder, disabled, onClick } = props
  const shown = toDMY(value ?? defaultValue)
  const overlayClass = String(className).split(/\s+/).filter((c) => TEXT_CLASS.test(c)).join(' ')
  const hasColor = /(^|\s)text-(?!xs|sm|base|lg|xl|\d|\[|left|center|right)/.test(overlayClass)
  const has = (c) => new RegExp(`(^|\\s)${c}(\\s|$)`).test(className)
  // The wrapper takes the input's place in the layout, so it carries its width rule.
  const wrap = has('flex-1') ? 'block flex-1 min-w-0' : has('grow') ? 'block grow min-w-0' : has('w-full') ? 'block w-full' : 'inline-block'

  return (
    <span className={`relative ${wrap}`}>
      <input
        type="date"
        {...props}
        className={className}
        style={{ ...style, color: 'transparent' }}
        onClick={(e) => { try { e.currentTarget.showPicker?.() } catch { /* picker not allowed here */ } onClick?.(e) }}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 right-8 flex items-center overflow-hidden whitespace-nowrap border border-transparent ${hasColor ? '' : 'text-slate-800'} ${overlayClass} ${!shown || disabled ? 'opacity-50' : ''}`}
      >
        {shown || placeholder || 'DD/MM/YYYY'}
      </span>
    </span>
  )
}
