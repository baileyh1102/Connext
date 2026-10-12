// StatusDot is a small colored circle overlaid on the bottom-right corner of
// an avatar, showing someone's manually-set presence: green (online),
// gray (offline), or red (busy).
function StatusDot({ status, size = 'w-2.5 h-2.5' }) {
  const color =
    status === 'online' ? 'bg-green-500' :
    status === 'busy' ? 'bg-red-500' :
    'bg-gray-400' // offline or unset

  return (
    <span
      className={`absolute bottom-0 right-0 ${size} ${color} rounded-full border-2 border-white`}
      title={status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Offline'}
    />
  )
}

export default StatusDot