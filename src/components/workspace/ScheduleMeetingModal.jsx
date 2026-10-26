import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MEETING_MODES } from '../../utils/meetingSchedule'
import DateInput from '../DateInput'

const TIME_SLOTS = [['10:00', '10 AM'], ['12:00', '12 PM'], ['16:00', '4 PM'], ['18:00', '6 PM'], ['19:30', '7:30 PM']]
const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * Pick a date, time and mode (phone call / face-to-face) with the phone number or
 * place. Used by the cell leader (Stage 5 call) and the deacon (Stage 6 interview).
 * onSave(schedule) gets { at, date, time, mode, phone, location, notes }.
 */
export default function ScheduleMeetingModal({ title, subtitle = '', initial = null, defaultPhone = '', accent = 'sky', onSave, onClose }) {
  const startAt = String(initial?.at || '')
  const [date, setDate] = useState(startAt.slice(0, 10) || todayIso())
  const [time, setTime] = useState(startAt.slice(11, 16) || '')
  const [mode, setMode] = useState(initial?.mode || 'phone')
  const [phone, setPhone] = useState(initial?.phone || defaultPhone || '')
  const [location, setLocation] = useState(initial?.location || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const theme = accent === 'emerald'
    ? { head: 'bg-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700', on: 'bg-emerald-600 text-white border-emerald-600' }
    : { head: 'bg-sky-600', btn: 'bg-sky-600 hover:bg-sky-700', on: 'bg-sky-600 text-white border-sky-600' }
  const inp = 'w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200'

  const save = async () => {
    setError('')
    if (!date || !time) { setError('Pick a date and time.'); return }
    if (mode === 'phone' && !phone.trim()) { setError('Add the phone number.'); return }
    if (mode === 'in_person' && !location.trim()) { setError('Add the place.'); return }
    setBusy(true)
    try {
      await onSave({
        at: `${date}T${time}`, date, time, mode,
        phone: mode === 'phone' ? phone.trim() : '',
        location: mode === 'in_person' ? location.trim() : '',
        notes: notes.trim(),
      })
      onClose()
    } catch (e) {
      console.error('ScheduleMeetingModal save', e)
      setError(e?.code === 'permission-denied' ? 'You are not allowed to schedule this one.' : 'Could not save. Please try again.')
    }
    setBusy(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`sticky top-0 ${theme.head} text-white px-5 py-3 flex items-center gap-3`}>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{title}</p>
            {subtitle && <p className="text-xs text-white/80 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Date</span>
            <DateInput value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} className={inp} />
          </label>
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1">Time</span>
            <div className="flex flex-wrap gap-1.5">
              {TIME_SLOTS.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={time === v} onClick={() => setTime(v)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${time === v ? theme.on : 'bg-white text-slate-700 border-slate-300'}`}>{l}</button>
              ))}
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Other time"
                className="h-8 px-2 rounded-full border border-slate-300 text-xs bg-white" />
            </div>
          </div>
          <div>
            <span className="block text-xs font-semibold text-slate-600 mb-1">Mode</span>
            <div className="grid grid-cols-2 gap-2">
              {MEETING_MODES.map((m) => (
                <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => setMode(m.value)}
                  className={`min-h-[44px] rounded-xl border text-sm font-semibold ${mode === m.value ? theme.on : 'bg-white text-slate-700 border-slate-300'}`}>{m.label}</button>
              ))}
            </div>
          </div>
          {mode === 'phone' ? (
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Phone number</span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 98450 12345" className={inp} />
            </label>
          ) : (
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Place</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Church office, after Sunday service" className={inp} />
            </label>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Note (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={busy} onClick={save}
            className={`w-full min-h-[44px] rounded-xl ${theme.btn} text-white text-sm font-bold disabled:opacity-50`}>
            {busy ? 'Saving…' : initial?.at ? 'Save New Time' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
