import { useEffect, useState } from 'react'
import { getMemberProfile } from '../../services/firestore'
import {
  membershipFieldValue, membershipFullName, MEMBERSHIP_DOCUMENTS, membershipDocumentProvided, hasValue,
} from '../../constants/membershipForm'
import { childDisplayName, childAgeText } from '../../utils/familyDetails'

const fmt = (d) => {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Section({ title, rows, children }) {
  const shown = (rows || []).filter(([, v]) => v !== undefined)
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 mb-2">{title}</p>
      {shown.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {shown.map(([label, value, wide]) => (
            <div key={label} className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className={`text-sm break-words ${hasValue(value) ? 'text-slate-800' : 'text-slate-300'}`}>{hasValue(value) ? value : '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  )
}

/**
 * Read-only view of a candidate's submitted Membership Application, grouped for
 * Stage 4 verification: profile, family, church journey, baptism, attachments.
 * Application values come first; the PCS record and member profile fill what the
 * form doesn't hold (native place, marriage date, previous church, baptism place).
 */
export default function MembershipApplicationPreview({ application, entry }) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    if (!entry?.visitorId) return
    let cancelled = false
    getMemberProfile(entry.visitorId).then((p) => { if (!cancelled) setProfile(p || {}) }).catch(() => { if (!cancelled) setProfile({}) })
    return () => { cancelled = true }
  }, [entry?.visitorId])

  if (!application || application.status === 'pending') {
    return (
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-500">
        No submitted membership application yet{application?.status === 'pending' ? ' (the link has been sent but not completed)' : ''}.
        Verify against the paper form and the PCS profile.
      </div>
    )
  }

  const v = (k) => membershipFieldValue(application, k)
  const p = profile || {}
  const fam = application.applicant?.family || {}
  const kids = fam.children || []
  const talents = application.applicant?.talents || []

  return (
    <div className="overflow-y-auto max-h-[70vh] p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
      {/* Profile header */}
      <div className="flex items-start gap-3">
        {application.photoDataUrl
          ? <img src={application.photoDataUrl} alt="Applicant" className="w-16 h-20 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
          : <div className="w-16 h-20 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">No photo</div>}
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900 break-words">{membershipFullName(application) || entry?.name || '—'}</p>
          <p className="text-xs text-slate-500">Submitted {fmt(application.submittedAt) || '—'}{application.applicant?.legalNameConfirmed ? ' · legal name confirmed' : ''}</p>
        </div>
      </div>

      <Section title="Candidate Profile" rows={[
        ['Mobile', v('phone')],
        ['Email', v('email')],
        ['Gender', v('gender')],
        ['Date of Birth', fmt(v('dob'))],
        ['Native Place', entry?.nativity || p.nativity || ''],
        ['Emergency Contact', v('emergencyPhone')],
        ['Current Address', v('currentAddress'), true],
        ['Permanent Address', v('permanentAddress'), true],
      ]} />

      <Section title="Family Details" rows={[
        ['Spouse', fam.spouseName || p.spouseName || ''],
        ['Marriage Date', fmt(p.marriageDate)],
        ['Children', kids.length ? kids.map((c) => `${childDisplayName(c)}${childAgeText(c) ? ` (${childAgeText(c)})` : ''}`).join(', ') : 'None listed', true],
        ['Family in ROLCC', v('familyInRolcc'), true],
      ]} />

      <Section title="Church & Spiritual Journey" rows={[
        ['First Visit / Date of Join', fmt(v('dateOfJoin') || entry?.attendedDate)],
        ['Service', entry?.serviceAttended || ''],
        ['Cell Group', v('cellName')],
        ['PCS Since', entry?.year ? String(entry.year) : ''],
        ['Previous Church', [p.previousChurchName, p.previousChurchPlace].filter(Boolean).join(', ') || (p.isFirstChurch === 'yes' ? 'ROLCC is their first church' : '')],
        ['Talents / Gifts', talents.length ? talents.join(', ') : '', true],
      ]} />

      <Section title="Water Baptism" rows={[
        ['Status', String(p.baptised || '').toLowerCase() === 'yes' || hasValue(v('baptismDate')) ? 'Baptised' : (p.baptised === 'no' ? 'Not baptised' : '')],
        ['Date', fmt(v('baptismDate') || p.baptismDate)],
        ['Place', p.baptismPlace || ''],
        ['Church', v('baptismChurch') || p.baptismChurch || ''],
      ]} />

      <Section title="Attachments">
        <ul className="space-y-1.5 text-sm">
          {MEMBERSHIP_DOCUMENTS.map((d) => {
            const ok = membershipDocumentProvided(application, d)
            const scan = application.documents?.[d.legacyKey]
            return (
              <li key={d.key} className="flex items-center gap-2">
                <span className={ok ? 'text-emerald-600' : 'text-amber-600'}>{ok ? '✓' : '○'}</span>
                <span className="text-slate-700 flex-1">{d.label}</span>
                {typeof scan === 'string' && (scan.startsWith('data:image') || /^https?:\/\//.test(scan))
                  ? <a href={scan} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">View scan</a>
                  : application.attachments?.[`${d.legacyKey}DeletedFromStorage`]
                  ? <span className="text-xs font-semibold text-slate-600">Downloaded &amp; Printed (Deleted from Storage)</span>
                  : <span className="text-xs text-slate-400">{ok ? 'Handed in (physical)' : 'Not confirmed'}</span>}
              </li>
            )
          })}
          <li className="flex items-center gap-2">
            <span className={application.photoDataUrl ? 'text-emerald-600' : 'text-amber-600'}>{application.photoDataUrl ? '✓' : '○'}</span>
            <span className="text-slate-700 flex-1">Photo</span>
            {application.photoDataUrl
              ? <a href={application.photoDataUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-700 hover:underline">View</a>
              : <span className="text-xs text-slate-400">Not uploaded</span>}
          </li>
        </ul>
        {application.signatureDataUrl && (
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Signature</p>
            <img src={application.signatureDataUrl} alt="Applicant signature" className="max-h-14 mt-1 border-b border-slate-300" />
          </div>
        )}
      </Section>
    </div>
  )
}
