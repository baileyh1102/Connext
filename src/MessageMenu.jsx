import { useEffect, useRef } from 'react'

const QUICK_EMOJIS = ['💪', '👑', '❤️', '😂', '🙏', '🎉', '😮', '😢', '🤔', '🔥', '🏀', '🏈', '🥎', '👻', '🎃', ]

// One menu for every message in the app.
// Computer: a small popup next to the cursor (right-click).
// Phone: a bottom sheet (long-press).
// Any action you don't pass in is simply left out of the menu.
function MessageMenu({ x, y, openedAt = 0, preview, onClose, onReact, onReply, onCopy, onEdit, onDelete }) {
  const ref = useRef(null)
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

  const rowClass = isPhone
    ? 'w-full text-left px-4 py-3 text-base hover:bg-gray-100 rounded-lg'
    : 'w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 rounded'

  const items = (
    <>
      {onReact && (
        <div className={`flex justify-around border-b border-gray-100 ${isPhone ? 'px-2 pb-2 mb-1' : 'px-1 pb-1 mb-1'}`}>
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`rounded-full hover:bg-gray-100 active:bg-gray-200 ${isPhone ? 'text-2xl w-11 h-11' : 'text-xl w-8 h-8'}`}
              onClick={run(() => onReact(emoji))}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {onReply && <button className={rowClass} onClick={run(onReply)}>Reply</button>}
      {onCopy && <button className={rowClass} onClick={run(onCopy)}>Copy text</button>}
      {onEdit && <button className={rowClass} onClick={run(onEdit)}>Edit</button>}
      {onDelete && <button className={`${rowClass} text-red-600 hover:bg-red-50`} onClick={run(onDelete)}>Delete</button>}
    </>
  )

  if (isPhone) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" />
        <div
          ref={ref}
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-2xl"
        >
          <div className="mx-auto w-10 h-1 bg-gray-300 rounded-full my-2" />
          {preview && <p className="px-4 pb-2 text-sm text-gray-500 line-clamp-2">{preview}</p>}
          {items}
        </div>
      </div>
    )
  }

  // Keep the popup fully on screen (w-56 = 224px wide, roughly 300px tall at most)
  const left = Math.max(8, Math.min(x, window.innerWidth - 224 - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - 300 - 8))

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top, left }}
      className="bg-white border rounded-lg shadow-lg w-56 p-1 z-50"
    >
      {items}
    </div>
  )
}

export default MessageMenu