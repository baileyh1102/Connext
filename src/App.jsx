import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Profile from './Profile'
import Dashboard from './Dashboard'

function App() {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLogin, setIsLogin] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true })
      setMessages(data || [])
    }
    fetchMessages()

    const channel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((current) => [...current, payload.new])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

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
    if (!newMessage.trim()) return
    await supabase.from('messages').insert({
      content: newMessage,
      user_id: session.user.id,
      user_email: session.user.email,
    })
    setNewMessage('')
  }

  if (session) {
    return (
      <div className="flex flex-col h-screen bg-gray-100">
        <div className="bg-white shadow p-4 flex justify-between items-center relative">
          <h1 className="text-xl font-bold">Connext</h1>
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

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="bg-white p-2 rounded shadow-sm max-w-md">
              <span className="text-xs text-gray-500 block">{msg.user_email}</span>
              <span>{msg.content}</span>
            </div>
          ))}
        </div>

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

        {showProfile && <Profile session={session} onClose={() => setShowProfile(false)} />}
      </div>
    )
  }

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