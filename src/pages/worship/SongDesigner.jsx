import { useState, useCallback } from 'react'
import { addWorshipSong } from '../../services/firestore'

// ── Instruments ───────────────────────────────────────────────────────────────
const INSTRUMENTS = [
  { key: 'vocals',        label: 'Vocals',        color: '#10b981' },
  { key: 'keys',          label: 'Keys',          color: '#3b82f6' },
  { key: 'leadGuitar',    label: 'Lead Guitar',   color: '#f97316' },
  { key: 'rhythmGuitar',  label: 'Rhythm Guitar', color: '#f59e0b' },
  { key: 'bass',          label: 'Bass',          color: '#8b5cf6' },
  { key: 'drums',         label: 'Drums',         color: '#ef4444' },
  { key: 'acoustic',      label: 'Acoustic',      color: '#14b8a6' },
  { key: 'choir',         label: 'Choir',         color: '#ec4899' },
]

const MAX_INT = 6
const INT_LABEL = ['', 'pp', 'p', 'mp', 'mf', 'f', 'ff']
const defaultDynamics = () => Object.fromEntries(INSTRUMENTS.map(i => [i.key, 0]))

// ── Chord parser ──────────────────────────────────────────────────────────────
const CHORD_RE = /^[A-G][b#]?(m(?:aj)?[0-9]*|min|dim[0-9]*|aug|sus[24]?|add[0-9]+|[0-9]+)?(\/[A-G][b#]?)?$/

function isChordToken(t) {
  return CHORD_RE.test(t.replace(/[()]/g, ''))
}

function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return false
  const chordCount = tokens.filter(t => isChordToken(t)).length
  return chordCount >= 1 && chordCount / tokens.length >= 0.65
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
    const t = m[1]
    if (isChordToken(t)) chords.push({ chord: t, pos: lyrics.length })
    last = re.lastIndex
  }
  lyrics += line.slice(last)
  return { chords, lyrics }
}

function buildChordLine(chords, lyrics) {
  const len = Math.max(
    lyrics.length + 1,
    ...chords.map(c => c.pos + c.chord.length + 1)
  )
  const arr = Array(len).fill(' ')
  for (const { chord, pos } of chords) {
    for (let j = 0; j < chord.length && pos + j < arr.length; j++) {
      arr[pos + j] = chord[j]
    }
  }
  return arr.join('')
}

function parseSong(text) {
  const rawLines = text.split('\n')
  const blocks = []
  let current = null
  let i = 0

  while (i < rawLines.length) {
    const line = rawLines[i]
    const t = line.trim()

    if (!t) { i++; continue }

    if (isSectionHeader(t)) {
      current = {
        sectionName: t.replace(/[\[\]:]/g, '').trim(),
        lines: [],
        dynamics: defaultDynamics(),
      }
      blocks.push(current)
      i++; continue
    }

    if (!current) {
      current = { sectionName: null, lines: [], dynamics: defaultDynamics() }
      blocks.push(current)
    }

    // Chord line paired with next lyric line
    const next = rawLines[i + 1]?.trim()
    if (isChordLine(t) && next && !isChordLine(next) && !isSectionHeader(next)) {
      current.lines.push({ chords: parseChordPositions(t), lyrics: next, chordLine: t })
      i += 2; continue
    }

    // Inline [G]chord format
    if (/\[[A-G][^\]]{0,6}\]/.test(t)) {
      const { chords, lyrics } = parseInline(t)
      current.lines.push({ chords, lyrics })
      i++; continue
    }

    // Plain lyric line (may still be a standalone chord line with no lyric after it)
    if (isChordLine(t)) {
      current.lines.push({ chords: parseChordPositions(t), lyrics: '', chordLine: t })
    } else {
      current.lines.push({ chords: [], lyrics: t })
    }
    i++
  }

  return blocks.filter(b => b.lines.length > 0)
}

// Preserve existing dynamics when re-parsing
function mergeBlocks(fresh, old) {
  return fresh.map((b, idx) => {
    const match = old.find(o => o.sectionName && o.sectionName === b.sectionName) ?? old[idx]
    return match ? { ...b, dynamics: match.dynamics } : b
  })
}

// ── Instrument chip ───────────────────────────────────────────────────────────
function InstrumentChip({ inst, level, onChange }) {
  const hex = n => Math.round(n * 255).toString(16).padStart(2, '0')
  const opacity = level === 0 ? 0 : 0.18 + (level / MAX_INT) * 0.82
  const bg = level === 0 ? '#f1f5f9' : `${inst.color}${hex(opacity)}`
  const textColor = level === 0 ? '#94a3b8' : opacity > 0.5 ? '#fff' : inst.color
  const border = level === 0 ? '#e2e8f0' : inst.color

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <button
        type="button"
        onClick={() => onChange(inst.key, level >= MAX_INT ? 0 : level + 1)}
        className="px-2.5 py-1 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
        style={{ backgroundColor: bg, color: textColor, border: `1.5px solid ${border}` }}
      >
        {inst.label}
        {level > 0 && <span className="ml-1 text-[10px] opacity-80">{INT_LABEL[level]}</span>}
      </button>
      {/* Intensity bar */}
      <div className="flex gap-0.5">
        {Array.from({ length: MAX_INT }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(inst.key, i + 1 === level ? 0 : i + 1)}
            className="w-3 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: i < level ? inst.color : '#e2e8f0' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Chord chart line ──────────────────────────────────────────────────────────
function ChordChartLine({ line }) {
  const { chords, lyrics, chordLine } = line
  if (!chords.length) {
    return <p className="font-mono text-sm text-slate-700 leading-6 whitespace-pre">{lyrics || ' '}</p>
  }
  const display = chordLine ?? buildChordLine(chords, lyrics)
  return (
    <div className="mb-2">
      <pre className="font-mono text-xs font-bold text-violet-600 whitespace-pre leading-5 m-0">{display}</pre>
      <pre className="font-mono text-sm text-slate-700 whitespace-pre leading-6 m-0">{lyrics || ' '}</pre>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SongDesigner({ canManageWorship, userProfile, onSaved }) {
  const [meta, setMeta] = useState({ title: '', artist: '', key: '', tempo: '', tags: '' })
  const [rawText, setRawText] = useState('')
  const [blocks, setBlocks] = useState([])
  const [parsed, setParsed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleParse = useCallback(() => {
    const fresh = parseSong(rawText)
    setBlocks(prev => mergeBlocks(fresh, prev))
    setParsed(true)
  }, [rawText])

  const updateDynamics = useCallback((bIdx, instKey, level) => {
    setBlocks(prev => prev.map((b, i) =>
      i === bIdx ? { ...b, dynamics: { ...b.dynamics, [instKey]: level } } : b
    ))
  }, [])

  const handleSave = async () => {
    if (!meta.title.trim()) return
    setSaving(true)
    try {
      await addWorshipSong({
        ...meta,
        rawText,
        blocks: blocks.map(b => ({
          sectionName: b.sectionName || '',
          lines: b.lines.map(({ chords, lyrics }) => ({ chords, lyrics })),
          dynamics: b.dynamics,
        })),
        sections: blocks.map(b => ({
          type: b.sectionName || 'Section',
          lyrics: b.lines.map(l => l.lyrics).join('\n'),
        })),
      }, userProfile?.name || 'unknown')
      setSaved(true)
      setMeta({ title: '', artist: '', key: '', tempo: '', tags: '' })
      setRawText('')
      setBlocks([])
      setParsed(false)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400">
        Paste lyrics below — chords above lines or inline <span className="font-mono bg-slate-100 px-1 rounded">[G]</span> format are auto-detected.
      </p>

      {/* Meta */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
            <input
              value={meta.title}
              onChange={e => setMeta(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Song title"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Artist</label>
            <input
              value={meta.artist}
              onChange={e => setMeta(p => ({ ...p, artist: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="e.g. Hillsong"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Key</label>
            <select
              value={meta.key}
              onChange={e => setMeta(p => ({ ...p, key: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            >
              <option value="">—</option>
              {['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Tempo</label>
            <select
              value={meta.tempo}
              onChange={e => setMeta(p => ({ ...p, tempo: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            >
              <option value="">—</option>
              {['Slow','Medium','Fast','Upbeat'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-600 block mb-1">Tags</label>
            <input
              value={meta.tags}
              onChange={e => setMeta(p => ({ ...p, tags: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="e.g. Praise"
            />
          </div>
        </div>
      </div>

      {/* Lyrics input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">Lyrics</label>
          <button
            type="button"
            onClick={handleParse}
            disabled={!rawText.trim()}
            className="px-4 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all active:scale-95"
          >
            Parse chords
          </button>
        </div>
        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setParsed(false) }}
          rows={10}
          placeholder={`Paste your lyrics here. Supported formats:\n\nAbove lines:\n  Am        G        F    C\n  Amazing grace how sweet the sound\n\nInline:\n  [Am]Amazing [G]grace how [F]sweet [C]the sound\n\nSection headers:\n  [Verse 1]\n  [Chorus]`}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 bg-slate-50 text-slate-800 placeholder-slate-400"
        />
        {!parsed && rawText.trim() && (
          <p className="text-xs text-amber-600">Hit "Parse chords" to render the chord chart below.</p>
        )}
      </div>

      {/* Parsed chord chart + dynamics */}
      {parsed && blocks.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chord Chart + Dynamics</p>
          {blocks.map((block, bIdx) => (
            <div key={bIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Section header */}
              {block.sectionName && (
                <div className="px-4 py-2 bg-violet-50 border-b border-violet-100">
                  <p className="text-xs font-black uppercase tracking-widest text-violet-600">
                    {block.sectionName}
                  </p>
                </div>
              )}

              {/* Chord chart */}
              <div className="px-4 pt-3 pb-2 overflow-x-auto">
                {block.lines.map((line, lIdx) => (
                  <ChordChartLine key={lIdx} line={line} />
                ))}
              </div>

              {/* Instrument dynamics */}
              <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 mb-3">
                  Dynamics — tap instrument to cycle, tap dots to set level
                </p>
                <div className="flex flex-wrap gap-3">
                  {INSTRUMENTS.map(inst => (
                    <InstrumentChip
                      key={inst.key}
                      inst={inst}
                      level={block.dynamics[inst.key] ?? 0}
                      onChange={(key, level) => updateDynamics(bIdx, key, level)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {parsed && blocks.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-4">No sections detected. Check your lyrics format.</p>
      )}

      {/* Save / Clear */}
      {canManageWorship && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setMeta({ title: '', artist: '', key: '', tempo: '', tags: '' })
              setRawText('')
              setBlocks([])
              setParsed(false)
            }}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={saving || !meta.title.trim()}
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved to Directory' : 'Save to Directory'}
          </button>
        </div>
      )}
    </div>
  )
}
