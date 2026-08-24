import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { AuthCard, PasswordField } from './AuthWidgets'
import { generateFlowIdSuggestion } from '../lib/authHelpers'

// Shown once, right after someone verifies their sign-up code — at that
// point they're authenticated (Supabase's OTP verification signs them in)
// but don't have a password or a profile row yet. This screen finishes the
// job: set a password, pick a display name, and confirm (or change) a
// Flowify ID — the short handle other people use to find and add them.
export default function ProfileSetup({ userId, onDone }) {
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [flowId, setFlowId] = useState(generateFlowIdSuggestion())
  const [idStatus, setIdStatus] = useState('ok') // 'checking' | 'ok' | 'taken' | 'invalid'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const idPattern = /^[A-Za-z0-9_-]{3,24}$/

  useEffect(() => {
    if (!idPattern.test(flowId)) {
      setIdStatus('invalid')
      return
    }
    setIdStatus('checking')
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('flow_id', flowId)
        .maybeSingle()
      setIdStatus(data ? 'taken' : 'ok')
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])

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
    if (idStatus !== 'ok') {
      setError('Choose a Flowify ID that is available first.')
      return
    }

    setLoading(true)

    const { error: pwError } = await supabase.auth.updateUser({ password })
    if (pwError) {
      setLoading(false)
      setError(pwError.message)
      return
    }

    const { data, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: userId, display_name: displayName.trim(), flow_id: flowId })
      .select()
      .single()

    setLoading(false)
    if (insertError) {
      setError(insertError.code === '23505' ? 'That Flowify ID was just taken — try another.' : insertError.message)
      return
    }
    onDone(data)
  }

  const canSubmit = displayName.trim() && password.length >= 8 && password === password2 && idStatus === 'ok'

  return (
    <AuthCard>
      <h2>Welcome to Flowify!</h2>
      <p className="authx-sub">A few last things and you're in.</p>

      <form onSubmit={handleSubmit}>
        <div className="authx-field-label">What should people call you?</div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Display name"
          maxLength={40}
          autoFocus
        />

        <div className="authx-field-label">Create a password</div>
        <PasswordField value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />

        <div className="authx-field-label">Confirm password</div>
        <PasswordField value={password2} onChange={setPassword2} placeholder="Type it again" autoComplete="new-password" />

        <div className="authx-field-label">Your Flowify ID</div>
        <div className="authx-id-check-row">
          <input type="text" value={flowId} onChange={(e) => setFlowId(e.target.value.trim())} maxLength={24} />
          <span className={'authx-id-status ' + (idStatus === 'ok' ? 'ok' : idStatus === 'checking' ? 'checking' : 'taken')}>
            {idStatus === 'ok' && '✓ Available'}
            {idStatus === 'checking' && 'Checking…'}
            {idStatus === 'taken' && '✕ Taken'}
            {idStatus === 'invalid' && '3–24 letters, numbers, _ -'}
          </span>
        </div>
        <div className="authx-id-helper">This is what friends use to find and add you — you can change it later from your profile.</div>

        {error && <div className="authx-error">{error}</div>}

        <button type="submit" className="authx-primary-btn" disabled={!canSubmit || loading}>
          {loading ? 'Creating…' : 'Continue'}
        </button>
      </form>
    </AuthCard>
  )
}
