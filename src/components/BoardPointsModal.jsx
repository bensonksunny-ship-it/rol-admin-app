import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { addBoardPoint, getBoardPoints } from '../services/firestore'

function getNextSundayISO() {
  const now = new Date()
  const day = now.getDay()
  const daysTo = day === 0 ? 0 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  return d.toISOString().slice(0, 10)
}

function fmtSundayLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BoardPointsModal({ department, userEmail, onClose }) {
  const [points, setPoints]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [point, setPoint]           = useState('')
  const [timeNeeded, setTimeNeeded] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')

  const targetSunday = getNextSundayISO()
  const sundayLabel  = fmtSundayLabel(targetSunday)

  useEffect(() => {
    if (!department) { setLoading(false); return }
    getBoardPoints(department)
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [department])

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  const handleSubmit = async () => {
    if (!point.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const slNo = String(points.length + 1)
      const id = await addBoardPoint({
        department,
        slNo,
        point: point.trim(),
        timeNeeded: timeNeeded.trim(),
        meetingDate: targetSunday,
        createdBy: userEmail || 'unknown',
      })
      if (id) {
        setPoints(prev => [...prev, {
          id, department, slNo,
          point: point.trim(),
          timeNeeded: timeNeeded.trim(),
          meetingDate: targetSunday,
          status: 'pending',
          allottedTime: '',
          createdAt: new Date(),
        }])
        setPoint('')
        setTimeNeeded('')
      } else {
        setError('Could not save — please try again.')
      }
    } catch {
      setError('Failed to submit. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const s = {
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 99998, display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center',
    },
    sheet: {
      background: '#fff', width: '100%', maxWidth: '440px',
      borderRadius: '20px 20px 0 0', maxHeight: '88vh',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
      zIndex: 99999, position: 'relative',
    },
    header: {
      padding: '18px 20px 14px', borderBottom: '1px solid #f1f5f9',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      flexShrink: 0,
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: '50%', border: 'none',
      background: '#f1f5f9', cursor: 'pointer', fontSize: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#64748b', flexShrink: 0,
    },
    list: { overflowY: 'auto', flexShrink: 0, maxHeight: 176 },
    row: { padding: '10px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', gap: 8 },
    form: { padding: '14px 20px 20px', borderTop: '1px solid #f1f5f9', flexShrink: 0 },
    textarea: {
      width: '100%', padding: '10px 12px', borderRadius: 12,
      border: '1.5px solid #e2e8f0', fontSize: 13, resize: 'none',
      boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
      lineHeight: 1.5,
    },
    input: {
      width: '100%', padding: '9px 12px', borderRadius: 12,
      border: '1.5px solid #e2e8f0', fontSize: 13,
      boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none',
      marginTop: 8,
    },
    submitBtn: (disabled) => ({
      width: '100%', padding: '11px', borderRadius: 12, border: 'none',
      background: disabled ? '#a5b4fc' : '#4f46e5', color: '#fff',
      fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
      marginTop: 10, fontFamily: 'inherit',
    }),
    pill: (color, bg, border) => ({
      fontSize: 10, fontWeight: 700, color, background: bg,
      border: `1px solid ${border}`, padding: '1px 7px',
      borderRadius: 999, display: 'inline-block',
    }),
    tag: {
      fontSize: 10, fontWeight: 700, color: '#6366f1',
      background: '#eef2ff', border: '1px solid #e0e7ff',
      padding: '2px 8px', borderRadius: 999,
    },
  }

  return createPortal(
    <div style={s.overlay} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', margin: 0 }}>Board Meeting Points</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, marginBottom: 0 }}>
              {loading ? 'Loading…' : `${points.length} point${points.length !== 1 ? 's' : ''} submitted · ${department}`}
            </p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* ── Existing points ── */}
        {!loading && points.length > 0 && (
          <div style={s.list}>
            {points.map((bp, idx) => (
              <div key={bp.id} style={s.row}>
                <span style={{ fontSize: 11, color: '#cbd5e1', width: 20, flexShrink: 0, paddingTop: 2 }}>{idx + 1}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.4 }}>{bp.point}</p>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {bp.timeNeeded && <span style={{ fontSize: 10, color: '#94a3b8' }}>Requested: {bp.timeNeeded}</span>}
                    {bp.allottedTime
                      ? <span style={s.pill('#059669', '#ecfdf5', '#a7f3d0')}>Allotted: {bp.allottedTime}</span>
                      : <span style={s.pill('#d97706', '#fffbeb', '#fde68a')}>{bp.status}</span>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Add point form ── */}
        <div style={s.form}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>New Point</p>
            <span style={s.tag}>For Sunday {sundayLabel}</span>
          </div>
          <textarea
            rows={3}
            value={point}
            onChange={e => setPoint(e.target.value)}
            placeholder="Describe the point to present at the board meeting…"
            style={s.textarea}
          />
          <input
            type="text"
            value={timeNeeded}
            onChange={e => setTimeNeeded(e.target.value)}
            placeholder="Time needed (e.g. 10 min)"
            style={s.input}
          />
          {error && <p style={{ fontSize: 11, color: '#ef4444', marginTop: 6, marginBottom: 0 }}>{error}</p>}
          <button
            disabled={!point.trim() || submitting}
            onClick={handleSubmit}
            style={s.submitBtn(!point.trim() || submitting)}
          >
            {submitting ? 'Submitting…' : 'Submit Point'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
