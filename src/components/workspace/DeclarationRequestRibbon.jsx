import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { subscribeMyInterviewRequests, getBaptismDeclarationByToken, markWorkspaceNotificationDone } from '../../services/firestore'

/**
 * My Workspace → "please sign your Baptism Self-Declaration" ribbon for a
 * membership applicant (Stage 4, item 3), in the Worship ribbon style. Opens the
 * signing page; once the declaration is signed the ribbon closes itself.
 */
export default function DeclarationRequestRibbon({ uid, email, myName }) {
  const [requests, setRequests] = useState([])
  const [signed, setSigned] = useState({}) // token → true once signed / expired

  useEffect(() => subscribeMyInterviewRequests({ uid, email, statuses: ['pending'], type: 'baptism_self_declaration' }, setRequests), [uid, email])

  // Hide (and close) any whose declaration is already signed or no longer available.
  useEffect(() => {
    requests.filter((r) => r.token && !(r.token in signed)).forEach((r) => {
      getBaptismDeclarationByToken(r.token)
        .then((d) => {
          const done = !d || d.status === 'signed'
          setSigned((s) => ({ ...s, [r.token]: done }))
          if (done) markWorkspaceNotificationDone(r.id, myName).catch(() => {})
        })
        .catch(() => setSigned((s) => ({ ...s, [r.token]: true })))
    })
  }, [requests]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = requests.filter((r) => r.token && signed[r.token] === false)
  if (!shown.length) return null
  const firstName = String(myName || '').trim().split(/\s+/)[0] || 'there'
  return (
    <div>
      {shown.map((r) => (
        <div key={r.id} className="w-full max-w-xl mx-auto my-3">
          <div className="bg-indigo-600 text-white rounded-xl px-5 py-3 shadow-md flex items-center justify-between gap-3 w-full">
            <span className="min-w-0 text-sm font-medium tracking-wide">
              Hello {firstName}, please sign your Baptism Self-Declaration for your membership application.
            </span>
            <a href={`/baptism-declaration?token=${r.token}`}
              className="flex-shrink-0 bg-indigo-700/80 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all">
              Sign <ChevronRight size={14} />
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
