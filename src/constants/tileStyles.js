// Rotating palette shared by every "icon tile" surface in the app — the mobile
// department dock's grid (DepartmentFolderModal) and the desktop top nav's
// department tiles (DesktopDepartmentNav) — so both read as one visual system.
// Items aren't separate "apps" with their own brand color, so each tile's color
// comes from its position in the list rather than a fixed per-item mapping.
// Bright, saturated gradients (not muted/pastel) so tiles pop, each paired with
// a matching-hue drop shadow.
export const TILE_STYLES = [
  { gradient: 'from-blue-500 to-indigo-600', shadow: 'shadow-indigo-500/30' },
  { gradient: 'from-emerald-400 to-teal-500', shadow: 'shadow-emerald-500/30' },
  { gradient: 'from-amber-400 to-orange-500', shadow: 'shadow-amber-500/30' },
  { gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/30' },
  { gradient: 'from-cyan-400 to-sky-600', shadow: 'shadow-cyan-500/30' },
  { gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/30' },
  { gradient: 'from-red-500 to-rose-600', shadow: 'shadow-red-500/30' },
  { gradient: 'from-teal-400 to-emerald-600', shadow: 'shadow-teal-500/30' },
  { gradient: 'from-orange-400 to-amber-600', shadow: 'shadow-orange-500/30' },
]

// Fixed per-department accent for a department's own header icon (e.g. the section
// dividers in DepartmentFolderModal), so each category is recognizable at a glance
// instead of every department sharing one brand purple. Keyed by department name;
// anything unmapped falls back to DEFAULT_DEPARTMENT_ACCENT.
export const DEPARTMENT_ACCENTS = {
  workspace: { gradient: 'from-slate-600 to-slate-800', shadow: 'shadow-slate-500/30' },
  Worship: { gradient: 'from-blue-500 to-blue-700', shadow: 'shadow-blue-500/30' },
  Cell: { gradient: 'from-lime-500 to-green-600', shadow: 'shadow-lime-500/30' },
  Caring: { gradient: 'from-pink-400 to-rose-500', shadow: 'shadow-pink-500/30' },
  'Sunday Ministry': { gradient: 'from-yellow-400 to-amber-500', shadow: 'shadow-yellow-500/30' },
  'D Light': { gradient: 'from-fuchsia-500 to-pink-600', shadow: 'shadow-fuchsia-500/30' },
  'River Kids': { gradient: 'from-orange-400 to-orange-600', shadow: 'shadow-orange-500/30' },
  Outreach: { gradient: 'from-sky-400 to-cyan-600', shadow: 'shadow-sky-500/30' },
  'Building Care': { gradient: 'from-stone-500 to-stone-700', shadow: 'shadow-stone-500/30' },
  'Event M': { gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/30' },
  Mission: { gradient: 'from-cyan-500 to-blue-600', shadow: 'shadow-cyan-500/30' },
  Media: { gradient: 'from-red-500 to-red-700', shadow: 'shadow-red-500/30' },
  Accounts: { gradient: 'from-emerald-500 to-green-700', shadow: 'shadow-emerald-500/30' },
  'Human Resourses': { gradient: 'from-teal-400 to-teal-600', shadow: 'shadow-teal-500/30' },
  'Gen Affairs': { gradient: 'from-zinc-500 to-zinc-700', shadow: 'shadow-zinc-500/30' },
  Thunderstorm: { gradient: 'from-yellow-500 to-orange-500', shadow: 'shadow-yellow-500/30' },
  'SP Office': { gradient: 'from-indigo-400 to-blue-600', shadow: 'shadow-indigo-500/30' },
  'Sec-Core': { gradient: 'from-gray-600 to-gray-800', shadow: 'shadow-gray-500/30' },
  Administration: { gradient: 'from-indigo-500 to-indigo-700', shadow: 'shadow-indigo-500/30' },
  RFF: { gradient: 'from-purple-500 to-purple-700', shadow: 'shadow-purple-500/30' },
  'First Lady': { gradient: 'from-rose-400 to-pink-600', shadow: 'shadow-rose-500/30' },
  'weekly-entry': { gradient: 'from-emerald-500 to-green-700', shadow: 'shadow-emerald-500/30' },
}

export const DEFAULT_DEPARTMENT_ACCENT = { gradient: 'from-violet-500 to-indigo-600', shadow: 'shadow-violet-500/30' }
