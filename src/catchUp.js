import { useSyncExternalStore } from 'react'

// Tiny shared store: the sidebar saves "when did I last read this channel"
// here, and the chat view reads it to draw the red NEW line.
const cutoffs = new Map()
const listeners = new Set()

export function setCatchUpCutoff(channelId, iso) {
  // capturedAt has 5s of slack so small clock differences don't matter.
  // Only messages that existed when the channel was opened can get the line.
  cutoffs.set(channelId, { cutoff: iso ?? null, capturedAt: Date.now() + 5000 })
  listeners.forEach((l) => l())
}

export function useCatchUpCutoff(channelId) {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => cutoffs.get(channelId)
  )
}