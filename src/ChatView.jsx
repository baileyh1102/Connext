// ChatView displays the message list for the currently selected channel,
// plus the input bar for sending new messages.
function ChatView({ messages, profilesMap, newMessage, setNewMessage, handleSendMessage, formatTime, formatDateLabel, isNewDay }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-100">
      {/* ---- CHAT MESSAGE LIST ---- */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, index) => {
          const senderProfile = profilesMap[msg.user_id]
          const showDateStamp = isNewDay(msg.created_at, messages[index - 1]?.created_at)

          return (
            <div key={msg.id}>
              {showDateStamp && (
                <div className="flex justify-center my-4">
                  <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full">
                    {formatDateLabel(msg.created_at)}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-3">
                {senderProfile?.avatar_url ? (
                  <img src={senderProfile.avatar_url} alt="Avatar" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-300 flex-shrink-0" />
                )}
                <div className="max-w-md">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">
                      {senderProfile?.display_name || msg.user_email}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="bg-white p-2 rounded shadow-sm mt-1">
                    <span>{msg.content}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- MESSAGE INPUT BAR ---- */}
      <form onSubmit={handleSendMessage} className="p-4 bg-white flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 border rounded p-2"
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-600/90">
          Send
        </button>
      </form>
    </div>
  )
}

export default ChatView