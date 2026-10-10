import { useState } from 'react'
import { stagesForApplicant, currentStage } from '../utils/membershipPipeline'
import { MEMBERSHIP_DOCUMENTS, membershipDocumentProvided, membershipFieldValue } from '../constants/membershipForm'
import { initialFamilyState } from '../utils/familyDetails'
import FamilyDetailsSection from './FamilyDetailsSection'

const fmt = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * The applicant's live view of their membership journey, shown on the public
 * /membership-apply link once the form is submitted: the same 8 stages as the PCS
 * tracker (mirrored onto the application by staff as pipelineProgress — see
 * utils/membershipPipeline.js), then a collapsible read-only summary of what they
 * submitted. The page feeds it from an onSnapshot listener, so it updates live.
 */
export default function MembershipProgressPublic({ app }) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const stages = stagesForApplicant(app)
  const cur = currentStage(stages)
  const rejected = app.status === 'rejected'
  const infoRequested = app.status === 'info_requested'

  const legal = [
    ['First Name', app.applicant?.firstName || membershipFieldValue(app, 'firstName')],
    ['Middle Name', app.applicant?.middleName || membershipFieldValue(app, 'middleName')],
    ['Last Name', app.applicant?.lastName || membershipFieldValue(app, 'lastName')],
  ]
  const family = initialFamilyState({ family: app.applicant?.family || app.prefill?.family })

  return (
    <div className="p-5 space-y-5">
      <div className={`rounded-xl px-4 py-3 text-sm ${rejected ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-900'}`}>
        {rejected
          ? 'Your Membership Application could not be approved at this time. Please speak with the Pastoral Office.'
          : '✓ Application received. Thank you!'}
      </div>
      {infoRequested && (
        <p className="rounded-xl px-4 py-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          The church office needs more information. Please contact them.
        </p>
      )}

      {/* Stepper — numbered 1..8, current stage highlighted */}
      <section>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-blue-700 border-b-2 border-blue-700 pb-1">Progress</h2>
        <div className="flex items-center mt-4" role="list" aria-label={cur ? `Stage ${cur.n} of 8: ${cur.label}` : 'All stages complete'}>
          {stages.map((s, i) => {
            const isCur = cur?.key === s.key && !rejected
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none" role="listitem">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 ${
                  s.done ? 'bg-emerald-500 border-emerald-500 text-white' : isCur ? 'bg-amber-50 border-amber-400 text-amber-700 ring-4 ring-amber-100' : 'bg-white border-slate-200 text-slate-400'}`}>
                  {s.done ? '✓' : s.n}
                </span>
                {i < stages.length - 1 && <span className={`h-1 flex-1 mx-0.5 rounded ${s.done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
            )
          })}
        </div>
        <p className={`mt-3 text-sm font-bold ${cur ? 'text-amber-800' : 'text-emerald-700'}`}>
          {cur ? `Stage ${cur.n} of 8: ${cur.label}` : 'All 8 stages complete — welcome to the church family!'}
        </p>
        {cur && !rejected && <p className="text-xs text-slate-500">{cur.publicDetail}</p>}

        <ol className="mt-4 space-y-2">
          {stages.map((s) => {
            const isCur = cur?.key === s.key && !rejected
            return (
              <li key={s.key} className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${isCur ? 'border-amber-300 bg-amber-50/60' : s.done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                <span className={`mt-0.5 text-sm ${s.done ? 'text-emerald-600' : isCur ? 'text-amber-600' : 'text-slate-300'}`}>{s.done ? '✔' : isCur ? '●' : '○'}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${s.done || isCur ? 'text-slate-800' : 'text-slate-400'}`}>{s.n}. {s.label}</p>
                </div>
                <span className={`text-[10px] font-bold whitespace-nowrap ${s.done ? 'text-emerald-700' : isCur ? 'text-amber-700' : 'text-slate-400'}`}>
                  {s.done ? (fmt(s.completedAt) || 'Done') : isCur ? 'Now' : ''}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* Read-only summary of what was submitted */}
      <section className="rounded-xl border border-slate-200 overflow-hidden">
        <button type="button" onClick={() => setSummaryOpen((v) => !v)} aria-expanded={summaryOpen}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 text-sm font-bold text-slate-700">
          Your application
          <span className="text-slate-400">{summaryOpen ? '▲' : '▼'}</span>
        </button>
        {summaryOpen && (
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Verified Legal Name</p>
              <div className="grid grid-cols-3 gap-2">
                {legal.map(([label, v]) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 p-2 rounded-lg">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-sm font-medium text-slate-800 break-words">{v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Cell Group</p>
              <p className="text-sm font-medium text-slate-800">{membershipFieldValue(app, 'cellName') || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Documents handed over</p>
              <ul className="space-y-1">
                {MEMBERSHIP_DOCUMENTS.map((d) => (
                  <li key={d.key} className="text-sm text-slate-700">{membershipDocumentProvided(app, d) ? '☑' : '☐'} {d.label}</li>
                ))}
              </ul>
            </div>
            <FamilyDetailsSection value={family} showSpouse={!!family.spouse?.firstName} />
          </div>
        )}
      </section>
    </div>
  )
}
