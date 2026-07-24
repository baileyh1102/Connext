import { useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleSignUp = async (e) => {
    e.preventDefault()
    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Success! Check your email to confirm your account.')
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSignUp} className="bg-white p-8 rounded-lg shadow-md w-80">
        <h1 className="text-2xl font-bold mb-6 text-center">Join Connext</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 mb-4 border rounded"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-600/90">
          Sign Up
        </button>
        {message && <p className="mt-4 text-sm text-center">{message}</p>}
      </form>
    </div>
  )
}

export default App