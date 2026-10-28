// Who conducts / operates each Sunday programme item. Names the Sunday Ministry
// Director typed for that Sunday (sunday_program/people_{date}) always win; without
// them, items that map to another department's roster pull the names from it:
//   Worship / Praise   → every worship leader / co-lead on Worship's roster (anyone
//                        rostered as Worship Leader, then each Lead Vocal with the
//                        songs they lead)
//   Altar Call         → the Altar Call Worship leader (Lead Vocal-4) only; while the
//                        programme has such an item, that slot drops out of the
//                        Worship / Praise item above
//   Pre-Service        → that Sunday's speakers on the monthly Pre-Service schedule
//                        (else its Pre-Service Leader)
//   Sermon / Message   → the Senior Pastor (edit for a guest speaker)
// An item can have several people: the Director types them comma-separated.
// Media cues (Display Lyrics, Camera Switch…) map to Media's crew area for that
// Sunday (Projection, Sound, Camera…), falling back to Worship's Sound Engineer for audio.

import { sortByWorshipRole, isAltarCallRole } from './worshipRoleOrder'

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

const AUTO_RULES = [
  // Before the generic worship rule — "Altar Call Worship" would match both.
  {
    test: ALTAR_CALL_ITEM, role: 'Altar Call Worship Leader', source: 'Worship roster',
    pick: (r) => worshipLeaders((r.worship || []).filter((a) => isAltarCallRole(a.role))),
  },
  {
    test: /worship|praise/i, role: 'Worship Leader', source: 'Worship roster',
    pick: (r, ctx) => worshipLeaders(r.worship, { excludeAltarCall: !!ctx?.hasAltarCallItem }),
  },
  {
    test: /pre[\s-]?service/i, role: 'Pre-Service Speaker', source: 'Pre-Service schedule',
    pick: (r) => (r.preServiceSpeakers?.length ? r.preServiceSpeakers.map((name) => ({ name, songs: [] })) : asLeads(r.preServiceLeader)),
  },
  { test: /sermon|message|preach/i, role: 'Speaker', source: 'Senior Pastor', pick: (r) => asLeads(r.seniorPastor) },
]

/** The roster rule an item name falls under, or null for a manual-only item. */
export function autoRuleFor(programName) {
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
    const rule = autoRuleFor(name)
    const autoLeads = rule ? rule.pick(rosters, ctx) : []
    const typed = splitNames(manual[name]?.name)
    // A typed name keeps the songs the roster has that person leading.
    const leads = typed.length
      ? typed.map((n) => autoLeads.find((l) => l.name.toLowerCase() === n.toLowerCase()) || { name: n, songs: [] })
      : autoLeads
    if (!leads.length) continue
    const names = leads.map((l) => l.name)
    out[name] = {
      name: names.join(', '),
      names,
      leads,
      role: plural(typed.length ? manual[name].role || rule?.role || '' : rule.role, names.length),
      source: typed.length ? 'manual' : rule.source,
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
