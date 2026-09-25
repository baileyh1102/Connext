import { useState, useEffect, useRef } from 'react'
import { computeChannelViewers } from './computeChannelViewers'

// ChannelViewerCount shows "# channel-name  •  N here" in the header, and
// opens a popup listing everyone who currently has permission to view this
// specific channel when clicked.
function ChannelViewerCount({ channel, server }) {
  const [viewers, setViewers] = useState([])
  const [showList, setShowList] = useState(false)
  const popupRef = useRef(null)

  useEffect(() => {
    if (!channel || !server) return
    const load = async () => {
      const result = await computeChannelViewers(channel, server)
      setViewers(result)
    }
    load()
  }, [channel, server])

  useEffect(() => {
    if (!showList) return
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setShowList(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showList])

  if (!channel) return null

  return (
    <div className="relative" ref={popupRef}>
      <button
        onClick={() => setShowList(!showList)}
        className="text-gray-400 text-sm hover:text-gray-600 flex items-center gap-1.5"
      >
        <span># {channel.name}</span>
        <span className="text-gray-300">•</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{viewers.length}</span>
      </button>

      {showList && (
        <div className="absolute left-0 top-7 bg-white border rounded-lg shadow-lg w-56 max-h-72 overflow-y-auto z-30">
          <div className="px-3 py-2 border-b text-xs font-semibold text-gray-500">
            {viewers.length} member{viewers.length === 1 ? '' : 's'} can view this channel
          </div>
          {viewers.map((v) => (
            <div key={v.user_id} className="flex items-center gap-2 px-3 py-2">
              {v.avatar_url ? (
                <img src={v.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-300" />
              )}
              <span className="text-sm text-gray-700 truncate">{v.display_name || 'A member'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChannelViewerCount