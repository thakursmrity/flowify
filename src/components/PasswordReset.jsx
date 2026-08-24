import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { AuthCard, PasswordField } from './AuthWidgets'
import { PASSWORD_RESET_PENDING_KEY } from '../lib/authHelpers'

// Shown right after someone verifies a "forgot password" code — verifying
// signs them in with their OLD password still on the account, so this is
// where that actually gets replaced before they see the rest of the app.
// App.jsx renders this whenever the PASSWORD_RESET_PENDING_KEY flag is set,
// regardless of which component set it, so it survives the remount that
// happens when the session changes.
export default function PasswordReset({ onDone }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.')
      return
    }
    if (password !== password2) {
      setError("Passwords don't match.")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }

    try {
      sessionStorage.removeItem(PASSWORD_RESET_PENDING_KEY)
    } catch {
      // ignore
    }
    onDone()
  }

  return (
    <AuthCard>
      <h2>Set a new password</h2>
      <p className="authx-sub">Your code checked out — choose a new password to finish resetting your account.</p>

      <form onSubmit={handleSubmit}>
        <div className="authx-field-label">New password</div>
        <PasswordField value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />

        <div className="authx-field-label">Confirm new password</div>
        <PasswordField value={password2} onChange={setPassword2} placeholder="Type it again" autoComplete="new-password" />

        {error && <div className="authx-error">{error}</div>}

        <button type="submit" className="authx-primary-btn" disabled={password.length < 8 || password !== password2 || loading}>
          {loading ? 'Saving…' : 'Reset password'}
        </button>
      </form>
    </AuthCard>
  )
}
