import { useState, useEffect } from 'react'
import { addBoardPoint, getBoardPoints } from '../services/firestore'

function nextSundayISO() {
  const now = new Date()
  const day = now.getDay()
  const daysTo = day === 0 ? 0 : 7 - day
  const d = new Date(now)
  d.setDate(now.getDate() + daysTo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function labelDate(iso) {
  const d = new Date(iso + 'T12:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function BoardPointsModal({ department, userEmail, onClose }) {
  const [points,     setPoints]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [point,      setPoint]      = useState('')
  const [timeNeeded, setTimeNeeded] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const targetSunday = nextSundayISO()
  const sundayLabel  = labelDate(targetSunday)

  useEffect(() => {
    if (!department) { setLoading(false); return }
    getBoardPoints(department)
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [department])

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
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
          status: 'pending', allottedTime: '',
        }])
        setPoint('')
        setTimeNeeded('')
      } else {
        setError('Could not save — please try again.')
      }
    } catch (e) {
      setError('Submission failed: ' + (e?.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = point.trim().length > 0 && !submitting

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 z-[9998]"
        onClick={onClose}
      />

      {/* Centered modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-[9999]">
        <div
          className="animate-folder-zoom-in max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden"
          style={{ maxHeight: '85vh' }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
            <div>
              <p style={{ margin:0, fontWeight:700, fontSize:15, color:'#1e293b' }}>Board Meeting Points</p>
              <p style={{ margin:0, marginTop:2, fontSize:11, color:'#94a3b8' }}>
                {loading ? 'Loading…' : `${points.length} point${points.length !== 1 ? 's' : ''} submitted · ${department || '—'}`}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ width:32, height:32, borderRadius:'50%', border:'none', background:'#f1f5f9', cursor:'pointer', fontSize:20, color:'#64748b', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
            >×</button>
          </div>

          {/* ── Submitted points list ── */}
          {!loading && points.length > 0 && (
            <div style={{ overflowY:'auto', maxHeight:160, flexShrink:0 }}>
              {points.map((bp, idx) => (
                <div key={bp.id} style={{ display:'flex', gap:8, padding:'9px 20px', borderBottom:'1px solid #f8fafc' }}>
                  <span style={{ fontSize:11, color:'#cbd5e1', flexShrink:0, paddingTop:2, width:18 }}>{idx + 1}.</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:13, color:'#334155', lineHeight:1.4 }}>{bp.point}</p>
                    <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap', alignItems:'center' }}>
                      {bp.timeNeeded && <span style={{ fontSize:10, color:'#94a3b8' }}>Need: {bp.timeNeeded}</span>}
                      {bp.allottedTime
                        ? <span style={{ fontSize:10, fontWeight:700, color:'#059669', background:'#ecfdf5', border:'1px solid #a7f3d0', padding:'1px 7px', borderRadius:999 }}>Allotted: {bp.allottedTime}</span>
                        : <span style={{ fontSize:10, fontWeight:600, color:'#d97706', background:'#fffbeb', border:'1px solid #fde68a', padding:'1px 7px', borderRadius:999 }}>{bp.status}</span>
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Add point form ── */}
          <div style={{ padding:'14px 20px 24px', borderTop: points.length > 0 ? '1px solid #f1f5f9' : undefined, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em' }}>New Point</span>
              <span style={{ fontSize:10, fontWeight:700, color:'#6366f1', background:'#eef2ff', border:'1px solid #e0e7ff', padding:'2px 8px', borderRadius:999 }}>
                For Sunday {sundayLabel}
              </span>
            </div>

            <textarea
              value={point}
              onChange={e => setPoint(e.target.value)}
              placeholder="Describe the point to present at the board meeting…"
              rows={3}
              style={{ width:'100%', padding:'10px 12px', borderRadius:12, border:'1.5px solid #e2e8f0', fontSize:13, resize:'none', boxSizing:'border-box', fontFamily:'inherit', outline:'none', lineHeight:1.5, display:'block' }}
            />
            <input
              type="text"
              value={timeNeeded}
              onChange={e => setTimeNeeded(e.target.value)}
              placeholder="Time needed (e.g. 10 min)"
              style={{ width:'100%', padding:'9px 12px', borderRadius:12, border:'1.5px solid #e2e8f0', fontSize:13, marginTop:8, boxSizing:'border-box', fontFamily:'inherit', outline:'none', display:'block' }}
            />
            {error && (
              <p style={{ margin:'6px 0 0', fontSize:11, color:'#ef4444' }}>{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{ display:'block', width:'100%', padding:'11px', borderRadius:12, border:'none', background: canSubmit ? '#4f46e5' : '#a5b4fc', color:'#fff', fontSize:13, fontWeight:700, cursor: canSubmit ? 'pointer' : 'not-allowed', marginTop:10, fontFamily:'inherit' }}
            >
              {submitting ? 'Submitting…' : 'Submit Point'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}
