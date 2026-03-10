import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getTasks, getAttendance, getFinanceIncome, getFinanceExpense } from '../services/firestore'
import { useAuth } from '../context/AuthContext'
import { format as formatDate, startOfMonth, endOfMonth } from 'date-fns'
import { formatDMY, formatDMYTime } from '../utils/date'

function computeAttendanceTotal(r) {
  const eng = Number(r.englishService) || 0
  const tamil = Number(r.tamilService) || 0
  const jr = Number(r.juniorChurch) || 0
  const combined = Number(r.combinedService) || 0
  return eng + tamil + jr + combined
}

export default function Reports() {
  const { hasPermission } = useAuth()
  const [loading, setLoading] = useState(false)
  const [reportType, setReportType] = useState('attendance')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState('')
  const canExport = hasPermission('exportReports')

  async function getReportData() {
    setLoading(true)
    const y = year
    const m = month !== '' ? parseInt(month, 10) : null
    const start = m != null ? startOfMonth(new Date(y, m)) : new Date(y, 0, 1)
    const end = m != null ? endOfMonth(new Date(y, m)) : new Date(y, 11, 31, 23, 59, 59)

    const [tasks, attendance, income, expense] = await Promise.all([
      getTasks(),
      hasPermission('attendance') ? getAttendance({ year: y }) : Promise.resolve([]),
      hasPermission('finance') ? getFinanceIncome({ year: y, ...(m != null && { month: m }) }) : Promise.resolve([]),
      hasPermission('finance') ? getFinanceExpense({ year: y, ...(m != null && { month: m }) }) : Promise.resolve([]),
    ])

    const attFiltered = attendance.filter(
      (a) => a.date && new Date(a.date) >= start && new Date(a.date) <= end
    )
    setLoading(false)
    return { tasks, attendance: attFiltered, income, expense }
  }

  function exportExcel(sheetName, columns, rows) {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `ROL_${reportType}_${year}${month !== '' ? `_${month + 1}` : ''}.xlsx`)
  }

  function exportPDF(title, columns, rows) {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`River Of Life Admin - ${title}`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Generated: ${formatDMYTime(new Date())}`, 14, 28)
    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: 34,
      styles: { fontSize: 8 },
    })
    doc.save(`ROL_${reportType}_${year}.pdf`)
  }

  async function handleExport(exportFormat) {
    if (!canExport) return
    const data = await getReportData()
    if (exportFormat === 'excel') {
      if (reportType === 'attendance') {
        const columns = ['Date', 'English', 'Tamil', 'Junior Church', 'Combined', 'Total']
        const rows = data.attendance.map((a) => [
          a.date ? formatDMY(a.date) : '',
          a.englishService ?? '',
          a.tamilService ?? '',
          a.juniorChurch ?? '',
          a.combinedService ?? '',
          computeAttendanceTotal(a),
        ])
        exportExcel('Attendance', columns, rows)
      } else if (reportType === 'finance') {
        const columns = ['Type', 'Date', 'Category', 'Amount', 'Description']
        const incomeRows = data.income.map((i) => [
          'Income',
          i.date ? formatDMY(i.date) : '',
          i.category ?? '',
          Number(i.amount) || 0,
          i.description ?? '',
        ])
        const expenseRows = data.expense.map((e) => [
          'Expense',
          e.date ? formatDMY(e.date) : '',
          e.category ?? '',
          Number(e.amount) || 0,
          e.description ?? '',
        ])
        exportExcel('Finance', columns, [...incomeRows, ...expenseRows])
      } else if (reportType === 'tasks') {
        const columns = ['Task', 'Department', 'Assigned', 'Priority', 'Deadline', 'Status']
        const rows = data.tasks.map((t) => [
          t.taskTitle ?? '',
          t.department ?? '',
          t.assignedPerson ?? '',
          t.priority ?? '',
          t.deadline ? formatDMY(t.deadline) : '',
          t.status ?? '',
        ])
        exportExcel('Tasks', columns, rows)
      }
    } else {
      if (reportType === 'attendance') {
        const columns = ['Date', 'English', 'Tamil', 'Junior Church', 'Combined', 'Total']
        const rows = data.attendance.map((a) => [
          a.date ? formatDMY(a.date) : '',
          a.englishService ?? '',
          a.tamilService ?? '',
          a.juniorChurch ?? '',
          a.combinedService ?? '',
          computeAttendanceTotal(a),
        ])
        exportPDF('Attendance Report', columns, rows)
      } else if (reportType === 'finance') {
        const columns = ['Type', 'Date', 'Category', 'Amount']
        const incomeRows = data.income.map((i) => [
          'Income',
          i.date ? formatDMY(i.date) : '',
          i.category ?? '',
          Number(i.amount) || 0,
        ])
        const expenseRows = data.expense.map((e) => [
          'Expense',
          e.date ? formatDMY(e.date) : '',
          e.category ?? '',
          Number(e.amount) || 0,
        ])
        exportPDF('Finance Report', columns, [...incomeRows, ...expenseRows])
      } else if (reportType === 'tasks') {
        const columns = ['Task', 'Department', 'Assigned', 'Status']
        const rows = data.tasks.map((t) => [
          t.taskTitle ?? '',
          t.department ?? '',
          t.assignedPerson ?? '',
          t.status ?? '',
        ])
        exportPDF('Tasks Report', columns, rows)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-slate-500 mt-1">Generate and export attendance, finance, and task reports</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-2xl">
        <h2 className="font-semibold text-slate-800 mb-4">Export Report</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Report type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            >
              <option value="attendance">Attendance</option>
              <option value="finance">Finance</option>
              <option value="tasks">Task completion</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              >
                {[year, year - 1, year - 2].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Month (optional)</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              >
                <option value="">All months</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>{formatDate(new Date(year, i), 'MMMM')}</option>
                ))}
              </select>
            </div>
          </div>
          {canExport ? (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleExport('excel')}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? 'Preparing...' : 'Export Excel'}
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Preparing...' : 'Export PDF'}
              </button>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">You do not have permission to export reports.</p>
          )}
        </div>
      </div>
    </div>
  )
}
