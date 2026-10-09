// PCS duplicate detection — shared by the PCS list (dedupeProfiles hides the
// extra cards) and the Find Duplicates / merge tool.
//
// Two entries are the same person when they share:
//   • the same D-Light visitor record (visitorId), or
//   • the same name (legal or display, case/space-insensitive) AND the same
//     phone (last 10 digits) or email.
// Phone alone is deliberately NOT enough — spouses and family members often share
// one number, and merging them would destroy a real profile.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const phone10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }

const COMPLETENESS_FIELDS = ['name', 'phone', 'email', 'dob', 'nativity', 'currentPlace', 'serviceAttended', 'howKnown',
  'attendedDate', 'membershipNumber', 'leadershipPosition', 'displayName', 'personId']

/** 0–1 share of key profile fields that are filled in. */
export function profileCompleteness(e) {
  const filled = COMPLETENESS_FIELDS.filter((k) => String(e?.[k] ?? '').trim() !== '').length
  return filled / COMPLETENESS_FIELDS.length
}

const ts = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null)?.getTime?.() || 0

/** Which entry of a duplicate group to keep: most complete, then most recently updated/added. */
export function pickMaster(group) {
  return [...group].sort((a, b) =>
    (profileCompleteness(b) - profileCompleteness(a)) ||
    (Math.max(ts(b.updatedAt), ts(b.addedAt)) - Math.max(ts(a.updatedAt), ts(a.addedAt))))[0]
}

function matchKeys(e) {
  const keys = []
  if (e.visitorId) keys.push(`v:${e.visitorId}`)
  const names = [...new Set([norm(e.name), norm(e.displayName)].filter(Boolean))]
  const ph = phone10(e.phone)
  const em = norm(e.email)
  names.forEach((n) => {
    if (ph) keys.push(`np:${n}|${ph}`)
    if (em) keys.push(`ne:${n}|${em}`)
  })
  return keys
}

/** Groups (arrays of 2+ entries) that are the same person. Union-find over shared keys. */
export function findDuplicateGroups(entries) {
  const parent = new Map()
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const owner = new Map()
  ;(entries || []).forEach((e) => {
    parent.set(e.id, e.id)
    matchKeys(e).forEach((k) => { if (owner.has(k)) union(e.id, owner.get(k)); else owner.set(k, e.id) })
  })
  const groups = new Map()
  ;(entries || []).forEach((e) => { const r = find(e.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e) })
  return [...groups.values()].filter((g) => g.length > 1)
}

/**
 * Collapse duplicates for display: one card per person (the master). Returns
 * { list, hiddenByMaster: Map<masterId, duplicate entries> }.
 */
export function dedupeProfiles(entries) {
  const hiddenByMaster = new Map()
  const hidden = new Set()
  findDuplicateGroups(entries).forEach((g) => {
    const master = pickMaster(g)
    const dupes = g.filter((e) => e.id !== master.id)
    hiddenByMaster.set(master.id, dupes)
    dupes.forEach((d) => hidden.add(d.id))
  })
  return { list: (entries || []).filter((e) => !hidden.has(e.id)), hiddenByMaster }
}
