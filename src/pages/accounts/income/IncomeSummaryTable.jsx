import { categorizeEntries, sumAmount } from './incomeCategorize'

const ROWS = [
  { key: 'englishOffering', label: 'English Offering' },
  { key: 'tamilOffering', label: 'Tamil Offering' },
  { key: 'onlineOffering', label: 'Online Offering' },
  { key: 'titheEnglish', label: 'Tithe - English' },
  { key: 'titheTamil', label: 'Tithe - Tamil' },
  { key: 'contribution', label: 'Contribution' },
  { key: 'otherIncome', label: 'Other Income' },
  { key: 'supportFromROLCC', label: 'Support from ROLCC' },
  { key: 'rsmSalary', label: 'RSM Salary' },
]

export default function IncomeSummaryTable({ entries }) {
  const categorized = categorizeEntries(entries)
  const total = sumAmount(entries)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
        <h3 className="text-sm font-semibold text-slate-700">Income Summary</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {ROWS.map((row, i) => (
            <tr key={row.key} className={i % 2 === 1 ? 'bg-slate-50/50' : undefined}>
              <td className="px-5 py-2.5 text-slate-600">{row.label}</td>
              <td className="px-5 py-2.5 text-right font-medium tabular-nums text-slate-800">
                ₹{sumAmount(categorized[row.key]).toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-emerald-50/60">
            <td className="px-5 py-3 font-bold text-slate-700">Total Income</td>
            <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">₹{total.toLocaleString('en-IN')}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
