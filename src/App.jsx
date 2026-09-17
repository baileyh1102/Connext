import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'
import Profile from './Profile'
import Dashboard from './Dashboard'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import ServerSettings from './ServerSettings'
import ChatView from './ChatView'
import ThreadPanel from './ThreadPanel'
import PageNav from './PageNav'
import HomePage from './HomePage'
import CalendarPage from './CalendarPage'

function App() {
  // ---- AUTH STATE ----
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLogin, setIsLogin] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ---- SERVER / CHANNEL STATE ----
  const [servers, setServers] = useState([]) // servers the logged-in user belongs to
  const [selectedServer, setSelectedServer] = useState(null)
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [currentPage, setCurrentPage] = useState('chat') // 'chat' | 'home' | 'calendar'
  const [showServerSettings, setShowServerSettings] = useState(false)

  // ---- CHAT STATE ----
  const [messages, setMessages] = useState([]) // top-level messages only (parent_id is null)
  const [newMessage, setNewMessage] = useState('')

  // ---- THREAD STATE ----
  const [activeThread, setActiveThread] = useState(null) // the parent message currently open in the thread panel
  const [threadReplies, setThreadReplies] = useState([]) // replies to activeThread
  const [replyCounts, setReplyCounts] = useState({}) // { messageId: count } for showing "X replies" in main chat
  const activeThreadRef = useRef(null) // always holds the CURRENT activeThread, for use inside the realtime callback below

  // ---- REACTIONS STATE ----
  const [reactionsMap, setReactionsMap] = useState({}) // { messageId: [{ emoji, user_id }, ...] }

  // ---- PROFILE / DASHBOARD STATE ----
  const [showProfile, setShowProfile] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [profile, setProfile] = useState(null)
  const [profilesMap, setProfilesMap] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetches the servers the logged-in user belongs to. Lives here (rather than
  // inside ServerRail) so both ServerRail and ChannelSidebar can read/act on
  // the same server list and selection.
  useEffect(() => {
    if (!session) return

    const fetchServers = async () => {
      const { data: memberships } = await supabase
        .from('server_members')
        .select('server_id')
        .eq('user_id', session.user.id)

      const serverIds = memberships?.map((m) => m.server_id) || []
      if (serverIds.length === 0) return

      const { data: serverData } = await supabase
        .from('servers')
        .select('*')
        .in('id', serverIds)
        .order('id', { ascending: true })

      setServers(serverData || [])
      if (serverData && serverData.length > 0 && !selectedServer) {
        setSelectedServer(serverData[0])
      }
    }
    fetchServers()
  }, [session])

  
  // Reset back to the Chat page whenever the selected server changes,
  // so switching servers doesn't leave you stranded on a page that doesn't apply
  useEffect(() => {
    setCurrentPage('chat')
  }, [selectedServer])

  // Fetches messages for the SELECTED CHANNEL only, and re-runs whenever
  // the selected channel changes. Realtime listener also filters by channel_id
  // so messages from other channels don't leak into this one.
  useEffect(() => {
    if (!selectedChannel) return

    const fetchMessages = async () => {
      // Only top-level messages (no parent) show in the main channel view
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', selectedChannel.id)
        .is('parent_id', null)
        .order('created_at', { ascending: true })
      setMessages(data || [])

      // Fetch reply counts for all these messages in one go
      const { data: allInChannel } = await supabase
        .from('messages')
        .select('parent_id')
        .eq('channel_id', selectedChannel.id)
        .not('parent_id', 'is', null)

      const counts = {}
      allInChannel?.forEach((m) => {
        counts[m.parent_id] = (counts[m.parent_id] || 0) + 1
      })
      setReplyCounts(counts)
    }
    fetchMessages()

    const channel = supabase
      .channel(`messages-${selectedChannel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${selectedChannel.id}` }, (payload) => {
        if (payload.new.parent_id) {
          // It's a reply — bump the count for its parent, and add it to the open thread if that thread is currently active.
          // We use activeThreadRef (not activeThread directly) since this callback is created once
          // and would otherwise always see the OLD value of activeThread (a "stale closure").
          setReplyCounts((current) => ({
            ...current,
            [payload.new.parent_id]: (current[payload.new.parent_id] || 0) + 1,
          }))
          setThreadReplies((current) =>
            activeThreadRef.current?.id === payload.new.parent_id ? [...current, payload.new] : current
          )
        } else {
          // It's a top-level message
          setMessages((current) => [...current, payload.new])
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedChannel])

  useEffect(() => {
    activeThreadRef.current = activeThread
  }, [activeThread])

  // Loads all replies whenever a thread is opened
  useEffect(() => {
    if (!activeThread) {
      setThreadReplies([])
      return
    }
    const fetchReplies = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('parent_id', activeThread.id)
        .order('created_at', { ascending: true })
      setThreadReplies(data || [])
    }
    fetchReplies()
  }, [activeThread])

  // Loads reactions for the current channel's messages, and keeps them live via realtime
  useEffect(() => {
    if (!selectedChannel) return

    const fetchReactions = async () => {
      const { data } = await supabase
        .from('reactions')
        .select('message_id, emoji, user_id')
      // Note: this fetches ALL reactions rather than filtering by channel, since reactions
      // don't have a channel_id of their own — fine at this scale, worth optimizing later
      // by joining through messages if the table grows large.

      const map = {}
      data?.forEach((r) => {
        if (!map[r.message_id]) map[r.message_id] = []
        map[r.message_id].push(r)
      })
      setReactionsMap(map)
    }
    fetchReactions()

    const channel = supabase
      .channel(`reactions-${selectedChannel.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => {
        fetchReactions() // simplest approach: re-fetch on any insert/delete
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedChannel])

  // Toggles a reaction: adds it if the current user hasn't reacted with this emoji yet,
  // removes it if they have (classic "tap to toggle" behavior)
  const handleToggleReaction = async (messageId, emoji) => {
    const existing = reactionsMap[messageId]?.find(
      (r) => r.emoji === emoji && r.user_id === session.user.id
    )

    if (existing) {
      await supabase
        .from('reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', session.user.id)
        .eq('emoji', emoji)
    } else {
      await supabase.from('reactions').insert({
        message_id: messageId,
        user_id: session.user.id,
        emoji: emoji,
      })
    }
  }

  useEffect(() => {
    const fetchProfiles = async () => {
      const userIds = [...new Set(messages.map((m) => m.user_id))]
      if (userIds.length === 0) return

      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds)

      const map = {}
      data?.forEach((p) => { map[p.user_id] = p })
      setProfilesMap(map)
    }
    fetchProfiles()
  }, [messages])

  useEffect(() => {
    const loadProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()
      setProfile(data)
    }
    if (session) loadProfile()
  }, [session, showProfile])

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const formatDateLabel = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const isNewDay = (current, previous) => {
    if (!previous) return true
    return new Date(current).toDateString() !== new Date(previous).toDateString()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(`Error: ${error.message}`)
    } else {
      if (password !== confirmPassword) {
        setMessage("Error: Passwords don't match")
        return
      }
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(`Error: ${error.message}`)
      else setMessage('Success! Check your email to confirm your account.')
    }
  }

  // Adds a new server, makes the current user its first member, and switches to it
  const handleAddServer = async (name) => {
    if (!name.trim()) return

    const iconText = name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3)

    const { data: newServer, error } = await supabase
      .from('servers')
      .insert({ name: name.trim(), created_by: session.user.id, icon_text: iconText })
      .select()
      .single()

    if (!error && newServer) {
      await supabase.from('server_members').insert({ server_id: newServer.id, user_id: session.user.id })
      setServers((current) => [...current, newServer])
      setSelectedServer(newServer)
    }
  }

  // Renames a server, and keeps selectedServer in sync so the header updates immediately
  const handleRenameServer = async (serverId, newName) => {
    await supabase.from('servers').update({ name: newName }).eq('id', serverId)
    setServers((current) =>
      current.map((s) => (s.id === serverId ? { ...s, name: newName } : s))
    )
    if (selectedServer?.id === serverId) {
      setSelectedServer((prev) => ({ ...prev, name: newName }))
    }
  }

  // Deletes a server. Channels and server_members cascade-delete automatically
  // via foreign key constraints, so we only need to delete the server row itself.
  const handleDeleteServer = async (serverId) => {
    await supabase.from('servers').delete().eq('id', serverId)
    setServers((current) => current.filter((s) => s.id !== serverId))
    if (selectedServer?.id === serverId) {
      setSelectedServer(null)
      setSelectedChannel(null)
    }
  }

  // Updates a message's content and marks it as edited.
  // Realtime doesn't broadcast UPDATE events by default (only INSERT is set up),
  // so we also update local state directly for instant feedback.
  const handleEditMessage = async (messageId, newContent) => {
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent, edited: true })
      .eq('id', messageId)

    if (!error) {
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? { ...m, content: newContent, edited: true } : m))
      )
      setThreadReplies((current) =>
        current.map((m) => (m.id === messageId ? { ...m, content: newContent, edited: true } : m))
      )
    }
  }

  // Deletes a message. Realtime doesn't broadcast DELETE events by default
  // (we only set up INSERT), so we also remove it from local state directly.
  // If this was a reply (parentId provided), also decrements its parent's reply count.
  const handleDeleteMessage = async (messageId, parentId) => {
    const { error } = await supabase.from('messages').delete().eq('id', messageId)
    if (!error) {
      setMessages((current) => current.filter((m) => m.id !== messageId))
      setThreadReplies((current) => current.filter((m) => m.id !== messageId))

      if (parentId) {
        setReplyCounts((current) => {
          const updated = { ...current }
          const newCount = (updated[parentId] || 1) - 1
          if (newCount <= 0) {
            delete updated[parentId]
          } else {
            updated[parentId] = newCount
          }
          return updated
        })
      }
    }
  }

  // Maps a file's extension to one of our four supported attachment types,
  // so ChatView knows how to render it (image/video/audio player, or a PDF link)
  const getAttachmentType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image'
    if (ext === 'mp4') return 'video'
    if (ext === 'mp3' || ext === 'wav') return 'audio'
    if (ext === 'pdf') return 'pdf'
    return null
  }

  // Uploads a file to Storage, then sends a message carrying a reference to it
  const handleSendAttachment = async (file, caption = '') => {
    const type = getAttachmentType(file.name)
    if (!type) {
      alert('Unsupported file type. Please use PDF, PNG, MP4, MP3, or WAV.')
      return
    }
    if (!selectedChannel) return

    const filePath = `${selectedChannel.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file)
    if (uploadError) {
      console.log('Attachment upload error:', uploadError)
      return
    }

    const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(filePath)

    await supabase.from('messages').insert({
      content: caption,
      user_id: session.user.id,
      user_email: session.user.email,
      channel_id: selectedChannel.id,
      attachment_url: publicUrlData.publicUrl,
      attachment_type: type,
      attachment_name: file.name,
    })
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedChannel) return
    const { error } = await supabase.from('messages').insert({
      content: newMessage,
      user_id: session.user.id,
      user_email: session.user.email,
      channel_id: selectedChannel.id,
    })
    if (error) console.log('Send message error:', error)
    setNewMessage('')
  }

  // Sends a reply inside the currently open thread
  const handleSendReply = async (replyText) => {
    if (!replyText.trim() || !activeThread) return
    await supabase.from('messages').insert({
      content: replyText,
      user_id: session.user.id,
      user_email: session.user.email,
      channel_id: selectedChannel.id,
      parent_id: activeThread.id,
    })
  }

  // ================= LOGGED-IN VIEW =================
  if (session) {
    return (
      <div className="flex h-screen">
        <ServerRail
          servers={servers}
          selectedServer={selectedServer}
          setSelectedServer={setSelectedServer}
          onAddServer={handleAddServer}
          onDeleteServer={handleDeleteServer}
        />
        {/* Channel sidebar only makes sense on the Chat page — other pages (Prayer Wall, Calendar) aren't organized by channel */}
        {currentPage === 'chat' && (
          <ChannelSidebar
            selectedChannel={selectedChannel}
            setSelectedChannel={setSelectedChannel}
            selectedServer={selectedServer}
            onOpenServerSettings={() => setShowServerSettings(true)}
          />
        )}

        <div className="flex flex-col flex-1">
          {/* ---- HEADER: page switcher (Chat/Prayer Wall/Calendar) + avatar button that opens the dashboard dropdown ---- */}
          <div className="bg-white shadow p-4 flex justify-between items-center relative">
            <div className="flex items-center gap-4">
              <PageNav currentPage={currentPage} setCurrentPage={setCurrentPage} />
              {currentPage === 'chat' && (
                <span className="text-gray-400 text-sm"># {selectedChannel?.name || '...'}</span>
              )}
            </div>
            <button onClick={() => setShowDashboard(!showDashboard)} className="flex items-center gap-2">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-300" />
              )}
            </button>

            {showDashboard && (
              <Dashboard
                profile={profile}
                session={session}
                onEditProfile={() => { setShowDashboard(false); setShowProfile(true) }}
                onLogout={() => { setShowDashboard(false); handleLogout() }}
                onClose={() => setShowDashboard(false)}
              />
            )}
          </div>

          {currentPage === 'chat' && (
            <ChatView
              messages={messages}
              profilesMap={profilesMap}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              handleSendMessage={handleSendMessage}
              handleSendAttachment={handleSendAttachment}
              handleEditMessage={handleEditMessage}
              handleDeleteMessage={handleDeleteMessage}
              formatTime={formatTime}
              formatDateLabel={formatDateLabel}
              isNewDay={isNewDay}
              currentUserId={session.user.id}
              replyCounts={replyCounts}
              onOpenThread={setActiveThread}
              reactionsMap={reactionsMap}
              onToggleReaction={handleToggleReaction}
            />
          )}

          {currentPage === 'home' && (
            <HomePage
              selectedServer={selectedServer}
              session={session}
              isAdmin={profile?.is_admin || false}
            />
          )}
          {currentPage === 'calendar' && (
            <CalendarPage selectedServer={selectedServer} isAdmin={profile?.is_admin || false} />
          )}
        </div>

        {currentPage === 'chat' && activeThread && (
          <ThreadPanel
            parentMessage={activeThread}
            replies={threadReplies}
            profilesMap={profilesMap}
            onClose={() => setActiveThread(null)}
            onSendReply={handleSendReply}
            formatTime={formatTime}
            currentUserId={session.user.id}
            handleEditMessage={handleEditMessage}
            handleDeleteMessage={handleDeleteMessage}
            reactionsMap={reactionsMap}
            onToggleReaction={handleToggleReaction}
          />
        )}

        {showProfile && <Profile session={session} onClose={() => setShowProfile(false)} />}

        {showServerSettings && selectedServer && (
          <ServerSettings
            server={selectedServer}
            currentUserId={session.user.id}
            onClose={() => setShowServerSettings(false)}
            onDeleteServer={handleDeleteServer}
            onServerUpdated={(updates) => {
              setServers((current) => current.map((s) => (s.id === selectedServer.id ? { ...s, ...updates } : s)))
              setSelectedServer((prev) => ({ ...prev, ...updates }))
            }}
          />
        )}
      </div>
    )
  }

  // ================= LOGGED-OUT VIEW: login/signup form =================
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md w-80">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {isLogin ? 'Log In to Connext' : 'Join Connext'}
        </h1>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2 mb-4 border rounded" required />

        <div className="relative mb-4">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 pr-10 border rounded"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>

        {!isLogin && (
          <div className="relative mb-4">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-2 pr-10 border rounded"
              required
            />
          </div>
        )}

        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-600/90">
          {isLogin ? 'Log In' : 'Sign Up'}
        </button>
        {message && <p className="mt-4 text-sm text-center">{message}</p>}
        <p className="mt-4 text-sm text-center text-gray-500">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button type="button" onClick={() => { setIsLogin(!isLogin); setMessage('') }} className="text-blue-600 underline">
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </p>
      </form>
    </div>
  )
}

export default App