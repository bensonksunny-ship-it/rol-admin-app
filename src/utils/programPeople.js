// Who conducts / operates each Sunday programme item. A name the Sunday Ministry
// Director typed for that Sunday (sunday_program/people_{date}) always wins; without
// one, items that map to another department's roster pull the name from it:
//   Worship / Praise   → Worship roster's worship leader (Lead Vocal-1)
//   Pre-Service        → that Sunday's Pre-Service Leader
//   Sermon / Message   → the Senior Pastor (edit for a guest speaker)
// Media cues (Display Lyrics, Camera Switch…) map to Media's crew area for that
// Sunday (Projection, Sound, Camera…), falling back to Worship's Sound Engineer for audio.

import { sortByWorshipRole } from './worshipRoleOrder'

function worshipLeader(assignments = []) {
  const named = assignments.filter((a) => String(a.memberName || '').trim())
  const explicit = named.find((a) => /worship\s*leader/i.test(a.role || ''))
  if (explicit) return explicit.memberName.trim()
  const lead = sortByWorshipRole(named.filter((a) => /^lead vocal/i.test(a.role || '')))[0]
  return lead ? lead.memberName.trim() : ''
}

const AUTO_RULES = [
  { test: /worship|praise/i, role: 'Worship Leader', source: 'Worship roster', pick: (r) => worshipLeader(r.worship) },
  { test: /pre[\s-]?service/i, role: 'Pre-Service Leader', source: 'Pre-Service roster', pick: (r) => r.preServiceLeader || '' },
  { test: /sermon|message|preach/i, role: 'Speaker', source: 'Senior Pastor', pick: (r) => r.seniorPastor || '' },
]

/** The roster rule an item name falls under, or null for a manual-only item. */
export function autoRuleFor(programName) {
  return AUTO_RULES.find((r) => r.test.test(String(programName || ''))) || null
}

/**
 * { [programName]: { name, role, source, auto } } — `source` is 'manual' or the
 * roster the name came from; `auto` is what the roster alone would give (shown as a
 * hint beside a manual override). Items with neither are left out.
 */
export function resolveProgramPeople(programNames, manual = {}, rosters = {}) {
  const out = {}
  for (const name of programNames) {
    const rule = autoRuleFor(name)
    const auto = rule ? rule.pick(rosters) : ''
    const m = manual[name]
    if (m?.name?.trim()) out[name] = { name: m.name.trim(), role: m.role || rule?.role || '', source: 'manual', auto }
    else if (auto) out[name] = { name: auto, role: rule.role, source: rule.source, auto }
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
