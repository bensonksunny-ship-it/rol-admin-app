import { useSearchParams, Link } from 'react-router-dom'
import SundayReport from './SundayReport'
import SundayProgram from './SundayProgram'
import { useAuth } from '../context/AuthContext'

function SubTabBar({ active, onChange }) {
  const tabs = [
    { id: 'livecontrol', label: 'Live Control' },
    { id: 'program', label: 'Program' },
  ]
  return (
    <div className="flex gap-1 border-b border-slate-200 px-4 bg-white">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
            active === t.id
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function Sunday() {
  const { isSundayMinistryDirector } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const subTab = searchParams.get('subtab') || 'livecontrol'

  if (!isSundayMinistryDirector) {
    return (
      <div className="p-8 text-slate-600">
        <Link to="/departments" className="text-blue-600 hover:underline">← Departments</Link>
        <p className="mt-4">You do not have access to Sunday Ministry.</p>
      </div>
    )
  }

  const setSubTab = (tab) => {
    const next = new URLSearchParams(searchParams)
    next.set('subtab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <div className="px-4 pt-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Sunday</h1>
      </div>
      <SubTabBar active={subTab} onChange={setSubTab} />
      {subTab === 'livecontrol' && <SundayReport embedded />}
      {subTab === 'program' && <SundayProgram embedded />}
    </div>
  )
}
