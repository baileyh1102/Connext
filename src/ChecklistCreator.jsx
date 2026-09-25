import { useState, useRef, useEffect } from 'react'

// ChecklistCreator is a popover for building a shared checklist: a title
// and 1+ starting items. onCreate receives { title, items }.
function ChecklistCreator({ onCreate, onClose }) {
  const [title, setTitle] = useState('')
  const [items, setItems] = useState([''])
  const pickerRef = useRef(null)
  const itemRefs = useRef([])
  const [focusIndex, setFocusIndex] = useState(null) // set right after adding an item via Shift+Enter, so we can focus it once it exists

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const updateItem = (index, value) => {
    setItems((current) => current.map((it, i) => (i === index ? value : it)))
  }

  const addItem = () => {
    setItems((current) => [...current, ''])
  }

  // After a new item is added (via the button OR Shift+Enter), focus it once it's actually rendered
  useEffect(() => {
    if (focusIndex === null) return
    itemRefs.current[focusIndex]?.focus()
    setFocusIndex(null)
  }, [items, focusIndex])

  const handleItemKeyDown = (e, index) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      if (index === items.length - 1) {
        addItem()
        setFocusIndex(index + 1)
      } else {
        itemRefs.current[index + 1]?.focus()
      }
    }
  }

  const removeItem = (index) => {
    if (items.length <= 1) return
    setItems((current) => current.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    const cleanedItems = items.map((i) => i.trim()).filter(Boolean)
    if (!title.trim() || cleanedItems.length === 0) return

    onCreate({ title: title.trim(), items: cleanedItems })
  }

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 bg-white border rounded-lg shadow-lg w-80 p-4 z-20"
    >
      <h3 className="text-sm font-semibold mb-3">Create a Checklist</h3>
      <div>
        <input
          type="text"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Checklist title..."
          className="w-full border rounded p-2 text-sm mb-3"
        />

        <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input
                ref={(el) => (itemRefs.current[index] = el)}
                type="text"
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                onKeyDown={(e) => handleItemKeyDown(e, index)}
                placeholder={`Item ${index + 1}`}
                className="flex-1 border rounded p-2 text-sm"
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-gray-400 hover:text-red-500 px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="text-sm text-blue-600 hover:underline mb-3"
        >
          + Add item
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
        >
          Create Checklist
        </button>
      </div>
    </div>
  )
}

export default ChecklistCreator