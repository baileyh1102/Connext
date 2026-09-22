import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

const PRESETS = [
  { label: 'In 1 hour', getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: 'In 3 hours', getDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: 'Tomorrow morning (9am)', getDate: () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d
  }},
  { label: 'Next week', getDate: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
]

// ScheduleMessagePicker lets the user schedule the current composer text to
// send later — via a quick preset or a custom date/time — and includes a
// "Pending" tab to view/cancel messages they've already scheduled but that
// haven't sent yet.
function ScheduleMessagePicker({ messageText, channelId, currentUserId, currentUserEmail, onScheduled, onClose }) {
  const [tab, setTab] = useState('new')
  const [customDateTime, setCustomDateTime] = useState('')
  const [pending, setPending] = useState([])
  const pickerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const fetchPending = async () => {
    const { data } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('user_id', currentUserId)
      .eq('sent', false)
      .order('send_at', { ascending: true })
    setPending(data || [])
  }

  useEffect(() => {
    if (tab === 'pending') fetchPending()
  }, [tab])

  const scheduleFor = async (date) => {
    if (!messageText.trim()) return
    await supabase.from('scheduled_messages').insert({
      channel_id: channelId,
      user_id: currentUserId,
      user_email: currentUserEmail,
      content: messageText.trim(),
      send_at: date.toISOString(),
    })
    onScheduled()
    onClose()
  }

  const handleCustomSubmit = () => {
    if (!customDateTime) return
    scheduleFor(new Date(customDateTime))
  }

  const handleCancel = async (id) => {
    await supabase.from('scheduled_messages').delete().eq('id', id)
    setPending((current) => current.filter((p) => p.id !== id))
  }

  const formatSendAt = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 bg-white border rounded-lg shadow-lg w-80 z-20"
    >
      <div className="flex border-b">
        <button
          onClick={() => setTab('new')}
          className={`flex-1 text-sm py-2 ${tab === 'new' ? 'font-semibold border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          Schedule
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 text-sm py-2 ${tab === 'pending' ? 'font-semibold border-b-2 border-blue-600' : 'text-gray-500'}`}
        >
          Pending
        </button>
      </div>

      {tab === 'new' ? (
        <div className="p-4">
          {!messageText.trim() && (
            <p className="text-xs text-amber-600 mb-3">Type your message in the box below first, then choose when to send it.</p>
          )}
          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Quick options</p>
          <div className="space-y-1 mb-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => scheduleFor(preset.getDate())}
                disabled={!messageText.trim()}
                className="w-full text-left text-sm border rounded p-2 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Custom</p>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={customDateTime}
              onChange={(e) => setCustomDateTime(e.target.value)}
              className="flex-1 border rounded p-2 text-sm"
            />
            <button
              type="button"
              onClick={handleCustomSubmit}
              disabled={!messageText.trim() || !customDateTime}
              className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-40"
            >
              Set
            </button>
          </div>
        </div>
      ) : (
        <div className="p-2 max-h-72 overflow-y-auto">
          {pending.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No scheduled messages.</p>
          ) : (
            pending.map((p) => (
              <div key={p.id} className="flex justify-between items-start gap-2 p-2 border-b last:border-b-0">
                <div>
                  <p className="text-sm text-gray-700 line-clamp-2">{p.content}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Sends {formatSendAt(p.send_at)}</p>
                </div>
                <button
                  onClick={() => handleCancel(p.id)}
                  className="text-xs text-red-500 hover:text-red-600 flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default ScheduleMessagePicker