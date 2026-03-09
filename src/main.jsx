import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { isFirebaseConfigured } from './lib/firebase'

function SetupMessage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'system-ui, sans-serif',
      background: '#f8fafc',
      color: '#1e293b',
    }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>River Of Life Admin App</h1>
        <p style={{ marginBottom: 16, color: '#64748b' }}>
          Firebase is not configured. Add a <strong>.env</strong> file in the project root with your Firebase keys.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'left' }}>
          Required variables: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID
        </p>
        <p style={{ fontSize: '0.875rem', marginTop: 12, color: '#64748b' }}>
          See DEPLOYMENT.md for how to get these from Firebase Console.
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isFirebaseConfigured() ? <App /> : <SetupMessage />}
  </StrictMode>,
)
