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
        className="text-base text-gray-400 hover:text-gray-600"
      >
        ♡
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