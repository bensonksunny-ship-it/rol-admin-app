import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Download, Eye, Music2 } from 'lucide-react'
import { subscribeWorshipScheduleByDate, getWorshipSongs } from '../../services/firestore'
import { sortByWorshipRole } from '../../utils/worshipRoleOrder'
import SongViewer from '../../pages/worship/SongViewer'

// Same layout SongDesigner uses to round-trip a chord line: each chord sits at its
// character offset (`pos`) above the lyric it lands on.
function chordLine(chords, lyrics) {
  const len = Math.max(lyrics.length + 1, ...chords.map((c) => (c.pos || 0) + String(c.chord || '').length + 1))
  const arr = Array(len).fill(' ')
  for (const { chord = '', pos = 0 } of chords) {
    for (let j = 0; j < chord.length && pos + j < arr.length; j++) arr[pos + j] = chord[j]
  }
  return arr.join('').trimEnd()
}

// A designed song's sections in playback order: [{ name, lines: [{ lyrics, chords }] }].
// Falls back to the plain `sections` lyrics for older songs saved without `blocks`.
function songSections(lib) {
  if (lib?.blocks?.length) {
    return lib.blocks.map((b) => ({
      name: b.sectionName || 'Section',
      lines: (b.lines || []).map((l) => ({ lyrics: l.lyrics || '', chords: l.chords || [] })),
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
 * Text for projection software (ProPresenter, EasyWorship, OpenLP, PowerPoint…):
 * title, then each section as "[Verse 1]" + its lyric lines, a blank line between
 * sections (most importers split slides on blank lines). `withChords` puts each
 * chord line above its lyric for the band / stage display.
 */
function songText(title, sections, withChords) {
  const out = [title.toUpperCase(), '']
  for (const s of sections) {
    const lines = []
    for (const l of s.lines) {
      if (withChords && l.chords.length) lines.push(chordLine(l.chords, l.lyrics))
      if (l.lyrics.trim() || (withChords && l.chords.length)) lines.push(l.lyrics.trimEnd())
    }
    if (!lines.length) continue
    out.push(`[${s.name}]`, ...lines, '')
  }
  return out.join('\n').trimEnd() + '\n'
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older Android WebViews / non-secure origins: fall back to a hidden textarea.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/**
 * Media → Upcoming Sunday: the songs Worship has scheduled for that Sunday (live
 * from worship_schedule), each with its designed structure from the Song Builder
 * and one-tap copy for presentation slides.
 */
export default function MediaWorshipSongs({ sundayDate }) {
  const [schedule, setSchedule] = useState(null) // null = loading
  const [lib, setLib] = useState([])
  const [open, setOpen] = useState(null) // song key whose lyrics are expanded
  const [copied, setCopied] = useState('') // `${key}:${mode}` just copied
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    getWorshipSongs().then(setLib).catch(() => setLib([]))
  }, [])

  useEffect(() => subscribeWorshipScheduleByDate('Worship', sundayDate, setSchedule,
    (e) => { console.error('MediaWorshipSongs', e); setSchedule({ assignments: [] }) }), [sundayDate])

  const songs = useMemo(() => {
    const out = []
    for (const a of sortByWorshipRole(schedule?.assignments || [])) {
      if (!a.songId && !a.songName) continue
      const k = a.songId || `name:${a.songName}`
      if (out.some((s) => s.k === k)) continue
      const doc = lib.find((s) => (a.songId && s.id === a.songId) || (!a.songId && s.title && s.title.trim() === String(a.songName || '').trim())) || null
      out.push({
        k,
        title: a.songName || doc?.title || '(untitled)',
        key: a.key || doc?.key || '',
        singer: a.memberName || '',
        doc,
        sections: songSections(doc),
      })
    }
    return out
  }, [schedule, lib])

  async function doCopy(id, text) {
    if (await copyText(text)) {
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? '' : c)), 2000)
    }
  }

  const allText = (withChords) => songs.map((s) => songText(s.title, s.sections, withChords)).join('\n\n')

  function downloadAll() {
    const blob = new Blob([allText(false)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `worship-songs-${sundayDate}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyBtn = ({ id, text, label, primary }) => (
    <button type="button" onClick={() => doCopy(id, text)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        copied === id ? 'bg-emerald-600 text-white'
          : primary ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
      {copied === id ? <Check size={13} /> : <Copy size={13} />}
      {copied === id ? 'Copied' : label}
    </button>
  )

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <Music2 size={18} className="text-indigo-600" />
        <h3 className="font-bold text-slate-900">Worship songs</h3>
        {schedule && <span className="text-xs font-semibold text-slate-400">{songs.length}</span>}
        {songs.some((s) => s.sections.length) && (
          <div className="ml-auto flex flex-wrap gap-2">
            {copyBtn({ id: 'all:lyrics', text: allText(false), label: 'Copy all lyrics' })}
            <button type="button" onClick={downloadAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
              <Download size={13} /> .txt
            </button>
          </div>
        )}
      </div>

      {schedule === null ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading songs…</p>
      ) : songs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">The worship team hasn’t scheduled songs for this Sunday yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {songs.map((s, i) => {
            const isOpen = open === s.k
            const hasBody = s.sections.length > 0
            return (
              <li key={s.k} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">
                      {s.title}
                      {s.key && <span className="ml-2 text-xs font-bold text-indigo-600">Key {s.key}</span>}
                    </p>
                    <p className="text-xs text-slate-500">{s.singer ? `Lead: ${s.singer}` : 'Lead vocal not assigned yet'}</p>
                    {hasBody && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.sections.map((sec, n) => (
                          <span key={n} className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{sec.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {hasBody ? (
                  <div className="mt-2.5 flex flex-wrap gap-2 pl-10">
                    {copyBtn({ id: `${s.k}:lyrics`, text: songText(s.title, s.sections, false), label: 'Copy for Presentation', primary: true })}
                    {copyBtn({ id: `${s.k}:chords`, text: songText(s.title, s.sections, true), label: 'Copy with chords' })}
                    <button type="button" onClick={() => setOpen(isOpen ? null : s.k)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
                      <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /> Lyrics
                    </button>
                    {s.doc && (
                      <button type="button" onClick={() => setViewing(s.doc)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
                        <Eye size={13} /> Full chart
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 pl-10 text-xs text-amber-700">
                    {s.doc ? 'No lyrics designed for this song yet.' : 'Not in the Songs Directory — no lyrics to copy.'}
                  </p>
                )}

                {isOpen && hasBody && (
                  <div className="mt-3 ml-10 rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-3 max-h-96 overflow-y-auto">
                    {s.sections.map((sec, n) => (
                      <div key={n}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">{sec.name}</p>
                        <div className="mt-1 font-mono text-[13px] leading-snug whitespace-pre-wrap">
                          {sec.lines.map((l, j) => (
                            <div key={j}>
                              {l.chords.length > 0 && <div className="text-indigo-600 font-bold whitespace-pre">{chordLine(l.chords, l.lyrics)}</div>}
                              <div className="text-slate-800">{l.lyrics || ' '}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {viewing && (
        <SongViewer song={viewing} canManage={false} initialViewMode="full"
          onClose={() => setViewing(null)} onEdit={() => {}} />
      )}
    </div>
  )
}
