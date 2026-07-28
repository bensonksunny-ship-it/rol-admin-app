import { useState, useCallback, useEffect, useRef } from 'react'
import { Pencil, Copy, Play, Pause } from 'lucide-react'
import { addWorshipSong, updateWorshipSong } from '../../services/firestore'

// ── Constants ─────────────────────────────────────────────────────────────────
const SEGMENT_TYPES = [
  'Intro', 'Verse 1', 'Verse 2', 'Verse 3',
  'Chorus', 'Bridge', 'Break', 'Outro', 'Interlude',
]

const INSTRUMENTS = [
  { key: 'mVocal',       label: 'M Vocal',       color: '#3b82f6' },
  { key: 'fVocal',       label: 'F Vocal',       color: '#ec4899' },
  { key: 'parts',        label: 'Parts',         color: '#10b981' },
  { key: 'choir',        label: 'Choir',         color: '#8b5cf6' },
  { key: 'keys',         label: 'Keys',          color: '#6366f1' },
  { key: 'leadGuitar',   label: 'Lead Guitar',   color: '#f97316' },
  { key: 'rhythmGuitar', label: 'Rhythm Guitar', color: '#f59e0b' },
  { key: 'bass',         label: 'Bass',          color: '#14b8a6' },
  { key: 'drums',        label: 'Drums',         color: '#ef4444' },
  { key: 'acoustic',     label: 'Acoustic',      color: '#84cc16' },
  { key: 'midi',         label: 'MIDI',          color: '#a855f7' },
]

const MAX_INT = 3
const defaultDynamics = () => Object.fromEntries(INSTRUMENTS.map(i => [i.key, 0]))

// ── Section lead / "driven by" — who's taking point for this specific segment ──
const LEAD_OPTIONS = ['Lead Vocal', 'Keys', 'Acoustic Guitar', 'Electric Guitar', 'Choir', 'Full Band', 'Drums']
const DEFAULT_LEAD = 'Lead Vocal'

// ── Metronome / bar lines ─────────────────────────────────────────────────────
const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8']
const DEFAULT_TIME_SIGNATURE = '4/4'
const beatsPerBarFor = ts => parseInt((ts || DEFAULT_TIME_SIGNATURE).split('/')[0], 10) || 4

// ── Segment color system — each structure type gets its own vibrant, soft-pill identity ──
const SEGMENT_COLOR_MAP = {
  intro:     { pill: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',     active: 'bg-indigo-600 border-indigo-600 text-white',     header: 'bg-indigo-50 border-indigo-100',     label: 'text-indigo-700',     top: 'border-indigo-500' },
  verse:     { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100', active: 'bg-emerald-600 border-emerald-600 text-white',   header: 'bg-emerald-50 border-emerald-100',   label: 'text-emerald-700',   top: 'border-emerald-500' },
  chorus:    { pill: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',     active: 'bg-violet-600 border-violet-600 text-white',     header: 'bg-violet-50 border-violet-100',     label: 'text-violet-700',     top: 'border-violet-500' },
  bridge:    { pill: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',         active: 'bg-amber-600 border-amber-600 text-white',       header: 'bg-amber-50 border-amber-100',       label: 'text-amber-700',       top: 'border-amber-500' },
  break:     { pill: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',                 active: 'bg-sky-600 border-sky-600 text-white',           header: 'bg-sky-50 border-sky-100',           label: 'text-sky-700',         top: 'border-sky-500' },
  outro:     { pill: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',             active: 'bg-rose-600 border-rose-600 text-white',         header: 'bg-rose-50 border-rose-100',         label: 'text-rose-700',       top: 'border-rose-500' },
  interlude: { pill: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-100', active: 'bg-fuchsia-600 border-fuchsia-600 text-white',   header: 'bg-fuchsia-50 border-fuchsia-100',   label: 'text-fuchsia-700',   top: 'border-fuchsia-500' },
}
const DEFAULT_SEGMENT_COLOR = { pill: 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100', active: 'bg-slate-600 border-slate-600 text-white', header: 'bg-slate-50 border-slate-100', label: 'text-slate-600', top: 'border-slate-400' }

function getSegmentColor(type) {
  const key = (type || '').toLowerCase().replace(/\s*\d+$/, '').trim() // 'Verse 1' → 'verse'
  return SEGMENT_COLOR_MAP[key] || DEFAULT_SEGMENT_COLOR
}

// ── Transpose ─────────────────────────────────────────────────────────────────
const CHROMATIC     = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const FLAT_TO_SHARP = { Db:'C#', Eb:'D#', Fb:'E', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' }
const SHARP_TO_FLAT = { 'C#':'Db', 'D#':'Eb', 'F#':'Gb', 'G#':'Ab', 'A#':'Bb' }
const FLAT_KEYS     = new Set(['F','Bb','Eb','Ab','Db','Gb'])

// Diatonic scale notes per key (major + natural minor)
const KEY_SCALES = {
  'C':   ['C','D','E','F','G','A','B'],
  'G':   ['G','A','B','C','D','E','F#'],
  'D':   ['D','E','F#','G','A','B','C#'],
  'A':   ['A','B','C#','D','E','F#','G#'],
  'E':   ['E','F#','G#','A','B','C#','D#'],
  'B':   ['B','C#','D#','E','F#','G#','A#'],
  'F#':  ['F#','G#','A#','B','C#','D#','F'],
  'F':   ['F','G','A','Bb','C','D','E'],
  'Bb':  ['Bb','C','D','Eb','F','G','A'],
  'Eb':  ['Eb','F','G','Ab','Bb','C','D'],
  'Ab':  ['Ab','Bb','C','Db','Eb','F','G'],
  'Db':  ['Db','Eb','F','Gb','Ab','Bb','C'],
  'Am':  ['A','B','C','D','E','F','G'],
  'Em':  ['E','F#','G','A','B','C','D'],
  'Bm':  ['B','C#','D','E','F#','G','A'],
  'F#m': ['F#','G#','A','B','C#','D','E'],
  'C#m': ['C#','D#','E','F#','G#','A','B'],
  'G#m': ['G#','A#','B','C#','D#','E','F#'],
  'Dm':  ['D','E','F','G','A','Bb','C'],
  'Gm':  ['G','A','Bb','C','D','Eb','F'],
  'Cm':  ['C','D','Eb','F','G','Ab','Bb'],
  'Fm':  ['F','G','Ab','Bb','C','Db','Eb'],
  'Bbm': ['Bb','C','Db','Eb','F','Gb','Ab'],
  'Ebm': ['Eb','F','Gb','Ab','Bb','Cb','Db'],
}

function detectKey(segments) {
  const allRoots = []
  for (const seg of segments) {
    const lines = seg.parsed && seg.lines?.length ? seg.lines : parseSegmentText(seg.rawText || '')
    for (const line of lines) {
      for (const { chord } of line.chords || []) {
        const m = chord.match(/^([A-G][b#]?)/)
        if (m) allRoots.push(FLAT_TO_SHARP[m[1]] ?? m[1])
      }
    }
  }
  if (!allRoots.length) return []
  const rootSet = new Set(allRoots)
  const firstSharp = allRoots[0]

  const scores = Object.entries(KEY_SCALES).map(([key, scale]) => {
    const sharpScale = new Set(scale.map(n => FLAT_TO_SHARP[n] ?? n))
    const covered = [...rootSet].filter(r => sharpScale.has(r)).length
    const coverage = covered / rootSet.size
    const tonic = FLAT_TO_SHARP[key.replace(/m$/, '')] ?? key.replace(/m$/, '')
    const tonicBonus = firstSharp === tonic ? 0.35 : 0
    return { key, score: coverage + tonicBonus }
  })

  scores.sort((a, b) => b.score - a.score)
  return scores.filter(s => s.score > 0.5).slice(0, 3).map(s => s.key)
}

function shiftNote(note, semitones, useFlatKey = false) {
  const n = FLAT_TO_SHARP[note] ?? note
  const idx = CHROMATIC.indexOf(n)
  if (idx === -1) return note
  const result = CHROMATIC[((idx + semitones) % 12 + 12) % 12]
  return (useFlatKey && SHARP_TO_FLAT[result]) ? SHARP_TO_FLAT[result] : result
}

function transposeChord(chord, semitones, useFlatKey) {
  if (!semitones) return chord
  const m = chord.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return chord
  const [, root, rest] = m
  const slash = rest.match(/^(.*)(\/[A-G][b#]?)$/)
  if (slash) {
    const [, mod, s] = slash
    return shiftNote(root, semitones, useFlatKey) + mod + '/' + shiftNote(s.slice(1), semitones, useFlatKey)
  }
  return shiftNote(root, semitones, useFlatKey) + rest
}

function transposeKey(key, semitones) {
  if (!key || !semitones) return key
  const root = key.replace(/m$/, '')
  const suffix = key.endsWith('m') && key.length > 2 ? 'm' : ''
  const shifted = shiftNote(root, semitones, FLAT_KEYS.has(shiftNote(root, semitones, false)))
  return shifted + suffix
}

// ── Chord parser ──────────────────────────────────────────────────────────────
const CHORD_RE = /^[A-G][b#]?(m(?:aj)?[0-9]*|min|dim[0-9]*|aug|sus[24]?|add[0-9]+|[0-9]+)?(\/[A-G][b#]?)?$/

function isChordToken(t) { return CHORD_RE.test(t.replace(/[()]/g, '')) }

function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  const n = tokens.filter(t => isChordToken(t)).length
  return n >= 1 && n / tokens.length >= 0.65
}

function isSectionHeader(line) {
  const t = line.trim()
  return /^\[.+\]$/.test(t) ||
    /^(verse|chorus|bridge|intro|outro|pre[\s-]?chorus|tag|interlude|hook|vamp|refrain)\b.*:?$/i.test(t)
}

function parseChordPositions(line) {
  const chords = []
  const re = /(\S+)/g
  let m
  while ((m = re.exec(line)) !== null) {
    const t = m[1].replace(/[()]/g, '')
    if (isChordToken(t)) chords.push({ chord: t, pos: m.index, annotations: defaultDynamics() })
  }
  return chords
}

function parseInline(line) {
  if (!/\[[A-G][^\]]{0,6}\]/.test(line)) return { chords: [], lyrics: line }
  const chords = []
  let lyrics = ''
  let last = 0
  const re = /\[([A-G][^\]]{0,6})\]/g
  let m
  while ((m = re.exec(line)) !== null) {
    lyrics += line.slice(last, m.index)
    if (isChordToken(m[1])) chords.push({ chord: m[1], pos: lyrics.length, annotations: defaultDynamics() })
    last = re.lastIndex
  }
  lyrics += line.slice(last)
  return { chords, lyrics }
}

function buildChordLine(chords, lyrics) {
  const len = Math.max(lyrics.length + 1, ...chords.map(c => c.pos + c.chord.length + 1))
  const arr = Array(len).fill(' ')
  for (const { chord, pos } of chords) {
    for (let j = 0; j < chord.length && pos + j < arr.length; j++) arr[pos + j] = chord[j]
  }
  return arr.join('')
}

// ── Bar-line divider offsets — every Nth chord's character position marks a new
// measure. Returned as `ch` offsets (not baked into either string) so the divider can
// be drawn as an absolutely-positioned overlay spanning the chord row AND the lyric
// row beneath it — guaranteeing the two line up, instead of drifting the way inserting
// a literal "|" into either string would (both rely on `pos` being a raw char index).
function computeBarDividerOffsets(chords, beatsPerBar) {
  const offsets = []
  chords.forEach((c, i) => {
    if (i > 0 && i % beatsPerBar === 0) offsets.push(Math.max(c.pos - 1, 0))
  })
  return offsets
}

// Groups consecutive indices [0..count) that share the same measure number, so the
// UI can wrap each run in one highlighted "measure block" without extra markup per item.
function groupByMeasure(count, measureOf) {
  const groups = []
  for (let i = 0; i < count; i++) {
    const m = measureOf(i)
    const last = groups[groups.length - 1]
    if (last && last.measure === m) last.items.push(i)
    else groups.push({ measure: m, items: [i] })
  }
  return groups
}

// Maps each word to the measure of the most recent chord at/before its character offset —
// lets the lyric row get the same alternating measure-block highlight as the chord row.
function computeWordMeasures(words, chords, beatsPerBar) {
  if (!chords.length) return words.map(() => 0)
  let offset = 0
  const wordOffsets = words.map(w => { const o = offset; offset += w.text.length; return o })
  return wordOffsets.map(o => {
    let idx = 0
    for (let ci = 0; ci < chords.length; ci++) {
      if (chords[ci].pos <= o) idx = ci
      else break
    }
    return Math.floor(idx / beatsPerBar)
  })
}

// Tokenise lyrics into word / space tokens
function tokenizeLyrics(lyrics) {
  const tokens = []
  const re = /(\S+|\s+)/g
  let m
  while ((m = re.exec(lyrics)) !== null) {
    tokens.push({ text: m[1], isWord: /\S/.test(m[1]), annotations: defaultDynamics() })
  }
  return tokens
}

function parseSegmentText(text) {
  const rawLines = text.split('\n')
  const lines = []
  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]
    const t = line.trim()
    if (!t || isSectionHeader(t)) { i++; continue }
    const next = rawLines[i + 1]?.trim()
    if (isChordLine(t) && next && !isChordLine(next) && !isSectionHeader(next)) {
      lines.push({ chords: parseChordPositions(t), lyrics: next, chordLine: t, words: tokenizeLyrics(next) })
      i += 2; continue
    }
    if (/\[[A-G][^\]]{0,6}\]/.test(t)) {
      const { chords, lyrics } = parseInline(t)
      lines.push({ chords, lyrics, words: tokenizeLyrics(lyrics) })
      i++; continue
    }
    if (isChordLine(t)) {
      lines.push({ chords: parseChordPositions(t), lyrics: '', chordLine: t, words: [] })
    } else {
      lines.push({ chords: [], lyrics: t, words: tokenizeLyrics(t) })
    }
    i++
  }
  return lines
}

// ── Instrument palette — always visible; select an instrument, then paint words ──
function InstrumentPalette({ activeInstrument, onToggle }) {
  return (
    <div className="px-4 pt-2.5 pb-2 bg-slate-50 border-b border-slate-100">
      <p className="text-[10px] text-slate-400 opacity-70 mb-1.5 select-none">
        {activeInstrument
          ? 'Click, or click-and-drag across words, to tag them — click the button again to stop'
          : 'Select an instrument, then click or drag across words to tag dynamics'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {INSTRUMENTS.map(inst => {
          const isActive = activeInstrument === inst.key
          return (
            <button
              key={inst.key}
              type="button"
              onClick={() => onToggle(inst.key)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold border transition-all active:scale-95 ${
                isActive ? 'text-white shadow-sm' : 'hover:brightness-95'
              }`}
              style={isActive
                ? { backgroundColor: inst.color, borderColor: inst.color }
                : { backgroundColor: `${inst.color}14`, color: inst.color, borderColor: `${inst.color}33` }}
            >
              {inst.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Annotated lyric line ──────────────────────────────────────────────────────
function AnnotatedLine({ line, transpose, useFlatKey, activeInstrument, onWordDown, onWordEnter, onChordDown, onChordEnter, showBarLines, beatsPerBar }) {
  const { chords, lyrics, words } = line
  const shifted = chords.map(c => ({ ...c, chord: transposeChord(c.chord, transpose, useFlatKey) }))
  const isInstrumental = chords.length > 0 && words.length === 0
  const chordDisplay = !isInstrumental && chords.length ? buildChordLine(shifted, lyrics) : null
  const barDividerOffsets = showBarLines && !isInstrumental && chords.length
    ? computeBarDividerOffsets(shifted, beatsPerBar)
    : []
  const hasAnyAnnotation = words.some(w => w.isWord && INSTRUMENTS.some(i => (w.annotations?.[i.key] ?? 0) > 0))
  const activeInst = INSTRUMENTS.find(i => i.key === activeInstrument)

  const renderChordToken = (c, ci) => {
    const activeInsts = INSTRUMENTS.filter(i => (c.annotations?.[i.key] ?? 0) > 0)
    const hasAnnotation = activeInsts.length > 0
    const activeLevel = activeInst ? (c.annotations?.[activeInst.key] ?? 0) : 0
    return (
      <span
        key={ci}
        onMouseDown={e => { e.preventDefault(); onChordDown(ci) }}
        onMouseEnter={() => onChordEnter(ci)}
        onTouchStart={e => { e.preventDefault(); onChordDown(ci) }}
        className={`font-bold tracking-tight text-indigo-600 rounded px-1.5 py-0.5 select-none ${
          activeInst ? 'cursor-pointer' : 'cursor-default'
        } ${!activeLevel && !hasAnnotation ? 'hover:bg-slate-100' : ''}`}
        style={activeLevel > 0
          ? { backgroundColor: `${activeInst.color}33`, boxShadow: `inset 0 0 0 1.5px ${activeInst.color}` }
          : !activeLevel && hasAnnotation
          ? { backgroundColor: `${activeInsts[0].color}1f` }
          : undefined}
      >
        {c.chord}
      </span>
    )
  }

  // Instrumental line — no lyrics, so chords themselves are the taggable targets
  // (e.g. an Intro/Interlude's chord progression). Same click/drag painting as words.
  if (isInstrumental) {
    // Chord tokens are discrete flex items here (no monospace grid to preserve), so bar
    // dividers/measure highlighting can be inserted directly instead of via an overlay.
    const chordGroups = showBarLines
      ? groupByMeasure(shifted.length, i => Math.floor(i / beatsPerBar))
      : shifted.map((_, i) => ({ measure: 0, items: [i] }))
    return (
      <div className="mb-4">
        <div className="font-mono text-sm leading-relaxed flex flex-nowrap items-center" onDragStart={e => e.preventDefault()}>
          {chordGroups.map((g, gi) => (
            <span key={gi} className={`inline-flex items-center gap-4 px-1.5 rounded ${
              showBarLines && g.measure % 2 === 1 ? 'bg-indigo-50/70' : ''
            }`}>
              {g.items.map(ci => renderChordToken(shifted[ci], ci))}
              {showBarLines && gi < chordGroups.length - 1 && (
                <span className="self-stretch w-[3px] ml-2 rounded-full bg-indigo-500" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>

        {/* Dynamic indicator row — every chord reserves the same slot so the underline
            stays structurally uniform whether or not a tag has been painted onto it. */}
        <div className="font-mono text-sm flex flex-nowrap gap-4 mt-1" aria-hidden="true">
          {shifted.map((c, ci) => {
            const activeInsts = INSTRUMENTS.filter(i => (c.annotations?.[i.key] ?? 0) > 0)
            return (
              <span key={ci} className="flex flex-col gap-[1.5px] px-1.5" style={{ width: `${c.chord.length}ch`, minWidth: `${c.chord.length}ch` }}>
                {activeInsts.length > 0 ? activeInsts.map(inst => (
                  <span key={inst.key} className="block rounded-full" style={{
                    height: '3px', backgroundColor: inst.color, opacity: 0.25 + (c.annotations[inst.key] / MAX_INT) * 0.75,
                  }} />
                )) : (
                  <span className="block rounded-full bg-slate-200" style={{ height: '3px' }} />
                )}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  const renderWord = (w, wi) => {
    if (!w.isWord) return (
      <span key={wi} className="whitespace-pre select-none">{w.text}</span>
    )
    const activeInsts = INSTRUMENTS.filter(i => (w.annotations?.[i.key] ?? 0) > 0)
    const hasAnnotation = activeInsts.length > 0
    const activeLevel = activeInst ? (w.annotations?.[activeInst.key] ?? 0) : 0
    return (
      <span
        key={wi}
        onMouseDown={e => { e.preventDefault(); onWordDown(wi) }}
        onMouseEnter={() => onWordEnter(wi)}
        onTouchStart={e => { e.preventDefault(); onWordDown(wi) }}
        className={`rounded transition-colors px-0.5 -mx-0.5 select-none ${
          activeInst ? 'cursor-pointer' : 'cursor-default'
        } ${!activeLevel && !hasAnnotation ? 'hover:bg-slate-100' : ''}`}
        style={activeLevel > 0
          ? { backgroundColor: `${activeInst.color}33`, boxShadow: `inset 0 0 0 1.5px ${activeInst.color}` }
          : !activeLevel && hasAnnotation
          ? { backgroundColor: `${activeInsts[0].color}1f` }
          : undefined}
      >
        {w.text}
      </span>
    )
  }

  // Words row measure grouping only adds a background (no padding/margin/gap), so it
  // can't shift word positions out from under the chordDisplay character grid above.
  const wordMeasures = showBarLines && chords.length ? computeWordMeasures(words, shifted, beatsPerBar) : null
  const wordGroups = wordMeasures ? groupByMeasure(words.length, wi => wordMeasures[wi]) : null

  return (
    <div className="mb-4">
      {/* Relative wrapper lets the bar dividers below be one absolutely-positioned overlay
          spanning both the chord row and the lyric row, so the same `ch` offset lines up
          pixel-for-pixel across both instead of drifting the way two separate elements could. */}
      <div className="relative">
        {barDividerOffsets.map(offset => (
          <div key={offset} aria-hidden="true"
            className="absolute top-0 bottom-0 w-[3px] bg-indigo-500 rounded-full"
            style={{ left: `${offset}ch` }} />
        ))}

        {chordDisplay && (
          // Same font-mono + text-sm as the words row below — chord `pos` is a character
          // index into the lyric string, so both rows must share one character width
          // (font family + size) or the chords drift out of alignment with the syllables.
          <pre className="font-mono text-sm font-bold tracking-tight text-indigo-600 whitespace-pre leading-relaxed m-0 select-none">
            {chordDisplay}
          </pre>
        )}

        {/* Words row — mousedown starts painting the active instrument, mouseenter extends the drag */}
        <div className="font-mono text-sm font-medium leading-relaxed text-slate-800 flex flex-nowrap" onDragStart={e => e.preventDefault()}>
          {wordGroups
            ? wordGroups.map((g, gi) => (
                <span key={gi} className={g.measure % 2 === 1 ? 'bg-indigo-50/70 rounded' : ''}>
                  {g.items.map(wi => renderWord(words[wi], wi))}
                </span>
              ))
            : words.map((w, wi) => renderWord(w, wi))
          }
        </div>
      </div>

      {/* Stripe row — one thin bar per active instrument, aligned to word.
          Same text-sm as the words row: its `ch`-based widths are relative to
          this element's own font-size, so a mismatched size would drift the
          stripes out from under the words they're meant to mark. */}
      {hasAnyAnnotation && (
        <div className="font-mono text-sm flex flex-nowrap" aria-hidden="true">
          {words.map((w, wi) => {
            if (!w.isWord) return (
              <span key={wi} className="whitespace-pre invisible">{w.text}</span>
            )
            const activeInsts = INSTRUMENTS.filter(i => (w.annotations?.[i.key] ?? 0) > 0)
            if (!activeInsts.length) return (
              <span key={wi} className="invisible px-0.5">{w.text}</span>
            )
            return (
              <span
                key={wi}
                className="flex flex-col gap-[1.5px] pt-[3px] px-0.5"
                style={{ width: `${w.text.length}ch`, minWidth: `${w.text.length}ch` }}
              >
                {activeInsts.map(inst => {
                  const lvl = w.annotations[inst.key]
                  return (
                    <span
                      key={inst.key}
                      className="block rounded-full"
                      style={{
                        height: '3px',
                        backgroundColor: inst.color,
                        opacity: 0.25 + (lvl / MAX_INT) * 0.75,
                      }}
                    />
                  )
                })}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Segment section ───────────────────────────────────────────────────────────
function SegmentSection({ seg, onUpdate, onDuplicate, transpose, useFlatKey, beatsPerBar, isLast }) {
  const [activeInstrument, setActiveInstrument] = useState(null)
  const paintLevelRef = useRef(0)
  const isPaintingRef = useRef(false)

  // A drag stroke can end outside any word (or the browser window) — always catch mouseup/touchend
  useEffect(() => {
    const stopPainting = () => { isPaintingRef.current = false }
    window.addEventListener('mouseup', stopPainting)
    window.addEventListener('touchend', stopPainting)
    return () => {
      window.removeEventListener('mouseup', stopPainting)
      window.removeEventListener('touchend', stopPainting)
    }
  }, [])

  const applyToWord = useCallback((lineIdx, wordIdx, level) => {
    onUpdate(seg.id, {
      lines: seg.lines.map((line, li) => {
        if (li !== lineIdx) return line
        return {
          ...line,
          words: line.words.map((w, wi) => {
            if (wi !== wordIdx) return w
            return { ...w, annotations: { ...w.annotations, [activeInstrument]: level } }
          }),
        }
      }),
    })
  }, [seg.id, seg.lines, onUpdate, activeInstrument])

  // Click cycles this word's intensity for the active instrument (off → p → mf → f → off);
  // the level it lands on is then painted onto every other word the drag passes over.
  const handleWordDown = useCallback((lineIdx, wordIdx) => {
    if (!activeInstrument) return
    const current = seg.lines[lineIdx]?.words?.[wordIdx]?.annotations?.[activeInstrument] ?? 0
    const next = (current + 1) % (MAX_INT + 1)
    paintLevelRef.current = next
    isPaintingRef.current = true
    applyToWord(lineIdx, wordIdx, next)
  }, [activeInstrument, seg.lines, applyToWord])

  const handleWordEnter = useCallback((lineIdx, wordIdx) => {
    if (!isPaintingRef.current || !activeInstrument) return
    applyToWord(lineIdx, wordIdx, paintLevelRef.current)
  }, [activeInstrument, applyToWord])

  // Same paint mechanics as words, targeting standalone chord tokens (instrumental lines)
  const applyToChord = useCallback((lineIdx, chordIdx, level) => {
    onUpdate(seg.id, {
      lines: seg.lines.map((line, li) => {
        if (li !== lineIdx) return line
        return {
          ...line,
          chords: line.chords.map((c, ci) => {
            if (ci !== chordIdx) return c
            return { ...c, annotations: { ...c.annotations, [activeInstrument]: level } }
          }),
        }
      }),
    })
  }, [seg.id, seg.lines, onUpdate, activeInstrument])

  const handleChordDown = useCallback((lineIdx, chordIdx) => {
    if (!activeInstrument) return
    const current = seg.lines[lineIdx]?.chords?.[chordIdx]?.annotations?.[activeInstrument] ?? 0
    const next = (current + 1) % (MAX_INT + 1)
    paintLevelRef.current = next
    isPaintingRef.current = true
    applyToChord(lineIdx, chordIdx, next)
  }, [activeInstrument, seg.lines, applyToChord])

  const handleChordEnter = useCallback((lineIdx, chordIdx) => {
    if (!isPaintingRef.current || !activeInstrument) return
    applyToChord(lineIdx, chordIdx, paintLevelRef.current)
  }, [activeInstrument, applyToChord])

  const toggleInstrument = useCallback(key => {
    setActiveInstrument(prev => prev === key ? null : key)
  }, [])

  const color = getSegmentColor(seg.type)

  return (
    <div>
      {/* Section header — color-coded by segment type so structure reads at a glance */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${color.header}`}>
        <div className="flex items-center gap-1.5">
          <p className={`text-xs font-bold uppercase tracking-wider ${color.label}`}>{seg.type}</p>
          {seg.parsed && (
            <button type="button" onClick={() => onUpdate(seg.id, { editing: !seg.editing })}
              title={seg.editing ? 'Hide editor' : 'Edit lyrics/chords'}
              className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${
                seg.editing ? 'bg-white text-slate-600' : `${color.label} opacity-70 hover:opacity-100 hover:bg-white/60`
              }`}>
              <Pencil size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Section Lead / Driven By — dropdown disguised as a pill badge, so it reads as
              "Lead: Keys" at a glance but is still a real, keyboard-accessible <select>. */}
          <div className="relative inline-flex shrink-0">
            <span className={`pointer-events-none inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border ${color.pill}`}>
              Lead: {seg.lead || DEFAULT_LEAD}
            </span>
            <select
              value={seg.lead || DEFAULT_LEAD}
              onChange={e => onUpdate(seg.id, { lead: e.target.value })}
              aria-label="Section lead / primary"
              title="Lead / Primary"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {LEAD_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Repeat / Duplicate — deep-clones this section (lyrics, chords, dynamics, lead) into a new tab */}
          <button type="button" onClick={() => onDuplicate(seg.id)}
            title="Repeat / duplicate this section"
            className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${color.label} opacity-70 hover:opacity-100 hover:bg-white/60`}>
            <Copy size={12} />
          </button>

          {/* Show Bar Lines — partitions chords/lyrics into measures of `beatsPerBar` for timing */}
          <button type="button" onClick={() => onUpdate(seg.id, { showBarLines: !seg.showBarLines })}
            title={seg.showBarLines ? 'Hide bar lines' : 'Show bar lines'}
            className={`w-6 h-6 flex items-center justify-center rounded-lg font-bold text-xs transition-colors ${
              seg.showBarLines ? 'bg-white text-slate-600' : `${color.label} opacity-70 hover:opacity-100 hover:bg-white/60`
            }`}>
            |
          </button>
        </div>
      </div>

      {/* Lyrics input — hidden once parsed, unless the user reopens it via the pencil icon */}
      {(!seg.parsed || seg.editing) && (
        <div className="px-4 pt-3 pb-2 space-y-2 bg-slate-50">
          <textarea
            value={seg.rawText}
            onChange={e => onUpdate(seg.id, { rawText: e.target.value, lines: [], parsed: false })}
            rows={4}
            placeholder={`Paste lyrics here.\nChords above lines or [G]inline format.`}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-600 placeholder-slate-400"
          />
          <div className="flex items-center justify-between">
            {seg.parsed
              ? <span className="text-xs text-slate-400">Select an instrument below to tag dynamics</span>
              : <span className="text-xs text-slate-400">{seg.rawText.trim() ? 'Hit parse to render' : ''}</span>
            }
            <button
              type="button"
              disabled={!seg.rawText.trim()}
              onClick={() => onUpdate(seg.id, { lines: parseSegmentText(seg.rawText), parsed: true, editing: false })}
              className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-500 text-xs font-medium hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 transition-all active:scale-95"
            >Parse chords</button>
          </div>
        </div>
      )}

      {/* Instrument palette (always visible, muted) + chord chart with paintable words —
          the palette's own bg-slate-50 recedes so the white lyrics/chords area below reads
          as the focal point of the section. */}
      {seg.parsed && seg.lines.length > 0 && (
        <div>
          <InstrumentPalette activeInstrument={activeInstrument} onToggle={toggleInstrument} />
          <div className="px-4 pt-3 pb-4 overflow-x-auto bg-white">
            {seg.lines.map((line, li) => (
              <AnnotatedLine
                key={li}
                line={line}
                transpose={transpose}
                useFlatKey={useFlatKey}
                activeInstrument={activeInstrument}
                onWordDown={wordIdx => handleWordDown(li, wordIdx)}
                onWordEnter={wordIdx => handleWordEnter(li, wordIdx)}
                onChordDown={chordIdx => handleChordDown(li, chordIdx)}
                onChordEnter={chordIdx => handleChordEnter(li, chordIdx)}
                showBarLines={!!seg.showBarLines}
                beatsPerBar={beatsPerBar}
              />
            ))}
          </div>
        </div>
      )}

      {!isLast && <div className="h-px bg-slate-200" />}
    </div>
  )
}

// ── Local draft persistence — survives accidental navigation/refresh before Save ──
const DRAFT_PREFIX = 'worship_song_draft_'
const draftKeyFor = songId => `${DRAFT_PREFIX}${songId || 'new'}`

function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Quota exceeded or storage disabled (e.g. private browsing) — losing autosave isn't fatal
  }
}

function clearDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

// ── Reconstruct segments from stored blocks ───────────────────────────────────
function blocksToSegments(blocks) {
  return (blocks || []).map(block => {
    const lines = (block.lines || []).map(line => ({
      ...line,
      chords: (line.chords || []).map(c => ({
        ...c,
        annotations: { ...defaultDynamics(), ...(c.annotations || {}) },
      })),
      words: (line.words || tokenizeLyrics(line.lyrics || '')).map(w => ({
        ...w,
        annotations: { ...defaultDynamics(), ...(w.annotations || {}) },
      })),
    }))
    const rawText = lines.map(line => {
      if (line.chords?.length) {
        return buildChordLine(line.chords, line.lyrics || '') + '\n' + (line.lyrics || '')
      }
      return line.lyrics || ''
    }).join('\n')
    return {
      id: Date.now() + Math.random(),
      type: block.sectionName || 'Section',
      lead: block.lead || DEFAULT_LEAD,
      rawText,
      lines,
      parsed: true,
    }
  })
}

// ── Duplicate naming — "Verse 1" → "Verse 2" (segment types ending in a bare number
// just increment); otherwise "Chorus" → "Chorus (Repeat 1)" → "Chorus (Repeat 2)"...
// Always strips any existing "(Repeat N)" suffix from the base first, so re-duplicating
// an already-repeated section renumbers from its original name instead of stacking
// suffixes (previously: "Chorus (Repeat) (Repeat)").
function getDuplicateName(existingTypes, type) {
  const used = new Set(existingTypes)
  const base = type.replace(/\s*\(Repeat\s+\d+\)\s*$/i, '')

  const trailingNumber = base.match(/^(.*?)(\d+)$/)
  if (trailingNumber) {
    const [, prefix, numStr] = trailingNumber
    let n = parseInt(numStr, 10) + 1
    let candidate = `${prefix}${n}`
    while (used.has(candidate)) { n++; candidate = `${prefix}${n}` }
    return candidate
  }

  let n = 1
  let candidate = `${base} (Repeat ${n})`
  while (used.has(candidate)) { n++; candidate = `${base} (Repeat ${n})` }
  return candidate
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SongDesigner({ canManageWorship, userProfile, onSaved, editingSong, onCancelEdit }) {
  const isEditing = !!editingSong
  const [meta, setMeta] = useState({ title: '', artist: '', key: '', tempo: '', designedBy: userProfile?.name || '' })
  const [segments, setSegments] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [transpose, setTranspose] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [detectedKeys, setDetectedKeys] = useState([])
  const [metaEditing, setMetaEditing] = useState(true)
  const [showSegmentMenu, setShowSegmentMenu] = useState(false)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [timeSignature, setTimeSignature] = useState(DEFAULT_TIME_SIGNATURE)
  const segmentMenuRef = useRef(null)
  const draftKey = draftKeyFor(editingSong?.id)
  const tapTimesRef = useRef([])
  const audioCtxRef = useRef(null)
  const nextNoteTimeRef = useRef(0)
  const beatCountRef = useRef(0)

  useEffect(() => {
    if (!showSegmentMenu) return
    const close = (e) => {
      if (segmentMenuRef.current && !segmentMenuRef.current.contains(e.target)) setShowSegmentMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [showSegmentMenu])

  // Load from editingSong whenever it changes — but a local draft for this exact song
  // (or the "new song" slot) always wins over the last-saved copy, and hydrates
  // straight into state with no prompt: it's the single source of truth for whatever
  // was in progress before a refresh/navigation-away interrupted it.
  useEffect(() => {
    const draft = loadDraft(draftKeyFor(editingSong?.id))
    if (draft) {
      // Merge over full fallbacks rather than using draft.meta as-is — a draft saved by
      // an older build (before a meta field like designedBy existed) would otherwise
      // hydrate that field as undefined, flipping its <input> from controlled to
      // uncontrolled and triggering React's warning.
      setMeta({ title: '', artist: '', key: '', tempo: '', designedBy: userProfile?.name || '', ...draft.meta })
      setSegments(draft.segments || [])
      setActiveIdx(0)
      setTranspose(draft.transpose ?? 0)
      setSaved(false)
      setMetaEditing(!draft.meta?.title?.trim())
      return
    }
    if (editingSong) {
      setMeta({
        title: editingSong.title || '',
        artist: editingSong.artist || '',
        key: editingSong.key || '',
        tempo: editingSong.tempo || '',
        designedBy: editingSong.designedBy || editingSong.createdBy || '',
      })
      setSegments(blocksToSegments(editingSong.blocks))
      setActiveIdx(0)
      setTranspose(0)
      setSaved(false)
      setMetaEditing(false)
    } else {
      setMeta({ title: '', artist: '', key: '', tempo: '', designedBy: userProfile?.name || '' })
      setSegments([])
      setActiveIdx(0)
      setTranspose(0)
      setSaved(false)
      setMetaEditing(true)
    }
  }, [editingSong, userProfile])

  // Keep the focused tab in bounds whenever segments are added/removed
  useEffect(() => {
    setActiveIdx(a => Math.min(a, Math.max(segments.length - 1, 0)))
  }, [segments.length])

  // Background autosave — every edit to lyrics, chords, dynamics, or segment structure
  // (all nested inside `segments`) plus song meta and transpose is written to
  // localStorage immediately, with no debounce, so it's continuously the working
  // source of truth rather than a periodic snapshot.
  useEffect(() => {
    if (!segments.length && !meta.title.trim()) return
    saveDraft(draftKey, { meta, segments, transpose, savedAt: Date.now() })
  }, [meta, segments, transpose, draftKey])

  const transposedKey = transposeKey(meta.key, transpose)
  const useFlatKey = FLAT_KEYS.has(transposedKey?.replace(/m$/, ''))
  const activeSegColor = getSegmentColor(segments[activeIdx]?.type)
  const bpmNumber = Number(meta.tempo) || 0
  const beatsPerBar = beatsPerBarFor(timeSignature)

  // Metronome — schedules Web Audio clicks against the AudioContext clock (not
  // setInterval alone) so playback stays sample-accurate instead of drifting with
  // JS timer jitter. Restarts automatically whenever BPM/time signature change live.
  useEffect(() => {
    if (!metronomeOn || !bpmNumber) return
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioCtx()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const lookaheadMs = 25
    const scheduleAheadSec = 0.1
    nextNoteTimeRef.current = ctx.currentTime + 0.05
    beatCountRef.current = 0

    const scheduleClick = (time, isDownbeat) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = isDownbeat ? 1600 : 1000
      gain.gain.setValueAtTime(0.0001, time)
      gain.gain.exponentialRampToValueAtTime(0.9, time + 0.001)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(time)
      osc.stop(time + 0.05)
    }

    const timer = setInterval(() => {
      while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadSec) {
        scheduleClick(nextNoteTimeRef.current, beatCountRef.current % beatsPerBar === 0)
        nextNoteTimeRef.current += 60 / bpmNumber
        beatCountRef.current++
      }
    }, lookaheadMs)

    return () => clearInterval(timer)
  }, [metronomeOn, bpmNumber, beatsPerBar])

  // Release the AudioContext when the designer unmounts
  useEffect(() => () => { audioCtxRef.current?.close?.() }, [])

  // Tap Tempo — averages the last few tap intervals (resetting if the user pauses
  // for 2s+) and writes the resulting BPM straight into the tempo field.
  const handleTapTempo = () => {
    const now = performance.now()
    const recent = [...tapTimesRef.current, now].filter(t => now - t < 2000).slice(-6)
    tapTimesRef.current = recent
    if (recent.length < 2) return
    const intervals = recent.slice(1).map((t, i) => t - recent[i])
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const bpm = Math.round(60000 / avgMs)
    if (bpm >= 30 && bpm <= 300) setMeta(m => ({ ...m, tempo: String(bpm) }))
  }

  const addSegment = type => {
    setSegments(p => [...p, {
      id: Date.now() + Math.random(),
      type, lead: DEFAULT_LEAD, rawText: '', lines: [], parsed: false,
    }])
    setActiveIdx(segments.length)
  }

  const updateSegment = useCallback((id, patch) =>
    setSegments(p => p.map(s => s.id === id ? { ...s, ...patch } : s)), [])

  // Deep-clones the section (lyrics, chord/word dynamics annotations, lead) into a
  // new tab right after the original, auto-naming it (e.g. "Verse 1" → "Verse 2").
  const duplicateSegment = id => {
    const idx = segments.findIndex(s => s.id === id)
    if (idx === -1) return
    setSegments(prev => {
      const i = prev.findIndex(s => s.id === id)
      if (i === -1) return prev
      const original = prev[i]
      const clone = {
        ...original,
        id: Date.now() + Math.random(),
        type: getDuplicateName(prev.map(s => s.type), original.type),
        lines: original.lines.map(line => ({
          ...line,
          chords: (line.chords || []).map(c => ({ ...c, annotations: { ...c.annotations } })),
          words: (line.words || []).map(w => ({ ...w, annotations: { ...w.annotations } })),
        })),
      }
      const next = [...prev]
      next.splice(i + 1, 0, clone)
      return next
    })
    setActiveIdx(idx + 1)
  }

  const buildPayload = () => {
    // Always resolve lines — fall back to parsing rawText so lyrics are never lost
    // if the user edited the textarea without clicking "Parse chords" again.
    const resolvedSegments = segments.map(s => ({
      ...s,
      lines: s.lines?.length ? s.lines : parseSegmentText(s.rawText || ''),
    }))
    return {
      ...meta,
      key: transposedKey || meta.key,
      tempo: meta.tempo ? Number(meta.tempo) : null,
      blocks: resolvedSegments.map(s => ({
        sectionName: s.type,
        lead: s.lead || DEFAULT_LEAD,
        lines: s.lines.map(({ chords, lyrics, words }) => ({
          chords: chords.map(c => ({ ...c, chord: transposeChord(c.chord, transpose, useFlatKey) })),
          lyrics,
          words: words?.map(({ text, isWord, annotations }) => ({ text, isWord, annotations })) ?? [],
        })),
      })),
      sections: resolvedSegments.map(s => ({
        type: s.type,
        lyrics: s.lines.map(l => l.lyrics).filter(Boolean).join('\n'),
      })),
    }
  }

  const handleSave = async () => {
    if (!meta.title.trim()) return
    setSaving(true)
    try {
      if (isEditing) {
        await updateWorshipSong(editingSong.id, buildPayload())
      } else {
        await addWorshipSong(buildPayload(), userProfile?.name || 'unknown')
      }
      clearDraft(draftKey)
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = () => {
    if (isEditing) {
      onCancelEdit?.()
    } else {
      clearDraft(draftKey)
      setMeta({ title: '', artist: '', key: '', tempo: '', designedBy: userProfile?.name || '' })
      setSegments([])
      setTranspose(0)
      setSaved(false)
      setMetaEditing(true)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Edit mode banner — muted helper banner */}
      {isEditing && (
        <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-2xl opacity-80">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Editing</p>
          <p className="text-sm font-medium text-slate-500">{editingSong.title}</p>
        </div>
      )}

      {/* Meta — soft gradient glow gives the main info card a lift without cluttering the canvas */}
      <div className="bg-gradient-to-br from-indigo-50/40 via-white to-purple-50/30 rounded-2xl border border-indigo-100/60 p-4 space-y-3">
        {metaEditing ? (
          <>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Title *</label>
                <input value={meta.title} onChange={e => setMeta(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="Song title" />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Artist</label>
                <input value={meta.artist} onChange={e => setMeta(p => ({ ...p, artist: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="e.g. Hillsong" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Designed by</label>
              <input value={meta.designedBy} onChange={e => setMeta(p => ({ ...p, designedBy: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-300" placeholder="Who put this song sheet together?" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Key</label>
                  <button
                    type="button"
                    onClick={() => setDetectedKeys(detectKey(segments))}
                    disabled={segments.length === 0}
                    className="text-[10px] font-medium text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >Auto-detect</button>
                </div>
                <select value={meta.key} onChange={e => { setMeta(p => ({ ...p, key: e.target.value })); setDetectedKeys([]) }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-600">
                  <option value="">—</option>
                  {['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B',
                    'Am','Em','Bm','F#m','C#m','Dm','Gm','Cm','Fm','Bbm'].map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                {detectedKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="text-[10px] text-slate-400 self-center">Detected:</span>
                    {detectedKeys.map((k, i) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => { setMeta(p => ({ ...p, key: k })); setDetectedKeys([]) }}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
                          i === 0
                            ? 'bg-slate-500 text-white border-slate-500'
                            : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                        }`}
                      >{k}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Tempo (BPM)</label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  inputMode="numeric"
                  value={meta.tempo}
                  onChange={e => setMeta(p => ({ ...p, tempo: e.target.value }))}
                  placeholder="e.g. 120"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white text-slate-600"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!meta.title.trim()}
                onClick={() => setMetaEditing(false)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              >Save Info</button>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-700 text-base truncate">{meta.title || 'Untitled Song'}</p>
              {meta.designedBy && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Designed by <span className="font-medium text-slate-500">{meta.designedBy}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {meta.artist && <span className="text-xs text-slate-400">{meta.artist}</span>}
                {(transposedKey || meta.key) && (
                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    Key of {transposedKey || meta.key}
                  </span>
                )}
                {meta.tempo && (
                  <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                    {meta.tempo} BPM
                  </span>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setMetaEditing(true)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <Pencil size={12} /> Edit
            </button>
          </div>
        )}

        {/* Transpose — compact, muted ghost controls */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200 opacity-80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0">Transpose</span>
          <button type="button" onClick={() => setTranspose(t => Math.max(t - 1, -11))}
            className="w-7 h-7 rounded-lg text-slate-400 font-medium hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all flex items-center justify-center text-sm">−</button>
          <div className="min-w-[72px] text-center">
            {transpose === 0
              ? <span className="text-xs text-slate-400">Original</span>
              : <span className="text-xs font-medium text-slate-500">{transpose > 0 ? `+${transpose}` : transpose} st</span>
            }
          </div>
          <button type="button" onClick={() => setTranspose(t => Math.min(t + 1, 11))}
            className="w-7 h-7 rounded-lg text-slate-400 font-medium hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all flex items-center justify-center text-sm">+</button>
          {transpose !== 0 && (
            <button type="button" onClick={() => setTranspose(0)}
              className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
          )}
          {meta.key && transpose !== 0 && (
            <span className="ml-auto text-xs font-medium text-slate-400 bg-white px-2.5 py-1 rounded-full border border-slate-200">
              {meta.key} → {transposedKey}
            </span>
          )}
        </div>

        {/* Metronome — Web Audio click track locked to the Tempo (BPM) field above */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200 opacity-80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0">Metronome</span>
          <button type="button" onClick={() => setMetronomeOn(v => !v)}
            disabled={!bpmNumber}
            title={metronomeOn ? 'Pause metronome' : 'Play metronome'}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed ${
              metronomeOn ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}>
            {metronomeOn ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button type="button" onClick={handleTapTempo}
            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-500 hover:bg-slate-100 active:scale-95 transition-all">
            Tap Tempo
          </button>
          <select value={timeSignature} onChange={e => setTimeSignature(e.target.value)}
            title="Time signature"
            className="text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300">
            {TIME_SIGNATURES.map(ts => <option key={ts} value={ts}>{ts}</option>)}
          </select>
          {metronomeOn && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {bpmNumber} BPM
            </span>
          )}
        </div>
      </div>

      {/* Segment picker — button reveals a popover of segment types */}
      <div className="relative" ref={segmentMenuRef}>
        <button
          type="button"
          onClick={() => setShowSegmentMenu(v => !v)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-400 text-xs font-medium bg-slate-50 hover:bg-slate-100 hover:text-slate-600 active:scale-95 transition-all"
        >
          + Add Segment
        </button>
        {showSegmentMenu && (
          <div className="absolute z-10 mt-2 p-2 rounded-2xl border border-slate-200 bg-white shadow-lg flex flex-wrap gap-2 w-max max-w-xs">
            {SEGMENT_TYPES.map(type => (
              <button key={type} type="button"
                onClick={() => { addSegment(type); setShowSegmentMenu(false) }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium bg-slate-50 hover:bg-slate-100 hover:text-slate-700 active:scale-95 transition-all">
                + {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Song document — the readable chord/lyric sheet, kept narrow (see max-w-3xl
          on the outer container) since chord/lyric lines are short text blocks that
          look lost and hard to scan when stretched full-width on a wide screen. */}
      {segments.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-6">
          No segments yet — tap a segment button above to start building your song.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Section navigation tabs — color-coded per type; focus mode: only the active section renders below */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {segments.map((seg, idx) => {
              const c = getSegmentColor(seg.type)
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    idx === activeIdx ? c.active : c.pill
                  }`}
                >
                  {seg.type}
                </button>
              )
            })}
          </div>

          <div className={`bg-white rounded-xl border border-slate-100 border-t-4 ${activeSegColor.top} shadow-md overflow-hidden transition-colors`}>
            {meta.title && (
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-baseline gap-3 opacity-90">
                <p className="font-semibold text-slate-500 text-sm">{meta.title}</p>
                {meta.artist && <span className="text-xs text-slate-400">{meta.artist}</span>}
                {(transposedKey || meta.key) && (
                  <span className="ml-auto text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    Key of {transposedKey || meta.key}
                  </span>
                )}
              </div>
            )}

            <SegmentSection
              key={segments[activeIdx].id}
              seg={segments[activeIdx]}
              onUpdate={updateSegment}
              onDuplicate={duplicateSegment}
              transpose={transpose}
              useFlatKey={useFlatKey}
              beatsPerBar={beatsPerBar}
              isLast
            />

            {/* Step-by-step flow */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50 opacity-80">
              <button type="button" disabled={activeIdx === 0}
                onClick={() => setActiveIdx(i => Math.max(i - 1, 0))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95">
                ← Previous Section
              </button>
              <span className="text-xs text-slate-400 font-medium">{activeIdx + 1} / {segments.length}</span>
              <button type="button" disabled={activeIdx === segments.length - 1}
                onClick={() => setActiveIdx(i => Math.min(i + 1, segments.length - 1))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95">
                Next Section →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save / Clear */}
      {(segments.length > 0 || meta.title) && (
        <div className="flex gap-3">
          <button type="button" onClick={handleClear}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {isEditing ? '← Back' : 'Clear'}
          </button>
          {canManageWorship && (
            <button type="button" disabled={saving || !meta.title.trim()} onClick={handleSave}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-[0.98]">
              {saving ? 'Saving…' : saved ? '✓ Saved' : isEditing ? 'Save Changes' : 'Save to Directory'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
