import { useEffect, useState } from 'react'
import { ChevronDown, MapPin, Car, Pencil, ImagePlus, X, Loader2, Star, Check, UserRound } from 'lucide-react'
import { kindOf, statusOf, formatTime } from '../../utils/missionTrip'

/**
 * Shared Mission Trip schedule pieces — used by the SP Office planner
 * (pages/spoffice/MissionTrips.jsx) and the public team page (pages/MissionTripPlan.jsx).
 *  - DayAccordion: collapsible day header card (date, item-count badge, chevron)
 *  - ScheduleBlock: Bento-style event card (time badge, title, status pill, tags, photos)
 */

// Soft tint per item kind (static class strings so Tailwind picks them up).
const KIND_TINT = {
  meeting: { card: 'bg-indigo-50/70 border-indigo-100',  time: 'bg-indigo-600 text-white' },
  meal:    { card: 'bg-amber-50/70 border-amber-100',    time: 'bg-amber-500 text-white' },
  travel:  { card: 'bg-sky-50/70 border-sky-100',        time: 'bg-sky-600 text-white' },
  visit:   { card: 'bg-emerald-50/70 border-emerald-100', time: 'bg-emerald-600 text-white' },
  rest:    { card: 'bg-rose-50/60 border-rose-100',      time: 'bg-rose-500 text-white' },
  other:   { card: 'bg-slate-50 border-slate-200',       time: 'bg-slate-600 text-white' },
}
const tintOf = (kind) => KIND_TINT[kind] || KIND_TINT.other
const COMPLETED_TINT = { card: 'bg-white border-emerald-200', time: 'bg-emerald-600 text-white' }

function Tag({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/80 border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 max-w-full">
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * Photo strip inside a block: thumbnails (tap = open full size), × to remove and an
 * "Add photo" picker while under `limit`. Read-only when no handlers are given.
 */
function PhotoStrip({ photos, limit, onAdd, onRemove, busy, addLabel = 'Add photo' }) {
  const canAdd = onAdd && photos.length < limit
  if (!photos.length && !canAdd) return null
  return (
    <>
    {photos.length > 0 && (
    <div className="flex flex-wrap items-center gap-2 mt-2.5">
      {photos.map((ph) => (
        <div key={ph.id} className="relative">
          <a href={ph.url} target="_blank" rel="noreferrer" className="block">
            <img src={ph.url} alt="" loading="lazy" className="h-20 w-24 sm:h-24 sm:w-32 rounded-lg object-cover border border-white shadow-sm bg-slate-100" />
          </a>
          {onRemove && (
            <button type="button" disabled={busy} onClick={() => onRemove(ph)} aria-label="Remove photo"
              className="absolute -top-1.5 -right-1.5 grid place-items-center h-6 w-6 rounded-full bg-slate-900/80 text-white shadow hover:bg-red-600 disabled:opacity-50">
              <X size={13} />
            </button>
          )}
          {ph.by && <p className="mt-0.5 max-w-24 sm:max-w-32 truncate text-[10px] text-slate-500">{ph.by}</p>}
        </div>
      ))}
    </div>
    )}
    {/* One slim text line — tapping it opens the phone's photo picker directly. */}
    {canAdd && (
      <label className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 ${busy ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:text-indigo-600'}`}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
        {busy ? 'Uploading…' : `${addLabel} (${photos.length}/${limit})`}
        <input type="file" accept="image/*" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onAdd(f) }} />
      </label>
    )}
    </>
  )
}

/**
 * Team members' photos on a card. Guest page: their own photos + "Add your photo";
 * planner: everyone's photos with the name under each (office can remove any).
 * `photos` items may carry `by` (name). Hidden when empty and nothing can be added.
 */
export function GuestPhotos({ photos, limit = 2, onAdd, onRemove, busy = false, title = 'Team photos' }) {
  if (!photos.length && !onAdd) return null
  return (
    <div className="mt-2">
      {photos.length > 0 && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>}
      <PhotoStrip photos={photos} limit={limit} onAdd={onAdd} onRemove={onRemove} busy={busy} addLabel="Add your photo" />
    </div>
  )
}

/**
 * One event block. `onClick` makes the top part a button (planner edit); `extra` renders
 * under the tags (e.g. "3 answered"); `showDetails` shows driver phone + notes (public page).
 * Photos: `onAddPhoto(file)` / `onRemovePhoto(photo)` enable editing; `photoBusy` = uploading.
 */
export function ScheduleBlock({ item, onClick, extra, footer, showDetails = false, photoLimit = 2, onAddPhoto, onRemovePhoto, photoBusy = false }) {
  const k = kindOf(item.kind)
  const s = statusOf(item.status)
  // Completed items lock into a view-only summary: no edit, no photo add/remove.
  const c = item.completion?.outcome ? item.completion : null
  if (c) { onClick = undefined; onAddPhoto = undefined; onRemovePhoto = undefined }
  const t = c ? COMPLETED_TINT : tintOf(item.kind)
  const isTravel = item.kind === 'travel'
  const transport = isTravel ? [item.vehicle, item.driver && `Driver: ${item.driver}`, showDetails && item.driverPhone].filter(Boolean).join(' · ') : ''

  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-lg px-2 py-1.5 text-center min-w-[4.25rem] shadow-sm ${item.time ? t.time : 'bg-slate-200 text-slate-500'}`}>
          <p className="text-xs font-bold leading-tight whitespace-nowrap">{item.time ? formatTime(item.time) : 'Time TBD'}</p>
          {item.endTime && <p className="text-[10px] leading-tight opacity-80 whitespace-nowrap">to {formatTime(item.endTime)}</p>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-bold text-slate-800 leading-snug break-words">
              <span className="mr-1">{k.emoji}</span>{item.title || k.label}
            </p>
            {onClick && <Pencil size={13} className="text-slate-300 mt-0.5 shrink-0" />}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {c
              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white"><Check size={11} strokeWidth={3} /> Completed</span>
              : <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>}
            {item.incharge && <Tag icon={<UserRound size={11} />}>In charge: {item.incharge}</Tag>}
            {item.location && <Tag icon={<MapPin size={11} />}>{item.location}</Tag>}
            {transport && <Tag icon={<Car size={11} />}>{transport}</Tag>}
          </div>
          {extra}
        </div>
      </div>
      {(showDetails || c) && item.notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-line">{item.notes}</p>}
    </>
  )

  return (
    <div className={`rounded-xl border p-3 shadow-sm transition hover:shadow-md ${t.card}`}>
      {onClick
        ? <button type="button" onClick={onClick} className="block w-full text-left">{body}</button>
        : body}
      <PhotoStrip photos={item.photos || []} limit={photoLimit} onAdd={onAddPhoto} onRemove={onRemovePhoto} busy={photoBusy} />
      {!c && footer}
    </div>
  )
}

/**
 * Shown on a card once its time has passed: "Done as planned" in one tap, or
 * "Something changed" with a short note. `onSubmit({ outcome, note })`.
 */
export function CompletionPrompt({ onSubmit }) {
  const [mode, setMode] = useState('') // '' | changed
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function submit(outcome) {
    if (outcome === 'changed' && !note.trim()) { setErr('Please write what changed.'); return }
    setBusy(true); setErr('')
    try { await onSubmit({ outcome, note: outcome === 'changed' ? note.trim() : '' }) }
    catch { setErr('Could not save — try again.'); setBusy(false) }
  }
  return (
    <div className="mt-2.5 rounded-lg border border-indigo-200 bg-white/90 px-3 py-2.5 space-y-2">
      <p className="text-xs font-bold text-indigo-900">⏰ Was this done as planned, or did anything change?</p>
      {mode !== 'changed' ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => submit('as_planned')}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Done as planned
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('changed')}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
            Something changed
          </button>
        </div>
      ) : (
        <>
          <textarea rows={2} value={note} maxLength={500} autoFocus onChange={(e) => { setNote(e.target.value); setErr('') }}
            placeholder="What changed? e.g. lunch moved to 2 PM, different venue…"
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => submit('changed')}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
              {busy && <Loader2 size={13} className="animate-spin" />} Save &amp; complete
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode(''); setErr('') }} className="text-xs font-semibold text-slate-500 underline">Back</button>
          </div>
        </>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}

/**
 * Collapsible day card. Controlled (`open` + `onToggle`). `action` sits beside the
 * chevron (e.g. the planner's "+ Add"). Expands with a grid-rows transition.
 */
export function DayAccordion({ label, count, open, onToggle, action, isToday = false, muted = false, children }) {
  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${muted ? 'border-dashed border-slate-300' : isToday ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 pr-2">
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-2 px-3 py-3 text-left hover:bg-slate-50/70">
          <span className={`text-sm font-bold uppercase tracking-wide truncate ${muted ? 'text-slate-500' : 'text-slate-800'}`}>{label}</span>
          {isToday && <span className="shrink-0 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Today</span>}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${count ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
            {count} {count === 1 ? 'event' : 'events'}
          </span>
          <ChevronDown size={18} className={`ml-auto shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {action}
      </div>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-3 space-y-2 border-t border-slate-100">{children}</div>
        </div>
      </div>
    </div>
  )
}

// ── Food rating ──────────────────────────────────────────────────────────────
const STAR_WORDS = ['', 'Poor', 'Okay', 'Good', 'Very good', 'Excellent']

function Stars({ value, size = 14 }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      ))}
    </span>
  )
}

/** Planner: average rating badge + the team's dish notes. `summary` from ratingSummary(). */
export function RatingBadge({ summary }) {
  if (!summary?.count) return <p className="mt-2 text-[11px] font-medium text-slate-400">🍽️ No food ratings yet</p>
  return (
    <div className="mt-2 rounded-lg bg-white/80 border border-amber-100 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">★ {summary.avg.toFixed(1)} / 5</span>
        <Stars value={summary.avg} size={12} />
        <span className="text-[11px] text-slate-500">{summary.count} {summary.count === 1 ? 'rating' : 'ratings'}</span>
      </div>
      {summary.entries.some((e) => e.comment) && (
        <ul className="mt-1.5 space-y-0.5">
          {summary.entries.filter((e) => e.comment).map((e) => (
            <li key={e.name + e.comment} className="text-[11px] text-slate-600">“{e.comment}” <span className="text-slate-400">— {e.name}, {e.stars}★</span></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Guest page: rate a meal 1–5 stars with an optional dish note. `value` = saved rating,
 * `onSave({ stars, comment })` persists it. Without `canRate`, asks them to add their name first.
 */
export function FoodRating({ value, onSave, canRate, onNeedDetails }) {
  const [stars, setStars] = useState(value?.stars || 0)
  const [comment, setComment] = useState(value?.comment || '')
  const [state, setState] = useState('') // '' | saving | saved | error
  const dirty = stars !== (value?.stars || 0) || comment.trim() !== (value?.comment || '')

  if (!canRate) {
    return (
      <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
        🍽️ Rate this meal — <button type="button" onClick={onNeedDetails} className="font-semibold underline">add your name below</button> first.
      </div>
    )
  }
  async function save() {
    setState('saving')
    try { await onSave({ stars, comment }); setState('saved') } catch { setState('error') }
  }
  return (
    <div className="mt-2.5 rounded-lg border border-amber-200 bg-white/80 px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-bold text-amber-900">🍽️ How was the food?</span>
        <span className="inline-flex" role="radiogroup" aria-label="Food rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => { setStars(n); setState('') }} className="p-0.5 active:scale-90 transition">
              <Star size={24} className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
            </button>
          ))}
        </span>
        {stars > 0 && <span className="text-xs font-semibold text-amber-700">{STAR_WORDS[stars]}</span>}
      </div>
      {stars > 0 && (
        <>
          <input value={comment} maxLength={300} onChange={(e) => { setComment(e.target.value); setState('') }}
            placeholder="Favourite dish or a short note (optional)"
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-300" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={!dirty || state === 'saving'}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
              {state === 'saving' ? 'Saving…' : value?.stars ? 'Update rating' : 'Save rating'}
            </button>
            {state === 'saved' && !dirty && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check size={13} /> Thank you!</span>}
            {state === 'error' && <span className="text-xs text-red-600">Could not save — check your internet and try again.</span>}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Tour completion bar. `progress` comes from tourProgress(). `onDark` renders it
 * inside the indigo trip banner (guest page); otherwise as a white card.
 */
export function TourProgress({ progress, onDark = false }) {
  const { pct, done, total, dayIndex, dayCount, phase } = progress
  // Start empty and grow to pct so the fill animates in on open.
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = setTimeout(() => setShown(pct), 60); return () => clearTimeout(t) }, [pct])
  const dayText = phase === 'running' ? `Day ${dayIndex} of ${dayCount}`
    : phase === 'upcoming' ? 'Not started yet'
    : phase === 'finished' ? 'Tour ended' : ''
  const sub = [total ? `${done} of ${total} events done` : '', dayText].filter(Boolean).join(' · ')
  const wrap = onDark ? 'mt-4 rounded-xl bg-white/15 p-3' : 'rounded-xl border border-slate-200 bg-white p-3 shadow-sm'
  const track = onDark ? 'bg-white/25' : 'bg-slate-100'
  const fill = pct >= 100 ? 'bg-emerald-400' : onDark ? 'bg-white' : 'bg-gradient-to-r from-indigo-500 to-emerald-500'
  return (
    <div className={wrap}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-sm font-bold ${onDark ? 'text-white' : 'text-slate-800'}`}>
          {pct}% <span className={`font-medium ${onDark ? 'text-indigo-100' : 'text-slate-500'}`}>of tour completed</span>
        </p>
        {sub && <p className={`text-[11px] text-right ${onDark ? 'text-indigo-100' : 'text-slate-500'}`}>{sub}</p>}
      </div>
      <div className={`mt-2 h-2.5 w-full overflow-hidden rounded-full ${track}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${fill}`} style={{ width: `${shown}%` }} />
      </div>
    </div>
  )
}
