import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { REACTION_EMOJIS } from './emojiList'

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 17,
  height: 17,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// One menu for every message in the app. Any action you don't pass in is left out.
// Computer: the same pill-shaped toolbar as before, appearing where you right-clicked.
// Phone: a bottom sheet (long-press) with a React row that opens the emoji grid.
function MessageMenu({ x, y, openedAt = 0, preview, onClose, onReact, onReply, onCopy, onEdit, onDelete }) {
  const ref = useRef(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const isPhone = window.innerWidth < 768

  useEffect(() => {
    const handleOutside = (e) => {
      // Ignore the tap generated when the finger lifts after a long press
      if (Date.now() - openedAt < 500) return
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose, openedAt])

  const run = (fn) => () => { fn(); onClose() }
  const pickEmoji = (emoji) => { onReact(emoji); onClose() }

  let content

  if (isPhone) {
    const rowClass = 'w-full text-left px-4 py-3 text-base hover:bg-gray-100 rounded-lg'
    content = (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl"
        >
          <div className="mx-auto w-10 h-1 bg-gray-300 rounded-full my-2" />

          {showEmoji ? (
            <>
              <button className="px-4 py-2 text-sm text-blue-600" onClick={() => setShowEmoji(false)}>
                ‹ Back
              </button>
              <div className="grid grid-cols-6 gap-1 px-2 pb-2 max-h-[50vh] overflow-y-auto">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className="text-2xl h-12 rounded-lg hover:bg-gray-100 active:bg-gray-200"
                    onClick={() => pickEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {preview && <p className="px-4 pb-2 text-sm text-gray-500 line-clamp-2">{preview}</p>}
              {onReact && <button className={rowClass} onClick={() => setShowEmoji(true)}>React</button>}
              {onReply && <button className={rowClass} onClick={run(onReply)}>Reply</button>}
              {onCopy && <button className={rowClass} onClick={run(onCopy)}>Copy text</button>}
              {onEdit && <button className={rowClass} onClick={run(onEdit)}>Edit</button>}
              {onDelete && <button className={`${rowClass} text-red-600 hover:bg-red-50`} onClick={run(onDelete)}>Delete</button>}
            </>
          )}
        </div>
      </div>
    )
  } else {
    // Keep it on screen; reserve room below for the emoji grid
    const left = Math.max(8, Math.min(x, window.innerWidth - 250))
    const top = Math.max(8, Math.min(y, window.innerHeight - 240))
    const btn = 'text-gray-500 hover:text-gray-800'

    content = (
      <div ref={ref} style={{ position: 'fixed', top, left }} className="z-50">
        <div className="flex items-center gap-3 bg-white shadow-md border border-gray-100 rounded-full px-3 py-1.5 whitespace-nowrap">
          {onReact && (
            <button title="React" className={btn} onClick={() => setShowEmoji((s) => !s)}>
              <svg {...iconProps}>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>
          )}
          {onReply && (
            <button title="Reply" className={btn} onClick={run(onReply)}>
              <svg {...iconProps}>
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
              </svg>
            </button>
          )}
          {onCopy && (
            <button title="Copy text" className={btn} onClick={run(onCopy)}>
              <svg {...iconProps}>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
          {onEdit && (
            <button title="Edit" className={btn} onClick={run(onEdit)}>
              <svg {...iconProps}>
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button title="Delete" className="text-red-400 hover:text-red-600" onClick={run(onDelete)}>
              <svg {...iconProps}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>

        {showEmoji && (
          <div className="mt-2 bg-white shadow-lg border border-gray-100 rounded-lg p-2 w-56 grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className="text-xl h-8 w-8 rounded hover:bg-gray-100"
                onClick={() => pickEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Rendered at the top level of the page so no parent layout can clip or shift it
  return createPortal(content, document.body)
}

export default MessageMenu