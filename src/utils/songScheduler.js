// Who scheduled a song onto a Sunday setlist (Songs → Schedule song / the calendar
// button on a song card). Stored on the worship_schedule assignment row beside the
// song: scheduledByUid (the owner key), scheduledByName (display) and scheduledBy
// (email — the original field, kept for rows written before the uid existed).
export const SCHEDULER_FIELDS = ['scheduledBy', 'scheduledByUid', 'scheduledByName']

/** The scheduler fields present on a row, as strings — spread into rewritten rows so saves keep them. */
export function schedulerFields(row) {
  const out = {}
  if (!row?.songName && !row?.songId) return out
  for (const k of SCHEDULER_FIELDS) if (row[k]) out[k] = String(row[k])
  return out
}

/** Fields to stamp on a row when `scheduler` ({ uid, email, name }) schedules a song. */
export function schedulerStamp(scheduler) {
  return {
    scheduledBy: String(scheduler?.email || ''),
    scheduledByUid: String(scheduler?.uid || ''),
    scheduledByName: String(scheduler?.name || ''),
  }
}
