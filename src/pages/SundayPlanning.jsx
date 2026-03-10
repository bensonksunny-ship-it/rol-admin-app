import { useEffect, useState } from 'react'
import { getSundayPlan, setSundayPlanSection, setSundayPlanFull } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { SUNDAY_PLAN_SECTIONS } from '../constants/roles'
import { format, addWeeks, subWeeks } from 'date-fns'
import { formatDMY } from '../utils/date'

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
  const { hasPermission, canEditSundaySection } = useAuth()
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('combined')
  const canView = hasPermission('attendance')
  const canEditFull = hasPermission('editSundayPlanFull')

  useEffect(() => {
    getSundayPlan(selectedDate).then((p) => {
      setPlan(p || {})
      setLoading(false)
    })
  }, [selectedDate])

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
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300"
        />
        <button
          type="button"
          onClick={() => setSelectedDate(format(subWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm hover:bg-slate-50"
        >
          ← Previous Sunday
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(format(addWeeks(new Date(selectedDate), 1), 'yyyy-MM-dd'))}
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
          {SECTION_ORDER.map((key) => (
            <SectionForm
              key={key}
              sectionKey={key}
              label={SECTION_LABELS[key]}
              data={plan?.[key]}
              canEdit={canEditFull || canEditSundaySection(key)}
              onSave={handleSaveSection}
              saving={saving}
            />
          ))}
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
