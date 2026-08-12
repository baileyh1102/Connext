import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Profile from './Profile'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLogin, setIsLogin] = useState(false)
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')  
  const [showProfile, setShowProfile] = useState(false)

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
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
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (isLogin) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(`Error: ${error.message}`)
      } else {
        setMessage(`Welcome back!`)
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage(`Error: ${error.message}`)
      } else {
        setMessage('Success! Check your email to confirm your account.')
      }
    }
  }

  if (session) {
    return (
      <div className="flex flex-col h-screen bg-gray-100">
        <div className="bg-white shadow p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Connext</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{session.user.email}</span>
            <button onClick={() => setShowProfile(true)} className="text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300">
              Edit Profile
            </button>
            <button onClick={handleLogout} className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-600/90">
              Log Out
            </button>
          </div>
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