// Level-wise progress for every application made through the app (Baptism, Baby
// Dedication, Marriage, Membership) — one place that turns an application doc into
// its ordered levels, used by My Workspace → Applications Progress
// (components/workspace/ApplicationsProgressWidget.jsx).
//
// RULE: every application type must appear here with its levels, and on the
// Founder's, the Caring Director's and the First Lady's My Workspace. A new
// application type = add it to APPLICATION_TYPE_KEYS (pastoralApplications.js) and
// a case to applicationLevels below, and open its collection's `list` to First Lady
// in firestore.rules.
//
// Level: { key, label, state: 'done' | 'current' | 'blocked' | 'waiting', note }
import { APPLICATION_TYPES, eventForApplication } from './pastoralApplications'
import { resolveBaptismStages } from './baptismProgress'
import { stagesForApplicant } from './membershipPipeline'

const fmt = (d) => {
  const dt = d instanceof Date ? d : d ? new Date(d) : null
  return dt && !isNaN(dt.getTime()) ? dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''
}

/** Approval → event → completed, shared by every type that ends in a Caring event. */
function eventLevels(app, events, { readyForApproval, eventLabel, doneLabel }) {
  const ev = eventForApplication(app, events)
  const approved = app.status === 'approved' || !!ev
  const rejected = app.status === 'rejected'
  return [
    {
      key: 'approval', label: 'Approval',
      ...(approved ? { state: 'done', note: app.decidedBy ? `by ${app.decidedBy}` : 'Approved' }
        : rejected ? { state: 'blocked', note: 'Not approved' }
        : app.status === 'info_requested' ? { state: 'current', note: 'More info requested' }
        : readyForApproval ? { state: 'current', note: 'Awaiting review' }
        : { state: 'waiting', note: '' }),
    },
    {
      key: 'event', label: eventLabel,
      ...(ev ? { state: 'done', note: [ev.batchCode, fmt(ev.date)].filter(Boolean).join(' · ') || 'Scheduled' }
        : approved ? { state: 'current', note: 'Not linked to an event yet' }
        : { state: 'waiting', note: '' }),
    },
    {
      key: 'completed', label: doneLabel,
      ...(ev?.status === 'completed' ? { state: 'done', note: fmt(ev.date) }
        : ev ? { state: 'current', note: fmt(ev.date) ? `On ${fmt(ev.date)}` : 'Upcoming' }
        : { state: 'waiting', note: '' }),
    },
  ]
}

function formLevel(app) {
  return app.status === 'pending'
    ? { key: 'form', label: 'Application', state: 'current', note: 'Link sent — not filled yet' }
    : { key: 'form', label: 'Application', state: 'done', note: fmt(app.submittedAt) ? `Submitted ${fmt(app.submittedAt)}` : 'Submitted' }
}

/** Ordered levels for one application. `events` = Caring events (for the event levels). */
export function applicationLevels(type, app, events = []) {
  if (!app) return []
  if (type === 'baptism') {
    const stages = resolveBaptismStages(app).map((s) => ({ key: s.key, label: s.label.replace(' Sign-off', ''), state: s.state, note: s.note }))
    return [...stages, ...eventLevels(app, events, {
      readyForApproval: stages.every((s) => s.state === 'done'), eventLabel: 'Baptism Batch', doneLabel: 'Baptised',
    })]
  }
  if (type === 'membership') {
    const stages = stagesForApplicant(app)
    const cur = stages.find((s) => !s.done)
    return stages.map((s) => ({
      key: s.key, label: s.label,
      state: s.done ? 'done' : s === cur ? (app.status === 'rejected' ? 'blocked' : 'current') : 'waiting',
      note: s.done ? fmt(s.completedAt)
        : s === cur && app.status === 'pending' ? 'Link sent — not filled yet'
        : s === cur && app.status === 'revision_requested' ? 'Returned for revisions'
        : s === cur && app.status === 'declaration_requested' ? 'Baptism declaration requested'
        : '',
    }))
  }
  const form = formLevel(app)
  return [form, ...eventLevels(app, events, {
    readyForApproval: form.state === 'done',
    eventLabel: type === 'marriage' ? 'Wedding Scheduled' : 'Dedication Scheduled',
    doneLabel: type === 'marriage' ? 'Married' : 'Dedicated',
  })]
}

/** The level the application is on now (first not done), or null when all are done. */
export const currentLevel = (levels) => levels.find((l) => l.state !== 'done') || null

/** Finished one way or the other: every level done, not approved, or closed. */
export function applicationFinished(type, app, levels) {
  if (app.status === 'rejected' || app.closedAt) return true
  return !currentLevel(levels)
}

/** Name to show for an application (submitted name, else the name it was sent to). */
export function applicationName(type, app) {
  const p = app.prefill || {}
  return APPLICATION_TYPES[type]?.title(app) || p.legalName || p.fullName || p.name
    || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.applicantName || 'Unnamed'
}

/** An unsent / unused link that has lapsed isn't in progress any more. */
export function applicationLapsed(type, app) {
  if (app.status !== 'pending') return false
  if (type === 'membership') return !!app.closedAt
  const exp = app.expiresAt instanceof Date ? app.expiresAt : null
  return !!exp && exp.getTime() < Date.now()
}
