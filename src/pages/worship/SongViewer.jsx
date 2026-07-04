import { useState } from 'react'

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

function SongLine({ line, transpose, useFlatKey }) {
  const { chords = [], lyrics = '', words = [] } = line
  const shifted = chords.map(c => ({ ...c, chord: transposeChord(c.chord, transpose, useFlatKey) }))
  const chordDisplay = chords.length ? buildChordLine(shifted, lyrics) : null
  const hasAnnotation = words.some(w => w.isWord && INSTRUMENTS.some(i => (w.annotations?.[i.key] ?? 0) > 0))

  return (
    <div className="mb-3">
      {chordDisplay && (
        <pre className="font-mono text-sm font-bold text-violet-600 whitespace-pre leading-6 m-0 select-none">
          {chordDisplay}
        </pre>
      )}
      <div className="font-mono text-sm leading-6 flex flex-nowrap">
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
            const active = INSTRUMENTS.filter(i => (w.annotations?.[i.key] ?? 0) > 0)
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

export default function SongViewer({ song, onClose, onEdit, canManage }) {
  const [transpose, setTranspose] = useState(0)
  const transposedKey = transposeKey(song?.key, transpose)
  const useFlatKey = FLAT_KEYS.has(transposedKey?.replace(/m$/, ''))

  if (!song) return null

  const hasBlocks = Array.isArray(song.blocks) && song.blocks.length > 0

  const usedInstruments = hasBlocks
    ? INSTRUMENTS.filter(inst =>
        song.blocks.some(b => b.lines?.some(l =>
          l.words?.some(w => (w.annotations?.[inst.key] ?? 0) > 0)
        ))
      )
    : []

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Sticky header — mirrors the designer's edit-mode banner style ── */}
      <div className="shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xl leading-none">
            ←
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-base leading-tight truncate">{song.title}</p>
            {(song.artist || song.tempo) && (
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {[song.artist, song.tempo].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {canManage && (
            <button type="button" onClick={() => onEdit(song)}
              className="px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 active:scale-95 transition-all shrink-0">
              Edit
            </button>
          )}
        </div>

        {/* Transpose row — same style as designer's transpose bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-slate-100 bg-slate-50">
          <span className="text-xs font-medium text-slate-500 shrink-0">Transpose</span>
          <button type="button" onClick={() => setTranspose(t => Math.max(t - 1, -11))}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-100 active:scale-90 transition-all text-sm">−</button>
          <div className="min-w-[80px] text-center">
            {transpose === 0
              ? <span className="text-sm text-slate-400 font-medium">Original</span>
              : <span className="text-sm font-bold text-violet-700">{transpose > 0 ? `+${transpose}` : transpose} st</span>
            }
          </div>
          <button type="button" onClick={() => setTranspose(t => Math.min(t + 1, 11))}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-100 active:scale-90 transition-all text-sm">+</button>
          {transpose !== 0 && (
            <button type="button" onClick={() => setTranspose(0)}
              className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
          )}
          {song.key && (
            <span className="ml-auto text-xs font-semibold text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200 shrink-0">
              {song.key}{transpose !== 0 ? ` → ${transposedKey}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable content — same padding as designer ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Unified song card — identical structure to the designer's song document */}
        {(hasBlocks || song.sections?.length > 0) && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Song title banner inside card */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline gap-3">
              <p className="font-bold text-slate-800 text-base">{song.title}</p>
              {song.artist && <span className="text-xs text-slate-500">{song.artist}</span>}
              {(transposedKey || song.key) && (
                <span className="ml-auto text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  Key of {transposedKey || song.key}
                </span>
              )}
            </div>

            {hasBlocks
              ? song.blocks.map((block, bi) => (
                  <div key={bi}>
                    {/* Section header — same violet style as SegmentSection */}
                    <div className={`flex items-center px-4 py-2.5 bg-violet-50 ${bi > 0 ? 'border-t border-slate-200' : ''}`}>
                      <p className="text-xs font-black uppercase tracking-widest text-violet-700">{block.sectionName}</p>
                    </div>
                    {/* Lyrics + chords */}
                    <div className="px-4 pt-3 pb-4 overflow-x-auto">
                      {(block.lines || []).length > 0
                        ? (block.lines || []).map((line, li) => (
                            <SongLine key={li} line={line} transpose={transpose} useFlatKey={useFlatKey} />
                          ))
                        : <p className="text-xs text-slate-400 italic">No lyrics</p>
                      }
                    </div>
                  </div>
                ))
              : (song.sections || []).map((sec, si) => (
                  <div key={si}>
                    <div className={`flex items-center px-4 py-2.5 bg-violet-50 ${si > 0 ? 'border-t border-slate-200' : ''}`}>
                      <p className="text-xs font-black uppercase tracking-widest text-violet-700">{sec.type}</p>
                    </div>
                    <div className="px-4 pt-3 pb-4">
                      {sec.lyrics
                        ? <pre className="font-mono text-sm text-slate-700 whitespace-pre-wrap leading-6 m-0">{sec.lyrics}</pre>
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

        {/* Instrument legend */}
        {usedInstruments.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">Instrument legend</p>
            <div className="flex flex-wrap gap-3">
              {usedInstruments.map(inst => (
                <span key={inst.key} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
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
