import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Simple email + password sign up / log in, toggled with one link.
// Supabase Auth handles all the password hashing, sessions, etc.
export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setInfo('Check your email to confirm your account, then log in.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }

    setLoading(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Tend Chat</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Log in to your account' : 'Create an account'}
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="form-error">{error}</div>}
          {info && <div className="form-info">{info}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
            setInfo('')
          }}
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  )
}
