import { useSearchParams } from 'react-router-dom'
import DepartmentTabBar from '../components/DepartmentTabBar'
import SundayReport from './SundayReport'
import SundayProgram from './SundayProgram'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const subTab = searchParams.get('subtab') || 'livecontrol'

  const setSubTab = (tab) => {
    const next = new URLSearchParams(searchParams)
    next.set('subtab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <DepartmentTabBar slug="sunday-ministry" activeTab="sunday" />
      <SubTabBar active={subTab} onChange={setSubTab} />
      {subTab === 'livecontrol' && <SundayReport embedded />}
      {subTab === 'program' && <SundayProgram embedded />}
    </div>
  )
}
