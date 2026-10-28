// Shared helpers for the public Media Control Center (pages/MediaLiveControl.jsx)
// and the Upcoming Sunday card that publishes it (components/media/MediaLiveLinkCard.jsx).

export const MEDIA_LIVE_PHASES = [
  { id: 'reh', label: 'Saturday Rehearsal', cueDone: 'Tested', songDone: 'Slides ready' },
  { id: 'live', label: 'Sunday Live', cueDone: 'Done', songDone: 'Shown' },
]

// Firestore field-path safe: only [A-Za-z0-9_], so `checks.${key}` needs no escaping.
export function safeKey(s) {
  return String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'x'
}

export const checkKey = (phase, ...parts) => [phase, ...parts.map(safeKey)].join('__')

export function mediaLiveUrl(token) {
  return `${window.location.origin}/media-live/${token}`
}

// Each chord sits at its character offset (`pos`) above the lyric it lands on.
export function chordLine(chords, lyrics) {
  const len = Math.max(lyrics.length + 1, ...chords.map((c) => (c.pos || 0) + String(c.chord || '').length + 1))
  const arr = Array(len).fill(' ')
  for (const { chord = '', pos = 0 } of chords) {
    for (let j = 0; j < chord.length && pos + j < arr.length; j++) arr[pos + j] = chord[j]
  }
  return arr.join('').trimEnd()
}

// A worship_songs doc's sections in playback order: [{ name, lines: [{ lyrics, chords }] }].
// Falls back to the plain `sections` lyrics for older songs saved without `blocks`.
export function songSections(lib) {
  if (lib?.blocks?.length) {
    return lib.blocks.map((b) => ({
      name: b.sectionName || 'Section',
      lines: (b.lines || []).map((l) => ({
        lyrics: l.lyrics || '',
        chords: (l.chords || []).map((c) => ({ chord: String(c.chord || ''), pos: Number(c.pos) || 0 })),
      })),
    }))
  }
  if (lib?.sections?.length) {
    return lib.sections.map((s) => ({
      name: s.type || 'Section',
      lines: String(s.lyrics || '').split('\n').map((t) => ({ lyrics: t, chords: [] })),
    }))
  }
  return []
}

/**
 * Clean text for projection slides: lyrics only — no chords, title or section
 * labels — with a blank line between sections, which ProPresenter, EasyWorship,
 * OpenLP and PowerPoint outline import all treat as a slide break.
 */
export function songPresentationText(song) {
  return (song.sections || [])
    .map((s) => s.lines.map((l) => l.lyrics.trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n') + '\n'
}

// Run-sheet items whose songs come from Worship's schedule.
export const isWorshipItem = (name) => /worship|praise|song/i.test(String(name || ''))

function hashString(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * The public doc's content: programmes (with Media's cues) in service order and the
 * scheduled songs. Keys are stable per name so ticks survive a re-publish. A
 * programme's `songKeys` (songs Media attached to it, by songId / `name:<title>`)
 * become `songs`: the published keys of those songs. `audio` ({ id, name, url })
 * is the programme's attached audio, played from the Control Center.
 */
export function buildMediaLiveContent({ sundayDate, serviceStartTime = '', programs = [], songs = [], crew = [], stations = [] }) {
  const used = new Set()
  const uniq = (base) => {
    let k = base, n = 2
    while (used.has(k)) k = `${base}_${n++}`
    used.add(k)
    return k
  }
  const progKeys = programs.map((p) => uniq(safeKey(p.name)))
  const songKeys = songs.map((s) => uniq(`song_${safeKey(s.title)}`))
  const publishedSongKey = new Map(songs.map((s, i) => [s.k, songKeys[i]]))
  const body = {
    sundayDate,
    serviceStartTime: String(serviceStartTime || ''),
    programs: programs.map((p, i) => {
      const attached = (p.songKeys || []).map((k) => publishedSongKey.get(k)).filter(Boolean)
      return {
        key: progKeys[i],
        name: p.name,
        duration: Number(p.duration) || 0,
        startTime: String(p.startTime || ''),
        elements: [...new Set(p.elements || [])],
        ...(attached.length ? { songs: attached } : {}),
        ...(p.parallel ? { parallel: true } : {}),
        // Audio Media attached to the element (backing track / sound effect) — the desk plays it.
        ...(p.audio?.length ? { audio: p.audio.filter((t) => t?.url).map((t) => ({ id: String(t.id || ''), name: String(t.name || 'Audio'), url: String(t.url) })) } : {}),
        // Person in charge (utils/programPeople.js) and the Media crew operating each cue.
        ...(p.person ? { person: String(p.person), personRole: String(p.personRole || '') } : {}),
        // Several people (worship co-leads): each with the songs they lead.
        ...(p.leads?.length > 1 || p.leads?.some((l) => l.songs?.length)
          ? { leads: p.leads.map((l) => ({ name: String(l.name), songs: (l.songs || []).map(String) })) }
          : {}),
        ...(p.cueOps && Object.keys(p.cueOps).length ? { cueOps: p.cueOps } : {}),
      }
    }),
    songs: songs.map((s, i) => ({
      key: songKeys[i],
      title: s.title,
      musicKey: s.musicKey || '',
      singer: s.singer || '',
      sections: s.sections || [],
    })),
    // Names and areas only — never contact details (this doc is publicly readable).
    crew: crew.map((c) => ({ key: uniq(`crew_${safeKey(c.area)}_${safeKey(c.name)}`), area: c.area || 'Crew', name: c.name })),
    // Station dropdown entries — Media's Sub-Departments (see buildStations).
    stations,
  }
  return { ...body, contentHash: hashString(JSON.stringify(body)) }
}

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
const fmtMin = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Planned "start – end" label per programme. The run sheet is sequential: the first
 * item starts at the service start time and every next one at the previous item's
 * start + its duration. Stored per-item start times are ignored (they go stale when a
 * duration changes); only with no service start set does the first item's own time
 * anchor the sheet. `parallel` items (a department's own add-ons) keep their own time
 * and don't move the clock.
 */
export function plannedStarts(programs, serviceStartTime) {
  let cursor = toMin(serviceStartTime) ?? toMin(programs.find((p) => !p.parallel)?.startTime)
  return programs.map((p) => {
    const dur = Number(p.duration) || 0
    let at
    if (p.parallel) at = toMin(p.startTime)
    else {
      at = cursor
      if (cursor != null) cursor += dur
    }
    if (at == null) return ''
    return dur ? `${fmtMin(at)} – ${fmtMin(at + dur)}` : fmtMin(at)
  })
}

/**
 * The run sheet as minute windows, same rules as plannedStarts: items follow each
 * other from the service start; a parallel item keeps its own start time.
 * { hasClock, firstMin, items: [{ startMin, endMin } | null] } — without any start
 * time the windows are offsets from 0 (hasClock false).
 */
export function scheduleWindows(programs, serviceStartTime) {
  const clockStart = toMin(serviceStartTime) ?? toMin(programs.find((p) => !p.parallel)?.startTime)
  let cursor = clockStart ?? 0
  const items = programs.map((p) => {
    const dur = Number(p.duration) || 0
    if (p.parallel) {
      const at = toMin(p.startTime)
      return at == null || clockStart == null ? null : { startMin: at, endMin: at + dur }
    }
    const w = { startMin: cursor, endMin: cursor + dur }
    cursor += dur
    return w
  })
  return { hasClock: clockStart != null, firstMin: clockStart ?? 0, items }
}

/** Epoch ms of a local time (minutes after midnight) on an ISO date. */
export function dateAtMinutes(iso, mins) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, m - 1, d, 0, mins).getTime()
}

export function fmtClock(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

// ── Saturday rehearsal verification ──────────────────────────────────────────
// Each run-sheet item up to and including the Invocation prayer gets one checkpoint
// per technical system. Results live in the public doc's `verify` map under
// checkKey('reh', programKey, systemId): { status, note, at, by }.

export const REH_SYSTEMS = [
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'lights', label: 'Lights' },
  { id: 'slides', label: 'Presentation slides' },
  { id: 'stream', label: 'Live Stream' },
]

export const VERIFY_STATUSES = [
  { id: 'good', label: 'All Good' },
  { id: 'attention', label: 'Needs Attention' },
  { id: 'fixed', label: 'Fixed' },
]

export const verifyKey = (programKey, systemId) => checkKey('reh', programKey, systemId)

/** Items rehearsed for verification: up to and including the Invocation prayer (all items if there's none). */
export function rehearsalScope(programs) {
  const list = (programs || []).filter((p) => !p.songsOnly)
  const idx = list.findIndex((p) => /invocation/i.test(String(p.name || '')))
  return idx >= 0 ? list.slice(0, idx + 1) : list
}

/**
 * What the Director reviews: every checkpoint in scope with its status, counts per
 * status, the open issues, and a signature of all statuses + notes — a sign-off
 * stores the signature, so any later change shows the sign-off as out of date.
 */
export function rehearsalSummary(programs, verify = {}) {
  const items = rehearsalScope(programs).map((p) => ({
    program: p,
    systems: REH_SYSTEMS.map((s) => ({ ...s, key: verifyKey(p.key, s.id), entry: verify[verifyKey(p.key, s.id)] || null })),
  }))
  const all = items.flatMap((it) => it.systems.map((s) => ({ ...s, program: it.program })))
  const counts = { good: 0, attention: 0, fixed: 0, pending: 0 }
  all.forEach((s) => { counts[s.entry?.status && counts[s.entry.status] != null ? s.entry.status : 'pending'] += 1 })
  const signature = hashString(JSON.stringify(all.map((s) => [s.key, s.entry?.status || '', s.entry?.note || ''])))
  return {
    items,
    total: all.length,
    counts,
    attention: all.filter((s) => s.entry?.status === 'attention'),
    fixed: all.filter((s) => s.entry?.status === 'fixed'),
    signature,
  }
}

// ── Operator stations ────────────────────────────────────────────────────────
// Each crew station opens its own sub-link (/media-live/:token/:station) showing
// only its cues; the master link (no station) shows everything and runs the timer.
// All screens read the same public doc, so the live item and timings stay in sync.

export const MEDIA_STATIONS = [
  { id: 'projection', label: 'Projection', blurb: 'Slides, lyrics & video cues', systems: ['slides', 'video'], lyrics: true },
  { id: 'sound', label: 'Sound', blurb: 'Audio cues, tracks & song keys', systems: ['audio'], audio: true, songList: true },
  { id: 'lighting', label: 'Lighting', blurb: 'Lighting cues', systems: ['lights'] },
  { id: 'stream', label: 'Live Stream', blurb: 'Stream cues', systems: ['stream'] },
  { id: 'camera', label: 'Camera', blurb: 'Camera shots & cues', systems: ['video'] },
]

export const stationById = (id) => MEDIA_STATIONS.find((s) => s.id === id) || null

/**
 * The dropdown's stations come from Media's own Sub-Departments (Settings), published
 * with the content since the public page can't read them. Each one borrows the cue
 * matching, checkpoints and lyrics/audio panels of the built-in station its name reads
 * as (`kind`: "Projection & Slides" → projection); one that reads as none of them
 * (e.g. "Graphics") gets the cues that mention its name plus the unassigned ones.
 */
export function buildStations(subDepts = []) {
  const used = new Set()
  return subDepts.map((sd) => String(sd?.name || '').trim()).filter(Boolean).flatMap((label) => {
    const id = safeKey(label).toLowerCase()
    if (used.has(id)) return []
    used.add(id)
    // Most specific first, so "Video Camera" reads as camera, not projection.
    const kind = ['stream', 'camera', 'lighting', 'sound', 'projection'].find((k) => CREW_STATIONS[k].test(label)) || ''
    return [{ id, label, kind }]
  })
}

/** The station for a URL id: a published sub-department, else a built-in (older links). */
export function resolveStation(id, published) {
  if (!id) return null
  const sd = (published || []).find((s) => s.id === id)
  if (!sd) return stationById(id)
  const base = stationById(sd.kind)
  return base
    ? { ...base, id: sd.id, label: sd.label, kind: sd.kind }
    : { id: sd.id, label: sd.label, kind: '', blurb: `${sd.label} cues`, systems: [] }
}

export function mediaStationUrl(token, stationId) {
  return `${mediaLiveUrl(token)}/${stationId}`
}

// Which station a cue belongs to, by its wording (custom cues included); '' = everyone.
const CUE_STATIONS = [
  ['stream', /stream|broadcast|go live/i],
  ['camera', /camera|shot|focus/i],
  ['lighting', /light/i],
  ['sound', /mic\b|microphone|audio|sound|instrument/i],
  ['projection', /display|screen|slide|lyric|scripture|video|countdown|qr|lower third|presentation/i],
]
export function cueStation(el) {
  return CUE_STATIONS.find(([, re]) => re.test(String(el || '')))?.[0] || ''
}

/** A programme's cues for a station: its own plus the unassigned ones. All cues when station is null. */
export function stationCues(elements, station) {
  if (!station) return elements || []
  const kind = station.kind ?? station.id
  const word = String(station.label || '').toLowerCase()
  return (elements || []).filter((el) => {
    const s = cueStation(el)
    return !s || (kind ? s === kind : String(el).toLowerCase().includes(word))
  })
}

// Crew roster areas (Media → Assign) that belong to a station.
const CREW_STATIONS = {
  projection: /project|slide|present|screen|lyric|propresenter|easyworship|video/i,
  sound: /sound|audio|mix|foh|mic/i,
  lighting: /light/i,
  stream: /stream|broadcast|obs|online|youtube/i,
  camera: /camera|\bcam\b/i,
}
// Crew areas are the sub-department names, so a sub-department station matches its own name.
export const crewInStation = (area, station) => !station
  || String(area || '').trim().toLowerCase() === String(station.label || '').trim().toLowerCase()
  || !!CREW_STATIONS[station.kind ?? station.id]?.test(String(area || ''))
