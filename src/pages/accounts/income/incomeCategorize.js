import { format } from 'date-fns'

export const NAMED_CATEGORIES = [
  'Online Offering',
  'English Offering',
  'Tamil Offering',
  'Tithe - English',
  'Tithe - Tamil',
  'Contribution',
  'Support from ROLCC',
  'RSM',
  'RSM Salary',
  'RFF',
]

// Category choices offered by the inline add/edit form for cards that span
// more than one underlying category.
export const OFFERING_CATEGORY_OPTIONS = ['Online Offering', 'English Offering', 'Tamil Offering']
export const RSM_CATEGORY_OPTIONS = ['RSM', 'RSM Salary', 'RFF']
export const OTHER_INCOME_CATEGORY_OPTIONS = ['Missions', 'Donations']

// Per-category color accent, shared by IncomeSummaryTable, OfferingMatrixTable,
// and CategoryListTable so a category reads as the same color everywhere it
// appears on the page. Full class strings (not interpolated) so Tailwind's
// scanner picks them up.
export const ACCENT_STYLES = {
  emerald: { header: 'bg-emerald-50/70', accentBorder: 'border-emerald-400', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  indigo: { header: 'bg-indigo-50/70', accentBorder: 'border-indigo-400', dot: 'bg-indigo-500', text: 'text-indigo-700' },
  violet: { header: 'bg-violet-50/70', accentBorder: 'border-violet-400', dot: 'bg-violet-500', text: 'text-violet-700' },
  amber: { header: 'bg-amber-50/70', accentBorder: 'border-amber-400', dot: 'bg-amber-500', text: 'text-amber-700' },
  teal: { header: 'bg-teal-50/70', accentBorder: 'border-teal-400', dot: 'bg-teal-500', text: 'text-teal-700' },
  rose: { header: 'bg-rose-50/70', accentBorder: 'border-rose-400', dot: 'bg-rose-500', text: 'text-rose-700' },
  cyan: { header: 'bg-cyan-50/70', accentBorder: 'border-cyan-400', dot: 'bg-cyan-500', text: 'text-cyan-700' },
}

// Maps each Income Summary row / category card to its accent color.
export const CATEGORY_ACCENTS = {
  englishOffering: 'emerald',
  tamilOffering: 'emerald',
  onlineOffering: 'emerald',
  titheEnglish: 'indigo',
  titheTamil: 'violet',
  contribution: 'amber',
  supportFromROLCC: 'teal',
  otherIncome: 'rose',
  rsm: 'cyan',
}

// Pre-refactor entries were saved with the plain 'Tithe' category (no language
// split). Those are folded into Tithe - English rather than Other Income.
const LEGACY_TITHE_CATEGORY = 'Tithe'

// Pre-refactor entries were saved with the category 'DON U'. Those are folded
// into Support from ROLCC rather than Other Income.
const LEGACY_DON_U_CATEGORY = 'DON U'

// Older entries were saved with inconsistent casing/whitespace (e.g. "English
// offering" instead of "English Offering"), so category matching is
// case/whitespace-insensitive rather than an exact string match.
function normalizeCategory(cat) {
  return String(cat || '').trim().toLowerCase()
}

export function matchesCategory(entry, cat) {
  return normalizeCategory(entry.category) === normalizeCategory(cat)
}

export function isOtherIncome(entry) {
  return isOtherIncomeCategory(entry.category)
}

export function isOtherIncomeCategory(category) {
  const norm = normalizeCategory(category)
  return !NAMED_CATEGORIES.some(cat => normalizeCategory(cat) === norm)
    && norm !== normalizeCategory(LEGACY_TITHE_CATEGORY)
    && norm !== normalizeCategory(LEGACY_DON_U_CATEGORY)
}

export function categorizeEntries(entries) {
  const byCategory = (cat) => entries.filter(e => matchesCategory(e, cat))
  return {
    englishOffering: byCategory('English Offering'),
    tamilOffering: byCategory('Tamil Offering'),
    onlineOffering: byCategory('Online Offering'),
    titheEnglish: [...byCategory('Tithe - English'), ...byCategory(LEGACY_TITHE_CATEGORY)],
    titheTamil: byCategory('Tithe - Tamil'),
    contribution: byCategory('Contribution'),
    supportFromROLCC: [...byCategory('Support from ROLCC'), ...byCategory(LEGACY_DON_U_CATEGORY)],
    rsm: [...byCategory('RSM'), ...byCategory('RSM Salary'), ...byCategory('RFF')],
    otherIncome: entries.filter(isOtherIncome),
  }
}

export function sumAmount(entries) {
  return entries.reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

export function toDate(d) {
  return d instanceof Date ? d : new Date(d)
}

export function fmtDate(d) {
  return format(toDate(d), 'dd/MM/yyyy')
}
