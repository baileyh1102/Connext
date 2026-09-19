import { useState, useEffect, useRef } from 'react'

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY

// GifPicker is a small popover with a search box and a grid of GIF results
// from Giphy. Clicking a GIF calls onSelect with its URL, then closes itself.
function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
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

  useEffect(() => {
    const fetchGifs = async () => {
      setLoading(true)
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`

      try {
        const res = await fetch(endpoint)
        const data = await res.json()
        setGifs(data.data || [])
      } catch (err) {
        console.log('Giphy fetch error:', err)
        setGifs([])
      }
      setLoading(false)
    }

    const debounce = setTimeout(fetchGifs, 300)
    return () => clearTimeout(debounce)
  }, [query])

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full mb-2 left-0 bg-white border rounded-lg shadow-lg w-80 h-96 flex flex-col z-20"
    >
      <div className="p-2 border-b">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs..."
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="text-sm text-gray-400 text-center mt-8">Loading...</p>
        ) : gifs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-8">No GIFs found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.images.fixed_height.url)}
                className="rounded overflow-hidden hover:opacity-80 transition-opacity"
              >
                <img src={gif.images.fixed_height_small.url} alt={gif.title} className="w-full h-20 object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-1 text-center border-t">
        <span className="text-[10px] text-gray-300">Powered by GIPHY</span>
      </div>
    </div>
  )
}

export default GifPicker