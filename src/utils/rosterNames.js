// Cell rosters show each member under their linked (canonical) person name, while
// the roster row keeps its own stored name as `originalName`. Attendance is stored
// by NAME (Sunday sundayCellAttendance, cell report attendees), and a member counts
// as present when EITHER name is in the list (the originalName fallback covers old
// records saved before a rename).
//
// That only works if every name belongs to exactly one member. It broke when a
// roster row was re-linked to another person without renaming it: Sarah Nag's row
// still stored "Blessy Ng", so ticking Blessy Ng also ticked Sarah Nag.
//
// separateRosterNames() makes the names unambiguous within one roster:
//  1. Two rows linked to the same person (a wrong link): each falls back to its own
//     stored roster name, so they stay distinct chips.
//  2. A stored roster name that is another member's name is dropped as a fallback
//     match (originalName is removed), so it can never tick that other member.
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()

export function separateRosterNames(members) {
  if (!Array.isArray(members) || members.length < 2) return members || []
  const hasOrig = (m) => m.originalName != null && norm(m.originalName) && norm(m.originalName) !== norm(m.name)

  const canonCount = new Map()
  members.forEach((m) => canonCount.set(norm(m.name), (canonCount.get(norm(m.name)) || 0) + 1))
  const distinct = members.map((m) => (canonCount.get(norm(m.name)) > 1 && hasOrig(m)
    ? { ...m, name: String(m.originalName).trim(), originalName: undefined }
    : m))

  const names = new Set(distinct.map((m) => norm(m.name)))
  return distinct.map((m) => {
    if (!hasOrig(m) || !names.has(norm(m.originalName))) return m
    const { originalName: _dropped, ...rest } = m
    return rest
  })
}
