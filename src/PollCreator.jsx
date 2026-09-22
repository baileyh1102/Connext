import { useState, useRef, useEffect } from 'react'

// PollCreator is a popover for building a poll: a question, 2+ options, and
// a toggle for whether multiple options can be selected. onCreate receives
// { question, options, allowMultiple } when submitted.
function PollCreator({ onCreate, onClose }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const pickerRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const updateOption = (index, value) => {
    setOptions((current) => current.map((o, i) => (i === index ? value : o)))
  }

  const addOption = () => {
    if (options.length >= 8) return
    setOptions((current) => [...current, ''])
  }

  const removeOption = (index) => {
    if (options.length <= 2) return
    setOptions((current) => current.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    const cleanedOptions = options.map((o) => o.trim()).filter(Boolean)
    if (!question.trim() || cleanedOptions.length < 2) return

    onCreate({ question: question.trim(), options: cleanedOptions, allowMultiple })
  }

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 bg-white border rounded-lg shadow-lg w-80 p-4 z-20"
    >
      <h3 className="text-sm font-semibold mb-3">Create a Poll</h3>
      <div>
        <input
          type="text"
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question..."
          className="w-full border rounded p-2 text-sm mb-3"
        />

        <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
          {options.map((opt, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="flex-1 border rounded p-2 text-sm"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="text-gray-400 hover:text-red-500 px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {options.length < 8 && (
          <button
            type="button"
            onClick={addOption}
            className="text-sm text-blue-600 hover:underline mb-3"
          >
            + Add option
          </button>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <input
            type="checkbox"
            checked={allowMultiple}
            onChange={(e) => setAllowMultiple(e.target.checked)}
          />
          Allow selecting multiple options
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
        >
          Create Poll
        </button>
      </div>
    </div>
  )
}

export default PollCreator