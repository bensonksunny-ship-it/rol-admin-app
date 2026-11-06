import { format } from 'date-fns'
import { categorizeEntries, toDate } from '../pages/accounts/income/incomeCategorize'

// Monthly Income / Expense statements shown once a month is marked "Entry
// completed" (finance_month_unlocks.completed) — the on-screen report
// (components/finance/FinanceStatementReport.jsx) and its PDF share this model:
// { title, monthLabel, summary: { rows: [{ label, amount, count? }], totalLabel, total, notes? },
//   sections: [{ title, columns: [{ key, label, align?, money? }], rows, total }], completedBy, completedAt }

export const CHURCH_NAME = 'River of Life Christian Church, Bangalore'

const amt = (e) => Number(e?.amount) || 0
const sum = (list) => list.reduce((s, e) => s + amt(e), 0)
const isoOf = (d) => format(toDate(d), 'yyyy-MM-dd')
const byDate = (a, b) => toDate(a.date) - toDate(b.date)

export const fmtMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const INCOME_SUMMARY = [
  { key: 'englishOffering', label: 'English Offering' },
  { key: 'tamilOffering', label: 'Tamil Offering' },
  { key: 'onlineOffering', label: 'Online Offering' },
  { key: 'titheEnglish', label: 'Tithe - English' },
  { key: 'titheTamil', label: 'Tithe - Tamil' },
  { key: 'contribution', label: 'Contribution' },
  { key: 'otherIncome', label: 'Other Income' },
  { key: 'supportFromROLCC', label: 'Support from ROLCC' },
  { key: 'rsm', label: 'RSM' },
]

const INCOME_LISTS = [
  { key: 'titheEnglish', title: 'Tithe - English' },
  { key: 'titheTamil', title: 'Tithe - Tamil' },
  { key: 'contribution', title: 'Contribution', towards: true },
  { key: 'supportFromROLCC', title: 'Support from ROLCC' },
  { key: 'otherIncome', title: 'Other Income', category: true, towards: true },
  { key: 'rsm', title: 'RSM', category: true },
]

function completion(unlock) {
  return {
    completedBy: unlock?.lockedBy || '',
    completedAt: unlock?.lockedAt?.toDate ? unlock.lockedAt.toDate() : (unlock?.lockedAt instanceof Date ? unlock.lockedAt : null),
  }
}

export function buildIncomeStatement(entries, monthDate, unlock) {
  const c = categorizeEntries(entries)
  const offering = [...c.englishOffering, ...c.tamilOffering, ...c.onlineOffering]
  const days = [...new Set(offering.map((e) => isoOf(e.date)))].sort()
  const dayTotal = (list, iso) => sum(list.filter((e) => isoOf(e.date) === iso))
  const offeringRows = days.map((iso) => {
    const english = dayTotal(c.englishOffering, iso)
    const tamil = dayTotal(c.tamilOffering, iso)
    const online = dayTotal(c.onlineOffering, iso)
    return { date: format(new Date(`${iso}T00:00:00`), 'dd/MM/yyyy'), english, tamil, online, total: english + tamil + online }
  })

  const sections = []
  if (offeringRows.length) {
    sections.push({
      title: 'Offering',
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'english', label: 'English', align: 'right', money: true },
        { key: 'tamil', label: 'Tamil', align: 'right', money: true },
        { key: 'online', label: 'Online', align: 'right', money: true },
        { key: 'total', label: 'Total', align: 'right', money: true },
      ],
      rows: offeringRows,
      total: sum(offering),
    })
  }
  INCOME_LISTS.forEach((s) => {
    const list = [...(c[s.key] || [])].sort(byDate)
    if (!list.length) return
    sections.push({
      title: s.title,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'name', label: 'Name' },
        ...(s.category ? [{ key: 'category', label: 'Category' }] : []),
        ...(s.towards ? [{ key: 'towards', label: 'Towards' }] : []),
        { key: 'mode', label: 'Mode' },
        { key: 'amount', label: 'Amount', align: 'right', money: true },
      ],
      rows: list.map((e) => ({
        date: format(toDate(e.date), 'dd/MM/yyyy'),
        name: e.giverName || '—',
        category: e.category || '',
        towards: e.towards || '',
        mode: (e.paymentMode || '').replace(' (UPI/Bank)', ''),
        amount: amt(e),
      })),
      total: sum(list),
    })
  })

  return {
    kind: 'income',
    title: 'Statement of Income',
    monthLabel: format(monthDate, 'MMMM yyyy'),
    summary: {
      heading: 'Income Summary',
      rows: INCOME_SUMMARY.map((r) => ({ label: r.label, count: (c[r.key] || []).length, amount: sum(c[r.key] || []) })),
      totalLabel: 'Total Income',
      total: sum(entries),
    },
    sections,
    ...completion(unlock),
  }
}

/** departmentOf(entry) → the department name the Expense page files it under. */
export function buildExpenseStatement(entries, monthDate, unlock, { departmentOf, departmentOrder = [], fundReserved = 0 } = {}) {
  const groups = new Map()
  entries.forEach((e) => {
    const dept = departmentOf(e) || 'Other'
    if (!groups.has(dept)) groups.set(dept, [])
    groups.get(dept).push(e)
  })
  const rank = (d) => { const i = departmentOrder.indexOf(d); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
  const depts = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const total = sum(entries)

  return {
    kind: 'expense',
    title: 'Statement of Expenses',
    monthLabel: format(monthDate, 'MMMM yyyy'),
    summary: {
      heading: 'Expense Summary by Department',
      rows: depts.map((d) => ({ label: d, count: groups.get(d).length, amount: sum(groups.get(d)) })),
      totalLabel: 'Total Expense',
      total,
      notes: fundReserved ? [{ label: 'Funds reserved this month (Savings)', amount: fundReserved }] : [],
    },
    sections: depts.map((d) => {
      const list = [...groups.get(d)].sort(byDate)
      return {
        title: d,
        columns: [
          { key: 'sl', label: 'No.' },
          { key: 'date', label: 'Date' },
          { key: 'item', label: 'Item' },
          { key: 'billNo', label: 'Bill No' },
          { key: 'amount', label: 'Amount', align: 'right', money: true },
        ],
        rows: list.map((e, i) => ({
          sl: i + 1,
          date: format(toDate(e.date), 'dd/MM/yyyy'),
          item: e.item || e.description || '—',
          billNo: e.billNo || '',
          amount: amt(e),
        })),
        total: sum(list),
      }
    }),
    ...completion(unlock),
  }
}

/**
 * Draws the statement natively with jsPDF + autoTable (crisp, searchable text —
 * no screenshot). mode 'download' saves the file; 'print' opens it in a new tab
 * with the print dialog. Helvetica has no ₹ glyph, so amounts read "Rs.".
 */
export async function exportStatementPdf(st, mode = 'download') {
  // Opened synchronously so the browser treats it as part of the click.
  const printWin = mode === 'print' ? window.open('', '_blank') : null
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default || autoTableModule
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 14
  const rs = (n) => `Rs. ${fmtMoney(n)}`
  const BRAND = [0, 80, 68]

  // Letterhead
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...BRAND)
  doc.text(CHURCH_NAME, W / 2, 18, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100)
  doc.text('Accounts Department', W / 2, 23.5, { align: 'center' })
  doc.setDrawColor(...BRAND); doc.setLineWidth(0.6); doc.line(M, 27, W - M, 27)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20)
  doc.text(st.title.toUpperCase(), W / 2, 35, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60)
  doc.text(`For the month of ${st.monthLabel}`, W / 2, 41, { align: 'center' })
  const status = ['Status: Entry completed', st.completedBy && `by ${st.completedBy}`, st.completedAt && `on ${format(st.completedAt, 'dd/MM/yyyy')}`].filter(Boolean).join(' ')
  doc.setFontSize(8.5); doc.setTextColor(110)
  doc.text(status, W / 2, 46, { align: 'center' })

  const head = { fillColor: BRAND, textColor: 255, fontStyle: 'bold', fontSize: 9 }
  const foot = { fillColor: [232, 245, 240], textColor: 20, fontStyle: 'bold', fontSize: 9 }

  // Summary
  autoTable(doc, {
    startY: 52,
    margin: { left: M, right: M },
    head: [[st.summary.heading, 'Entries', 'Amount']],
    body: st.summary.rows.map((r) => [r.label, String(r.count ?? ''), rs(r.amount)]),
    foot: [[st.summary.totalLabel, '', rs(st.summary.total)], ...(st.summary.notes || []).map((n) => [n.label, '', rs(n.amount)])],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2, lineColor: [210, 214, 220], lineWidth: 0.2 },
    headStyles: head,
    footStyles: foot,
    columnStyles: { 1: { halign: 'center', cellWidth: 20 }, 2: { halign: 'right', cellWidth: 40 } },
    showFoot: 'lastPage',
  })

  // Breakdowns
  st.sections.forEach((sec) => {
    let y = doc.lastAutoTable.finalY + 9
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...BRAND)
    doc.text(sec.title, M, y)
    const moneyIdx = sec.columns.map((c, i) => (c.money ? i : -1)).filter((i) => i >= 0)
    const lastMoney = moneyIdx[moneyIdx.length - 1]
    autoTable(doc, {
      startY: y + 2,
      margin: { left: M, right: M },
      head: [sec.columns.map((c) => c.label)],
      body: sec.rows.map((r) => sec.columns.map((c) => (c.money ? fmtMoney(r[c.key]) : String(r[c.key] ?? '')))),
      foot: [sec.columns.map((c, i) => (i === 0 ? 'Total' : i === lastMoney ? rs(sec.total) : ''))],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { ...head, fontSize: 8.5 },
      footStyles: foot,
      columnStyles: Object.fromEntries(sec.columns.map((c, i) => [i, c.align === 'right' ? { halign: 'right' } : {}])),
      showFoot: 'lastPage',
    })
  })

  // Sign-off
  let y = doc.lastAutoTable.finalY + 26
  if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 40 }
  doc.setDrawColor(150); doc.setLineWidth(0.3); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70)
  const colW = (W - M * 2) / 3
  ;['Prepared by', 'Verified by', 'Approved by'].forEach((label, i) => {
    const x = M + i * colW + 6
    doc.line(x, y, x + colW - 12, y)
    doc.text(label, x + (colW - 12) / 2, y + 5, { align: 'center' })
  })

  // Footer on every page
  const pages = doc.getNumberOfPages()
  const generated = `Generated ${format(new Date(), 'dd/MM/yyyy, h:mm a')}`
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7.5); doc.setTextColor(140)
    const H = doc.internal.pageSize.getHeight()
    doc.text(`${CHURCH_NAME} · ${st.title} · ${st.monthLabel}`, M, H - 8)
    doc.text(`${generated} · Page ${p} of ${pages}`, W - M, H - 8, { align: 'right' })
  }

  const file = `${st.title.replace(/\s+/g, '_')}_${st.monthLabel.replace(/\s+/g, '_')}.pdf`
  if (mode === 'print') {
    doc.autoPrint()
    const url = doc.output('bloburl')
    if (printWin) printWin.location.href = url
    else window.open(url, '_blank')
  } else {
    doc.save(file)
  }
}
