// Number-one Cell rule: a person may appear on only ONE cell roster, once.
// Rows are the same person when they share a visitorId OR a normalised name — so a
// legacy row with no visitorId still matches its linked twin in another cell.

export const normalizeMemberName = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')

const memberKeys = (m) => [
  m.visitorId ? `v:${m.visitorId}` : '',
  normalizeMemberName(m.name) ? `n:${normalizeMemberName(m.name)}` : '',
].filter(Boolean)

/**
 * Groups of active roster rows that are the same person, listed more than once
 * (in different cells or twice in the same cell). Each group: [{ id, cellId, name, ... }].
 */
export function findDuplicateCellMembers(members) {
  const active = (members || []).filter((m) => m.status !== 'inactive' && !m.mergedInto)
  const parent = active.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const firstByKey = new Map()
  active.forEach((m, i) => {
    for (const k of memberKeys(m)) {
      if (firstByKey.has(k)) parent[find(i)] = find(firstByKey.get(k))
      else firstByKey.set(k, i)
    }
  })
  const groups = new Map()
  active.forEach((m, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(m)
  })
  return [...groups.values()].filter((g) => g.length > 1)
}

/** Message shown whenever someone tries to add a person who is already on a cell roster. */
export const cellConflictMessage = (cellName) =>
  `This person is already added in a cell: ${cellName || 'another cell group'}.`
