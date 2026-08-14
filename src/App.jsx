import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Profile from './Profile'
import Dashboard from './Dashboard'
import ServerRail from './ServerRail'
import ChannelSidebar from './ChannelSidebar'
import ChatView from './ChatView'

function App() {
  // ---- AUTH STATE ----
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLogin, setIsLogin] = useState(false)

  // ---- CHANNEL STATE ----
  const [selectedChannel, setSelectedChannel] = useState(null)

  // ---- CHAT STATE ----
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')

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

  // Fetches messages for the SELECTED CHANNEL only, and re-runs whenever
  // the selected channel changes. Realtime listener also filters by channel_id
  // so messages from other channels don't leak into this one.
  useEffect(() => {
    if (!selectedChannel) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', selectedChannel.id)
        .order('created_at', { ascending: true })
      setMessages(data || [])
    }
    fetchMessages()

    const channel = supabase
      .channel(`messages-${selectedChannel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${selectedChannel.id}` }, (payload) => {
        setMessages((current) => [...current, payload.new])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [selectedChannel])

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
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(`Error: ${error.message}`)
      else setMessage('Success! Check your email to confirm your account.')
    }
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

  // ================= LOGGED-IN VIEW =================
  if (session) {
    return (
      <div className="flex h-screen">
        <ServerRail />
        <ChannelSidebar selectedChannel={selectedChannel} setSelectedChannel={setSelectedChannel} />

        <div className="flex flex-col flex-1">
          {/* ---- HEADER: current channel name + avatar button that opens the dashboard dropdown ---- */}
          <div className="bg-white shadow p-4 flex justify-between items-center relative">
            <h1 className="text-xl font-bold"># {selectedChannel?.name || '...'}</h1>
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

          <ChatView
            messages={messages}
            profilesMap={profilesMap}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            handleSendMessage={handleSendMessage}
            formatTime={formatTime}
            formatDateLabel={formatDateLabel}
            isNewDay={isNewDay}
          />
        </div>

        {showProfile && <Profile session={session} onClose={() => setShowProfile(false)} />}
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
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 mb-4 border rounded" required />
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