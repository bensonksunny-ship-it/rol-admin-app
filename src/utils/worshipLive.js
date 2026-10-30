// Shared helpers for the Worship Control Center: the public link page
// (pages/WorshipLiveControl.jsx) and the Worship → Control Center tab that
// publishes it (components/worship/WorshipControlCenterTab.jsx).

import { safeKey, isWorshipItem } from './mediaLive'
import { sortByWorshipRole, worshipRoleLabel } from './worshipRoleOrder'

export { safeKey }

export const WORSHIP_LIVE_PHASES = [
  { id: 'reh', label: 'Saturday Rehearsal' },
  { id: 'live', label: 'Sunday Live' },
]

export function worshipLiveUrl(token) {
  return `${window.location.origin}/worship-live/${token}`
}

// ── Views per role ───────────────────────────────────────────────────────────
// `kind`: vocal → big lyrics (chords off by default); chords → chords over lyrics;
// full → everything. `inst` are the Song Designer's dynamics keys (SongDesigner.jsx
// INSTRUMENTS) whose tags mark this person's part; `leads` are the section "Lead"
// options (LEAD_OPTIONS) that put this role in front.
export const WORSHIP_VIEW_ROLES = [
  { id: 'lead', label: 'Lead Vocal', kind: 'vocal', inst: ['mVocal', 'fVocal'], leads: ['Lead Vocal'] },
  { id: 'parts', label: 'Parts / Harmony', kind: 'vocal', inst: ['parts'], leads: [] },
  { id: 'choir', label: 'Choir', kind: 'vocal', inst: ['choir'], leads: ['Choir'] },
  { id: 'keys', label: 'Keyboard', kind: 'chords', inst: ['keys', 'midi'], leads: ['Keys'] },
  { id: 'leadGuitar', label: 'Lead Guitar', kind: 'chords', inst: ['leadGuitar'], leads: ['Electric Guitar'] },
  { id: 'guitar', label: 'Acoustic / Rhythm Guitar', kind: 'chords', inst: ['acoustic', 'rhythmGuitar'], leads: ['Acoustic Guitar'] },
  { id: 'bass', label: 'Bass Guitar', kind: 'chords', inst: ['bass'], leads: [] },
  { id: 'drums', label: 'Drums', kind: 'chords', inst: ['drums'], leads: ['Drums'] },
  { id: 'sound', label: 'Sound Engineer', kind: 'full', inst: null, leads: [] },
  { id: 'full', label: 'Full chart', kind: 'full', inst: null, leads: [] },
]

export const viewRoleById = (id) => WORSHIP_VIEW_ROLES.find((r) => r.id === id) || null

/** A worship_schedule role ("Lead Vocal-2", "Choir member", "Bass Guitar"…) → view role id. */
export function viewRoleFor(scheduleRole) {
  const r = String(scheduleRole || '').toLowerCase()
  if (/lead vocal|worship leader/.test(r)) return 'lead'
  if (/part|harmon/.test(r)) return 'parts'
  if (/choir/.test(r)) return 'choir'
  if (/key|piano|synth|midi/.test(r)) return 'keys'
  if (/lead guitar|electric/.test(r)) return 'leadGuitar'
  if (/bass/.test(r)) return 'bass'
  if (/guitar|acoustic/.test(r)) return 'guitar'
  if (/drum|percussion|cajon/.test(r)) return 'drums'
  if (/sound|audio|engineer/.test(r)) return 'sound'
  return 'full'
}

export const INTENSITY = ['', 'p', 'mf', 'f']

/** The role's part in a section: { mine, lead, level } — level 0–3 from the dynamics tags. */
export function sectionPart(section, role) {
  if (!role?.inst) return { mine: true, lead: false, level: 0 }
  const lead = role.leads.includes(section.lead)
  let level = 0
  for (const l of section.lines || []) for (const k of role.inst) level = Math.max(level, l.parts?.[k] || 0)
  return { mine: lead || level > 0 || section.lead === 'Full Band', lead, level }
}

/** Whether a song carries any dynamics tags at all (if not, nothing is dimmed). */
export const songIsTagged = (song) => (song.sections || []).some((s) => (s.lead && s.lead !== 'Lead Vocal') ||s.lines.some((l) => l.parts && Object.keys(l.parts).length))

// ── Transpose ────────────────────────────────────────────────────────────────
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B' }
const SHARP_TO_FLAT = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'])

const noteIdx = (n) => CHROMATIC.indexOf(FLAT_TO_SHARP[n] ?? n)
const keyRoot = (key) => /^([A-G][b#]?)/.exec(String(key || '').trim())?.[1] || ''

function shiftNote(note, semis, flat) {
  const i = noteIdx(note)
  if (i === -1) return note
  const r = CHROMATIC[((i + semis) % 12 + 12) % 12]
  return flat && SHARP_TO_FLAT[r] ? SHARP_TO_FLAT[r] : r
}

/** Semitones from one key to another (0 when either is unknown). */
export function keyShift(fromKey, toKey) {
  const a = noteIdx(keyRoot(fromKey)), b = noteIdx(keyRoot(toKey))
  if (a === -1 || b === -1) return 0
  const d = ((b - a) % 12 + 12) % 12
  return d > 6 ? d - 12 : d
}

export function transposeKey(key, semis) {
  const root = keyRoot(key)
  if (!root || !semis) return key || ''
  const shifted = shiftNote(root, semis, false)
  const flat = FLAT_KEYS.has(SHARP_TO_FLAT[shifted] || shifted)
  return shiftNote(root, semis, flat) + String(key).trim().slice(root.length)
}

export function transposeChord(chord, semis, flat) {
  if (!semis) return chord
  const m = /^([A-G][b#]?)(.*)$/.exec(chord)
  if (!m) return chord
  const [, root, rest] = m
  const slash = /^(.*)\/([A-G][b#]?)$/.exec(rest)
  return slash
    ? `${shiftNote(root, semis, flat)}${slash[1]}/${shiftNote(slash[2], semis, flat)}`
    : shiftNote(root, semis, flat) + rest
}

export const prefersFlats = (key) => FLAT_KEYS.has(keyRoot(key))

// ── Content ──────────────────────────────────────────────────────────────────

/** A worship_songs doc → published sections: [{ name, lead, lines: [{ lyrics, chords, parts }] }]. */
export function songLiveSections(lib) {
  if (lib?.blocks?.length) {
    return lib.blocks.map((b) => ({
      name: b.sectionName || 'Section',
      lead: b.lead || '',
      lines: (b.lines || []).map((l) => {
        const parts = {}
        for (const t of [...(l.words || []), ...(l.chords || [])]) {
          for (const [k, v] of Object.entries(t?.annotations || {})) if (v > 0) parts[k] = Math.max(parts[k] || 0, Math.min(3, Number(v) || 0))
        }
        return {
          lyrics: l.lyrics || '',
          chords: (l.chords || []).filter((c) => c?.chord).map((c) => ({ chord: String(c.chord), pos: Number(c.pos) || 0 })),
          ...(Object.keys(parts).length ? { parts } : {}),
        }
      }),
    }))
  }
  if (lib?.sections?.length) {
    return lib.sections.map((s) => ({
      name: s.type || 'Section',
      lead: '',
      lines: String(s.lyrics || '').split('\n').map((t) => ({ lyrics: t, chords: [] })),
    }))
  }
  return []
}

function hashString(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * The public doc's content from this Sunday's worship_schedule assignments, the song
 * library and the Sunday programme. Team members carry role + name only — this doc
 * is publicly readable.
 */
export function buildWorshipLiveContent({ sundayDate, serviceStartTime = '', programs = [], assignments = [], lib = [] }) {
  const used = new Set()
  const uniq = (base) => {
    let k = base, n = 2
    while (used.has(k)) k = `${base}_${n++}`
    used.add(k)
    return k
  }
  const sorted = sortByWorshipRole(assignments)
  const songs = []
  const seen = new Map()
  for (const a of sorted) {
    if (!a.songId && !a.songName) continue
    const id = a.songId || `name:${String(a.songName).trim()}`
    const leader = String(a.memberName || '').trim()
    if (seen.has(id)) {
      const s = seen.get(id)
      if (leader && !s.leaders.includes(leader)) s.leaders.push(leader)
      continue
    }
    const d = lib.find((s) => (a.songId && s.id === a.songId) || (!a.songId && s.title && s.title.trim() === String(a.songName || '').trim())) || null
    const libKey = d?.key || ''
    const key = a.key || libKey
    const song = {
      key: uniq(`song_${safeKey(a.songName || d?.title || 'song')}`),
      title: a.songName || d?.title || '(untitled)',
      musicKey: key,
      // Chords are stored in the song's own key; the schedule's key shifts them.
      shift: keyShift(libKey, key),
      tempo: d?.tempo ? Number(d.tempo) || null : null,
      leaders: leader ? [leader] : [],
      leadRole: worshipRoleLabel(a.role),
      sections: songLiveSections(d),
    }
    seen.set(id, song)
    songs.push(song)
  }
  const team = sorted
    .filter((a) => String(a.memberName || '').trim())
    .map((a) => ({
      key: uniq(`m_${safeKey(a.role)}_${safeKey(a.memberName)}`),
      name: a.memberName.trim(),
      role: worshipRoleLabel(a.role),
      view: viewRoleFor(a.role),
    }))
  const body = {
    sundayDate,
    serviceStartTime: String(serviceStartTime || ''),
    programs: programs.map((p) => ({
      key: uniq(`p_${safeKey(p.name)}`),
      name: p.name,
      duration: Number(p.duration) || 0,
      startTime: String(p.startTime || ''),
      ...(isWorshipItem(p.name) ? { worship: true } : {}),
    })),
    songs,
    team,
  }
  return { ...body, contentHash: hashString(JSON.stringify(body)) }
}

export const checkInKey = (phase, memberKey) => `${phase}__in__${memberKey}`
export const readyKey = (phase, memberKey, songKey) => `${phase}__ready__${memberKey}__${songKey}`
