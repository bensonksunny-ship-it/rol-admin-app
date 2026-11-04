// Cell Director → Unassigned drawer (CellDirectorCockpit.jsx):
//  • findCellMatch — is this unassigned person already (or probably) on a cell roster?
//  • suggestCellFor — the "Ask D-Light for Cell" auto-suggestion: scores every active
//    cell from the person's D-Light visitor record (locality, service attended, family
//    sharing their phone) against the members already in each cell.
//
// `cells` = CellDirectorCockpit's cellMemberData: [{ cellId, fullCellName, memberCount,
//   members: [{ name, nameKey, visitorId, phoneKey, locality }] }]

const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
export const phone10 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : '' }

/** Names that are probably the same person: same letters, one inside the other, or a lone first name. */
function namesAlike(a, b) {
  const ca = compact(a), cb = compact(b)
  if (!ca || !cb) return false
  if (ca === cb) return true
  const [short, long] = ca.length <= cb.length ? [ca, cb] : [cb, ca]
  if (short.length >= 5 && long.includes(short)) return true
  const ta = tokens(a), tb = tokens(b)
  return (ta.length === 1 || tb.length === 1) && ta[0] === tb[0] && ta[0]?.length >= 3
}

/**
 * Where this person already sits, across every active cell:
 *   { level: 'definite', cellName }  — same visitor record or same name
 *   { level: 'possible', cellName, member } — a similar name, or a shared phone
 *                                     (families often share one number)
 *   null — no roster has them.
 */
export function findCellMatch(item, cells) {
  const nameKey = norm(item.name)
  const ph = phone10(item.phone)
  let possible = null
  for (const c of cells || []) {
    for (const m of c.members || []) {
      if ((item.visitorId && m.visitorId === item.visitorId) || (nameKey && norm(m.name) === nameKey)) {
        return { level: 'definite', cellName: c.fullCellName || c.cellName, member: m.name }
      }
      if (!possible && ((ph && m.phoneKey === ph) || namesAlike(item.name, m.name))) {
        possible = { level: 'possible', cellName: c.fullCellName || c.cellName, member: m.name }
      }
    }
  }
  return possible
}

/** The person's D-Light visitor record: by visitorId, else phone, else exact name. */
export function findVisitorFor(item, visitors) {
  const list = (visitors || []).filter((v) => !v.mergedInto)
  if (item.visitorId) { const v = list.find((x) => x.id === item.visitorId); if (v) return v }
  const ph = phone10(item.phone)
  if (ph) { const v = list.find((x) => phone10(x.phone) === ph); if (v) return v }
  const key = norm(item.name)
  return list.find((x) => norm(x.name) === key) || null
}

const placeWords = (s) => tokens(s).filter((w) => w.length >= 4 && !['road', 'nagar', 'layout', 'main', 'cross', 'street', 'bangalore', 'bengaluru', 'stage', 'phase', 'block'].includes(w))

/**
 * Best-fit cells for an unassigned person, highest score first:
 * [{ cellId, cellName, score, reasons: [..] }] (only cells with some signal).
 *   +6  a member shares their phone number (family)
 *   +3  per member living in the same locality (max 3 members counted)
 *   +1  per member attending the same Sunday service (max 3)
 * Ties go to the smaller cell, which has more room.
 */
export function suggestCellFor(item, cells, visitors) {
  const visitor = findVisitorFor(item, visitors)
  const place = placeWords(visitor?.currentPlace || item.locality || '')
  const service = norm(visitor?.serviceAttended)
  const ph = phone10(item.phone || visitor?.phone)
  const visitorById = new Map((visitors || []).map((v) => [v.id, v]))

  const scored = (cells || []).map((c) => {
    let score = 0
    const reasons = []
    const family = ph ? (c.members || []).filter((m) => m.phoneKey === ph) : []
    if (family.length) { score += 6; reasons.push(`family: ${family.map((m) => m.name).join(', ')}`) }
    if (place.length) {
      const near = (c.members || []).filter((m) => {
        const loc = placeWords(m.locality || visitorById.get(m.visitorId)?.currentPlace || '')
        return loc.some((w) => place.includes(w))
      })
      if (near.length) { score += 3 * Math.min(near.length, 3); reasons.push(`${near.length} member${near.length === 1 ? '' : 's'} near ${visitor?.currentPlace || item.locality}`) }
    }
    if (service) {
      const same = (c.members || []).filter((m) => norm(visitorById.get(m.visitorId)?.serviceAttended) === service)
      if (same.length) { score += Math.min(same.length, 3); reasons.push(`${same.length} at the ${visitor.serviceAttended}`) }
    }
    return { cellId: c.cellId, cellName: c.fullCellName || c.cellName, score, reasons, size: c.memberCount || 0 }
  })
  return {
    visitor,
    suggestions: scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.size - b.size),
  }
}
