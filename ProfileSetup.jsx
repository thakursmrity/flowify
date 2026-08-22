import { useState } from 'react'
import { supabase } from '../supabaseClient'

function generateTendId() {
  const letters = Array.from({ length: 2 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('')
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `${letters}-${digits}`
}

// Shown once, right after a user's first login, so they can pick a display
// name. We generate their Tend ID for them and retry a couple of times in
// the (extremely rare) case of a collision with an existing ID.
export default function ProfileSetup({ userId, onDone }) {
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    let lastError = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const tendId = generateTendId()
      const { data, error } = await supabase
        .from('profiles')
        .insert({ id: userId, display_name: displayName.trim(), tend_id: tendId })
        .select()
        .single()

      if (!error) {
        onDone(data)
        setLoading(false)
        return
      }

      lastError = error
      // 23505 = unique_violation. Only worth retrying if it was the tend_id
      // that collided — anything else, stop and show the error.
      if (error.code !== '23505') break
    }

    setError(lastError?.message ?? 'Something went wrong creating your profile.')
    setLoading(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Welcome!</h1>
        <p className="auth-subtitle">What should people see you as?</p>

        <form onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={40}
              autoFocus
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" disabled={loading || !displayName.trim()}>
            {loading ? 'Creating...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
