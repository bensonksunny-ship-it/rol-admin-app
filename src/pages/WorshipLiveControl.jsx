import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { subscribeWorshipLive } from '../services/firestore'
import WorshipLiveView from '../components/worship/WorshipLiveView'

/**
 * Public Worship Control Center (/worship-live/:token) — for team members without
 * an app login. View only, apart from their own check-in, song readiness and
 * display settings; leaders drive the live song from the Worship tab in the app.
 */
export default function WorshipLiveControl() {
  const { token } = useParams()
  const [data, setData] = useState(undefined) // undefined = loading, null = gone

  useEffect(() => subscribeWorshipLive(token, setData, () => setData(null)), [token])
  useEffect(() => { document.title = 'Worship Control Center' }, [])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-4">
        {data === undefined && (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />Loading…
          </div>
        )}
        {data === null && (
          <div className="py-24 text-center">
            <p className="text-lg font-semibold">This link isn't active</p>
            <p className="mt-1 text-sm text-slate-400">Ask the Worship team for the current Control Center link.</p>
          </div>
        )}
        {data && <WorshipLiveView data={data} token={token} />}
      </div>
    </div>
  )
}
