// MentionAutocomplete shows a small dropdown of matching members while
// someone is typing "@partial-name" in a composer. Positioned to open
// upward from the textarea, same as the other composer popovers.
function MentionAutocomplete({ members, query, onSelect }) {
  const filtered = members
    .filter((m) => m.display_name?.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6)

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full mb-1 left-0 bg-white border rounded-lg shadow-lg w-56 max-h-48 overflow-y-auto z-30">
      {filtered.map((m) => (
        <button
          key={m.user_id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault() // keep focus in the textarea instead of the button
            onSelect(m.display_name)
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
        >
          {m.avatar_url ? (
            <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-300" />
          )}
          <span className="text-sm truncate">{m.display_name}</span>
        </button>
      ))}
    </div>
  )
}

export default MentionAutocomplete