// Placeholder for the Calendar page — will be built out with real events,
// RSVPs, and reminders in a future session.
function CalendarPage({ selectedServer }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-400">
      <div className="text-center">
        <p className="text-lg font-medium">Calendar</p>
        <p className="text-sm mt-1">⚠️Coming soon - {selectedServer?.name}🚧</p>
      </div>
    </div>
  )
}

export default CalendarPage