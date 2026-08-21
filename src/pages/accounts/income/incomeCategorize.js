import { format } from 'date-fns'

export const NAMED_CATEGORIES = [
  'Online Offering',
  'English Offering',
  'Tamil Offering',
  'Tithe - English',
  'Tithe - Tamil',
  'Contribution',
  'Support from ROLCC',
]

export function isOtherIncome(entry) {
  return !NAMED_CATEGORIES.includes(entry.category)
}

export function categorizeEntries(entries) {
  const byCategory = (cat) => entries.filter(e => e.category === cat)
  return {
    englishOffering: byCategory('English Offering'),
    tamilOffering: byCategory('Tamil Offering'),
    onlineOffering: byCategory('Online Offering'),
    titheEnglish: byCategory('Tithe - English'),
    titheTamil: byCategory('Tithe - Tamil'),
    contribution: byCategory('Contribution'),
    supportFromROLCC: byCategory('Support from ROLCC'),
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
