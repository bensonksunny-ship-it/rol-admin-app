import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { getSundayPlan, setSundayPlanSection, getWorshipScheduleByDate } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'

function nextSundayISO() {
  const today = new Date()
  const day = today.getDay()
  const daysUntilSunday = (7 - day) % 7
  const next = new Date(today)
  next.setDate(today.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday))
  return format(next, 'yyyy-MM-dd')
}

const WORSHIP_ROLES = [
  'Lead Vocal-1', 'Lead Vocal-2', 'Lead Vocal-3', 'Lead Vocal-4', 'Parts-1', 'Parts-2',
  'Choir member-1', 'Choir member-2', 'Choir member-3', 'Choir member-4', 'Choir member-5', 'Choir member-6',
  'Keyboard', 'Lead Guitar', 'Bass Guitar', 'Acoustic guitar', 'Drums', 'Sound Engineer',
]

const SECTION_LABELS = {
  [SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]: 'Sunday Ministry Team',
  [SUNDAY_PLAN_SECTIONS.WORSHIP]: 'Worship',
  [SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER]: 'Sunday Leader',
  [SUNDAY_PLAN_SECTIONS.MEDIA]: 'Media Team',
  [SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS]: 'Announcements',
  [SUNDAY_PLAN_SECTIONS.D_LITE]: 'D-Lite',
  [SUNDAY_PLAN_SECTIONS.RIVER_KIDS]: 'River Kids',
}

const SECTION_ORDER = [
  SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY,
  SUNDAY_PLAN_SECTIONS.WORSHIP,
  SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER,
  SUNDAY_PLAN_SECTIONS.MEDIA,
  SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS,
  SUNDAY_PLAN_SECTIONS.D_LITE,
  SUNDAY_PLAN_SECTIONS.RIVER_KIDS,
]

const SECTION_ACCENT = {
  [SUNDAY_PLAN_SECTIONS.SUNDAY_MINISTRY]: { border: 'border-l-violet-500', btn: 'bg-violet-500 hover:bg-violet-600' },
  [SUNDAY_PLAN_SECTIONS.SUNDAY_LEADER]: { border: 'border-l-sky-500', btn: 'bg-sky-500 hover:bg-sky-600' },
  [SUNDAY_PLAN_SECTIONS.MEDIA]: { border: 'border-l-emerald-500', btn: 'bg-emerald-500 hover:bg-emerald-600' },
  [SUNDAY_PLAN_SECTIONS.ANNOUNCEMENTS]: { border: 'border-l-amber-500', btn: 'bg-amber-500 hover:bg-amber-600' },
  [SUNDAY_PLAN_SECTIONS.D_LITE]: { border: 'border-l-rose-500', btn: 'bg-rose-500 hover:bg-rose-600' },
  [SUNDAY_PLAN_SECTIONS.RIVER_KIDS]: { border: 'border-l-teal-500', btn: 'bg-teal-500 hover:bg-teal-600' },
}

function WorshipPlanSummary({ selectedDate }) {
  const [worshipPlan, setWorshipPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    getWorshipScheduleByDate('Worship', selectedDate)
      .then(setWorshipPlan)
      .catch(() => setWorshipPlan({ date: selectedDate, assignments: [], songs: [] }))
      .finally(() => setLoading(false))
  }, [selectedDate])
  if (loading) return <div className="bg-white rounded-lg border border-amber-200 p-4 shadow-sm"><p className="text-slate-500 text-sm">Loading Worship plan...</p></div>
  const assignments = worshipPlan?.assignments || []
  const songs = worshipPlan?.songs || []
  return (
    <div className="bg-white rounded-lg border border-amber-200 border-l-4 border-l-amber-500 p-4 shadow-sm">
      <h3 className="font-semibold text-amber-900 mb-1">Worship (from Worship department)</h3>
      <p className="text-slate-500 text-sm mb-2">Same as Plan coming Sunday. {formatDMY(selectedDate)}</p>
      <p className="mb-2">
        <Link to={`/department/worship?date=${selectedDate}`} className="text-amber-600 hover:text-amber-700 text-sm font-semibold">Edit in Worship department →</Link>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded border border-amber-100 bg-amber-50/50 overflow-hidden">
          <h4 className="text-sm font-semibold text-amber-900 bg-amber-100 px-2 py-1">Team by role</h4>
          <table className="w-full text-sm">
            <thead><tr><th className="text-left py-1 px-2 text-slate-600">Role</th><th className="text-left py-1 px-2 text-slate-600">Assigned</th></tr></thead>
            <tbody className="divide-y divide-amber-100">
              {WORSHIP_ROLES.map((role) => {
                const a = assignments.find((x) => x.role === role)
                return <tr key={role}><td className="py-1 px-2 text-slate-800">{role}</td><td className="py-1 px-2 text-slate-600">{a?.memberName || '—'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
        <div className="rounded border border-orange-100 bg-orange-50/50 overflow-hidden">
          <h4 className="text-sm font-semibold text-orange-900 bg-orange-100 px-2 py-1">Songs & lead</h4>
          {songs.length === 0 ? <p className="text-slate-500 text-sm p-2">No songs yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className="text-left py-1 px-2 w-6 text-slate-600">#</th><th className="text-left py-1 px-2 text-slate-600">Song</th><th className="text-left py-1 px-2 text-slate-600">Key</th><th className="text-left py-1 px-2 text-slate-600">Lead</th></tr></thead>
              <tbody className="divide-y divide-orange-100">
                {songs.map((s, i) => (
                  <tr key={i}><td className="py-1 px-2 text-slate-600">{i + 1}</td><td className="py-1 px-2 text-slate-800">{s?.title || '—'}</td><td className="py-1 px-2 text-slate-600">{s?.key || '—'}</td><td className="py-1 px-2 text-slate-600">{s?.memberName || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionForm({ sectionKey, label, data, canEdit, onSave, saving }) {
  const [form, setForm] = useState(data || { notes: '' })
  useEffect(() => setForm(data || { notes: '' }), [data])
  const style = SECTION_ACCENT[sectionKey] || { border: 'border-l-indigo-400', btn: 'bg-indigo-500 hover:bg-indigo-600' }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(sectionKey, form)
  }

  return (
    <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${style.border} p-4 shadow-sm`}>
      <h3 className="font-semibold text-slate-800 mb-2">{label}</h3>
      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Planning notes, names, details..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[80px]"
            rows={3}
          />
          <button
            type="submit"
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${style.btn}`}
          >
            {saving ? 'Saving...' : 'Save section'}
          </button>
        </form>
      ) : (
        <div className="text-slate-600 whitespace-pre-wrap">
          {form.notes || '— No data yet —'}
        </div>
      )}
    </div>
  )
}

export default function SundayPlanning() {
  const [searchParams, setSearchParams] = useSearchParams()
  const dateFromUrl = searchParams.get('date')
  const { hasPermission, canEditSundaySection } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => dateFromUrl || nextSundayISO())
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('combined')
  const canView = hasPermission('attendance')
  const canEditFull = hasPermission('editSundayPlanFull')

  useEffect(() => {
    if (dateFromUrl) setSelectedDate(dateFromUrl)
  }, [dateFromUrl])

  useEffect(() => {
    getSundayPlan(selectedDate).then((p) => {
      setPlan(p || {})
      setLoading(false)
    })
  }, [selectedDate])

  const handleDateChange = (nextDate) => {
    setSelectedDate(nextDate)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('date', nextDate)
      return next
    })
  }

  const handleSaveSection = async (sectionKey, sectionData) => {
    setSaving(true)
    try {
      await setSundayPlanSection(selectedDate, sectionKey, sectionData)
      setPlan((prev) => ({ ...prev, [sectionKey]: sectionData }))
    } finally {
      setSaving(false)
    }
  }

  if (!canView) {
    return (
      <div className="p-8 text-slate-600">
        You don't have access to Sunday Planning. Contact an administrator.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-700 to-blue-700 bg-clip-text text-transparent">Sunday Ministry Planning</h1>
          <p className="text-slate-500 text-sm mt-0.5">Plan by section; data combined for reports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-slate-600">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm"
          />
          <button
            type="button"
            onClick={() => handleDateChange(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-medium hover:bg-indigo-50 hover:border-indigo-300"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => handleDateChange(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
            className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-medium hover:bg-indigo-50 hover:border-indigo-300"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-slate-200 pb-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('combined')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'combined' ? 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
          }`}
        >
          Combined view
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mysection')}
          className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === 'mysection' ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm' : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
          }`}
        >
          My section only
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading...</div>
      ) : activeTab === 'mysection' ? (
        <MySectionView
          plan={plan}
          canEditSundaySection={canEditSundaySection}
          onSave={handleSaveSection}
          saving={saving}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Combined sheet for {formatDMY(selectedDate)}.</p>
          {SECTION_ORDER.map((key) =>
            key === SUNDAY_PLAN_SECTIONS.WORSHIP ? (
              <WorshipPlanSummary key={key} selectedDate={selectedDate} />
            ) : (
              <SectionForm
                key={key}
                sectionKey={key}
                label={SECTION_LABELS[key]}
                data={plan?.[key]}
                canEdit={canEditFull || canEditSundaySection(key)}
                onSave={handleSaveSection}
                saving={saving}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

function MySectionView({ plan, canEditSundaySection, onSave, saving }) {
  const mySection = SECTION_ORDER.find((key) => canEditSundaySection(key))
  if (!mySection) {
    return (
      <div className="bg-slate-50 rounded-lg border border-slate-200 border-l-4 border-l-slate-400 p-4 text-slate-600">
        <p>Your account is not assigned to a specific section. Use Combined view, or ask an admin to set <strong>sundaySection</strong> in Firestore (users) to: sundayMinistry, worship, sundayLeader, media, announcements, dLite, riverKids.</p>
      </div>
    )
  }
  return (
    <SectionForm
      sectionKey={mySection}
      label={SECTION_LABELS[mySection]}
      data={plan?.[mySection]}
      canEdit
      onSave={onSave}
      saving={saving}
    />
  )
}
