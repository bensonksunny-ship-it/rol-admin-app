import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions, httpsCallable } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasEnvVars = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

let app = null
let auth = null
let db = null
let storage = null
let functions = null
/** Set when .env looks valid but initializeApp / services fail (would otherwise white-screen the app). */
let firebaseInitError = null

if (hasEnvVars) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    // Explicit region to match deployed callable functions
    functions = getFunctions(app, 'us-central1')
  } catch (err) {
    console.error('Firebase initialization failed:', err)
    firebaseInitError = err
    app = null
    auth = null
    db = null
    storage = null
    functions = null
  }
}

export { auth, db, storage, functions, httpsCallable }
/** True only when Firebase app initialized successfully (safe for Auth / Firestore). */
export const isFirebaseConfigured = () => !!app
export const getFirebaseInitError = () => firebaseInitError
export default app
