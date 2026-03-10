import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSundayPlan, setSundayPlanSection, getWorshipScheduleByDate } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'

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
  if (loading) return <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"><p className="text-slate-500">Loading Worship plan...</p></div>
  const assignments = worshipPlan?.assignments || []
  const songs = worshipPlan?.songs || []
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3">Worship (from Worship department)</h3>
      <p className="text-xs text-slate-500 mb-3">Team and songs for {formatDMY(selectedDate)}. Edit on the Worship department page.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Team by role</h4>
          <table className="w-full text-sm">
            <thead><tr><th className="text-left py-1 text-slate-600">Role</th><th className="text-left py-1 text-slate-600">Assigned</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {WORSHIP_ROLES.map((role) => {
                const a = assignments.find((x) => x.role === role)
                return <tr key={role}><td className="py-1 text-slate-800">{role}</td><td className="py-1 text-slate-600">{a?.memberName || '—'}</td></tr>
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="text-sm font-medium text-slate-700 mb-2">Songs & lead vocalist</h4>
          {songs.length === 0 ? <p className="text-slate-500 text-sm">No songs entered yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className="text-left py-1 text-slate-600 w-8">#</th><th className="text-left py-1 text-slate-600">Song</th><th className="text-left py-1 text-slate-600">Key</th><th className="text-left py-1 text-slate-600">Lead</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {songs.map((s, i) => (
                  <tr key={i}><td className="py-1 text-slate-600">{i + 1}</td><td className="py-1 text-slate-800">{s?.title || '—'}</td><td className="py-1 text-slate-600">{s?.key || '—'}</td><td className="py-1 text-slate-600">{s?.memberName || '—'}</td></tr>
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

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(sectionKey, form)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-3">{label}</h3>
      {canEdit ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Enter planning notes, names, and details for this section..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 min-h-[120px]"
            rows={4}
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
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
  const [selectedDate, setSelectedDate] = useState(() => dateFromUrl || format(new Date(), 'yyyy-MM-dd'))
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Sunday Ministry Planning</h1>
        <p className="text-slate-500 mt-1">
          Plan and report by section. Each department can fill their part; data is combined for reports.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-slate-700">Date:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => handleDateChange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300"
        />
        <button
          type="button"
          onClick={() => handleDateChange(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          ← Previous Sunday
        </button>
        <button
          type="button"
          onClick={() => handleDateChange(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          Next Sunday →
        </button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('combined')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === 'combined' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Combined view
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mysection')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === 'mysection' ? 'bg-white border border-slate-200 border-b-0 text-blue-600' : 'text-slate-600 hover:bg-slate-100'
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
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Combined sheet for {formatDMY(selectedDate)}. Export from Reports when needed.
          </p>
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
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-slate-600">
        <p>Your account is not assigned to a specific section. You can view the Combined view, or ask an admin to set your <strong>sundaySection</strong> in Firestore (users collection) to one of: sundayMinistry, worship, sundayLeader, media, announcements, dLite, riverKids.</p>
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
