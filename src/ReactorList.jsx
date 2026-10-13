import { useEffect, useRef } from 'react'

// ReactorList is a small popup listing everyone who reacted with a specific
// emoji on a message — opened via right-click (desktop) or long-press (phone)
// on a reaction pill. `names` is an array of already-resolved display names.
function ReactorList({ emoji, names, onClose, anchorPosition }) {
  const popupRef = useRef(null)
  const openedAt = useRef(Date.now())

  useEffect(() => {
    const handleClickOutside = (e) => {
      // Ignore the tap generated when the finger lifts after a long press
      if (Date.now() - openedAt.current < 500) return
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [onClose])

  // Keep the popup fully on screen (w-56 = 224px wide, max-h-64 = 256px tall)
  const left = Math.max(8, Math.min(anchorPosition.x, window.innerWidth - 224 - 8))
  const top = Math.max(8, Math.min(anchorPosition.y, window.innerHeight - 256 - 8))

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', top, left }}
      className="bg-white border rounded-lg shadow-lg w-56 max-h-64 overflow-y-auto z-50"
    >
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span className="text-xs font-semibold text-gray-500">{names.length} reaction{names.length === 1 ? '' : 's'}</span>
      </div>
      <div className="py-1">
        {names.map((name, index) => (
          <div key={index} className="px-3 py-1.5 text-sm text-gray-700">
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ReactorList