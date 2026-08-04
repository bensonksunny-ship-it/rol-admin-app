import { useState } from 'react'
import { Wallet, Banknote, X } from 'lucide-react'
import DeptExpenseTab from '../../components/DeptExpenseTab'
import AdvancePayoutTab from '../../components/AdvancePayoutTab'
import BudgetPage from '../accounts/BudgetPage'

/** Sec-Core's own Finance view — mirrors Worship's layout: Expense is the permanent
 * base view, Budget and Payout Request each open as a drawer via a top-right icon
 * button instead of separate routes/tabs. No dock popover — this renders directly
 * on the page. */
export default function SecCoreFinance({ department }) {
  const [overlay, setOverlay] = useState(null) // null | 'budget' | 'payout'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setOverlay('budget')}
          title="Budget"
          aria-label="Open Budget"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
        >
          <Wallet size={17} />
        </button>
        <button
          type="button"
          onClick={() => setOverlay('payout')}
          title="Payout Request"
          aria-label="Open Payout Request"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 bg-white border border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
        >
          <Banknote size={17} />
        </button>
      </div>

      {department?.name && <DeptExpenseTab department={department.name} />}

      {overlay && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
          onClick={() => setOverlay(null)}
        >
          <div
            className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
              <h3 className="font-semibold text-slate-800">{overlay === 'budget' ? 'Budget' : 'Payout Request'}</h3>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 pb-safe">
              {overlay === 'budget' && <BudgetPage department={department?.name} />}
              {overlay === 'payout' && <AdvancePayoutTab departmentSlug="sec-core" departmentName={department?.name || 'Sec-Core'} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
