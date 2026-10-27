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

export function songPlainText(song) {
  const out = [String(song.title || '').toUpperCase(), '']
  for (const s of song.sections || []) {
    const lines = s.lines.map((l) => l.lyrics.trimEnd()).filter((t) => t.trim())
    if (lines.length) out.push(`[${s.name}]`, ...lines, '')
  }
  return out.join('\n').trimEnd() + '\n'
}

function hashString(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * The public doc's content: programmes (with Media's cues) in service order and the
 * scheduled songs. Keys are stable per name so ticks survive a re-publish.
 */
export function buildMediaLiveContent({ sundayDate, serviceStartTime = '', programs = [], songs = [] }) {
  const used = new Set()
  const uniq = (base) => {
    let k = base, n = 2
    while (used.has(k)) k = `${base}_${n++}`
    used.add(k)
    return k
  }
  const body = {
    sundayDate,
    serviceStartTime: String(serviceStartTime || ''),
    programs: programs.map((p) => ({
      key: uniq(safeKey(p.name)),
      name: p.name,
      duration: Number(p.duration) || 0,
      startTime: String(p.startTime || ''),
      elements: [...new Set(p.elements || [])],
    })),
    songs: songs.map((s) => ({
      key: uniq(`song_${safeKey(s.title)}`),
      title: s.title,
      musicKey: s.musicKey || '',
      singer: s.singer || '',
      sections: s.sections || [],
    })),
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

/** Planned start label per programme: its own startTime, else running on from the service start. */
export function plannedStarts(programs, serviceStartTime) {
  let cursor = toMin(serviceStartTime)
  return programs.map((p) => {
    const own = toMin(p.startTime)
    const at = own ?? cursor
    cursor = at == null ? null : at + (Number(p.duration) || 0)
    return at == null ? '' : fmtMin(at)
  })
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
