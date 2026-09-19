import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// NotificationBell shows a bell icon with an unread-count badge. Clicking it
// opens a dropdown listing notifications (newest first), and marks them read
// as they're viewed. Other features (birthday alerts, prayer-sending, etc.)
// simply insert rows into the `notifications` table and they'll show up here.
function NotificationBell({ currentUserId }) {
  const [notifications, setNotifications] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data || [])
  }

  useEffect(() => {
    fetchNotifications()

    const channel = supabase
      .channel(`notifications-${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${currentUserId}` }, () => {
        fetchNotifications()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [currentUserId])

  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const handleOpen = async () => {
    const opening = !showDropdown
    setShowDropdown(opening)

    if (opening && unreadCount > 0) {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
      setNotifications((current) => current.map((n) => ({ ...n, read: true })))
    }
  }

  const handleDelete = async (id) => {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications((current) => current.filter((n) => n.id !== id))
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={handleOpen} className="relative text-gray-500 hover:text-gray-700 p-1" aria-label="Notifications">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-9 bg-white border rounded-lg shadow-lg w-80 max-h-96 overflow-y-auto z-30">
          <div className="p-3 border-b font-semibold text-sm">Notifications</div>
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-400 text-center p-6">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`flex justify-between items-start gap-2 p-3 border-b last:border-b-0 ${n.read ? '' : 'bg-blue-50'}`}>
                <div>
                  <p className="text-sm text-gray-800">{n.content}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatTime(n.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="text-gray-300 hover:text-red-500 flex-shrink-0"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell