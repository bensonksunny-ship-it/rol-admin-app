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
