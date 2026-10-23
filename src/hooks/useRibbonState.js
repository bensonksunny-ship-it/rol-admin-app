import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { subscribeUserRibbonState, setUserRibbonState } from '../services/firestore'

// Ribbon "Remind me later" snoozes and "Got it" acknowledgements, saved per user in
// Firestore (user_ribbon_state/{uid}) so they survive a refresh, another device or
// the installed app. localStorage is kept as an instant local copy: a value counts
// if either store has it (the later of the two wins), so nothing reappears while
// the Firestore write is still in flight or offline.
//
// One Firestore listener per signed-in user, shared by every ribbon on the page.

const lsKey = (field, key) => `rol.ribbonState.${field}.${key}`
const readLocal = (field, key) => { try { return Number(localStorage.getItem(lsKey(field, key))) || 0 } catch { return 0 } }
const writeLocal = (field, key, v) => { try { localStorage.setItem(lsKey(field, key), String(v)) } catch { /* storage blocked */ } }

// Firestore map keys can't hold '.', '/' etc. reliably — keep them plain.
const safeKey = (key) => String(key).replace(/[^A-Za-z0-9_-]/g, '_')

let shared = { uid: null, data: {}, unsub: null, listeners: new Set() }

function attach(uid, listener) {
  if (shared.uid !== uid) {
    shared.unsub?.()
    shared = { uid, data: {}, unsub: null, listeners: shared.listeners }
    shared.unsub = subscribeUserRibbonState(uid, (data) => {
      shared.data = data || {}
      shared.listeners.forEach((l) => l(shared.data))
    })
  }
  shared.listeners.add(listener)
  listener(shared.data)
  return () => { shared.listeners.delete(listener) }
}

export default function useRibbonState() {
  const { user } = useAuth()
  const uid = user?.uid || null
  const [data, setData] = useState(() => (uid && shared.uid === uid ? shared.data : {}))
  useEffect(() => (uid ? attach(uid, setData) : undefined), [uid])

  const get = (field, key) => Math.max(Number(data?.[field]?.[safeKey(key)]) || 0, readLocal(field, safeKey(key)))
  const set = (field, key, value) => {
    const k = safeKey(key)
    writeLocal(field, k, value)
    // Reflect at once for every ribbon on the page; the snapshot confirms it.
    shared.data = { ...shared.data, [field]: { ...(shared.data[field] || {}), [k]: value } }
    shared.listeners.forEach((l) => l(shared.data))
    if (uid) setUserRibbonState(uid, field, k, value).catch(() => {})
  }

  return {
    snoozedUntil: (key) => get('snoozedUntil', key),
    snooze: (key, until) => set('snoozedUntil', key, until),
    seenAt: (key) => get('seenAt', key),
    markSeen: (key, ms) => set('seenAt', key, ms),
  }
}
