/**
 * One size for every horizontal ribbon (My Workspace request ribbons, Upcoming
 * Worship, Membership Onboarding Pipeline, department notification ribbon):
 * full width, at least 56px tall, same padding and text size (rounding is left to the caller: the
 * pipeline, worship and department ribbons sit inside a rounded card).
 * Callers add only their colours.
 */
export const RIBBON_BAR = 'w-full min-h-[56px] px-4 py-2.5 flex items-center gap-3 text-sm'

/**
 * Ribbon colour by notification category:
 *  - blue  → action & roster items (duty assignments, rosters, meetings, practice, tasks)
 *  - amber → system alerts & submissions (new member added, expense to approve,
 *            new records) — dark text on amber for contrast.
 * Unknown / missing categories read as a general alert (amber).
 */
export const RIBBON_CATEGORY_TONE = {
  roster: 'blue',
  meeting: 'blue',
  task: 'blue',
  member_added: 'amber',
  expense_approval: 'amber',
  general_alert: 'amber',
}

// Every class is a literal so Tailwind keeps it.
//  bar: ribbon background + text (with hover) · head: same without hover, for popup headers · sub: secondary text · badge: the "N pending" pill
//  primary: solid button on the bar · secondary: quieter button on the bar · ring: focus ring
export const RIBBON_TONES = {
  blue: {
    bar: 'bg-blue-600 text-white hover:bg-blue-700',
    head: 'bg-blue-600 text-white',
    sub: 'text-blue-100',
    badge: 'bg-white/20 text-white',
    primary: 'bg-white text-blue-700 hover:bg-blue-50',
    secondary: 'bg-blue-800/60 text-white hover:bg-blue-800',
    ring: 'focus-visible:ring-white/80',
  },
  amber: {
    bar: 'bg-amber-500 text-slate-900 hover:bg-amber-400',
    head: 'bg-amber-500 text-slate-900',
    sub: 'text-slate-800',
    badge: 'bg-slate-900 text-amber-300',
    primary: 'bg-slate-900 text-amber-300 hover:bg-slate-800',
    secondary: 'bg-amber-600/25 text-slate-900 hover:bg-amber-600/40',
    ring: 'focus-visible:ring-slate-900/70',
  },
}

export function ribbonTone(category) {
  return RIBBON_TONES[RIBBON_CATEGORY_TONE[category] || 'amber']
}
