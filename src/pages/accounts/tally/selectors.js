// Pure reshapers: turn the raw finance_income / finance_expense entries already
// loaded by TallyPage into the row shapes each workbook sheet needs. No Firestore.

import { normalizeDepartmentName } from '../../../constants/roles'
import { categorizeEntries } from '../income/incomeCategorize'

// The church's Account Sheet lists spend under these 16 fixed departments, in this
// order. `match` bridges the app's own longer category names to the sheet's short
// labels. (Kept in sync with the same list on TallyPage.)
export const DEPT_ROWS = [
  { label: 'Worship', match: ['worship'] },
  { label: 'Cell', match: ['cell', 'cell ministry'] },
  { label: 'Caring', match: ['caring'] },
  { label: 'Sunday M', match: ['sunday ministry', 'sunday m', 'sunday'] },
  { label: 'D Light', match: ['d light', 'd-light', 'dlight'] },
  { label: 'Junior C', match: ['junior church', 'river kids', 'junior c'] },
  { label: 'Outreach', match: ['outreach'] },
  { label: 'Build C', match: ['building', 'building care', 'build c'] },
  { label: 'Event M', match: ['event m', 'event management', 'events', 'event-m'] },
  { label: 'Mission', match: ['mission', 'missions'] },
  { label: 'Media', match: ['media'] },
  { label: 'Accounts', match: ['accounts', 'account', 'finance'] },
  { label: 'Human Resources', match: ['human resources', 'hr'] },
  { label: 'Gen Affairs', match: ['general affairs', 'gen affairs'] },
  { label: 'Thunderstorm', match: ['thunderstorm'] },
  { label: 'SP Office', match: ['sp office', 'senior pastor office', "senior pastor's office"] },
]

export function num(v) {
  return Number(v) || 0
}

export function sumAmount(entries) {
  return entries.reduce((s, e) => s + num(e.amount), 0)
}

function toJsDate(d) {
  try {
    return d instanceof Date ? d : new Date(d)
  } catch {
    return null
  }
}

// ExcelJS serialises Date objects against UTC, so a local-midnight date in a
// timezone ahead of UTC (e.g. IST) lands on the previous calendar day in the
// sheet. Pin every exported date to UTC-noon of its calendar day so it renders
// as the day the user actually entered, in any viewer's timezone.
export function xlDate(d) {
  const jd = toJsDate(d)
  if (!jd || Number.isNaN(jd.getTime())) return null
  return new Date(Date.UTC(jd.getFullYear(), jd.getMonth(), jd.getDate(), 12))
}

function deptLabelFor(entry) {
  const key = String(normalizeDepartmentName(entry.department || entry.category || ''))
    .trim()
    .toLowerCase()
  const row = DEPT_ROWS.find((r) => r.label.toLowerCase() === key || r.match.includes(key))
  return row ? row.label : (entry.department || entry.category || 'Unspecified')
}

/**
 * Group this month's (already non-pending) expense entries by department.
 * Returns only departments that have at least one entry, ordered by the fixed
 * DEPT_ROWS order first, then any unmapped department names alphabetically.
 *
 * @returns {{ label:string, entries:Array, total:number }[]}
 */
export function groupExpenseByDepartment(expenseEntries) {
  const buckets = new Map()
  for (const e of expenseEntries) {
    const label = deptLabelFor(e)
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push(e)
  }

  const order = DEPT_ROWS.map((r) => r.label)
  const labels = [...buckets.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })

  return labels.map((label) => {
    const entries = [...buckets.get(label)]
      .sort((a, b) => (toJsDate(a.date)?.getTime() || 0) - (toJsDate(b.date)?.getTime() || 0))
      .map((e) => ({ ...e, date: xlDate(e.date) }))
    return { label, entries, total: sumAmount(entries) }
  })
}

const dayKey = (d) => {
  const jd = toJsDate(d)
  return jd ? `${jd.getFullYear()}-${jd.getMonth()}-${jd.getDate()}` : ''
}

/**
 * Build the Income Sheet model from this month's income entries.
 */
export function buildIncomeModel(incomeEntries) {
  const cat = categorizeEntries(incomeEntries)

  const ledger = (entries) =>
    [...entries]
      .sort((a, b) => (toJsDate(a.date)?.getTime() || 0) - (toJsDate(b.date)?.getTime() || 0))
      .map((e) => ({
        date: xlDate(e.date),
        name: e.giverName || e.name || '',
        amount: num(e.amount),
      }))

  // Offering matrix: one row per distinct date across English/Tamil/Online.
  const offeringByDay = new Map()
  const addOffering = (entries, key) => {
    for (const e of entries) {
      const k = dayKey(e.date)
      if (!k) continue
      if (!offeringByDay.has(k)) {
        offeringByDay.set(k, { date: xlDate(e.date), english: 0, tamil: 0, online: 0 })
      }
      offeringByDay.get(k)[key] += num(e.amount)
    }
  }
  addOffering(cat.englishOffering, 'english')
  addOffering(cat.tamilOffering, 'tamil')
  addOffering(cat.onlineOffering, 'online')
  const offeringRows = [...offeringByDay.values()].sort((a, b) => a.date - b.date)

  return {
    summary: [
      { label: 'English Offering', total: sumAmount(cat.englishOffering) },
      { label: 'Tamil Offering', total: sumAmount(cat.tamilOffering) },
      { label: 'Online Offering', total: sumAmount(cat.onlineOffering) },
      { label: 'Tithe - English', total: sumAmount(cat.titheEnglish) },
      { label: 'Tithe - Tamil', total: sumAmount(cat.titheTamil) },
      { label: 'Contribution', total: sumAmount(cat.contribution) },
      { label: 'Support from ROLCC', total: sumAmount(cat.supportFromROLCC) },
      { label: 'Other Income', total: sumAmount(cat.otherIncome) },
    ],
    offeringRows,
    supportRows: ledger(cat.supportFromROLCC),
    titheEnglishRows: ledger(cat.titheEnglish),
    titheTamilRows: ledger(cat.titheTamil),
    contributionRows: ledger(cat.contribution),
    otherIncomeRows: [...cat.otherIncome]
      .sort((a, b) => (toJsDate(a.date)?.getTime() || 0) - (toJsDate(b.date)?.getTime() || 0))
      .map((e) => ({
        date: xlDate(e.date),
        name: e.giverName || e.name || e.category || '',
        amount: num(e.amount),
      })),
    grandTotal: sumAmount(incomeEntries),
  }
}
