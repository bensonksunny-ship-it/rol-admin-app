import { format } from 'date-fns'

export const NAMED_CATEGORIES = [
  'Online Offering',
  'English Offering',
  'Tamil Offering',
  'Tithe - English',
  'Tithe - Tamil',
  'Contribution',
  'Support from ROLCC',
  'RSM Salary',
]

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
    rsmSalary: byCategory('RSM Salary'),
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
