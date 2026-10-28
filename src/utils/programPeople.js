// Who conducts / operates each Sunday programme item. Items that another department
// schedules are read-only here (locked) — always that department's names:
//   Pre-Service        → that Sunday's speakers on the monthly Pre-Service schedule
//   Psalms Reading,
//   Announcements      → Sec Core's Sunday Leader for that date (the same person on both)
//   Worship / Altar Call → Worship's roster (below)
// Other items take names the Sunday Ministry Director set for that Sunday
// (sunday_program/people_{date}); without them they fall back to a default or roster:
//   Sermon / Message   → the Senior Pastor (override / add guest speakers)
//   Invocation Prayer  → the First Lady (changeable)
// Roster details:
//   Worship / Praise   → every worship leader / co-lead on Worship's roster (anyone
//                        rostered as Worship Leader, then each Lead Vocal with the
//                        songs they lead)
//   Altar Call         → the Altar Call Worship leader (Lead Vocal-4) only; while the
//                        programme has such an item, that slot drops out of the
//                        Worship / Praise item above
//   Pre-Service        → falls back to the Pre-Service Leader when no speakers are set
// An item can have several people: the Director types them comma-separated.
// Media cues (Display Lyrics, Camera Switch…) map to Media's crew area for that
// Sunday (Projection, Sound, Camera…), falling back to Worship's Sound Engineer for audio.

import { sortByWorshipRole, isAltarCallRole } from './worshipRoleOrder'

// Default for the Invocation Prayer until the Director picks someone else.
export const FIRST_LADY_NAME = 'Rajitha Benson'

const withPastor = (name) => (name && !/^pastor\b/i.test(name) ? `Pastor ${name}` : name)

/** Several names typed in one box: "A, B", "A & B", "A and B" or one per line. */
export function splitNames(value) {
  const out = []
  for (const n of String(value || '').split(/\s*(?:,|&|\n|\band\b)\s*/i)) {
    const t = n.trim()
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

/** A Sunday's worship leaders in slot order — [{ name, songs }] (songs each one leads).
 * `excludeAltarCall` leaves out the Altar Call Worship slot (Lead Vocal-4) — used when
 * the programme has its own Altar Call item, which that slot fills instead. */
export function worshipLeaders(assignments = [], { excludeAltarCall = false } = {}) {
  const named = sortByWorshipRole(assignments.filter((a) =>
    String(a.memberName || '').trim() && !(excludeAltarCall && isAltarCallRole(a.role))))
  const rows = [
    ...named.filter((a) => /worship\s*leader/i.test(a.role || '')),
    ...named.filter((a) => /^lead vocal/i.test(a.role || '')),
  ]
  const out = []
  for (const a of rows) {
    const name = a.memberName.trim()
    let lead = out.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (!lead) { lead = { name, songs: [] }; out.push(lead) }
    const song = String(a.songName || '').trim()
    if (song && !lead.songs.includes(song)) lead.songs.push(song)
  }
  return out
}

const asLeads = (value) => splitNames(value).map((name) => ({ name, songs: [] }))

const ALTAR_CALL_ITEM = /alt[ae]r\s*call/i
const MEDIA_ITEM = /video|stream|broadcast|countdown|slides?\b|projection|media|clip|trailer/i

const AUTO_RULES = [
  // Sec Core's Sunday Leader reads the Psalm and gives the announcements.
  {
    test: /psalm|announcement/i, role: 'Sunday Leader', source: 'Sec Core Sunday Leader', dept: 'Sec Core', locked: true,
    pick: (r) => asLeads(r.sundayLeader),
  },
  // Before the generic worship rule — "Altar Call Worship" would match both.
  {
    test: ALTAR_CALL_ITEM, role: 'Altar Call Worship Leader', source: 'Worship roster', dept: 'Worship', locked: true,
    pick: (r) => worshipLeaders((r.worship || []).filter((a) => isAltarCallRole(a.role))),
  },
  {
    test: /worship|praise/i, role: 'Worship Leader', source: 'Worship roster', dept: 'Worship', locked: true,
    pick: (r, ctx) => worshipLeaders(r.worship, { excludeAltarCall: !!ctx?.hasAltarCallItem }),
  },
  {
    test: /pre[\s-]?service/i, role: 'Pre-Service Speaker', source: 'Pre-Service schedule', dept: 'Pre-Service', locked: true,
    pick: (r) => (r.preServiceSpeakers?.length ? r.preServiceSpeakers.map((name) => ({ name, songs: [] })) : asLeads(r.preServiceLeader)),
  },
  { test: /sermon|message|preach/i, role: 'Speaker', source: 'Senior Pastor (default)', dept: 'Senior Pastor', isDefault: true, pick: (r) => asLeads(withPastor(r.seniorPastor)) },
  {
    test: /invocation/i, role: 'Invocation Prayer', source: 'First Lady (default)', dept: 'First Lady', isDefault: true,
    pick: (r) => asLeads(r.firstLady || FIRST_LADY_NAME),
  },
  { test: MEDIA_ITEM, role: 'Media Operator', source: 'Media crew', dept: 'Media', pick: (r, ctx, name) => mediaOperators(r.mediaCrew, name) },
]

/**
 * Media items (Intro video, Livestream, Countdown…): that Sunday's Media crew from
 * the Assign tab — the stream in-charge first for stream items, else the video /
 * projection operators, each falling back to the other.
 */
export function mediaOperators(crew = [], programName = '') {
  const inArea = (re) => [...new Set((crew || []).filter((c) => re.test(c.area || '')).map((c) => c.name))]
  const stream = inArea(/stream|live|broadcast|in[\s-]?charge/i)
  const operators = inArea(/video|projection|presentation|screen|media|operator|propresenter|slide/i)
  const order = /stream|broadcast|live/i.test(programName) ? [stream, operators] : [operators, stream]
  return (order.find((l) => l.length) || []).map((name) => ({ name, songs: [] }))
}

// Which department manages an item — chosen per item in Default Program and saved
// as programOwners on the template. A department with a roster rule fills the names
// in from it; the rest just show the department.
export const PROGRAM_DEPARTMENTS = [
  { id: 'worship', label: 'Worship', rule: 'worship' },
  { id: 'media', label: 'Media', rule: 'media' },
  { id: 'pre-service', label: 'Pre-Service', rule: 'pre-service' },
  { id: 'senior-pastor', label: 'Senior Pastor', rule: 'sermon' },
  { id: 'sunday-ministry', label: 'Sunday Ministry' },
  { id: 'd-light', label: 'D-Light' },
  { id: 'caring', label: 'Caring' },
  { id: 'administration', label: 'Administration' },
]
const ruleWithRole = (role) => AUTO_RULES.find((r) => r.role === role)
const RULE_BY_ID = {
  worship: ruleWithRole('Worship Leader'),
  media: ruleWithRole('Media Operator'),
  'pre-service': ruleWithRole('Pre-Service Speaker'),
  sermon: ruleWithRole('Speaker'),
}
export const programDepartment = (id) => PROGRAM_DEPARTMENTS.find((d) => d.id === id) || null

/** A department's own guess for an item from its name (shown before one is chosen). */
export function guessDepartment(programName) {
  const n = String(programName || '')
  if (MEDIA_ITEM.test(n)) return 'media'
  if (/pre[\s-]?service/i.test(n)) return 'pre-service'
  if (/sermon|message|preach/i.test(n)) return 'senior-pastor'
  if (/worship|praise|alt[ae]r\s*call/i.test(n)) return 'worship'
  return ''
}

/**
 * The roster rule for an item: its chosen department's (owners: { [programName]:
 * departmentId }), else by its name; null for a manual-only item. A department with
 * no roster rule gives { deptOnly } so the item still shows who manages it.
 */
export function autoRuleFor(programName, owners = {}) {
  const locked = AUTO_RULES.find((r) => r.locked && r.test.test(String(programName || '')))
  if (locked) return locked
  const dept = programDepartment(owners?.[programName])
  if (dept) {
    // An Altar Call item managed by Worship keeps its own Altar Call rule.
    if (dept.rule === 'worship' && ALTAR_CALL_ITEM.test(String(programName || ''))) return { ...ruleWithRole('Altar Call Worship Leader'), dept: dept.label }
    return dept.rule ? { ...RULE_BY_ID[dept.rule], dept: dept.label } : { role: '', source: dept.label, dept: dept.label, deptOnly: true, pick: () => [] }
  }
  return AUTO_RULES.find((r) => r.test.test(String(programName || ''))) || null
}

const plural = (role, n) => (n > 1 && role && !/s$/i.test(role) ? `${role}s` : role)

/**
 * { [programName]: { name, names, leads, role, source, auto } }. `name` is everyone
 * joined for display, `names` the list, `leads` [{ name, songs }] (the worship songs
 * each one leads; empty for other items). `source` is 'manual' or the roster the
 * names came from; `auto` is what the roster alone would give (shown as a hint
 * beside a manual override). Items with nobody are left out.
 */
export function resolveProgramPeople(programNames, manual = {}, rosters = {}) {
  const out = {}
  const ctx = { hasAltarCallItem: programNames.some((n) => ALTAR_CALL_ITEM.test(String(n || ''))) }
  for (const name of programNames) {
    const rule = autoRuleFor(name, rosters.owners)
    const autoLeads = rule ? rule.pick(rosters, ctx, name) : []
    // A locked item always shows its department's names (nothing typed overrides it).
    const typed = rule?.locked ? [] : splitNames(manual[name]?.name)
    // A typed name keeps the songs the roster has that person leading.
    const leads = typed.length
      ? typed.map((n) => autoLeads.find((l) => l.name.toLowerCase() === n.toLowerCase()) || { name: n, songs: [] })
      : autoLeads
    const dept = rule?.dept || ''
    if (!leads.length) {
      // Nobody named, but a department was chosen for it: show the department.
      if (dept) out[name] = { name: dept, names: [], leads: [], role: 'Department', source: dept, dept, locked: !!rule?.locked, auto: '' }
      continue
    }
    const names = leads.map((l) => l.name)
    out[name] = {
      name: names.join(', '),
      names,
      leads,
      role: plural(typed.length ? manual[name].role || rule?.role || '' : rule.role, names.length),
      source: typed.length ? 'manual' : rule.source,
      dept,
      locked: !!rule?.locked,
      isDefault: !typed.length && !!rule?.isDefault,
      auto: autoLeads.map((l) => l.name).join(', '),
    }
  }
  return out
}

const CUE_AREAS = [
  { test: /mic|audio|sound|instrument/i, area: /sound|audio/i, soundFallback: true },
  { test: /camera|shot|focus/i, area: /camera/i },
  { test: /stream|broadcast|go live/i, area: /stream|live|broadcast/i },
  { test: /light/i, area: /light/i },
  { test: /video/i, area: /video|projection|presentation|screen/i },
  { test: /./, area: /projection|presentation|screen|slide|lyric|display|propresenter/i },
]

/** Media crew member(s) for a cue, e.g. 'Display Lyrics' → the Projection crew. */
export function cueOperator(cue, crew = [], soundEngineer = '') {
  const rule = CUE_AREAS.find((r) => r.test.test(cue))
  const names = crew.filter((c) => rule.area.test(c.area || '')).map((c) => c.name)
  if (names.length) return [...new Set(names)].join(', ')
  return rule.soundFallback ? soundEngineer : ''
}

export function soundEngineer(assignments = []) {
  const a = assignments.find((x) => /sound engineer/i.test(x.role || '') && String(x.memberName || '').trim())
  return a ? a.memberName.trim() : ''
}
