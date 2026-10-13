import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ArrowLeft, ChevronDown, Check, Star, Download, Lock, FileText, Image as ImageIcon } from 'lucide-react'
import rolccLogo from '../../assets/rolcc_logo BW.JPG'
import {
  getWorshipApplications,
  addWorshipApplication,
  updateWorshipApplication,
  getMergedPeopleDirectory,
  getCellGroups,
  getWorshipTeamMembers,
  addWorshipTeamMember,
  updateWorshipTeamMember,
  addPerson,
} from '../../services/firestore'

const DEPARTMENT = 'Worship'

const INSTRUMENT_OPTIONS = [
  'Lead vocal', 'Parts', 'Choir', 'Keyboard', 'Lead guitar',
  'Guitar', 'Bass', 'Drums', 'Sound engineer', 'Media',
]
const READING_OPTIONS = ['Standard notation', 'Nashville Number System', 'Chord charts / lead sheets', 'By ear only']
const MINISTRY_AREA_OPTIONS = ['Worship Ministry', 'Other Ministry Area']

// Resolves a searchable display name off a directory entry regardless of which shape
// it arrived in — getMergedPeopleDirectory() always sets `name`, but this stays
// defensive against `fullName` or split `firstName`/`lastName` fields in case a future
// source (or a hand-edited record) doesn't follow that convention.
function directoryEntryName(person) {
  if (person?.name) return person.name
  if (person?.fullName) return person.fullName
  const combined = [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim()
  return combined
}

// Wizard steps — Sections I-IV map one-to-one; the last two sections (Availability &
// Commitment, Heart for Worship & Alignment) share one final step since both are
// fundamentally about the same thing: committing to serve, then signing that commitment.
const STEPS = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'church', label: 'About Our Church' },
  { key: 'journey', label: 'Spiritual Journey' },
  { key: 'musical', label: 'Musical Profile' },
  { key: 'commitment', label: 'Commitment & Signature' },
]
const WORSHIP_BEST_PART_OPTIONS = [
  'Spirit-led Atmosphere & Presence',
  'Song Selection & Theology',
  'Musical Excellence & Team Unity',
  'Congregational Engagement & Prayer',
  'Sound & Technical Quality',
]

const emptyForm = () => ({
  applicationDate: new Date().toISOString().slice(0, 10),
  fullName: '', dob: '', phone: '', email: '', currentPlace: '', comingFrom: '',
  cellGroup: '', regularCellAttendee: '', permanentMember: '', churchAttendanceDuration: '',
  worshipRating: 0, worshipBestPart: '',
  testimony: '', baptised: '', anointedByHolySpirit: '',
  ministryExperience: '', ministryDuration: '', ministryArea: '', ministryAreaOther: '', worshipInspiration: '',
  primaryInstruments: [], instrumentDetails: {}, readingAbility: [], yearsExperience: '', formalTraining: '', portfolioLink: '', vocalRange: '',
  specialEvents: '', attendPractices: false, attendRehearsals: false,
  worshipDefinition: '', feedbackResponse: '', covenantAgree: false, signatureDataUrl: '',
})

function Field({ label, hint, children }) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-b-0">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-slate-400 -mt-1 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function TextInput(props) {
  return <input {...props} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
}

function TextArea(props) {
  return <textarea {...props} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300" />
}

function CheckboxGroup({ options, values, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = values.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              active ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            value === opt ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── 1–5 star rating — click a star to set the rating; filled stars up to that
// value stay lit so the current rating is always visible, not just on hover.
function StarRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5 active:scale-90 transition-transform"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star size={26} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
        </button>
      ))}
    </div>
  )
}

// ── Per-instrument detail panel — expands under the pill selector for every
// currently-selected instrument/vocal part, collecting the 3 details specific to
// that area (experience duration, coaching/formal education, certifications).
// Deselecting the pill hides its panel but doesn't erase what was already typed —
// re-selecting brings the same answers back instead of losing them.
function InstrumentDetailPanel({ instrument, details, onChange }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{instrument}</p>
      <Field label="Duration of experience" hint="e.g. 2 years, 6 months">
        <TextInput value={details.duration || ''} onChange={e => onChange({ duration: e.target.value })} />
      </Field>
      <Field label="Have you attended coaching or formal education for this?">
        <RadioGroup
          options={['Yes', 'No']}
          value={details.coaching || ''}
          onChange={v => onChange({ coaching: v, ...(v !== 'Yes' ? { coachingYears: '' } : {}) })}
        />
      </Field>
      {details.coaching === 'Yes' && (
        <Field label="How many years of coaching/formal education?">
          <TextInput value={details.coachingYears || ''} onChange={e => onChange({ coachingYears: e.target.value })} />
        </Field>
      )}
      <Field label="Have you completed any certifications in this area?">
        <RadioGroup
          options={['Yes', 'No']}
          value={details.certified || ''}
          onChange={v => onChange({ certified: v, ...(v !== 'Yes' ? { certificationDetails: '' } : {}) })}
        />
      </Field>
      {details.certified === 'Yes' && (
        <Field label="Certificate details (optional)" hint="Name of the certification and issuing body">
          <TextInput value={details.certificationDetails || ''} onChange={e => onChange({ certificationDetails: e.target.value })} />
        </Field>
      )}
    </div>
  )
}

// ── Drawable signature canvas — mouse, touch, and stylus all funnel through the same
// pointer-position math; canvas pixel size stays fixed while CSS scales the element
// responsively, so getPoint's rect-ratio conversion keeps strokes aligned regardless
// of display width. Reports a PNG data URL up to the parent on every stroke-end (and
// clears it on Reset) rather than on every mousemove, to avoid re-rendering the form
// dozens of times per second while someone is mid-signature.
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef(null)
  const hasDrawnRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !value) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    img.src = value
    // Only restore once on mount — re-running this on every `value` change would
    // fight with the user's own in-progress strokes being drawn onto the same canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getPoint = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0]
    const clientX = touch ? touch.clientX : e.clientX
    const clientY = touch ? touch.clientY : e.clientY
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDraw = (e) => {
    e.preventDefault()
    drawingRef.current = true
    hasDrawnRef.current = true
    lastPointRef.current = getPoint(e)
  }

  const draw = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const point = getPoint(e)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.25
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
  }

  const endDraw = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (hasDrawnRef.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    hasDrawnRef.current = false
    onChange('')
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className="w-full h-40 rounded-lg border border-slate-300 bg-white touch-none cursor-crosshair"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-xs text-slate-400">Sign above with your mouse, finger, or stylus</p>
        <button type="button" onClick={handleClear} className="text-xs font-medium text-slate-500 hover:text-red-600 underline">
          Clear
        </button>
      </div>
    </div>
  )
}

// ── Stepper progress bar — read-only indicator (no click-to-jump; the only way
// through the wizard is Next/Back so validation always runs) showing every step's
// number/checkmark and label, connected by a line that fills in as steps complete. ──
function Stepper({ steps, current }) {
  return (
    <div>
      <div className="flex items-start">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 w-16 shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-colors ${
                i < current ? 'bg-emerald-600 border-emerald-600 text-white'
                  : i === current ? 'bg-white border-emerald-600 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-300'
              }`}>
                {i < current ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium text-center leading-tight ${i === current ? 'text-emerald-700' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mt-3.5 transition-colors ${i < current ? 'bg-emerald-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-slate-400 mt-3">
        Step {current + 1} of {steps.length}: <span className="font-medium text-slate-500">{steps[current].label}</span>
      </p>
    </div>
  )
}

// ── The fill-out form — applicant-facing, shown full-screen while the Director
// hands over the device. Deliberately renders nothing from the applications list. ──
function ApplicationForm({ onSubmitted, onCancel, submittedBy }) {
  const [form, setForm] = useState(emptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [membersList, setMembersList] = useState([])
  const [nameSuggestions, setNameSuggestions] = useState([])
  const [showNameSuggestions, setShowNameSuggestions] = useState(false)
  const [cellGroups, setCellGroups] = useState([])
  const [loadingCellGroups, setLoadingCellGroups] = useState(true)
  const [cellGroupsError, setCellGroupsError] = useState(false)

  // Full People Directory merge (people, cell members, PCS entries, department/
  // worship team rosters, D-Light visitors — see getMergedPeopleDirectory in
  // firestore.js) so search here matches everyone registered in the system, not
  // just the `people` collection + D-Light visitors. Same source PeopleDirectory.jsx
  // and the Worship team "Add Member" search use — no role/department/status
  // filtering, since anyone in the directory should be selectable here (deliberately
  // no active-tab, stage, or role filtering — `people` here is already every entry
  // getMergedPeopleDirectory merged, unfiltered).
  useEffect(() => {
    getMergedPeopleDirectory()
      .then(({ people }) => {
        const withNames = []
        const malformed = []
        for (const p of people) {
          const name = directoryEntryName(p)
          if (!name) { malformed.push(p); continue }
          withNames.push(name === p.name ? p : { ...p, name })
        }
        if (malformed.length > 0) {
          console.error(
            `Worship application directory search: ${malformed.length} record(s) had no usable name (checked name/fullName/firstName+lastName) and were excluded from search.`,
            malformed
          )
        }
        setMembersList(withNames)
      })
      .catch(err => {
        console.error('Failed to load the People Directory for the application form:', err)
        setMembersList([])
      })
  }, [])

  // Cell group list for the "Which Cell Group do you belong to?" dropdown — active
  // groups only, sorted alphabetically for easy scanning. Falls back to `name`/
  // `groupName` in case a record was ever written under a different key than the
  // current `cellName` field, and drops any record with no resolvable name at all
  // instead of rendering a blank option.
  useEffect(() => {
    let alive = true
    setLoadingCellGroups(true)
    setCellGroupsError(false)
    getCellGroups('Cell')
      .then(groups => {
        if (!alive) return
        const named = (groups || [])
          .filter(g => g.status !== 'inactive')
          .map(g => ({ ...g, cellName: g.cellName || g.name || g.groupName || '' }))
          .filter(g => g.cellName)
          .sort((a, b) => a.cellName.localeCompare(b.cellName))
        setCellGroups(named)
        if (named.length === 0) {
          console.error('Cell group dropdown: query returned no usable records (either none exist, or this account lacks read access to cell_groups).', groups)
        }
      })
      .catch(err => {
        console.error('Failed to load cell groups for the application form:', err)
        if (!alive) return
        setCellGroups([])
        setCellGroupsError(true)
      })
      .finally(() => { if (alive) setLoadingCellGroups(false) })
    return () => { alive = false }
  }, [])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const toggle = (field, value) => setForm(f => ({
    ...f,
    [field]: f[field].includes(value) ? f[field].filter(v => v !== value) : [...f[field], value],
  }))
  const updateInstrumentDetail = (instrument, patch) => setForm(f => ({
    ...f,
    instrumentDetails: {
      ...f.instrumentDetails,
      [instrument]: { ...(f.instrumentDetails[instrument] || {}), ...patch },
    },
  }))

  // Auto-fills the basic personal-info fields from a matched directory record —
  // the applicant can still edit anything afterward (e.g. if their current place
  // on file is out of date).
  const applyDirectoryMatch = (m) => {
    setForm(f => ({
      ...f,
      fullName: m.name || f.fullName,
      dob: m.dob || f.dob,
      phone: m.phone || f.phone,
      email: m.email || f.email,
      currentPlace: m.currentPlace || f.currentPlace,
      comingFrom: m.nativity || f.comingFrom,
      directoryPersonId: m.personId || '',
      directoryVisitorId: m._visitorIds?.[0] || '',
    }))
    setShowNameSuggestions(false)
    setNameSuggestions([])
  }

  const canSubmit = form.fullName.trim() && form.covenantAgree && !!form.signatureDataUrl

  // Wizard navigation — form state itself never resets between steps (it's the same
  // `form` state for the whole component regardless of which step is showing), so
  // going Back and Next preserves every answer automatically. Only a handful of
  // fields were ever marked required ("*") in the original single-page form, so only
  // those same fields block moving on here — Next doesn't invent new requirements.
  const [step, setStep] = useState(0)
  const [stepError, setStepError] = useState('')
  const stepValidators = [
    () => (form.fullName.trim() ? null : 'Please enter your full legal name to continue.'),
    () => null,
    () => null,
    () => null,
    () => null, // final step's Submit button is disabled via canSubmit instead of a Next-gate
  ]
  const handleNext = () => {
    const err = stepValidators[step]?.()
    if (err) { setStepError(err); return }
    setStepError('')
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  const handleBack = () => {
    setStepError('')
    setStep(s => Math.max(s - 1, 0))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await addWorshipApplication(DEPARTMENT, form, submittedBy)
      onSubmitted()
    } catch (err) {
      console.error('Worship application submit failed:', err, form)
      alert('Failed to submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-10">
      <div className="text-center py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">Worship Ministry</p>
        <h2 className="text-xl font-bold text-slate-800">Application Form</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Please fill this out yourself — your Worship Director will review it afterward.</p>
      </div>

      <Stepper steps={STEPS} current={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="space-y-4"
        >
          {step === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-1">I. Personal Information</h3>
              <Field label="Full legal name *" hint="Search the People's Directory, or type a new name">
                <div className="relative">
                  <TextInput
                    required
                    value={form.fullName}
                    onChange={e => {
                      const q = e.target.value
                      set('fullName', q)
                      // Case-insensitive substring match against the resolved name (see
                      // directoryEntryName above) — matches anywhere in the name, not just
                      // the start, so "ronald" finds "Ronald" and "J. Ronald Smith" alike.
                      const needle = q.trim().toLowerCase()
                      const hits = needle
                        ? membersList.filter(m => m.name.toLowerCase().includes(needle)).slice(0, 25)
                        : []
                      setNameSuggestions(hits)
                      setShowNameSuggestions(hits.length > 0)
                    }}
                    onFocus={() => { if (nameSuggestions.length > 0) setShowNameSuggestions(true) }}
                    onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                    placeholder="Type to search or enter a new name…"
                    autoComplete="off"
                  />
                  {showNameSuggestions && (
                    <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                      {nameSuggestions.map(m => (
                        <li
                          key={m._key}
                          onMouseDown={() => applyDirectoryMatch(m)}
                          className="px-3 py-2 hover:bg-emerald-50 cursor-pointer"
                        >
                          <span className="text-sm font-medium text-slate-800">{m.name}</span>
                          {(m.phone || m.membershipNumber) && (
                            <span className="ml-2 text-xs text-slate-400">{m.phone || m.membershipNumber}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>
              <Field label="Date of birth"><TextInput type="date" value={form.dob} onChange={e => set('dob', e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone number"><TextInput value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
                <Field label="Email address"><TextInput type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current Place"><TextInput value={form.currentPlace} onChange={e => set('currentPlace', e.target.value)} /></Field>
                <Field label="Coming From"><TextInput value={form.comingFrom} onChange={e => set('comingFrom', e.target.value)} /></Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-1">II. About Our Church</h3>

              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mt-3 mb-1">Cell Group Details</p>
              <Field label="Which Cell Group do you belong to?">
                <select
                  value={form.cellGroup}
                  onChange={e => set('cellGroup', e.target.value)}
                  disabled={loadingCellGroups}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                >
                  <option value="">{loadingCellGroups ? 'Loading cell groups…' : 'Select a cell group…'}</option>
                  {cellGroups.map(g => (
                    <option key={g.id} value={g.cellName}>{g.cellName}</option>
                  ))}
                </select>
                {!loadingCellGroups && cellGroupsError && (
                  <p className="text-xs text-red-500 mt-1">Couldn't load the cell group list. You can leave this blank for now — your Worship Director can fill it in later.</p>
                )}
                {!loadingCellGroups && !cellGroupsError && cellGroups.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">No cell groups found yet. You can leave this blank for now.</p>
                )}
              </Field>
              <Field label="Are you a regular cell attendee?">
                <RadioGroup options={['Yes', 'No']} value={form.regularCellAttendee} onChange={v => set('regularCellAttendee', v)} />
              </Field>

              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mt-4 mb-1">Church Attendance &amp; Membership</p>
              <Field label="Are you a permanent member of the church?">
                <RadioGroup options={['Yes', 'No']} value={form.permanentMember} onChange={v => set('permanentMember', v)} />
              </Field>
              <Field label="How long have you been attending the church?" hint="e.g. 2 years, 6 months">
                <TextInput value={form.churchAttendanceDuration} onChange={e => set('churchAttendanceDuration', e.target.value)} />
              </Field>

              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 mt-4 mb-1">Worship Feedback</p>
              <Field label="How do you rate our worship?">
                <StarRating value={form.worshipRating} onChange={v => set('worshipRating', v)} />
              </Field>
              <Field label="What is the best part of our church worship?">
                <RadioGroup options={WORSHIP_BEST_PART_OPTIONS} value={form.worshipBestPart} onChange={v => set('worshipBestPart', v)} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-1">III. Spiritual Journey &amp; Church Involvement</h3>
              <Field label="In a few sentences, how did you come to faith?"><TextArea rows={3} value={form.testimony} onChange={e => set('testimony', e.target.value)} /></Field>
              <Field label="Have you been baptised by immersion?">
                <RadioGroup options={['Yes', 'No', 'Not yet, but I’d like to be']} value={form.baptised} onChange={v => set('baptised', v)} />
              </Field>
              <Field label="Are you anointed by the Holy Spirit?">
                <RadioGroup options={['Yes', 'No']} value={form.anointedByHolySpirit} onChange={v => set('anointedByHolySpirit', v)} />
              </Field>
              <Field label="Have you engaged in ministry before?">
                <RadioGroup options={['Yes', 'No']} value={form.ministryExperience} onChange={v => set('ministryExperience', v)} />
              </Field>
              {form.ministryExperience === 'Yes' && (
                <>
                  <Field label="Duration / How long?" hint="e.g. 2 years, 6 months"><TextInput value={form.ministryDuration} onChange={e => set('ministryDuration', e.target.value)} /></Field>
                  <Field label="Area of Ministry">
                    <RadioGroup options={MINISTRY_AREA_OPTIONS} value={form.ministryArea} onChange={v => set('ministryArea', v)} />
                  </Field>
                  {form.ministryArea === 'Other Ministry Area' && (
                    <Field label="Please specify"><TextInput value={form.ministryAreaOther} onChange={e => set('ministryAreaOther', e.target.value)} /></Field>
                  )}
                </>
              )}
              <Field label="What inspired you to be part of the Worship Ministry?"><TextArea rows={3} value={form.worshipInspiration} onChange={e => set('worshipInspiration', e.target.value)} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-1">IV. Musical &amp; Technical Profile</h3>
              <Field label="Instrument(s) or vocal part(s)"><CheckboxGroup options={INSTRUMENT_OPTIONS} values={form.primaryInstruments} onToggle={v => toggle('primaryInstruments', v)} /></Field>
              {form.primaryInstruments.length > 0 && (
                <div className="space-y-2.5 py-3 border-b border-slate-100">
                  {form.primaryInstruments.map(inst => (
                    <InstrumentDetailPanel
                      key={inst}
                      instrument={inst}
                      details={form.instrumentDetails[inst] || {}}
                      onChange={patch => updateInstrumentDetail(inst, patch)}
                    />
                  ))}
                </div>
              )}
              <Field label="Can you read standard notation, Nashville numbers, or chord charts?"><CheckboxGroup options={READING_OPTIONS} values={form.readingAbility} onToggle={v => toggle('readingAbility', v)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Years of experience"><TextInput value={form.yearsExperience} onChange={e => set('yearsExperience', e.target.value)} /></Field>
                <Field label="Formal training, if any"><TextInput value={form.formalTraining} onChange={e => set('formalTraining', e.target.value)} /></Field>
              </div>
              <Field label="Portfolio or audition recording link"><TextInput type="url" placeholder="YouTube, Drive, or SoundCloud link" value={form.portfolioLink} onChange={e => set('portfolioLink', e.target.value)} /></Field>
              <Field label="Comfortable vocal range or preferred instrument key" hint="Vocalists / keys / guitar"><TextInput value={form.vocalRange} onChange={e => set('vocalRange', e.target.value)} /></Field>
            </div>
          )}

          {step === 4 && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800 mb-1">V. Availability &amp; Commitment</h3>
                <Field label="Available for special events, conferences, or extra call-times?"><RadioGroup options={['Yes', 'With advance notice', 'Limited availability']} value={form.specialEvents} onChange={v => set('specialEvents', v)} /></Field>
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.attendPractices} onChange={e => set('attendPractices', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  I will attend all practices that are conducted.
                </label>
                <label className="flex items-center gap-2 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.attendRehearsals} onChange={e => set('attendRehearsals', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  I will attend the rehearsals that are conducted.
                </label>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800 mb-1">VI. Heart for Worship &amp; Alignment</h3>
                <Field label="In your own words, what is worship?"><TextArea rows={3} value={form.worshipDefinition} onChange={e => set('worshipDefinition', e.target.value)} /></Field>
                <Field label="How do you typically respond to correction or feedback during rehearsal?"><TextArea rows={2} value={form.feedbackResponse} onChange={e => set('feedbackResponse', e.target.value)} /></Field>

                <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-slate-700 leading-relaxed">
                  <strong>Team Covenant.</strong> I understand that serving on the worship team is a position of spiritual leadership.
                  I commit to pursuing personal integrity, submitting to the Worship Director's direction and correction, arriving
                  prepared and on time, and treating my fellow team members with honor both on and off the platform.
                </div>
                <label className="flex items-center gap-2 mt-3 text-sm text-slate-700">
                  <input type="checkbox" checked={form.covenantAgree} onChange={e => set('covenantAgree', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                  I have read and agree to the team covenant above *
                </label>
                <Field label="Signature *" hint="Draw your signature below">
                  <SignaturePad value={form.signatureDataUrl} onChange={v => set('signatureDataUrl', v)} />
                </Field>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {stepError && (
        <p className="text-sm text-red-600 text-center px-1">{stepError}</p>
      )}

      <div className="flex gap-3 px-1">
        {step === 0 ? (
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        ) : (
          <button type="button" onClick={handleBack} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={handleNext}
            className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all active:scale-[0.98]">
            Next
          </button>
        ) : (
          <button type="submit" disabled={!canSubmit || submitting}
            className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-all active:scale-[0.98]">
            {submitting ? 'Submitting…' : 'Submit Application'}
          </button>
        )}
      </div>
    </form>
  )
}

// ── Thank-you screen — applicant-facing, no admin data visible ──
function ThankYou({ onDone }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <Check size={28} className="text-emerald-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">Application received</h2>
      <p className="text-sm text-slate-500 max-w-xs">Thank you! Your Worship Director will review this and follow up with you.</p>
      <button type="button" onClick={onDone} className="mt-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50">
        Done — hand back to Director
      </button>
    </div>
  )
}

const SCREENING_RECOMMENDATIONS = ['Ready for Main Roster', 'Needs Training / Sub List', 'Not Ready']

const DEFAULT_SCREENING = {
  pitchAccuracy: 0,
  rhythmTiming: 0,
  livePlaySingDone: false,
  livePlaySingScore: 0,
  earTraining: '',
  instrumentalProficiency: 0,
  dynamicSensitivity: '',
  chartFollowing: '',
  stagePresence: 0,
  coachability: '',
  recommendation: '',
  notes: '',
}

// ── Screening evaluation modal — the 10-question live audition checklist a reviewer
// fills in while the applicant is actually singing/playing in front of them. Kept as
// its own small form (not reusing the applicant-facing Field/CheckboxGroup styling
// wholesale) so it reads clearly as a reviewer tool, not another applicant page.
// Doubles as the edit view: when `app.screening` already exists (a prior submission),
// the form starts pre-filled with those answers instead of blank. ──
function ScreeningModal({ app, onClose, onSubmit }) {
  const [form, setForm] = useState({ ...DEFAULT_SCREENING, ...(app.screening || {}) })
  const [saving, setSaving] = useState(false)
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const canSubmit = !!form.recommendation

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      await onSubmit(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="rol-solid bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              {app.screening ? 'Edit Screening Evaluation' : 'Screening Evaluation'}
            </p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{app.fullName}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 dark:hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 divide-y divide-slate-200 dark:divide-slate-700">
        <ScreeningItem label="1. Pitch Accuracy &amp; Vocal Control" hint="Can the applicant maintain pitch and key stability while singing?">
          <StarRating value={form.pitchAccuracy} onChange={v => set('pitchAccuracy', v)} />
        </ScreeningItem>
        <ScreeningItem label="2. Rhythm &amp; Timing" hint="Does the applicant stay in tempo with the metronome or backing track?">
          <StarRating value={form.rhythmTiming} onChange={v => set('rhythmTiming', v)} />
        </ScreeningItem>
        <ScreeningItem label="3. Live Play &amp; Sing Assessment" hint="Ask the applicant to play their primary instrument and sing simultaneously.">
          <label className="flex items-center gap-2 text-sm text-slate-900 dark:text-white mb-2">
            <input type="checkbox" checked={form.livePlaySingDone} onChange={e => set('livePlaySingDone', e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            Completed the live play-and-sing assessment
          </label>
          <StarRating value={form.livePlaySingScore} onChange={v => set('livePlaySingScore', v)} />
        </ScreeningItem>
        <ScreeningItem label="4. Ear Training &amp; Harmony" hint="Can the applicant identify or match a simple harmony interval by ear?">
          <RadioGroup options={['Pass', 'Fail']} value={form.earTraining} onChange={v => set('earTraining', v)} />
        </ScreeningItem>
        <ScreeningItem label="5. Instrumental Proficiency" hint="How fluid and accurate is their instrumental technique/chord transitions?">
          <StarRating value={form.instrumentalProficiency} onChange={v => set('instrumentalProficiency', v)} />
        </ScreeningItem>
        <ScreeningItem label="6. Dynamic Sensitivity" hint="Does the applicant demonstrate awareness of musical dynamics (soft/loud builds)?">
          <RadioGroup options={['Pass', 'Fail']} value={form.dynamicSensitivity} onChange={v => set('dynamicSensitivity', v)} />
        </ScreeningItem>
        <ScreeningItem label="7. Sight-Reading / Chart Following" hint="Can they follow a basic chord sheet or lead sheet during the live test?">
          <RadioGroup options={['Pass', 'Fail']} value={form.chartFollowing} onChange={v => set('chartFollowing', v)} />
        </ScreeningItem>
        <ScreeningItem label="8. Stage Presence &amp; Expression" hint="Is their demeanor engaging, relaxed, and worshipful?">
          <StarRating value={form.stagePresence} onChange={v => set('stagePresence', v)} />
        </ScreeningItem>
        <ScreeningItem label="9. Coachability &amp; Feedback Response" hint="How well do they adapt when asked to adjust tempo, key, or style on the spot?">
          <RadioGroup options={['Pass', 'Fail']} value={form.coachability} onChange={v => set('coachability', v)} />
        </ScreeningItem>
        <ScreeningItem label="10. Overall Readiness &amp; Recommendation *">
          <select
            value={form.recommendation}
            onChange={e => set('recommendation', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            <option value="">Select a recommendation…</option>
            {SCREENING_RECOMMENDATIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </ScreeningItem>
        <ScreeningItem label="Evaluation notes (optional)">
          <TextArea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional observations from the screening…" />
        </ScreeningItem>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit || saving}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-all active:scale-[0.98]">
            {saving ? 'Saving…' : app.screening ? 'Save Changes' : 'Submit Screening'}
          </button>
        </div>
      </form>
    </div>
  )
}

// One rating criterion inside ScreeningModal — higher-contrast than the shared
// applicant-facing Field; separators come from the parent's divide-y.
function ScreeningItem({ label, hint, children }) {
  return (
    <div className="py-4">
      <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-1">{label}</label>
      {hint && <p className="text-[13px] leading-snug text-slate-600 dark:text-slate-300 mb-2.5">{hint}</p>}
      {children}
    </div>
  )
}

const scaleOf5 = (n) => n ? `${n} / 5` : '—'

function safeFileNamePart(name) {
  return (name || 'applicant').trim().replace(/[^\w\- ]/g, '').replace(/\s+/g, '-') || 'applicant'
}

// Renders the full application form + (if present) the 10-point screening evaluation
// as a formal church-letterhead document and hands it to the browser's native print
// dialog (same "self-contained HTML string in a new window, @page CSS, window.print()
// on load" pattern DepartmentHub.jsx's PCS profile export uses) — no PDF library
// dependency, and "Save as PDF" in the print dialog produces the actual download.
const NAVY = '#1a365d'
const GOLD = '#c9a961'

// The project's actual church logo (src/assets, already used in Sidebar.jsx) —
// converted to a base64 data URI and cached, rather than referenced by its bundled
// URL, since a print window opened via window.open('') + document.write() can't
// reliably resolve an ordinary <img src> against the popup's own (blank) document,
// and a data URI sidesteps that entirely — same reason the Welcome Card canvas draws
// it as a pre-loaded Image element instead of setting a plain URL as its src.
let logoDataUrlPromise = null
function getLogoDataUrl() {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(rolccLogo)
      .then(res => res.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      }))
  }
  return logoDataUrlPromise
}

// Loads an image source (a data URI here) into an HTMLImageElement the canvas can
// drawImage() — a data URI never taints the canvas the way a cross-origin URL could,
// so the later toBlob('image/jpeg') call stays safe regardless of hosting.
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

async function downloadApplicationPDF(app) {
  const logoDataUrl = await getLogoDataUrl()
  const fmtDate = (d) => {
    if (!d) return null
    const parsed = new Date(d)
    return isNaN(parsed.getTime()) ? null : format(parsed, 'd MMM yyyy')
  }

  const field = (label, value) => (value === '' || value === null || value === undefined) ? '' : `
    <div style="padding:3px 0;border-bottom:1px solid #eef1f4;page-break-inside:avoid;break-inside:avoid">
      <div style="font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8a94a6;margin-bottom:1px">${label}</div>
      <div style="font-size:9px;color:#1f2937;font-weight:500;line-height:1.25">${value}</div>
    </div>`

  const subGroup = (title, contentHtml) => !contentHtml ? '' : `
    <div style="margin-bottom:6px;page-break-inside:avoid;break-inside:avoid">
      <div style="font-size:7.5px;font-weight:700;color:${NAVY};margin-bottom:2px">${title}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">${contentHtml}</div>
    </div>`

  const sectionHeader = (numeral, title) => `
    <div style="display:flex;align-items:baseline;gap:6px;border-bottom:1.5px solid ${NAVY};padding-bottom:3px;margin:10px 0 6px;page-break-inside:avoid;break-inside:avoid">
      <span style="font-size:10px;font-weight:800;color:${GOLD}">${numeral}.</span>
      <span style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${NAVY}">${title}</span>
    </div>`

  const statusLabel = app.status === 'screened' ? 'Screening Completed' : app.status === 'reviewed' ? 'Reviewed' : 'Pending Review'
  const submissionDate = fmtDate(app.applicationDate) || '—'
  const evaluatorEmail = app.screening?.screenedBy || 'Not yet evaluated'

  const personalInfo = subGroup('Personal Information',
    field('Date of Birth', fmtDate(app.dob)) +
    field('Phone', app.phone) +
    field('Email', app.email) +
    field('Current Place', app.currentPlace) +
    field('Coming From', app.comingFrom)
  )
  const churchBackground = subGroup('Church Background',
    field('Cell Group', app.cellGroup) +
    field('Regular Cell Attendee', app.regularCellAttendee) +
    field('Permanent Member', app.permanentMember) +
    field('Attending the Church For', app.churchAttendanceDuration) +
    field('Worship Rating', app.worshipRating ? `${app.worshipRating} / 5` : '') +
    field('Best Part of Our Worship', app.worshipBestPart)
  )
  const spiritualJourney = subGroup('Spiritual Journey',
    field('Testimony', app.testimony) +
    field('Baptised', app.baptised) +
    field('Anointed by the Holy Spirit', app.anointedByHolySpirit) +
    field('Ministry Experience', app.ministryExperience) +
    field('Duration', app.ministryDuration) +
    field('Area of Ministry', app.ministryArea === 'Other Ministry Area' ? app.ministryAreaOther : app.ministryArea) +
    field('Inspiration for Worship Ministry', app.worshipInspiration)
  )
  const musicalProfile = subGroup('Musical &amp; Technical Profile',
    field('Instrument(s) or Vocal Part(s)', (app.primaryInstruments || []).join(', ')) +
    field('Reading Ability', (app.readingAbility || []).join(', ')) +
    field('Years of Experience', app.yearsExperience) +
    field('Formal Training', app.formalTraining) +
    field('Portfolio Link', app.portfolioLink) +
    field('Vocal Range / Key', app.vocalRange)
  )

  const availabilityCommitment =
    field('Special Events', app.specialEvents) +
    field('Will Attend All Practices', app.attendPractices ? 'Yes' : 'No') +
    field('Will Attend Rehearsals', app.attendRehearsals ? 'Yes' : 'No')

  const alignmentCovenant =
    field('Definition of Worship', app.worshipDefinition) +
    field('Response to Feedback', app.feedbackResponse) +
    field('Covenant Agreed', app.covenantAgree ? 'Yes' : 'No')
  const signatureBlock = app.signatureDataUrl ? `
    <div style="margin-top:4px;page-break-inside:avoid;break-inside:avoid">
      <div style="font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8a94a6;margin-bottom:2px">Signature</div>
      <img src="${app.signatureDataUrl}" style="height:32px;border-bottom:1px solid #d1d5db" />
    </div>` : ''

  let screeningSectionHtml = ''
  if (app.screening) {
    const s = app.screening
    screeningSectionHtml = sectionHeader('IV', 'Screening Evaluation Report') + `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
        ${field('Pitch Accuracy &amp; Vocal Control', scaleOf5(s.pitchAccuracy))}
        ${field('Rhythm &amp; Timing', scaleOf5(s.rhythmTiming))}
        ${field('Live Play &amp; Sing Assessment', `${s.livePlaySingDone ? 'Completed' : 'Not completed'} — ${scaleOf5(s.livePlaySingScore)}`)}
        ${field('Ear Training &amp; Harmony', s.earTraining)}
        ${field('Instrumental Proficiency', scaleOf5(s.instrumentalProficiency))}
        ${field('Dynamic Sensitivity', s.dynamicSensitivity)}
        ${field('Sight-Reading / Chart Following', s.chartFollowing)}
        ${field('Stage Presence &amp; Expression', scaleOf5(s.stagePresence))}
        ${field('Coachability &amp; Feedback Response', s.coachability)}
      </div>
      <div style="margin-top:4px;padding:6px 8px;background:#f7f5ef;border:1px solid ${GOLD};border-radius:4px;page-break-inside:avoid;break-inside:avoid">
        <div style="font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#8a6d1f;margin-bottom:1px">Overall Recommendation</div>
        <div style="font-size:10px;font-weight:800;color:${NAVY}">${s.recommendation || '—'}</div>
      </div>
      ${field('Evaluation Notes', s.notes)}
      ${field('Screened By', s.screenedBy)}
    `
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${safeFileNamePart(app.fullName)}-application</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    @page { size:A4 portrait; margin:12mm; }
    html,body { font-family:'Segoe UI',Arial,sans-serif; font-size:9.5pt; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    body { color:#1f2937; max-width:180mm; margin:0 auto; }
    @media print { .no-print{display:none!important} * {-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important} }
  </style></head><body>

    <!-- Formal letterhead header -->
    <div style="display:flex;align-items:center;gap:10px;background:${NAVY};padding:8px 14px;border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <img src="${logoDataUrl}" alt="River Of Life Christian Church" style="height:34px;width:auto;max-width:34px;object-fit:contain;flex-shrink:0;display:block" />
      <div>
        <div style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#ffffff;line-height:1.1">River Of Life Christian Church</div>
        <div style="font-size:8.5px;font-weight:500;color:${GOLD};margin-top:1px;letter-spacing:.02em">Worship Ministry Candidate Application &amp; Evaluation</div>
      </div>
    </div>

    <!-- Candidate summary highlight box -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;background:#f8fafc;border:1px solid #dbe2ea;border-radius:4px;padding:6px 12px;margin-top:6px;page-break-inside:avoid;break-inside:avoid">
      ${field('Candidate Name', app.fullName || '—')}
      ${field('Form Status', statusLabel)}
      ${field('Submission Date', submissionDate)}
      ${field('Evaluator Email', evaluatorEmail)}
    </div>

    ${sectionHeader('I', 'Personal Information')}
    ${personalInfo}
    ${churchBackground}
    ${spiritualJourney}
    ${musicalProfile}

    ${sectionHeader('II', 'Availability &amp; Commitment')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">${availabilityCommitment}</div>

    ${sectionHeader('III', 'Alignment &amp; Covenant')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">${alignmentCovenant}</div>
    ${signatureBlock}

    ${screeningSectionHtml}

    <!-- Formal footer -->
    <div style="margin-top:8px;padding-top:4px;border-top:1px solid #d1d5db;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid;break-inside:avoid">
      <span style="font-size:6.5px;color:#9ca3af">River Of Life Christian Church &bull; Confidential Ministry Application Document</span>
      <span style="font-size:6.5px;color:#9ca3af">Generated ${format(new Date(), 'd MMM yyyy, h:mm a')}</span>
    </div>

    <script>window.onload=function(){window.print()}<\/script>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=750')
  if (!win) throw new Error('Pop-up blocked — please allow pop-ups for this site to download the PDF.')
  win.document.write(html)
  win.document.close()
}

// Draws a shareable "welcome to the team" image card straight onto a canvas (same
// raw Canvas 2D + toBlob('image/jpeg') pattern already used for the worship plan
// export elsewhere in this file) — no DOM screenshot library needed since every
// element here is drawn directly, giving full control over layout without the
// fidelity/async-font quirks html2canvas can introduce.
async function downloadWelcomeCardJPEG(app) {
  const logoImg = await loadImageElement(await getLogoDataUrl())
  const s = app.screening || {}
  const W = 800, HEADER_H = 230, PAD = 56
  const summaryRows = [
    ['Pitch accuracy & vocal control', scaleOf5(s.pitchAccuracy)],
    ['Rhythm & timing', scaleOf5(s.rhythmTiming)],
    ['Instrumental proficiency', scaleOf5(s.instrumentalProficiency)],
    ['Stage presence & expression', scaleOf5(s.stagePresence)],
  ].filter(([, v]) => v !== '—')
  const ROW_H = 40
  const H = HEADER_H + 180 + summaryRows.length * ROW_H + (s.recommendation ? 70 : 20) + 60

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.textBaseline = 'alphabetic'

  // Background
  ctx.fillStyle = '#f0fdf4'
  ctx.fillRect(0, 0, W, H)

  // Header gradient banner
  const grad = ctx.createLinearGradient(0, 0, W, HEADER_H)
  grad.addColorStop(0, '#059669')
  grad.addColorStop(1, '#065f46')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, HEADER_H)

  // Official church logo — left-aligned, scaled to a fixed height with its natural
  // aspect ratio preserved so it isn't stretched/clipped.
  const logoH = 40
  const logoW = logoH * (logoImg.naturalWidth / logoImg.naturalHeight || 1)
  ctx.drawImage(logoImg, PAD, 22, logoW, logoH)

  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = 'bold 15px Arial, sans-serif'
  ctx.fillText('RIVER OF LIFE CHURCH · WORSHIP MINISTRY', W / 2, 46)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 30px Arial, sans-serif'
  ctx.fillText('WELCOME TO THE TEAM', W / 2, 92)

  // Avatar initial
  ctx.beginPath()
  ctx.arc(W / 2, 155, 38, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.fillStyle = '#059669'
  ctx.font = 'bold 32px Arial, sans-serif'
  ctx.fillText((app.fullName || '?').trim().charAt(0).toUpperCase(), W / 2, 167)

  // Name, role, date joined
  ctx.fillStyle = '#064e3b'
  ctx.font = 'bold 30px Arial, sans-serif'
  ctx.fillText(app.fullName || '', W / 2, HEADER_H + 50)

  ctx.fillStyle = '#059669'
  ctx.font = '600 17px Arial, sans-serif'
  ctx.fillText((app.primaryInstruments || []).join(' · ') || 'Worship Team Member', W / 2, HEADER_H + 80)

  ctx.fillStyle = '#6b7280'
  ctx.font = '14px Arial, sans-serif'
  ctx.fillText(`Joined ${format(new Date(), 'd MMMM yyyy')}`, W / 2, HEADER_H + 106)

  // Divider
  ctx.strokeStyle = '#d1fae5'
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H + 130)
  ctx.lineTo(W - PAD, HEADER_H + 130)
  ctx.stroke()

  // Screening summary rows
  ctx.textAlign = 'left'
  ctx.fillStyle = '#065f46'
  ctx.font = 'bold 14px Arial, sans-serif'
  ctx.fillText('SCREENING SUMMARY', PAD, HEADER_H + 160)

  let y = HEADER_H + 190
  summaryRows.forEach(([label, val], i) => {
    ctx.fillStyle = i % 2 === 0 ? '#ecfdf5' : '#ffffff'
    ctx.fillRect(PAD - 14, y - 24, W - 2 * (PAD - 14), ROW_H)
    ctx.fillStyle = '#374151'
    ctx.font = '14px Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, PAD, y)
    ctx.fillStyle = '#059669'
    ctx.font = 'bold 14px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(val, W - PAD, y)
    y += ROW_H
  })

  if (s.recommendation) {
    ctx.fillStyle = '#d1fae5'
    ctx.fillRect(PAD - 14, y - 22, W - 2 * (PAD - 14), 46)
    ctx.fillStyle = '#065f46'
    ctx.font = 'bold 15px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.recommendation, W / 2, y + 8)
    y += 46
  }

  // Footer
  ctx.fillStyle = '#059669'
  ctx.fillRect(0, H - 44, W, 44)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '12px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Generated by ROL Admin App', W / 2, H - 18)

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  const filename = `${safeFileNamePart(app.fullName)}-welcome-card.jpg`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ── Read-only detail view for a submitted application (Director-only) ──
const STATUS_BADGE = {
  approved: ['Approved · On the Team', 'bg-indigo-50 text-indigo-700'],
  screened: ['Screening Completed', 'bg-violet-50 text-violet-700'],
  reviewed: ['Reviewed', 'bg-emerald-50 text-emerald-700'],
}
const statusBadge = (status) => STATUS_BADGE[status] || ['Pending review', 'bg-amber-50 text-amber-700']

const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const lower = (v) => String(v || '').trim().toLowerCase()

// The People Directory id an application already carries: picked from the
// directory on the form (directoryPersonId / directoryVisitorId) or set by
// another flow (personId / peopleDirectoryId).
function linkedDirectoryIds(app) {
  return {
    personId: app.directoryPersonId || app.personId || app.peopleDirectoryId || '',
    visitorId: app.directoryVisitorId || '',
  }
}

/**
 * "Approve & Add to Worship Team": pick the roles they will serve in (pre-ticked
 * from their Musical & Technical Profile). No directory lookup happens here: an
 * application already linked to a People Directory record shows it locked, and
 * one that isn't gets matched or created when Approve is clicked (handleApprove).
 */
function ApproveToTeamModal({ app, onClose, onConfirm }) {
  const [positions, setPositions] = useState(() => (app.primaryInstruments || []).filter((p) => INSTRUMENT_OPTIONS.includes(p)))
  const [memberSince, setMemberSince] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const linked = linkedDirectoryIds(app)
  const recordId = linked.personId || linked.visitorId
  const toggle = (p) => setPositions((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const confirm = async () => {
    setError('')
    if (!positions.length) { setError('Pick at least one role.'); return }
    if (!app.fullName?.trim()) { setError('The application has no name.'); return }
    setBusy(true)
    try {
      await onConfirm({ positions, memberSince })
    } catch (e) {
      console.error('Approve & add to team failed', e)
      setError(e?.message || 'Could not add them to the team. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Approve and add to Worship Team"
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-indigo-600 text-white px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">Approve &amp; Add to Worship Team</p>
            <p className="text-xs text-white/80 truncate">{app.fullName}{app.screening?.recommendation ? ` · ${app.screening.recommendation}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center text-lg">×</button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">Roles on the team</p>
            <p className="text-[11px] text-slate-400 mb-2">Ticked from their Musical &amp; Technical Profile: {(app.primaryInstruments || []).join(', ') || 'none given'}.</p>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENT_OPTIONS.map((p) => (
                <button key={p} type="button" aria-pressed={positions.includes(p)} onClick={() => toggle(p)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${positions.includes(p) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'}`}>
                  {positions.includes(p) && <Check size={12} className="inline -mt-0.5 mr-1" />}{p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">People Directory record</p>
            {/* Locked: the name is pre-validated from the application submission. */}
            <div className="relative">
              <input type="text" readOnly disabled aria-readonly="true"
                value={`${app.fullName || ''}${app.phone ? ` · ${app.phone}` : ''}`}
                title="Pre-validated from the application submission — cannot be edited"
                className="w-full h-10 pl-3 pr-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold cursor-not-allowed truncate" />
              <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {recordId ? (
              <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400 truncate flex items-center gap-1"><Check size={12} className="shrink-0" />Linked · ID {recordId}</p>
            ) : (
              <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-400">Their People Directory record is matched (phone, then name) or created when you approve.</p>
            )}
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Member since</span>
            <input type="date" value={memberSince} onChange={(e) => setMemberSince(e.target.value)} className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="button" disabled={busy} onClick={confirm}
            className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Adding…' : 'Approve & Add to Team'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Compact label/value cell for the detail grid — `wide` spans the full card width
// (long free-text answers); everything else packs 2–3 to a row.
function KV({ label, value, wide }) {
  if (value === '' || value === null || value === undefined || (Array.isArray(value) && !value.length)) return null
  return (
    <div className={`min-w-0 ${wide ? 'col-span-full' : ''}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[13px] leading-snug text-slate-800 whitespace-pre-wrap break-words">{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
    </div>
  )
}

// Detail section card: an accordion on phones (tap the header), always open on
// md+ where the cards sit in a 2-column grid.
function DetailCard({ title, tone = 'slate', defaultOpen = false, className = '', children }) {
  const [open, setOpen] = useState(defaultOpen)
  const toneCls = tone === 'emerald' ? 'border-emerald-200' : 'border-slate-200'
  const titleCls = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-500'
  return (
    <section className={`bg-white rounded-xl border ${toneCls} ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left md:cursor-default">
        <h3 className={`flex-1 text-[11px] font-bold uppercase tracking-wider ${titleCls}`}>{title}</h3>
        <ChevronDown size={16} className={`md:hidden shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <dl className={`${open ? 'grid' : 'hidden'} md:grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 px-3.5 pb-3.5`}>
        {children}
      </dl>
    </section>
  )
}

const yesNo = (v) => (v ? 'Yes' : 'No')

function ApplicationDetail({ app, onBack, onMarkReviewed, onEditScreening, onApprove }) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingCard, setExportingCard] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const readyForRoster = app.screening?.recommendation === 'Ready for Main Roster'
  const canApprove = !!onApprove && (app.status === 'reviewed' || app.status === 'screened')
  const canMarkReviewed = app.status !== 'reviewed' && app.status !== 'approved'
  const [badgeLabel, badgeCls] = statusBadge(app.status)
  const s = app.screening

  const handleDownloadPdf = async () => {
    setExportingPdf(true)
    try {
      await downloadApplicationPDF(app)
    } catch (err) {
      console.error('Application PDF export failed:', err)
      alert('Failed to generate the application PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleDownloadCard = async () => {
    setExportingCard(true)
    try {
      await downloadWelcomeCardJPEG(app)
    } catch (err) {
      console.error('Welcome card export failed:', err)
      alert('Failed to generate the welcome card. Please try again.')
    } finally {
      setExportingCard(false)
    }
  }

  // The one primary decision for the current status: Approve once reviewed/screened,
  // Mark as Reviewed while pending, nothing once approved.
  const primary = canApprove
    ? { label: 'Approve & Add to Team', onClick: () => onApprove(app), cls: 'bg-indigo-600 hover:bg-indigo-700' }
    : canMarkReviewed
      ? { label: 'Mark as Reviewed', onClick: () => onMarkReviewed(app), cls: 'bg-emerald-600 hover:bg-emerald-700' }
      : null
  const screeningBtn = { label: s ? 'Edit Screening' : 'Take Screening', onClick: () => onEditScreening(app), cls: s ? 'bg-violet-600 hover:bg-violet-700' : 'bg-amber-500 hover:bg-amber-600' }
  // Both exports live behind one Download icon menu (header on md+, phone bar below).
  // The Welcome Card stays listed but disabled until screening says "Ready for Main
  // Roster", so it's discoverable rather than silently missing.
  const downloads = [
    { key: 'pdf', label: exportingPdf ? 'Generating…' : 'Download PDF', hint: 'Application details', Icon: FileText, onClick: handleDownloadPdf, disabled: exportingPdf },
    { key: 'card', label: exportingCard ? 'Generating…' : 'Download Welcome Card', hint: readyForRoster ? 'JPEG image' : 'Needs a "Ready for Main Roster" screening', Icon: ImageIcon, onClick: handleDownloadCard, disabled: exportingCard || !readyForRoster },
  ]
  const busyDownloading = exportingPdf || exportingCard
  const downloadMenu = (placement) => (
    <AnimatePresence>
      {downloadOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDownloadOpen(false)} aria-hidden />
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: placement === 'down' ? -6 : 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'down' ? -6 : 6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute right-0 z-50 w-64 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden ${placement === 'down' ? 'top-full mt-1.5 origin-top-right' : 'bottom-full mb-2 origin-bottom-right'}`}
          >
            {downloads.map((item) => (
              <button key={item.key} type="button" role="menuitem" disabled={item.disabled}
                onClick={() => { setDownloadOpen(false); item.onClick() }}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left border-b border-slate-100 last:border-b-0 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                <item.Icon size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
                  <span className="block text-[11px] text-slate-500">{item.hint}</span>
                </span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  const quickFacts = [
    app.cellGroup && ['Cell', app.cellGroup],
    app.regularCellAttendee && ['Regular attendee', app.regularCellAttendee],
    app.worshipRating && ['Worship rating', `${app.worshipRating}/5`],
    app.primaryInstruments?.length && ['Serves as', app.primaryInstruments.join(', ')],
    app.yearsExperience && ['Experience', app.yearsExperience],
    s?.recommendation && ['Screening', s.recommendation],
  ].filter(Boolean)

  return (
    <div className="pb-24 md:pb-6">
      {/* Header — sticky on md+ with every action at the top right; on phones the
          actions live in the floating bar at the bottom instead. */}
      <div className="md:sticky md:top-[calc(3rem_+_env(safe-area-inset-top,24px))] lg:top-16 z-20 -mx-1 px-1 py-2 mb-3 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to list" className="shrink-0 -ml-2.5 w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-all active:scale-95">
            <ArrowLeft size={20} strokeWidth={2.25} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 truncate">{app.fullName}</h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className={`px-2 py-0.5 rounded-full font-semibold ${badgeCls}`}>{badgeLabel}</span>
              {app.applicationDate && <span className="truncate">Applied {format(new Date(app.applicationDate), 'd MMM yyyy')}</span>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <button type="button" onClick={() => setDownloadOpen((o) => !o)} disabled={busyDownloading}
                aria-label="Download" title="Download" aria-haspopup="menu" aria-expanded={downloadOpen}
                className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border transition-colors disabled:opacity-60 ${downloadOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {busyDownloading ? <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Download size={15} />}
              </button>
              {downloadMenu('down')}
            </div>
            <button type="button" onClick={screeningBtn.onClick} className={`px-3 py-1.5 rounded-lg text-white text-xs font-semibold ${screeningBtn.cls}`}>{screeningBtn.label}</button>
            {primary && (
              <button type="button" onClick={primary.onClick} className={`px-3.5 py-1.5 rounded-lg text-white text-xs font-bold shadow-sm ${primary.cls}`}>
                {canApprove ? '✔ ' : ''}{primary.label}
              </button>
            )}
          </div>
        </div>
      </div>

      {app.status === 'approved' && (
        <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-[13px] text-indigo-900">
          ✔ Approved{app.approvedBy ? ` by ${app.approvedBy}` : ''}{app.approvedAt ? ` on ${format(new Date(app.approvedAt), 'd MMM yyyy')}` : ''} and added to The Team
          {app.approvedPositions?.length ? ` as ${app.approvedPositions.join(', ')}` : ''}.
        </div>
      )}

      {/* Overview — contact details + the at-a-glance facts as one inline strip. */}
      <section className="mb-3 bg-white rounded-xl border border-slate-200 p-3.5">
        {quickFacts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {quickFacts.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px]">
                <span className="text-slate-400">{k}:</span><span className="font-semibold text-slate-700">{v}</span>
              </span>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-2">
          <KV label="Date of birth" value={app.dob} />
          <KV label="Phone" value={app.phone} />
          <KV label="Email" value={app.email} />
          <KV label="Current place" value={app.currentPlace} />
          <KV label="Coming from" value={app.comingFrom} />
        </dl>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
        <DetailCard title="Church & Cell" defaultOpen>
          <KV label="Cell group" value={app.cellGroup} />
          <KV label="Regular attendee" value={app.regularCellAttendee} />
          <KV label="Permanent member" value={app.permanentMember} />
          <KV label="Attending for" value={app.churchAttendanceDuration} />
          <KV label="Worship rating" value={app.worshipRating ? `${app.worshipRating} / 5` : ''} />
          <KV label="Best part of our worship" value={app.worshipBestPart} wide />
        </DetailCard>

        <DetailCard title="Musical & Technical Profile">
          <KV label="Instrument(s) / vocal part(s)" value={app.primaryInstruments} wide />
          {(app.primaryInstruments || []).map((inst) => {
            const d = app.instrumentDetails?.[inst]
            if (!d) return null
            const bits = [
              d.duration && `${d.duration} experience`,
              d.coaching && `Coaching: ${d.coaching}${d.coaching === 'Yes' && d.coachingYears ? ` (${d.coachingYears})` : ''}`,
              d.certified && `Certified: ${d.certified}${d.certified === 'Yes' && d.certificationDetails ? ` (${d.certificationDetails})` : ''}`,
            ].filter(Boolean).join(' · ')
            return <KV key={inst} label={inst} value={bits} wide />
          })}
          <KV label="Reading ability" value={app.readingAbility} />
          <KV label="Years of experience" value={app.yearsExperience} />
          <KV label="Formal training" value={app.formalTraining} />
          <KV label="Vocal range / key" value={app.vocalRange} />
          {app.portfolioLink && (
            <div className="col-span-full min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Portfolio</dt>
              <dd className="text-[13px] truncate">
                {/^https?:\/\//.test(app.portfolioLink)
                  ? <a href={app.portfolioLink} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{app.portfolioLink}</a>
                  : app.portfolioLink}
              </dd>
            </div>
          )}
        </DetailCard>

        <DetailCard title="Spiritual Journey" className="md:col-span-2">
          <KV label="Baptised" value={app.baptised} />
          <KV label="Anointed by the Holy Spirit" value={app.anointedByHolySpirit} />
          <KV label="Ministry experience" value={app.ministryExperience} />
          <KV label="Duration" value={app.ministryDuration} />
          <KV label="Area of ministry" value={app.ministryArea === 'Other Ministry Area' ? app.ministryAreaOther : app.ministryArea} />
          <KV label="Testimony" value={app.testimony} wide />
          <KV label="Inspiration for worship ministry" value={app.worshipInspiration} wide />
        </DetailCard>

        <DetailCard title="Availability & Commitment">
          <KV label="Attends all practices" value={yesNo(app.attendPractices)} />
          <KV label="Attends rehearsals" value={yesNo(app.attendRehearsals)} />
          <KV label="Special events" value={app.specialEvents} wide />
        </DetailCard>

        <DetailCard title="Heart for Worship & Alignment">
          <KV label="Covenant agreed" value={yesNo(app.covenantAgree)} />
          <KV label="Definition of worship" value={app.worshipDefinition} wide />
          <KV label="Response to feedback" value={app.feedbackResponse} wide />
          {app.signatureDataUrl && (
            <div className="col-span-full">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Signature</dt>
              <dd><img src={app.signatureDataUrl} alt="Applicant signature" className="max-h-14 max-w-[220px] border-b border-slate-300" /></dd>
            </div>
          )}
        </DetailCard>

        {s && (
          <DetailCard title="Screening Evaluation" tone="emerald" className="md:col-span-2" defaultOpen>
            <KV label="Pitch & vocal control" value={scaleOf5(s.pitchAccuracy)} />
            <KV label="Rhythm & timing" value={scaleOf5(s.rhythmTiming)} />
            <KV label="Live play & sing" value={`${s.livePlaySingDone ? 'Done' : 'Not done'} · ${scaleOf5(s.livePlaySingScore)}`} />
            <KV label="Instrumental proficiency" value={scaleOf5(s.instrumentalProficiency)} />
            <KV label="Stage presence" value={scaleOf5(s.stagePresence)} />
            <KV label="Ear training & harmony" value={s.earTraining} />
            <KV label="Dynamic sensitivity" value={s.dynamicSensitivity} />
            <KV label="Chart following" value={s.chartFollowing} />
            <KV label="Coachability" value={s.coachability} />
            <KV label="Recommendation" value={s.recommendation} />
            <KV label="Screened by" value={s.screenedBy} />
            <KV label="Evaluation notes" value={s.notes} wide />
          </DetailCard>
        )}
      </div>

      {/* Phone decision bar — floats above the bottom Departments button. */}
      <div className="md:hidden fixed inset-x-3 z-30" style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' }}>
        {downloadMenu('up')}
        <div className="relative flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-2 shadow-lg">
          {primary && (
            <button type="button" onClick={primary.onClick} className={`flex-1 min-h-[44px] rounded-xl text-white text-sm font-bold ${primary.cls}`}>
              {canApprove ? 'Approve' : primary.label}
            </button>
          )}
          <button type="button" onClick={screeningBtn.onClick}
            className={`${primary ? '' : 'flex-1 '}min-h-[44px] px-3 rounded-xl text-white text-sm font-semibold ${screeningBtn.cls}`}>
            {s ? 'Edit' : 'Screen'}
          </button>
          <button type="button" onClick={() => setDownloadOpen((o) => !o)} disabled={busyDownloading}
            aria-label="Download" aria-haspopup="menu" aria-expanded={downloadOpen}
            className={`w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl border disabled:opacity-60 ${downloadOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
            {busyDownloading ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Download size={18} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ──
// `backButton`: optional page-level back control rendered beside the list title.
// Only shown on the list view — the detail view has its own back-to-list arrow.
// `embedded`: rendered inside The Team's "Pending Applicant Reviews" panel —
// approved applications are hidden behind a toggle there, and the host is told
// about the list (onApplicationsChange, for its count badge) and approvals
// (onApproved, to reload the roster).
export default function WorshipApplications({ canManageWorship, userProfile, backButton = null, embedded = false, onApplicationsChange, onApproved }) {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [showApproved, setShowApproved] = useState(false)

  useEffect(() => { if (!loading) onApplicationsChange?.(applications) }, [applications, loading])
  const [mode, setMode] = useState('list') // 'list' | 'new' | 'done'
  const [viewing, setViewing] = useState(null)
  const [screeningApp, setScreeningApp] = useState(null)
  const [approvingApp, setApprovingApp] = useState(null)
  const createdPersonIds = useRef({})
  const [approvedNote, setApprovedNote] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      setApplications(await getWorshipApplications(DEPARTMENT))
    } catch (err) {
      console.error('Loading worship applications failed:', err)
      setApplications([])
    } finally {
      setLoading(false)
    }
  }

  async function markReviewed(app) {
    try {
      await updateWorshipApplication(app.id, { status: 'reviewed' })
      setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'reviewed' } : a))
      setViewing(v => v && v.id === app.id ? { ...v, status: 'reviewed' } : v)
    } catch (err) {
      console.error(err)
      alert('Failed to update application')
    }
  }

  // Submitting a screening evaluation both updates the application's lifecycle status
  // (to 'screened' — distinct from the older, more generic 'reviewed' flag) and attaches
  // the full evaluation as its own object on the record, so it's visible later in
  // ApplicationDetail via ScreeningSummary rather than just silently stored.
  async function handleScreeningSubmit(screeningForm) {
    const screening = { ...screeningForm, screenedBy: userProfile?.email || userProfile?.name || '', screenedAt: new Date().toISOString() }
    try {
      await updateWorshipApplication(screeningApp.id, { status: 'screened', screening })
      setApplications(prev => prev.map(a => a.id === screeningApp.id ? { ...a, status: 'screened', screening } : a))
      setViewing(v => v && v.id === screeningApp.id ? { ...v, status: 'screened', screening } : v)
      setScreeningApp(null)
    } catch (err) {
      console.error(err)
      alert('Failed to save the screening evaluation. Please try again.')
    }
  }

  // Approve & Add to Worship Team: create (or re-activate) their worship team
  // member record, then mark the application approved. A new record's createdAt
  // shows on the Worship page's blue notification ribbon ("New worship team
  // member added") for the department's directors.
  // People Directory link, resolved here rather than when the modal opens: the
  // application's own linked id wins; otherwise match by phone, then exact name;
  // otherwise (no match, or the lookup failed) create the record from the
  // application's details so the team member is always linked to someone.
  async function resolveDirectoryLink(app) {
    const linked = linkedDirectoryIds(app)
    if (linked.personId || linked.visitorId) return { ...linked, name: app.fullName.trim() }
    try {
      const { people } = await getMergedPeopleDirectory()
      const match = (digits(app.phone).length === 10 && people.find((p) => digits(p.phone) === digits(app.phone)))
        || people.find((p) => lower(directoryEntryName(p)) === lower(app.fullName))
      if (match && (match.personId || match._visitorIds?.length)) {
        return { personId: match.personId || '', visitorId: match._visitorIds?.[0] || '', name: directoryEntryName(match) || app.fullName.trim() }
      }
    } catch (e) {
      console.warn('People Directory lookup failed; creating a new record instead', e)
    }
    return null
  }

  async function handleApprove({ positions, memberSince }) {
    const app = approvingApp
    const by = userProfile?.email || userProfile?.name || ''
    const person = await resolveDirectoryLink(app)
    // Reuse a record this session already created for the app, so a retry after a
    // later step failed doesn't add the same person twice.
    let createdPersonId = person ? '' : (createdPersonIds.current[app.id] || '')
    if (!person && !createdPersonId) {
      createdPersonId = await addPerson({
        name: app.fullName.trim(),
        phone: app.phone || '',
        email: app.email || '',
        dob: app.dob || '',
        currentPlace: app.currentPlace || '',
        nativity: app.comingFrom || '',
        ministries: ['Worship'],
        createdSource: 'worship_application',
      }, by)
      if (!createdPersonId) throw new Error('Could not create their People Directory record.')
      createdPersonIds.current[app.id] = createdPersonId
    }
    const name = person?.name || app.fullName.trim()
    const visitorId = person?.visitorId || ''
    const personId = person?.personId || createdPersonId
    const team = await getWorshipTeamMembers(DEPARTMENT)
    const existing = team.find((m) => (personId && m.personId === personId) || (visitorId && m.visitorId === visitorId) || lower(m.name) === lower(name))
    let teamMemberId
    if (existing) {
      teamMemberId = existing.id
      await updateWorshipTeamMember(existing.id, {
        positions: Array.from(new Set([...(existing.positions || []), ...positions])),
        isFormer: false,
        visitorId: existing.visitorId || visitorId,
        personId: existing.personId || personId,
      })
    } else {
      teamMemberId = await addWorshipTeamMember(DEPARTMENT, { name, visitorId, personId, positions, memberSince, createdSource: 'worship_application' }, by)
    }
    const patch = {
      status: 'approved', approvedAt: new Date().toISOString(), approvedBy: by, approvedPositions: positions, teamMemberId: teamMemberId || '',
      directoryPersonId: personId || app.directoryPersonId || '',
      directoryVisitorId: visitorId || app.directoryVisitorId || '',
    }
    await updateWorshipApplication(app.id, patch)
    setApplications((prev) => prev.map((a) => (a.id === app.id ? { ...a, ...patch } : a)))
    setViewing((v) => (v && v.id === app.id ? { ...v, ...patch } : v))
    setApprovingApp(null)
    setApprovedNote(existing
      ? `${name} was already on The Team — their roles were updated.`
      : `✔ ${name} added to The Team as ${positions.join(', ')}.`)
    setTimeout(() => setApprovedNote(''), 6000)
    onApproved?.()
  }

  if (mode === 'new') {
    return (
      <div className="max-w-2xl mx-auto">
        <ApplicationForm
          submittedBy={userProfile?.email || ''}
          onCancel={() => setMode('list')}
          onSubmitted={() => setMode('done')}
        />
      </div>
    )
  }

  if (mode === 'done') {
    return (
      <div className="max-w-2xl mx-auto">
        <ThankYou onDone={async () => { setMode('list'); await load() }} />
      </div>
    )
  }

  if (viewing) {
    return (
      <div className="max-w-5xl mx-auto">
        {approvedNote && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">{approvedNote}</p>}
        <ApplicationDetail app={viewing} onBack={() => setViewing(null)} onMarkReviewed={markReviewed} onEditScreening={setScreeningApp}
          onApprove={canManageWorship ? setApprovingApp : null} />
        {approvingApp && <ApproveToTeamModal app={approvingApp} onClose={() => setApprovingApp(null)} onConfirm={handleApprove} />}
        {screeningApp && (
          <ScreeningModal
            app={screeningApp}
            onClose={() => setScreeningApp(null)}
            onSubmit={handleScreeningSubmit}
          />
        )}
      </div>
    )
  }

  const pendingCount = applications.filter(a => a.status !== 'reviewed' && a.status !== 'screened' && a.status !== 'approved').length
  const approvedCount = applications.filter(a => a.status === 'approved').length
  const listed = embedded && !showApproved ? applications.filter(a => a.status !== 'approved') : applications

  return (
    <div className={embedded ? 'space-y-4' : 'max-w-2xl mx-auto space-y-4'}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {backButton}
          <div className="min-w-0">
            {!embedded && <h2 className="font-semibold text-slate-800">Worship Applications</h2>}
            <p className="text-xs text-slate-400">
              {applications.length} received{pendingCount > 0 ? ` · ${pendingCount} pending review` : ''}
            </p>
            {embedded && approvedCount > 0 && (
              <button type="button" onClick={() => setShowApproved(v => !v)} className="text-xs font-semibold text-indigo-600 hover:underline">
                {showApproved ? 'Hide approved' : `Show approved (${approvedCount})`}
              </button>
            )}
          </div>
        </div>
        {canManageWorship && (
          <button type="button" onClick={() => setMode('new')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all">
            <span className="text-base leading-none">+</span> New Application
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
      ) : listed.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          {applications.length === 0
            ? 'No applications yet. Tap "+ New Application" and hand the device to the applicant.'
            : 'Every application has been decided. Nothing waiting for review.'}
        </div>
      ) : (
        <div className="space-y-2">
          {listed.map(app => (
            <div
              key={app.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewing(app)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(app) } }}
              className="w-full text-left bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{app.fullName}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {(app.primaryInstruments || []).join(', ') || 'No instrument selected'}
                  </p>
                </div>
                {app.status === 'approved' ? (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                    On the Team
                  </span>
                ) : app.status === 'screened' ? (
                  canManageWorship ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700">
                        Screening Completed
                      </span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setScreeningApp(app) }}
                        className="text-xs font-semibold text-violet-600 hover:underline"
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-50 text-violet-700">
                      Screening Completed
                    </span>
                  )
                ) : app.status === 'reviewed' ? (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                    Reviewed
                  </span>
                ) : canManageWorship ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setScreeningApp(app) }}
                    className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all"
                  >
                    Take Screening
                  </button>
                ) : (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {screeningApp && (
        <ScreeningModal
          app={screeningApp}
          onClose={() => setScreeningApp(null)}
          onSubmit={handleScreeningSubmit}
        />
      )}
    </div>
  )
}
