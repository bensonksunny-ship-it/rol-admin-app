import { useState, useMemo } from 'react'

const CHROMATIC     = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const FLAT_TO_SHARP = { Db:'C#', Eb:'D#', Fb:'E', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' }
const SHARP_TO_FLAT = { 'C#':'Db', 'D#':'Eb', 'F#':'Gb', 'G#':'Ab', 'A#':'Bb' }
const FLAT_KEYS     = new Set(['F','Bb','Eb','Ab','Db','Gb'])

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

// Maps a worship team roster position (see MEMBER_POSITIONS in DepartmentWorship.jsx)
// to the dynamics-annotation instrument key(s) it corresponds to, so "My Role" view
// can filter word/chord color bars down to just what that person plays.
const POSITION_TO_INSTRUMENTS = {
  'Lead vocal':     ['mVocal', 'fVocal'],
  'Parts':          ['parts'],
  'Choir':          ['choir'],
  'Lead guitar':    ['leadGuitar'],
  'Guitar':         ['rhythmGuitar', 'acoustic'],
  'Bass':           ['bass'],
  'Keyboard':       ['keys'],
  'Drums':          ['drums'],
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

function buildChordLine(chords, lyrics) {
  const len = Math.max((lyrics || '').length + 1, ...chords.map(c => c.pos + c.chord.length + 1))
  const arr = Array(len).fill(' ')
  for (const { chord, pos } of chords) {
    for (let j = 0; j < chord.length && pos + j < arr.length; j++) arr[pos + j] = chord[j]
  }
  return arr.join('')
}

function SongLine({ line, transpose, useFlatKey, visibleInstrumentKeys }) {
  const { chords = [], lyrics = '', words = [] } = line
  const shifted = chords.map(c => ({ ...c, chord: transposeChord(c.chord, transpose, useFlatKey) }))
  const chordDisplay = chords.length ? buildChordLine(shifted, lyrics) : null
  // null means "no filter" (full team view) — otherwise only these instrument keys render
  const visible = inst => !visibleInstrumentKeys || visibleInstrumentKeys.has(inst.key)
  const hasAnnotation = words.some(w => w.isWord && INSTRUMENTS.some(i => visible(i) && (w.annotations?.[i.key] ?? 0) > 0))

  return (
    <div className="mb-4">
      {chordDisplay && (
        <pre className="font-mono text-sm font-bold tracking-tight text-violet-700 whitespace-pre leading-relaxed m-0 select-none">
          {chordDisplay}
        </pre>
      )}
      <div className="font-mono text-sm font-medium leading-relaxed text-slate-800 flex flex-nowrap">
        {words.length > 0
          ? words.map((w, wi) =>
              !w.isWord
                ? <span key={wi} className="whitespace-pre">{w.text}</span>
                : <span key={wi}>{w.text}</span>
            )
          : <span className="whitespace-pre-wrap">{lyrics}</span>
        }
      </div>
      {hasAnnotation && (
        <div className="font-mono text-sm flex flex-nowrap" aria-hidden="true">
          {words.map((w, wi) => {
            if (!w.isWord) return <span key={wi} className="whitespace-pre invisible">{w.text}</span>
            const active = INSTRUMENTS.filter(i => visible(i) && (w.annotations?.[i.key] ?? 0) > 0)
            if (!active.length) return <span key={wi} className="invisible px-0.5">{w.text}</span>
            return (
              <span key={wi} className="flex flex-col gap-[1.5px] pt-[3px] px-0.5"
                style={{ width: `${w.text.length}ch`, minWidth: `${w.text.length}ch` }}>
                {active.map(inst => (
                  <span key={inst.key} className="block rounded-full"
                    style={{ height: '3px', backgroundColor: inst.color,
                      opacity: 0.25 + (w.annotations[inst.key] / MAX_INT) * 0.75 }} />
                ))}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SongViewer({ song, onClose, onEdit, canManage, myPositions = [] }) {
  const [transpose, setTranspose] = useState(0)

  const myInstrumentKeys = useMemo(() => {
    const keys = new Set()
    for (const pos of myPositions) {
      for (const key of POSITION_TO_INSTRUMENTS[pos] || []) keys.add(key)
    }
    return keys
  }, [myPositions])

  // Default to "My Role" whenever we could resolve at least one instrument for this
  // person, otherwise there's nothing to filter to, so show the full arrangement.
  const [viewMode, setViewMode] = useState(() => myInstrumentKeys.size > 0 ? 'mine' : 'full')

  const transposedKey = transposeKey(song?.key, transpose)
  const useFlatKey = FLAT_KEYS.has(transposedKey?.replace(/m$/, ''))

  if (!song) return null

  const hasBlocks = Array.isArray(song.blocks) && song.blocks.length > 0
  const visibleInstrumentKeys = viewMode === 'mine' ? myInstrumentKeys : null
  const myRoleLabel = INSTRUMENTS.filter(i => myInstrumentKeys.has(i.key)).map(i => i.label).join(' / ')

  const usedInstruments = hasBlocks
    ? INSTRUMENTS.filter(inst =>
        (!visibleInstrumentKeys || visibleInstrumentKeys.has(inst.key)) &&
        song.blocks.some(b => b.lines?.some(l =>
          l.words?.some(w => (w.annotations?.[inst.key] ?? 0) > 0)
        ))
      )
    : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Sticky top toolbar — back nav, title, transpose, Edit all condensed and
          muted here so the lyrics/chords below are the only thing fighting for attention ── */}
      <div className="shrink-0 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:scale-90 transition-all text-lg leading-none shrink-0">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-400 truncate">
              {[song.title, song.artist, song.tempo].filter(Boolean).join(' · ')}
            </p>
          </div>
          <select
            value={viewMode}
            onChange={e => setViewMode(e.target.value)}
            title="Filter arrangement dynamics by role"
            className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-1 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-200 shrink-0"
          >
            {myInstrumentKeys.size > 0 && <option value="mine">My role ({myRoleLabel})</option>}
            <option value="full">Full team view</option>
          </select>
          {canManage && (
            <button type="button" onClick={() => onEdit(song)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-400 text-xs font-medium opacity-70 hover:opacity-100 hover:bg-slate-50 hover:text-slate-600 active:scale-95 transition-all shrink-0">
              Edit
            </button>
          )}
        </div>

        {/* Transpose row — compact, muted, ghost controls */}
        <div className="max-w-4xl mx-auto px-4 pb-2 flex items-center gap-1.5 text-slate-400 opacity-70">
          <span className="text-xs font-semibold uppercase tracking-wider shrink-0">Transpose</span>
          <button type="button" onClick={() => setTranspose(t => Math.max(t - 1, -11))}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all text-xs font-bold">−</button>
          <div className="min-w-[64px] text-center text-[11px] font-medium">
            {transpose === 0 ? 'Original' : `${transpose > 0 ? `+${transpose}` : transpose} st`}
          </div>
          <button type="button" onClick={() => setTranspose(t => Math.min(t + 1, 11))}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 hover:text-slate-600 active:scale-90 transition-all text-xs font-bold">+</button>
          {transpose !== 0 && (
            <button type="button" onClick={() => setTranspose(0)}
              className="text-[11px] hover:text-slate-600 underline">Reset</button>
          )}
          {song.key && (
            <span className="ml-auto text-[11px] font-medium shrink-0">
              {song.key}{transpose !== 0 ? ` → ${transposedKey}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable content — lyrics/chords card gets the space and the visual weight ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-5 flex flex-col gap-5 min-h-full">

        {/* Unified song card — identical structure to the designer's song document */}
        {(hasBlocks || song.sections?.length > 0) && (
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">

            {hasBlocks
              ? song.blocks.map((block, bi) => (
                  <div key={bi}>
                    {/* Section header — same violet style as SegmentSection */}
                    <div className={`flex items-center justify-between px-4 py-2 bg-slate-50 ${bi > 0 ? 'border-t border-slate-200' : ''}`}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{block.sectionName}</p>
                      {block.lead && (
                        <span className="text-[11px] font-bold px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-500 shrink-0">
                          Lead: {block.lead}
                        </span>
                      )}
                    </div>
                    {/* Lyrics + chords */}
                    <div className="px-4 pt-3 pb-4 overflow-x-auto">
                      {(block.lines || []).length > 0
                        ? (block.lines || []).map((line, li) => (
                            <SongLine key={li} line={line} transpose={transpose} useFlatKey={useFlatKey} visibleInstrumentKeys={visibleInstrumentKeys} />
                          ))
                        : <p className="text-xs text-slate-400 italic">No lyrics</p>
                      }
                    </div>
                  </div>
                ))
              : (song.sections || []).map((sec, si) => (
                  <div key={si}>
                    <div className={`flex items-center px-4 py-2 bg-slate-50 ${si > 0 ? 'border-t border-slate-200' : ''}`}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{sec.type}</p>
                    </div>
                    <div className="px-4 pt-3 pb-4">
                      {sec.lyrics
                        ? <pre className="font-mono text-sm font-medium leading-relaxed text-slate-800 whitespace-pre-wrap m-0">{sec.lyrics}</pre>
                        : <p className="text-xs text-slate-400 italic">No lyrics</p>
                      }
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {!hasBlocks && !song.sections?.length && (
          <p className="text-center text-slate-400 text-sm py-10">No content saved for this song.</p>
        )}

        {/* Instrument legend — muted, secondary to the lyrics/chords card above */}
        {usedInstruments.length > 0 && (
          <div className="shrink-0 rounded-2xl border border-slate-100 px-4 py-2.5 opacity-70">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              {viewMode === 'mine' ? 'My instrument' : 'Instrument legend'}
            </p>
            <div className="flex flex-wrap gap-3">
              {usedInstruments.map(inst => (
                <span key={inst.key} className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <span className="w-4 h-1.5 rounded-full shrink-0" style={{ backgroundColor: inst.color }} />
                  {inst.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>
      </div>
    </div>
  )
}
