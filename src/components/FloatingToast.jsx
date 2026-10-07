/** Transient bottom-center toast; state comes from hooks/useFloatingToast.js. */
export default function FloatingToast({ toast }) {
  if (!toast) return null
  const tone = toast.tone === 'error'
    ? 'bg-red-600 text-white'
    : toast.tone === 'info' ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white'
  return (
    <div
      key={toast.key}
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-[200] max-w-[calc(100vw-32px)] px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold ${tone}`}
    >
      {toast.msg}
    </div>
  )
}
