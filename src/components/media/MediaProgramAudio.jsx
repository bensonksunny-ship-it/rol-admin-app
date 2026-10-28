import { useRef, useState } from 'react'
import { Loader2, Music, Trash2, Upload } from 'lucide-react'
import { MEDIA_AUDIO_MAX_BYTES } from '../../services/firestore'

const fmtSize = (b) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/**
 * Media → Upcoming Sunday → element design popup: audio attached to this programme
 * element (backing track, sound effect…). The media desk plays it from the
 * Control Center when the item is selected or started. Uploads and removals are
 * saved straight away (onUpload / onRemove persist).
 */
export default function MediaProgramAudio({ tracks = [], canEdit, onUpload, onRemove }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState('')
  const [removing, setRemoving] = useState('')
  const [error, setError] = useState('')

  async function pick(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    setError('')
    for (const file of files) {
      if (!file.type.startsWith('audio/')) { setError(`${file.name} isn't an audio file.`); continue }
      if (file.size > MEDIA_AUDIO_MAX_BYTES) { setError(`${file.name} is over 50 MB.`); continue }
      setUploading(file.name)
      try { await onUpload(file) } catch (err) { console.error('uploadMediaAudio', err); setError(`Could not upload ${file.name}.`) }
    }
    setUploading('')
  }

  async function remove(t) {
    setRemoving(t.id); setError('')
    try { await onRemove(t) } catch (err) { console.error('deleteMediaAudio', err); setError('Could not remove the track.') }
    setRemoving('')
  }

  return (
    <div className="pb-3 border-b border-slate-100">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Audio</p>
        {canEdit && (
          <>
            <button type="button" disabled={!!uploading} onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Attach audio'}
            </button>
            <input ref={inputRef} type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" multiple className="hidden" onChange={pick} />
          </>
        )}
      </div>
      {tracks.length === 0 ? (
        <p className="text-xs text-slate-400">
          {canEdit ? 'No audio yet. Attach a backing track or sound effect (MP3, M4A, WAV, up to 50 MB) and the media desk can play it from the Control Center.' : 'No audio attached.'}
        </p>
      ) : (
        <div className="space-y-2">
          {tracks.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <Music className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="text-xs font-semibold text-slate-800 truncate flex-1">{t.name}</span>
                {t.size > 0 && <span className="text-[10px] text-slate-400 shrink-0">{fmtSize(t.size)}</span>}
                {canEdit && (
                  <button type="button" disabled={removing === t.id} onClick={() => remove(t)} aria-label={`Remove ${t.name}`}
                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {removing === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              <audio controls preload="none" src={t.url} className="w-full h-8" />
            </div>
          ))}
        </div>
      )}
      {uploading && <p className="text-[11px] text-slate-500 mt-1.5 truncate">Uploading {uploading}…</p>}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
