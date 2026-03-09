import { Link } from 'react-router-dom'
import { DEPARTMENTS } from '../constants/roles'

export default function Departments() {
  const slug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/'/g, '')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Departments</h1>
        <p className="text-slate-500 mt-1">Manage department activity, reports, and tasks</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {DEPARTMENTS.map((name) => (
          <Link
            key={name}
            to={`/departments/${slug(name)}`}
            className="block bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h2 className="font-semibold text-slate-800">{name}</h2>
            <p className="text-sm text-slate-500 mt-1">View activity & tasks →</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
