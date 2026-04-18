import { Navigate, useParams } from 'react-router-dom'
import EntryPage from './EntryPage'

/**
 * Nested under `/department/:slug/entry/*` so it shares DepartmentHub chrome.
 * Only Accounts may render the entry module; other departments redirect to their hub.
 */
export default function AccountsEntryGate() {
  const { slug } = useParams()

  if (!slug) return <Navigate to="/departments" replace />
  if (slug !== 'accounts') return <Navigate to={`/department/${slug}`} replace />

  return <EntryPage />
}

