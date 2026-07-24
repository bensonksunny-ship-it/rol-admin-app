import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getPeople,
  getDelightVisitors,
  getAllCellGroupMembers,
  getPCSEntries,
  getAllDepartmentTeamMembers,
  getAllWorshipTeamMembers,
  getCellGroups,
  addPerson,
  updatePerson,
  updatePCSEntry,
  updateCellGroupMember,
  updateCellGroup,
  updateDepartmentTeamMember,
  updateWorshipTeamMember,
  updateDelightVisitor,
  getAllPersonSundayAttendance,
} from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { isFounder } from '../utils/access'
import { isCellDirectorInPositions } from '../utils/cellReportPermissions'
import { ROLES } from '../constants/roles'

const fmt = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return d }
}

function miniDur(from, to) {
  if (!from) return ''
  const s = new Date(from), e = to ? new Date(to) : new Date()
  const tot = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  const y = Math.floor(tot / 12), m = tot % 12
  return [y > 0 ? `${y}y` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ') || '<1m'
}

function statusBadges(p) {
  const badges = []
  const isMember = p.membershipStatus === 'member' || p.pcs?.membershipStatus === 'member'
  const hasActiveCell = p.cells.some(c => c.status !== 'inactive')
  const hasMinistry = p.deptTeams.length > 0 || p.worshipTeams.length > 0 || (p.ministries?.length > 0) || (p.pcs?.ministries?.length > 0)

  if (isMember)      badges.push({ label: 'Member',  bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200'   })
  if (hasActiveCell) badges.push({ label: 'Cell',    bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' })
  if (p.pcs)         badges.push({ label: 'PCS',     bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200'  })
  if (hasMinistry)   badges.push({ label: 'Ministry', bg: 'bg-violet-100', text: 'text-violet-700',  border: 'border-violet-200'  })
  if (badges.length === 0) badges.push({ label: 'Visitor', bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200' })
  return badges
}

function avatarColor(p) {
  if (p.pcs?.membershipStatus === 'member') return 'from-amber-400 to-orange-500'
  if (p.cells.some(c => c.status !== 'inactive')) return 'from-emerald-400 to-teal-500'
  if (p.deptTeams.length > 0 || p.worshipTeams.length > 0) return 'from-violet-400 to-purple-500'
  if (p.pcs) return 'from-indigo-400 to-blue-500'
  return 'from-slate-400 to-slate-500'
}

const SERVICES = ['English Service', 'Malayalam Service', 'Tamil Service', 'Hindi Service']
const MEMBERSHIP_STATUSES = ['visitor', 'regular', 'applying', 'member']

// Defined at module scope (not inside EditPersonModal) — an inline component
// definition gets recreated every render, which makes React remount the <input>
// on each keystroke and drop focus after every letter.
function LabelInput({ label, value, onChange, type = 'text', options }) {
  return (
    <div>
      <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</label>
      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      )}
    </div>
  )
}

function EditPersonModal({ p, cellGroups, onClose, onSaved, userEmail }) {
  const blank = {
    name: p.name || '',
    phone: p.phone || '',
    email: p.email || '',
    dob: p.dob || '',
    nativity: p.nativity || '',
    currentPlace: p.currentPlace || '',
    firstVisitDate: p.attendedDate || '',
    serviceAttended: p.serviceAttended || '',
    howKnown: p.howKnown || '',
    baptised: p.pcs?.baptised || p.baptised || '',
    maritalStatus: p.pcs?.maritalStatus || p.maritalStatus || '',
    membershipStatus: p.pcs?.membershipStatus || p.membershipStatus || '',
    membershipNumber: p.pcs?.membershipNumber || p.membershipNumber || '',
  }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const personData = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        dob: form.dob,
        nativity: form.nativity.trim(),
        currentPlace: form.currentPlace.trim(),
        firstVisitDate: form.firstVisitDate,
        serviceAttended: form.serviceAttended,
        howKnown: form.howKnown.trim(),
        maritalStatus: form.maritalStatus,
        membershipStatus: form.membershipStatus,
        membershipNumber: form.membershipNumber.trim(),
      }

      let resolvedPersonId = p.personId
      if (resolvedPersonId) {
        await updatePerson(resolvedPersonId, personData, userEmail)
      } else {
        resolvedPersonId = await addPerson(personData, userEmail)
        // Link PCS entry if this was a legacy PCS record
        if (p.pcs?.id) {
          await updatePCSEntry(p.pcs.id, { personId: resolvedPersonId })
        }
      }

      // The People's Directory is the source of truth, but name/phone are also
      // copied into cell rosters, team lists, D-Light visitor records, and — since
      // a cell group stores its leader's name directly on the group doc itself
      // (leaderPersonId can point at a people/visitor/cell-member id depending on
      // when it was linked) — the cell group's own leader field too.
      // Without pushing the change out to those copies, they go stale and start
      // looking like a different person — which is what caused the duplicates.
      const copyUpdate = { name: personData.name, phone: personData.phone }
      const myIds = new Set([resolvedPersonId, ...(p._visitorIds || []), ...(p.cells || []).map((c) => c.id)].filter(Boolean))
      const leaderOfCells = (cellGroups || []).filter((g) => g.leaderPersonId && myIds.has(g.leaderPersonId))
      await Promise.all([
        ...(p.cells || []).map((c) => updateCellGroupMember(c.cellId, c.id, copyUpdate).catch(() => {})),
        ...(p.deptTeams || []).map((t) => updateDepartmentTeamMember(t.id, copyUpdate).catch(() => {})),
        ...(p.worshipTeams || []).map((t) => updateWorshipTeamMember(t.id, copyUpdate).catch(() => {})),
        ...(p._visitorIds || []).map((vid) => updateDelightVisitor(vid, copyUpdate).catch(() => {})),
        ...(p.pcs?.id ? [updatePCSEntry(p.pcs.id, copyUpdate).catch(() => {})] : []),
        ...leaderOfCells.map((g) => updateCellGroup(g.id, { leader: personData.name }).catch(() => {})),
      ])

      onSaved({
        ...p,
        _originalKey: p._key,
        personId: resolvedPersonId,
        _key: resolvedPersonId || p._key,
        name: personData.name,
        phone: personData.phone,
        email: personData.email,
        dob: personData.dob,
        nativity: personData.nativity,
        currentPlace: personData.currentPlace,
        attendedDate: personData.firstVisitDate,
        serviceAttended: personData.serviceAttended,
        howKnown: personData.howKnown,
        maritalStatus: personData.maritalStatus,
        membershipStatus: personData.membershipStatus,
        membershipNumber: personData.membershipNumber,
        pcs: p.pcs ? { ...p.pcs, maritalStatus: personData.maritalStatus, membershipStatus: personData.membershipStatus, membershipNumber: personData.membershipNumber } : p.pcs,
      })
      onClose()
    } catch (e) {
      console.error(e)
      setError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-black text-slate-800">Edit Person</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">{p.personId ? 'Updating People Directory' : 'Will create a new People record'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          {/* Personal */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-3">Personal Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><LabelInput label="Full Name *" value={form.name} onChange={v => set('name', v)} /></div>
              <LabelInput label="Phone" value={form.phone} onChange={v => set('phone', v)} type="tel" />
              <LabelInput label="Email" value={form.email} onChange={v => set('email', v)} type="email" />
              <LabelInput label="Date of Birth" value={form.dob} onChange={v => set('dob', v)} type="date" />
              <LabelInput label="Nativity" value={form.nativity} onChange={v => set('nativity', v)} />
              <div className="col-span-2"><LabelInput label="Current Place" value={form.currentPlace} onChange={v => set('currentPlace', v)} /></div>
            </div>
          </div>

          {/* Church Journey */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-3">Church Journey</p>
            <div className="grid grid-cols-2 gap-3">
              <LabelInput label="First Visit Date" value={form.firstVisitDate} onChange={v => set('firstVisitDate', v)} type="date" />
              <LabelInput label="Service" value={form.serviceAttended} onChange={v => set('serviceAttended', v)} options={SERVICES} />
              <div className="col-span-2"><LabelInput label="How Known" value={form.howKnown} onChange={v => set('howKnown', v)} /></div>
            </div>
          </div>

          {/* Membership */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-3">Spiritual & Membership</p>
            <div className="grid grid-cols-2 gap-3">
              <LabelInput label="Marital Status" value={form.maritalStatus} onChange={v => set('maritalStatus', v)} options={['single', 'married', 'widowed']} />
              <LabelInput label="Membership Status" value={form.membershipStatus} onChange={v => set('membershipStatus', v)} options={MEMBERSHIP_STATUSES} />
              <LabelInput label="Member Number" value={form.membershipNumber} onChange={v => set('membershipNumber', v)} />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {saving && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, dot, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{title}</p>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0 w-28">{label}</span>
      <span className={`text-[11px] font-semibold leading-snug text-right ${value ? 'text-slate-800' : 'text-slate-300'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function ExpandedProfile({ p, onEdit }) {
  // Build ministry list: manual PCS entries first, then auto from team records (deduplicated by ministry name)
  const manualMinistries = (p.pcs?.ministries || p.ministries || []).map(m => ({ ...m, source: 'pcs' }))
  const manualNames = new Set(manualMinistries.map(m => m.ministry?.toLowerCase()))
  const autoMinistries = [
    ...p.deptTeams.map(t => ({ ministry: t.department, role: t.rolePosition || t.role || '', from: t.since || '', to: '', source: 'dept' })),
    ...p.worshipTeams.map(t => ({ ministry: 'Worship', role: (t.positions || [])[0] || '', from: t.since || '', to: '', source: 'worship' })),
  ].filter(a => !manualNames.has(a.ministry?.toLowerCase()))
  const allMinistries = [...manualMinistries, ...autoMinistries]

  const activeCells = p.cells.filter(c => c.status !== 'inactive')
  const sundayAttendanceDates = [...new Set(p.sundayAttendance || [])].sort((a, b) => b.localeCompare(a))

  // Merge fields: prefer PCS values (more complete), fall back to top-level person fields
  const baptised      = p.pcs?.baptised      || p.baptised      || ''
  const maritalStatus = p.pcs?.maritalStatus || p.maritalStatus || ''
  const membershipStatus = p.pcs?.membershipStatus || p.membershipStatus || ''
  const membershipNumber = p.pcs?.membershipNumber || p.membershipNumber || ''
  const baptismDate   = p.pcs?.baptismDate   || p.baptismDate   || ''
  const baptismPlace  = p.pcs?.baptismPlace  || p.baptismPlace  || ''
  const baptismChurch = p.pcs?.baptismChurch || p.baptismChurch || ''
  const marriageDate  = p.pcs?.marriageDate  || p.marriageDate  || ''
  const spouseName    = p.pcs?.spouseName    || p.spouseName    || ''
  const leadershipPosition = p.pcs?.leadershipPosition || p.leadershipPosition || ''
  const permanentAddress   = p.pcs?.permanentAddress   || p.permanentAddress   || ''

  const hasSpiritualData = baptised || maritalStatus || membershipStatus || leadershipPosition

  return (
    <div className="px-3 pb-4 pt-3 bg-slate-50 border-t border-slate-100 space-y-3">

      {/* Row 1: Contact + Spiritual side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Contact & Personal */}
        <SectionCard title="Contact & Personal" dot="bg-blue-500">
          <Row label="Phone"         value={p.phone} />
          <Row label="Email"         value={p.email} />
          <Row label="Date of Birth" value={fmt(p.dob)} />
          <Row label="Nativity"      value={p.nativity} />
          <Row label="Current Place" value={p.currentPlace} />
          <Row label="How Known"     value={p.howKnown} />
        </SectionCard>

        {/* Spiritual & Membership */}
        <SectionCard title="Spiritual & Membership" dot="bg-amber-500">
          <Row label="Baptised"      value={baptised === 'yes' ? 'Yes' : baptised === 'no' ? 'No' : null} />
          {baptised === 'yes' && <>
            <Row label="Baptism Date"   value={fmt(baptismDate)} />
            <Row label="Baptism Place"  value={baptismPlace} />
            <Row label="Baptism Church" value={baptismChurch} />
          </>}
          <Row label="Marital Status" value={maritalStatus} />
          {(maritalStatus?.toLowerCase() === 'married') && <>
            <Row label="Marriage Date" value={fmt(marriageDate)} />
            <Row label="Spouse"        value={spouseName} />
          </>}
          <Row label="Membership"      value={membershipStatus === 'member' ? 'Member' : membershipStatus === 'applying' ? 'Applying' : membershipStatus || null} />
          <Row label="Member #"        value={membershipNumber} />
          <Row label="Leadership"      value={leadershipPosition} />
          <Row label="Perm. Address"   value={permanentAddress} />
        </SectionCard>
      </div>

      {/* Church Journey — full width card */}
      <SectionCard title="Church Journey" dot="bg-emerald-500">
        {/* Duration hero */}
        {p.attendedDate ? (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest text-emerald-100 mb-0.5">Time in Church</p>
              <p className="text-lg font-black text-white leading-tight">{miniDur(p.attendedDate, null)}</p>
              <p className="text-[9px] text-emerald-100 mt-0.5">since {fmt(p.attendedDate)}</p>
            </div>
            {p.serviceAttended && (
              <span className="text-[9px] font-bold text-emerald-100 bg-white/20 px-2.5 py-1 rounded-full border border-white/30">{p.serviceAttended}</span>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-slate-300 italic mb-2">No first visit date recorded</div>
        )}

        {/* Cell groups */}
        {activeCells.length > 0 && (
          <div className="space-y-1 mb-2">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cell Group</p>
            {activeCells.map((c, i) => {
              const cellDur = c.since ? miniDur(c.since, null) : null
              return (
                <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-700">{c.cellName || c.cellId}</p>
                    {c.leader && <p className="text-[9px] text-slate-500">Leader: {c.leader}</p>}
                    {c.since && <p className="text-[8px] text-slate-400">since {fmt(c.since)}</p>}
                  </div>
                  {cellDur && <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{cellDur}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Ministry & Leadership */}
        {allMinistries.length > 0 && (
          <div className="space-y-1">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ministry & Leadership</p>
            {allMinistries.map((m, i) => {
              const dur = miniDur(m.from, m.to)
              return (
                <div key={i} className="flex items-center justify-between gap-2 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-700">
                      {m.ministry}{m.role ? <span className="font-normal text-slate-400"> · {m.role}</span> : ''}
                    </p>
                    {m.from && <p className="text-[8px] text-slate-400 mt-0.5">since {new Date(m.from).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>}
                  </div>
                  {dur && <span className="text-[9px] font-black text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{dur}</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Sunday Attendance — from Live Control "Others" linking */}
        {sundayAttendanceDates.length > 0 && (
          <div className="space-y-1 mt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Sunday Attendance</p>
              <span className="text-[9px] font-black text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                {sundayAttendanceDates.length} Sunday{sundayAttendanceDates.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sundayAttendanceDates.map((d) => (
                <span key={d} className="text-[9px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                  {fmt(d)}
                </span>
              ))}
            </div>
          </div>
        )}

        {!p.attendedDate && activeCells.length === 0 && allMinistries.length === 0 && sundayAttendanceDates.length === 0 && (
          <p className="text-[10px] text-slate-300 italic">No church journey data recorded</p>
        )}
      </SectionCard>

      <div className="mt-3 flex items-center justify-between">
        {!p.personId && (
          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            Legacy record — saving will link to People Directory.
          </p>
        )}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" /></svg>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'member',   label: 'Members' },
  { key: 'cell',     label: 'Cell' },
  { key: 'ministry', label: 'Ministry' },
  { key: 'pcs',      label: 'PCS' },
  { key: 'visitor',  label: 'Visitors Only' },
]

export default function PeopleDirectory() {
  const { userProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState([])
  const [cellGroups, setCellGroups] = useState([])
  const [sourceCounts, setSourceCounts] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [editingPerson, setEditingPerson] = useState(null)

  // Cell Directors get a search-only lookup (to find and link a person to a cell
  // group), not the browsable full directory that Founders/Admins see.
  const isRestrictedDirector = isCellDirectorInPositions(userProfile) && !isFounder(userProfile) && userProfile?.role !== ROLES.ADMIN
  const hasSearch = search.trim().length > 0

  const handleSaved = useCallback((updated) => {
    setPeople(prev => prev.map(p =>
      p._key === updated._key ||
      p._key === updated._originalKey ||
      (updated.personId && p.personId === updated.personId)
        ? { ...p, ...updated }
        : p
    ))
  }, [])

  useEffect(() => {
    Promise.all([
      getPeople().catch(() => []),
      getAllCellGroupMembers().catch(() => []),
      getPCSEntries().catch(() => []),
      getAllDepartmentTeamMembers().catch(() => []),
      getAllWorshipTeamMembers().catch(() => []),
      getCellGroups('Cell').catch(() => []),
      getDelightVisitors().catch(() => []),
      getAllPersonSundayAttendance().catch(() => []),
    ]).then(([people, cellMembers, pcsEntries, deptTeams, worshipTeams, cellGroups, visitors, sundayAttendance]) => {
      const cellById = {}
      cellGroups.forEach(c => { cellById[c.id] = c })

      // Build from people collection (primary source — written by PCS)
      const byId = {}
      // Also index by phone for visitor merging (phone is the best legacy key)
      const byPhone = {}
      people.forEach(p => {
        const entry = {
          _key: p.id,
          personId: p.id,
          name: p.name || '',
          phone: p.phone || '',
          email: p.email || '',
          dob: p.dob || '',
          attendedDate: p.firstVisitDate || '',
          serviceAttended: p.serviceAttended || '',
          howKnown: p.howKnown || '',
          nativity: p.nativity || '',
          currentPlace: p.currentPlace || '',
          baptised: p.baptised || '',
          maritalStatus: p.maritalStatus || '',
          membershipStatus: p.membershipStatus || '',
          membershipNumber: p.membershipNumber || '',
          leadershipPosition: p.leadershipPosition || '',
          ministries: p.ministries || [],
          stage: p.stage || 'visitor',
          cells: [],
          pcs: null,
          deptTeams: [],
          worshipTeams: [],
          source: 'people',
          _visitorIds: [],
          sundayAttendance: [],
        }
        byId[p.id] = entry
        if (p.phone) byPhone[p.phone.replace(/\s+/g, '')] = entry
      })

      // Attach PCS entries (match by personId, fall back to unlinked)
      const unlinked = []
      pcsEntries.forEach(p => {
        if (p.personId && byId[p.personId]) {
          byId[p.personId].pcs = p
        } else if (!p.personId) {
          unlinked.push(p)
        }
      })

      // Start merged from people collection entries
      const merged = Object.values(byId)

      // Unlinked PCS entries (no personId yet — legacy records)
      unlinked.forEach(p => {
        const phone = (p.phone || '').replace(/\s+/g, '')
        if (phone && byPhone[phone]) {
          // Matched to an existing People's Directory row by phone — attach the PCS
          // data to it instead of silently dropping it. Without this, p.pcs stays
          // null on the merged row, so edits never propagate to this PCS entry.
          byPhone[phone].pcs = p
          return
        }
        const entry = {
          _key: 'pcs-' + p.id,
          personId: null,
          name: p.name || '',
          phone: p.phone || '',
          email: '',
          dob: '',
          attendedDate: p.attendedDate || '',
          serviceAttended: p.serviceAttended || '',
          howKnown: '',
          nativity: '',
          currentPlace: '',
          baptised: '',
          maritalStatus: '',
          membershipStatus: p.membershipStatus || '',
          membershipNumber: p.membershipNumber || '',
          leadershipPosition: p.leadershipPosition || '',
          ministries: p.ministries || [],
          stage: 'pcs',
          cells: [],
          pcs: p,
          deptTeams: [],
          worshipTeams: [],
          source: 'pcs-legacy',
          _visitorIds: [],
          sundayAttendance: [],
        }
        merged.push(entry)
        if (phone) byPhone[phone] = entry
      })

      // D-Light visitors — process BEFORE cell/dept/worship attachment so we can build byVisitorId
      // byVisitorId maps delight_visitors doc id → merged entry (for legacy linking)
      const byVisitorId = {}
      visitors.forEach(v => {
        const phone = (v.phone || '').replace(/\s+/g, '')
        if (phone && byPhone[phone]) {
          const existing = byPhone[phone]
          if (!existing.attendedDate && v.attendedDate) existing.attendedDate = v.attendedDate
          if (!existing.serviceAttended && v.serviceAttended) existing.serviceAttended = v.serviceAttended
          if (!existing.howKnown && v.howKnown) existing.howKnown = v.howKnown
          existing._visitorIds.push(v.id)
          byVisitorId[v.id] = existing
          return
        }
        const entry = {
          _key: 'vis-' + v.id,
          personId: null,
          name: v.name || '',
          phone: v.phone || '',
          email: v.email || '',
          dob: v.dob || '',
          attendedDate: v.attendedDate || '',
          serviceAttended: v.serviceAttended || '',
          howKnown: v.howKnown || '',
          nativity: v.nativity || '',
          currentPlace: v.currentPlace || '',
          baptised: '',
          maritalStatus: '',
          membershipStatus: '',
          membershipNumber: '',
          leadershipPosition: '',
          ministries: [],
          stage: 'visitor',
          cells: [],
          pcs: null,
          deptTeams: [],
          worshipTeams: [],
          source: 'visitor',
          _visitorIds: [v.id],
          sundayAttendance: [],
        }
        merged.push(entry)
        if (phone) byPhone[phone] = entry
        byVisitorId[v.id] = entry
      })

      // Attach cell memberships — try personId first, fall back to visitorId (legacy)
      cellMembers.forEach(m => {
        const entry = (m.personId && byId[m.personId]) || (m.visitorId && byVisitorId[m.visitorId])
        if (!entry) return
        const cell = cellById[m.cellId]
        entry.cells.push({ ...m, cellName: cell?.cellName || m.cellId, leader: cell?.leader || '', leaderPersonId: cell?.leaderPersonId || '' })
      })

      // Attach dept teams
      deptTeams.forEach(t => {
        const entry = (t.personId && byId[t.personId]) || (t.visitorId && byVisitorId[t.visitorId])
        if (!entry) return
        entry.deptTeams.push(t)
      })

      // Attach worship teams
      worshipTeams.forEach(t => {
        const entry = (t.personId && byId[t.personId]) || (t.visitorId && byVisitorId[t.visitorId])
        if (!entry) return
        entry.worshipTeams.push(t)
      })

      // Attach Sunday attendance records (linked from Live Control's "Others" section)
      sundayAttendance.forEach(a => {
        const entry = (a.personId && byId[a.personId]) || (a.visitorId && byVisitorId[a.visitorId])
        if (!entry) return
        entry.sundayAttendance.push(a.date)
      })

      // Sort final merged list by date descending
      merged.sort((a, b) => {
        const da = a.attendedDate ? new Date(a.attendedDate).getTime() : 0
        const db2 = b.attendedDate ? new Date(b.attendedDate).getTime() : 0
        return db2 - da
      })

      setSourceCounts({
        people: people.length,
        cellMembers: cellMembers.length,
        pcsEntries: pcsEntries.length,
        deptTeams: deptTeams.length,
        worshipTeams: worshipTeams.length,
        visitors: visitors.length,
      })
      setPeople(merged)
      setCellGroups(cellGroups)
      setLoading(false)
    }).catch((err) => { console.error('PeopleDirectory load error:', err); setLoading(false) })
  }, [])

  const personYear = (p) => {
    const currentYear = new Date().getFullYear()
    const yr = p.pcs?.year || (p.attendedDate ? new Date(p.attendedDate).getFullYear() : null)
    if (!yr || yr < 2000 || yr > currentYear) return null
    return yr
  }

  const filtered = useMemo(() => {
    let list = people
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    }
    switch (filter) {
      case 'member':   list = list.filter(p => p.membershipStatus === 'member' || p.pcs?.membershipStatus === 'member'); break
      case 'cell':     list = list.filter(p => p.cells.some(c => c.status !== 'inactive')); break
      case 'ministry': list = list.filter(p => p.deptTeams.length > 0 || p.worshipTeams.length > 0 || p.ministries?.length > 0); break
      case 'pcs':      list = list.filter(p => !!p.pcs); break
      case 'visitor':  list = list.filter(p => p.cells.length === 0 && !p.pcs && p.deptTeams.length === 0 && p.worshipTeams.length === 0); break
    }
    return list
  }, [people, search, filter])

  // Group filtered list by year, sorted newest first
  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(p => {
      const yr = personYear(p) || 'No Year'
      if (!map[yr]) map[yr] = []
      map[yr].push(p)
    })
    const years = Object.keys(map).sort((a, b) => {
      if (a === 'No Year') return 1
      if (b === 'No Year') return -1
      return Number(b) - Number(a)
    })
    return years.map(yr => ({
      year: yr,
      entries: map[yr].sort((a, b) => {
        const da = a.attendedDate ? new Date(a.attendedDate).getTime() : 0
        const db2 = b.attendedDate ? new Date(b.attendedDate).getTime() : 0
        return db2 - da
      }),
    }))
  }, [filtered])

  const counts = useMemo(() => ({
    all:      people.length,
    member:   people.filter(p => p.membershipStatus === 'member' || p.pcs?.membershipStatus === 'member').length,
    cell:     people.filter(p => p.cells.some(c => c.status !== 'inactive')).length,
    ministry: people.filter(p => p.deptTeams.length > 0 || p.worshipTeams.length > 0 || p.ministries?.length > 0).length,
    pcs:      people.filter(p => !!p.pcs).length,
    visitor:  people.filter(p => p.cells.length === 0 && !p.pcs && p.deptTeams.length === 0 && p.worshipTeams.length === 0).length,
  }), [people])

  return (
    <div className="min-h-screen bg-slate-50">
      {editingPerson && (
        <EditPersonModal
          p={editingPerson}
          cellGroups={cellGroups}
          onClose={() => setEditingPerson(null)}
          onSaved={handleSaved}
          userEmail={userProfile?.email || ''}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">People Directory</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRestrictedDirector
                  ? 'Search to find and link a person to a cell group'
                  : (loading ? 'Loading…' : `${people.length} people across all sources`)}
              </p>
            </div>
          </div>
          {!isRestrictedDirector && !loading && sourceCounts && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                { label: 'In People', count: sourceCounts.people, color: 'text-indigo-700 bg-indigo-50' },
                { label: 'Visitors', count: sourceCounts.visitors, color: 'text-sky-700 bg-sky-50' },
                { label: 'Cell Members', count: sourceCounts.cellMembers, color: 'text-emerald-700 bg-emerald-50' },
                { label: 'PCS Entries', count: sourceCounts.pcsEntries, color: 'text-blue-700 bg-blue-50' },
                { label: 'Dept Teams', count: sourceCounts.deptTeams, color: 'text-violet-700 bg-violet-50' },
                { label: 'Worship', count: sourceCounts.worshipTeams, color: 'text-rose-700 bg-rose-50' },
              ].map(s => (
                <span key={s.label} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.color}`}>
                  {s.label}: {s.count}
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search by name, phone or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 ${isRestrictedDirector ? '' : 'mb-3'}`}
          />

          {/* Filter tabs — hidden for the search-only Cell Director view */}
          {!isRestrictedDirector && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                    filter === f.key
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f.label} <span className={`ml-1 ${filter === f.key ? 'text-indigo-200' : 'text-slate-400'}`}>{counts[f.key]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-w-3xl mx-auto px-4 py-3">
        {isRestrictedDirector && !hasSearch && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-2xl mb-2">🔎</p>
            <p className="text-sm font-semibold">Search for a person</p>
            <p className="text-xs mt-1">Type a name, phone, or email to find someone and link them to a cell group</p>
          </div>
        )}

        {(!isRestrictedDirector || hasSearch) && loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mb-3" />
            <p className="text-sm">Loading all records…</p>
          </div>
        )}

        {(!isRestrictedDirector || hasSearch) && !loading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-sm font-semibold">No people found</p>
            <p className="text-xs mt-1">Try a different search or filter</p>
          </div>
        )}

        {(!isRestrictedDirector || hasSearch) && !loading && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map(({ year, entries }) => (
              <div key={year}>
                {/* Year header */}
                <div className="flex items-center gap-3 mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                    <span className="text-sm font-black text-slate-700 tracking-tight">
                      {year === 'No Year' ? 'No Year' : year}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {entries.length} {entries.length === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* People in this year */}
                <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                  {entries.map((p, idx) => {
                    const badges = statusBadges(p)
                    const isExpanded = expandedId === p._key
                    const initials = (p.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
                    const primaryCell = p.cells.find(c => c.status !== 'inactive')

                    return (
                      <div key={p._key} className={idx > 0 ? 'border-t border-slate-100' : ''}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : p._key)}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 bg-gradient-to-br ${avatarColor(p)}`}>
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-slate-800 truncate">{p.name || <span className="text-slate-400 italic">Unnamed</span>}</p>
                              {!p.personId && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0">legacy</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {p.phone && <span className="text-[10px] text-slate-400">{p.phone}</span>}
                              {primaryCell && <span className="text-[10px] text-emerald-600">{primaryCell.cellName}{primaryCell.leader ? ` · ${primaryCell.leader}` : ''}</span>}
                            </div>
                          </div>

                          <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                            {badges.map(b => (
                              <span key={b.label} className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${b.bg} ${b.text} ${b.border}`}>{b.label}</span>
                            ))}
                          </div>

                          <svg className={`w-4 h-4 text-slate-300 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {isExpanded && <ExpandedProfile p={p} onEdit={setEditingPerson} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {(!isRestrictedDirector || hasSearch) && !loading && <p className="text-center text-[10px] text-slate-300 mt-4">{filtered.length} of {people.length} people shown</p>}
      </div>
    </div>
  )
}
