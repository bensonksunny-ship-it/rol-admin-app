import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center gap-3 text-sm shadow-lg">
      <span className="text-base" aria-hidden="true">📡</span>
      <span>You're offline — live data unavailable. Reconnect to sync.</span>
    </div>
  )
}
