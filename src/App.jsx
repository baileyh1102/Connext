import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isLogin, setIsLogin] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
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
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-80 text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to Connext</h1>
          <p className="text-gray-500 mb-6">{session.user.email}</p>
          <button onClick={handleLogout} className="w-full bg-red-600 text-white p-2 rounded hover:bg-red-600/90">
            Log Out
          </button>
        </div>
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