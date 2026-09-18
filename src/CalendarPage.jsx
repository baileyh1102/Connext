import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import calendarWordmark from './assets/calendar_wordmark.png'
import calendarBg from './assets/mascot_stock_image.png'

// CalendarPage lets an admin connect a Google Calendar (via its secret iCal
// link) and shows the resulting events. The actual custom calendar GRID
// rendering comes in a follow-up pass — this version confirms the pipeline
// (link storage -> Edge Function -> parsed events) works end to end.
function CalendarPage({ selectedServer, isAdmin }) {
  const [isConnected, setIsConnected] = useState(null) // null = not checked yet
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [icalInput, setIcalInput] = useState('')
  const [showConnectForm, setShowConnectForm] = useState(false)
  const [error, setError] = useState('')

  const [selectedEvent, setSelectedEvent] = useState(null) // event currently open in the detail modal

  const fetchEvents = async () => {
    if (!selectedServer) return
    setLoading(true)
    setError('')

    const { data, error: fnError } = await supabase.functions.invoke('get-calendar-events', {
      body: { server_id: selectedServer.id },
    })

    if (fnError) {
      setError(fnError.message)
    } else {
      setIsConnected(data.connected)
      const sortedEvents = (data.events || []).sort(
        (a, b) => new Date(a.start) - new Date(b.start)
      )
      setEvents(sortedEvents)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEvents()
  }, [selectedServer])

  const handleConnect = async (e) => {
    e.preventDefault()
    if (!icalInput.trim()) return

    const { error: upsertError } = await supabase
      .from('server_calendars')
      .upsert({ server_id: selectedServer.id, ical_url: icalInput.trim() }, { onConflict: 'server_id' })

    if (upsertError) {
      setError(upsertError.message)
      return
    }

    setIcalInput('')
    setShowConnectForm(false)
    fetchEvents() // pull events right away using the newly connected calendar
  }

  const formatEventDate = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatEventTime = (dateStr) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div
      className="flex-1 overflow-y-auto bg-gray-100 p-6 flex flex-col"
      style={{ backgroundImage: `url(${calendarBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="max-w-2xl mx-auto w-full flex flex-col flex-1">
        <div className="flex justify-center items-center mb-4 relative">
          <img src={calendarWordmark} alt="Calendar" className="h-12" />
          {isAdmin && (
            <button
              onClick={() => setShowConnectForm(!showConnectForm)}
              className="absolute right-0 text-sm text-blue-600 hover:underline"
            >
              {isConnected ? 'Update Calendar Link' : 'Connect Calendar'}
            </button>
          )}
        </div>

        {showConnectForm && (
          <form onSubmit={handleConnect} className="bg-white p-4 rounded-lg shadow-sm mb-4">
            <label className="block text-sm font-medium mb-1">Google Calendar secret iCal address</label>
            <p className="text-xs text-gray-400 mb-2">
              Google Calendar → Settings and sharing → your calendar → Integrate calendar → "Secret address in iCal format"
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={icalInput}
                onChange={(e) => setIcalInput(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="flex-1 border rounded p-2 text-sm"
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
                Save
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {loading ? (
          <p className="text-gray-400 text-sm">Loading events...</p>
        ) : isConnected === false ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-lg font-medium">No calendar connected yet</p>
            {isAdmin && <p className="text-sm mt-1">Click "Connect Calendar" above to get started.</p>}
          </div>
        ) : events.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No upcoming events.</p>
        ) : (
          <div className="border border-gray-200 bg-gray-50 px-4 py-4 space-y-2 flex-1 rounded-lg">
            {events.map((event, index) => (
              <button
                key={index}
                onClick={() => setSelectedEvent(event)}
                className="w-full text-left bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <p className="font-semibold">{event.summary}</p>
                <p className="text-sm text-gray-500">{formatEventDate(event.start)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- EVENT DETAIL MODAL ---- */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg shadow-lg w-96 max-h-[80vh] overflow-y-auto p-6"
          >
            <div className="flex justify-between items-start mb-3">
              <h2 className="text-lg font-bold">{selectedEvent.summary}</h2>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <p className="text-sm text-gray-600 mb-1">📅 {formatEventDate(selectedEvent.start)}</p>
            <p className="text-sm text-gray-600 mb-1">🕐 {formatEventTime(selectedEvent.start)}
              {selectedEvent.end && ` – ${formatEventTime(selectedEvent.end)}`}
            </p>
            {selectedEvent.location && (
              <p className="text-sm text-gray-600 mb-1">📍 {selectedEvent.location}</p>
            )}

            {selectedEvent.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedEvent.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage