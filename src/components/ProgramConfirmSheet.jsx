import { useEffect } from 'react'

/**
 * Bottom sheet that shows the program/segment list before the first timer tap.
 * Props:
 *   items        – array of { name, detail? }
 *   onConfirm    – called when leader taps "Confirm & Begin"
 *   onEdit       – called when leader taps "Edit Program"
 *   title        – sheet heading (default "Today's Program")
 */
export default function ProgramConfirmSheet({ items = [], onConfirm, onEdit, title = "Today's Program" }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const hasItems = items.length > 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}
      onClick={onEdit}
    >
      <div
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', padding: '24px 20px 28px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top line accent */}
        <div style={{ width: 40, height: 4, background: '#6366f1', borderRadius: 4, marginBottom: 20 }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, marginTop: 4 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <h2 style={{ fontWeight: 700, fontSize: 17, color: '#0f172a', margin: 0, flex: 1 }}>{title}</h2>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', background: '#eef2ff', padding: '3px 10px', borderRadius: 20 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {hasItems ? (
          <>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
              Confirm this is today's program before the timer begins. Once started, timing is recorded against this order.
            </p>

            <ol style={{ listStyle: 'none', margin: '0 0 22px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((item, i) => (
                <li
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14, flex: 1 }}>{item.name}</span>
                  {item.detail && (
                    <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 8 }}>{item.detail}</span>
                  )}
                </li>
              ))}
            </ol>

            <button
              onClick={onConfirm}
              style={{ width: '100%', padding: 15, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10, letterSpacing: '0.01em' }}
            >
              ✓ Confirm &amp; Begin
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '28px 16px 24px', marginBottom: 16 }}>
            <span style={{ fontSize: 36 }}>⚠️</span>
            <p style={{ fontWeight: 700, color: '#b45309', marginTop: 10, marginBottom: 6, fontSize: 15 }}>No program set for today</p>
            <p style={{ fontSize: 13, color: '#78716c', lineHeight: 1.5 }}>
              Set up the program before starting the timer so timings are recorded accurately.
            </p>
          </div>
        )}

        <button
          onClick={onEdit}
          style={{ width: '100%', padding: 13, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          {hasItems ? '✏️ Edit Program First' : '➕ Set Up Program'}
        </button>
      </div>
    </div>
  )
}
