import { supabase } from './supabaseClient'

// A single shared Supabase Presence channel for the whole app. Presence is
// ephemeral and connection-based — the moment someone's browser tab/connection
// actually closes, they drop out of this set automatically (no code needs to
// run on their end to make that happen, which is what makes it reliable for
// detecting "really offline" vs. someone manually picking a status).
//
// This is a plain module-level singleton (not a React hook by itself) so
// only ONE presence channel connection exists no matter how many components
// want to know who's online — each component subscribes via usePresence().

let channel = null
const listeners = new Set()
let onlineUserIds = new Set()

function notifyListeners() {
  listeners.forEach((cb) => cb(new Set(onlineUserIds)))
}

export function initPresence(userId) {
  if (channel || !userId) return

  channel = supabase.channel('online-users', {
    config: { presence: { key: userId } },
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      onlineUserIds = new Set(Object.keys(state))
      notifyListeners()
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() })
      }
    })
}

export function teardownPresence() {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
    onlineUserIds = new Set()
  }
}

export function subscribeToPresence(callback) {
  listeners.add(callback)
  callback(new Set(onlineUserIds))
  return () => listeners.delete(callback)
}

export function isUserOnline(userId) {
  return onlineUserIds.has(userId)
}