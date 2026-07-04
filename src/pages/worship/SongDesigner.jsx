import { useState, useCallback, useEffect } from 'react'
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
const INT_LABEL = ['', 'p', 'mf', 'f']
const defaultDynamics = () => Object.fromEntries(INSTRUMENTS.map(i => [i.key, 0]))

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
    if (isChordToken(t)) chords.push({ chord: t, pos: m.index })
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
    if (isChordToken(m[1])) chords.push({ chord: m[1], pos: lyrics.length })
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

// ── Inline word annotation panel ─────────────────────────────────────────────
function WordPanel({ word, wordText, onClose, onChange }) {
  const hex = n => Math.round(n * 255).toString(16).padStart(2, '0')
  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-100">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Editing</span>
          <span className="font-mono font-bold text-amber-900 text-sm">"{wordText}"</span>
        </div>
        <button type="button" onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-200 text-amber-700 hover:bg-amber-300 text-base leading-none transition-colors">
          ×
        </button>
      </div>
      <div className="px-3 py-3 flex flex-wrap gap-2">
        {INSTRUMENTS.map(inst => {
          const level = word.annotations?.[inst.key] ?? 0
          const opacity = level === 0 ? 0 : 0.18 + (level / MAX_INT) * 0.82
          const bg = level === 0 ? '#fff' : `${inst.color}${hex(opacity)}`
          const textColor = level === 0 ? '#94a3b8' : opacity > 0.5 ? '#fff' : inst.color
          const border = level === 0 ? '#e2e8f0' : inst.color
          return (
            <div key={inst.key} className="flex flex-col items-center gap-1 select-none">
              <button type="button"
                onClick={() => onChange(inst.key, level >= MAX_INT ? 0 : level + 1)}
                className="px-2 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap active:scale-95"
                style={{ backgroundColor: bg, color: textColor, border: `1.5px solid ${border}` }}>
                {inst.label}
                {level > 0 && <span className="ml-1 text-[10px] opacity-90">{INT_LABEL[level]}</span>}
              </button>
              <div className="flex gap-[3px]">
                {Array.from({ length: MAX_INT }).map((_, di) => (
                  <button key={di} type="button"
                    onClick={() => onChange(inst.key, di + 1 === level ? 0 : di + 1)}
                    className="w-4 h-1.5 rounded-full transition-colors"
                    style={{ backgroundColor: di < level ? inst.color : '#e2e8f0' }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Annotated lyric line ──────────────────────────────────────────────────────
function AnnotatedLine({ line, transpose, useFlatKey, activeKey, onWordTap }) {
  const { chords, lyrics, words } = line
  const shifted = chords.map(c => ({ ...c, chord: transposeChord(c.chord, transpose, useFlatKey) }))
  const chordDisplay = chords.length ? buildChordLine(shifted, lyrics) : null
  const hasAnyAnnotation = words.some(w => w.isWord && INSTRUMENTS.some(i => (w.annotations?.[i.key] ?? 0) > 0))

  return (
    <div className="mb-3">
      {chordDisplay && (
        // Same font-mono + text-sm as the words row below — chord `pos` is a character
        // index into the lyric string, so both rows must share one character width
        // (font family + size) or the chords drift out of alignment with the syllables.
        <pre className="font-mono text-sm font-bold text-violet-600 whitespace-pre leading-6 m-0 select-none">
          {chordDisplay}
        </pre>
      )}

      {/* Words row */}
      <div className="font-mono text-sm leading-6 flex flex-nowrap">
        {words.map((w, wi) => {
          if (!w.isWord) return (
            <span key={wi} className="whitespace-pre select-none">{w.text}</span>
          )
          const key = `${wi}`
          const isActive = activeKey === key
          const activeInsts = INSTRUMENTS.filter(i => (w.annotations?.[i.key] ?? 0) > 0)
          const hasAnnotation = activeInsts.length > 0
          return (
            <span
              key={wi}
              className={`cursor-pointer rounded transition-colors px-0.5 -mx-0.5 ${
                isActive ? 'bg-amber-200 text-amber-900' : hasAnnotation ? 'bg-indigo-50' : 'hover:bg-slate-100'
              }`}
              onClick={() => onWordTap(key, wi)}
            >
              {w.text}
            </span>
          )
        })}
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
function SegmentSection({ seg, idx, total, onUpdate, onRemove, onMove, transpose, useFlatKey, isLast }) {
  const [activeWord, setActiveWord] = useState(null) // { lineIdx, wordIdx, wordKey }

  const handleWordTap = useCallback((lineIdx, wordKey, wordIdx) => {
    setActiveWord(prev =>
      prev?.lineIdx === lineIdx && prev?.wordKey === wordKey ? null : { lineIdx, wordKey, wordIdx }
    )
  }, [])

  const handleAnnotationChange = useCallback((instKey, level) => {
    if (!activeWord) return
    onUpdate(seg.id, {
      lines: seg.lines.map((line, li) => {
        if (li !== activeWord.lineIdx) return line
        return {
          ...line,
          words: line.words.map((w, wi) => {
            if (wi !== activeWord.wordIdx) return w
            return { ...w, annotations: { ...w.annotations, [instKey]: level } }
          }),
        }
      }),
    })
  }, [activeWord, seg.id, seg.lines, onUpdate])

  const activeWordObj = activeWord
    ? seg.lines[activeWord.lineIdx]?.words?.[activeWord.wordIdx]
    : null

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
        <p className="text-xs font-black uppercase tracking-widest text-violet-700">{seg.type}</p>
        <div className="flex items-center gap-1">
          <button type="button" disabled={idx === 0} onClick={() => onMove(idx, -1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-colors text-sm font-bold">↑</button>
          <button type="button" disabled={idx === total - 1} onClick={() => onMove(idx, 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-violet-600 disabled:opacity-30 transition-colors text-sm font-bold">↓</button>
          <button type="button" onClick={() => onRemove(seg.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 transition-colors text-base leading-none">×</button>
        </div>
      </div>

      {/* Lyrics input */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <textarea
          value={seg.rawText}
          onChange={e => onUpdate(seg.id, { rawText: e.target.value, lines: [], parsed: false })}
          rows={4}
          placeholder={`Paste lyrics here.\nChords above lines or [G]inline format.`}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 bg-slate-50 text-slate-800 placeholder-slate-400"
        />
        <div className="flex items-center justify-between">
          {seg.parsed
            ? <span className="text-xs text-emerald-600 font-medium">✓ Tap words to assign dynamics</span>
            : <span className="text-xs text-slate-400">{seg.rawText.trim() ? 'Hit parse to render' : ''}</span>
          }
          <button
            type="button"
            disabled={!seg.rawText.trim()}
            onClick={() => { onUpdate(seg.id, { lines: parseSegmentText(seg.rawText), parsed: true }); setActiveWord(null) }}
            className="px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all active:scale-95"
          >Parse chords</button>
        </div>
      </div>

      {/* Chord chart with annotatable words */}
      {seg.parsed && seg.lines.length > 0 && (
        <div className="px-4 pt-2 pb-4 border-t border-slate-100 overflow-x-auto">
          <p className="text-[10px] text-slate-400 mb-2 select-none">Tap a word to assign instrument dynamics</p>
          {seg.lines.map((line, li) => (
            <AnnotatedLine
              key={li}
              line={line}
              transpose={transpose}
              useFlatKey={useFlatKey}
              activeKey={activeWord?.lineIdx === li ? activeWord.wordKey : null}
              onWordTap={(wordKey, wordIdx) => handleWordTap(li, wordKey, wordIdx)}
            />
          ))}
          {/* Inline annotation panel — appears right below the lines */}
          {activeWord && activeWordObj && (
            <WordPanel
              word={activeWordObj}
              wordText={activeWordObj.text}
              onChange={handleAnnotationChange}
              onClose={() => setActiveWord(null)}
            />
          )}
        </div>
      )}

      {!isLast && <div className="h-px bg-slate-200" />}
    </div>
  )
}

// ── Reconstruct segments from stored blocks ───────────────────────────────────
function blocksToSegments(blocks) {
  return (blocks || []).map(block => {
    const lines = (block.lines || []).map(line => ({
      ...line,
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
      rawText,
      lines,
      parsed: true,
    }
  })
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SongDesigner({ canManageWorship, userProfile, onSaved, editingSong, onCancelEdit }) {
  const isEditing = !!editingSong
  const [meta, setMeta] = useState({ title: '', artist: '', key: '', tempo: '' })
  const [segments, setSegments] = useState([])
  const [transpose, setTranspose] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [detectedKeys, setDetectedKeys] = useState([])

  // Load from editingSong whenever it changes
  useEffect(() => {
    if (editingSong) {
      setMeta({
        title: editingSong.title || '',
        artist: editingSong.artist || '',
        key: editingSong.key || '',
        tempo: editingSong.tempo || '',
      })
      setSegments(blocksToSegments(editingSong.blocks))
      setTranspose(0)
      setSaved(false)
    } else {
      setMeta({ title: '', artist: '', key: '', tempo: '' })
      setSegments([])
      setTranspose(0)
      setSaved(false)
    }
  }, [editingSong])

  const transposedKey = transposeKey(meta.key, transpose)
  const useFlatKey = FLAT_KEYS.has(transposedKey?.replace(/m$/, ''))

  const addSegment = type => setSegments(p => [...p, {
    id: Date.now() + Math.random(),
    type, rawText: '', lines: [], parsed: false,
  }])

  const updateSegment = useCallback((id, patch) =>
    setSegments(p => p.map(s => s.id === id ? { ...s, ...patch } : s)), [])

  const removeSegment = useCallback(id =>
    setSegments(p => p.filter(s => s.id !== id)), [])

  const moveSegment = useCallback((idx, dir) => setSegments(p => {
    const a = [...p]
    const to = idx + dir
    if (to < 0 || to >= a.length) return a
    ;[a[idx], a[to]] = [a[to], a[idx]]
    return a
  }), [])

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
      setMeta({ title: '', artist: '', key: '', tempo: '' })
      setSegments([])
      setTranspose(0)
      setSaved(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Edit mode banner */}
      {isEditing && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Editing</p>
            <p className="text-sm font-semibold text-amber-900">{editingSong.title}</p>
          </div>
          <button type="button" onClick={onCancelEdit}
            className="text-xs text-amber-700 hover:text-amber-900 underline">
            ← Back to Directory
          </button>
        </div>
      )}

      {/* Meta */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
            <input value={meta.title} onChange={e => setMeta(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Song title" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Artist</label>
            <input value={meta.artist} onChange={e => setMeta(p => ({ ...p, artist: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Hillsong" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600">Key</label>
              <button
                type="button"
                onClick={() => setDetectedKeys(detectKey(segments))}
                disabled={segments.length === 0}
                className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >Auto-detect</button>
            </div>
            <select value={meta.key} onChange={e => { setMeta(p => ({ ...p, key: e.target.value })); setDetectedKeys([]) }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
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
                    className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                      i === 0
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'
                    }`}
                  >{k}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Tempo (BPM)</label>
            <input
              type="number"
              min="1"
              max="300"
              inputMode="numeric"
              value={meta.tempo}
              onChange={e => setMeta(p => ({ ...p, tempo: e.target.value }))}
              placeholder="e.g. 120"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
          </div>
        </div>
        {/* Transpose */}
        <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
          <span className="text-xs font-medium text-slate-600 shrink-0">Transpose</span>
          <button type="button" onClick={() => setTranspose(t => Math.max(t - 1, -11))}
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 active:scale-90 transition-all flex items-center justify-center">−</button>
          <div className="min-w-[80px] text-center">
            {transpose === 0
              ? <span className="text-sm text-slate-400 font-medium">Original</span>
              : <span className="text-sm font-bold text-violet-700">{transpose > 0 ? `+${transpose}` : transpose} st</span>
            }
          </div>
          <button type="button" onClick={() => setTranspose(t => Math.min(t + 1, 11))}
            className="w-8 h-8 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 active:scale-90 transition-all flex items-center justify-center">+</button>
          {transpose !== 0 && (
            <button type="button" onClick={() => setTranspose(0)}
              className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
          )}
          {meta.key && transpose !== 0 && (
            <span className="ml-auto text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200">
              {meta.key} → {transposedKey}
            </span>
          )}
        </div>
      </div>

      {/* Segment picker */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Add a segment</p>
        <div className="flex flex-wrap gap-2">
          {SEGMENT_TYPES.map(type => (
            <button key={type} type="button" onClick={() => addSegment(type)}
              className="px-3 py-1.5 rounded-xl border-2 border-violet-200 text-violet-700 text-xs font-bold bg-violet-50 hover:bg-violet-100 hover:border-violet-400 active:scale-95 transition-all">
              + {type}
            </button>
          ))}
        </div>
      </div>

      {/* Song document — the readable chord/lyric sheet, kept narrow (see max-w-3xl
          on the outer container) since chord/lyric lines are short text blocks that
          look lost and hard to scan when stretched full-width on a wide screen. */}
      {segments.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-6">
          No segments yet — tap a segment button above to start building your song.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {meta.title && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-baseline gap-3">
              <p className="font-bold text-slate-800 text-base">{meta.title}</p>
              {meta.artist && <span className="text-xs text-slate-500">{meta.artist}</span>}
              {(transposedKey || meta.key) && (
                <span className="ml-auto text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Key of {transposedKey || meta.key}
                </span>
              )}
            </div>
          )}
          {segments.map((seg, idx) => (
            <SegmentSection
              key={seg.id}
              seg={seg}
              idx={idx}
              total={segments.length}
              onUpdate={updateSegment}
              onRemove={removeSegment}
              onMove={moveSegment}
              transpose={transpose}
              useFlatKey={useFlatKey}
              isLast={idx === segments.length - 1}
            />
          ))}
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
