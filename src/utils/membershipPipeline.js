// Membership Onboarding Pipeline — 8 sequential milestones for a PCS person who
// wants to become a church member. Started by "+ Initiate Membership Process" on
// the PCS profile; stored on the caring_pcs entry as `membershipPipeline`:
//
//   membershipPipeline: {
//     status: 'in_progress' | 'completed', startedAt, startedBy, completedAt?,
//     stages: { <manual stage key>: { status: 'completed', completedAt, by, …extra } }
//   }
//
// Stages 1–3 are never stored — they're read live from existing records (cell
// roster, baptism record, submitted membership application), so they can't drift
// from the truth. Stages 4–8 are one-click by staff, strictly in order, gated by
// role (see canAdvanceStage).

export const MEMBERSHIP_STAGES = [
  { key: 'cellMembership',           n: 1, label: 'Cell Membership',        detail: 'Active member of an assigned cell group', auto: true, publicDetail: 'You are part of a cell group' },
  { key: 'baptism',                  n: 2, label: 'Water Baptism',          detail: 'Baptism recorded (in-house or external)', auto: true, publicDetail: 'Your water baptism is on record' },
  { key: 'applicationSubmitted',     n: 3, label: 'Application',            detail: 'Membership form submitted with verified legal name', auto: true, publicDetail: 'Your membership form was received' },
  { key: 'verification',             n: 4, label: 'Verification',           detail: 'Documents & ID checked by the office', publicDetail: 'The church office is checking your baptism certificate and ID',
    action: 'Mark Verified', who: 'caring' },
  { key: 'cellLeaderApproval',       n: 5, label: 'Cell Leader Approval',   detail: 'The cell leader calls the applicant and approves on their My Workspace', publicDetail: 'Waiting for sign-off from your Cell Leader',
    action: 'Notify Cell Leader', who: 'caring' },
  { key: 'membershipInterview',      n: 6, label: 'Membership Interview',   detail: 'Pastoral / leadership interview held', publicDetail: 'A short membership interview with the pastoral team',
    action: 'Mark Interview Complete', who: 'caring' },
  { key: 'pastoralApproval',         n: 7, label: 'Pastoral Approval',      detail: 'Final clearance by the Senior Pastor', publicDetail: 'Final clearance from the Senior Pastor',
    action: 'Give Pastoral Approval', who: 'pastor' },
  { key: 'certificateAndCardIssued', n: 8, label: 'Certificate & Card',     detail: 'Membership certificate and card issued', publicDetail: 'Your membership certificate and card are issued',
    action: 'Issue Certificate & Card', who: 'caring' },
]

export const MANUAL_STAGE_KEYS = MEMBERSHIP_STAGES.filter((s) => !s.auto).map((s) => s.key)

export const hasMembershipPipeline = (entry) => !!entry?.membershipPipeline?.startedAt

/**
 * Every stage's state for one person. `facts` = { hasCell, baptised, application }
 * where application is their latest membership application (any status).
 * Returns [{ ...stage, done, completedAt, by, extra }], in order.
 */
export function resolveMembershipStages(entry, { hasCell, baptised, application } = {}) {
  const stored = entry?.membershipPipeline?.stages || {}
  const appDone = !!application && ['submitted', 'info_requested', 'approved'].includes(application.status)
  const auto = {
    cellMembership: { done: !!hasCell },
    baptism: { done: !!baptised },
    applicationSubmitted: { done: appDone, completedAt: appDone ? application.submittedAt : null },
  }
  return MEMBERSHIP_STAGES.map((s) => {
    if (s.auto) return { ...s, ...auto[s.key] }
    const rec = stored[s.key]
    return { ...s, done: rec?.status === 'completed', completedAt: rec?.completedAt || null, by: rec?.by || '', extra: rec || {} }
  })
}

/** The first stage not yet done (null when all 8 are). */
export const currentStage = (stages) => stages.find((s) => !s.done) || null

/** "Stage 4 of 8: Verification Pending" / "All 8 stages complete". */
export function stageSummary(stages) {
  const cur = currentStage(stages)
  return cur ? `Stage ${cur.n} of 8: ${cur.label} Pending` : 'All 8 stages complete'
}

/**
 * Can this user complete this stage now? Only the current stage, only when every
 * earlier one is done, and only the right role: Pastoral Approval → Founder /
 * Senior Pastor; everything else → Caring (who record the cell leader's paper
 * sign-off too). Returns '' when allowed, else the reason.
 */
// The First Lady signs off on the pastoral-oversight stages (Membership Interview,
// Pastoral Approval) from her My Workspace, alongside the Senior Pastor.
export const FIRST_LADY_STAGE_KEYS = ['membershipInterview', 'pastoralApproval']

export function advanceBlockReason(stage, stages, { canCaring, canPastor, canFirstLady = false }) {
  const cur = currentStage(stages)
  if (!cur || cur.key !== stage.key) return 'Complete the earlier stages first.'
  if (stage.auto) return 'Completes automatically from church records.'
  if (canFirstLady && FIRST_LADY_STAGE_KEYS.includes(stage.key)) return ''
  if (stage.who === 'pastor' && !canPastor) return 'Only the Senior Pastor can give Pastoral Approval.'
  if (stage.who === 'caring' && !canCaring) return 'Only the Caring team can update this stage.'
  return ''
}

/** Undo is allowed only for the most recently completed manual stage. */
export function undoableStageKey(stages) {
  const done = stages.filter((s) => !s.auto && s.done)
  const last = done[done.length - 1]
  if (!last) return null
  const next = stages.find((s) => s.n === last.n + 1)
  return next && next.done ? null : last.key
}

// ─── Applicant view (public QR page) ─────────────────────────────────────────
// The public page is signed-out and can't read the PCS record, so staff screens
// mirror the resolved stages onto the membership application as pipelineProgress.

const toIso = (d) => { const dt = d ? new Date(d) : null; return dt && !isNaN(dt.getTime()) ? dt.toISOString() : null }

/** Compact mirror written onto the application. `sig` changes whenever any stage does. */
export function progressMirror(stages) {
  const list = stages.map((s) => ({ key: s.key, done: !!s.done, completedAt: s.done ? toIso(s.completedAt) : null }))
  return { stages: list, sig: list.map((s) => `${s.key}:${s.done ? 1 : 0}`).join('|') }
}

/** Stages as the applicant sees them: the staff mirror when there is one, else what
 *  the submitted application itself shows (cell, baptism and the form done). */
export function stagesForApplicant(app) {
  const mirror = app?.pipelineProgress?.stages
  // 'declaration_requested' = Stage 4 sent the baptism self-declaration back: the
  // form counts as not submitted again until it is signed.
  const submitted = !!app && app.status !== 'pending' && app.status !== 'declaration_requested'
  return MEMBERSHIP_STAGES.map((s) => {
    const m = mirror?.find((x) => x.key === s.key)
    // Once the form is (re)submitted, stages 1–3 are done even if the staff mirror
    // hasn't been refreshed yet (e.g. right after the applicant signs a declaration).
    if (m) return { ...s, done: !!m.done || (submitted && s.auto), completedAt: m.completedAt || (submitted && s.key === 'applicationSubmitted' ? toIso(app?.submittedAt) : null) }
    if (s.auto) return { ...s, done: submitted, completedAt: s.key === 'applicationSubmitted' ? toIso(app?.submittedAt) : null }
    return { ...s, done: false, completedAt: null }
  })
}
