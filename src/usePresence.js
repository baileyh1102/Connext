import { useState, useEffect } from 'react'
import { subscribeToPresence } from './presence'

// usePresence gives any component a live-updating Set of currently-connected
// user ids, re-rendering automatically as people connect/disconnect.
export function usePresence() {
  const [onlineUserIds, setOnlineUserIds] = useState(new Set())

  useEffect(() => {
    const unsubscribe = subscribeToPresence(setOnlineUserIds)
    return unsubscribe
  }, [])

  return onlineUserIds
}

// Given a stored status ('online'/'busy') and whether presence says this
// person is actually connected right now, returns the EFFECTIVE status to
// display — always 'offline' if they're not actually connected, regardless
// of what they last manually picked.
export function getEffectiveStatus(userId, storedStatus, onlineUserIds) {
  if (!onlineUserIds.has(userId)) return 'offline'
  return storedStatus || 'online'
}