import { useState, useRef, useEffect } from 'react'

const COMMON_EMOJI = ['💪', '👑', '❤️', '😂', '🙏', '🎉', '😮']

// A small button that opens a popover of common emoji to react with
function ReactionPicker({ onSelect }) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    if (!showPicker) return
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPicker])

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="text-gray-400 hover:text-gray-600"
        title="React"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="translate-y-0.5"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </button>

      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute bottom-6 left-0 bg-white border rounded-lg shadow-lg p-2 flex gap-1 z-10"
        >
          {COMMON_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji)
                setShowPicker(false)
              }}
              className="text-lg hover:bg-gray-100 rounded p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReactionPicker