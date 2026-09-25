import { useEffect, useRef } from 'react'

// ReactorList is a small popup listing everyone who reacted with a specific
// emoji on a message — opened via right-click on a reaction pill. `names`
// is an array of already-resolved display name strings.
function ReactorList({ emoji, names, onClose, anchorPosition }) {
  const popupRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={popupRef}
      style={{ position: 'fixed', top: anchorPosition.y, left: anchorPosition.x }}
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