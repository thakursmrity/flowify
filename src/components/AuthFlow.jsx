import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { AuthCard, Logo, OtpInputs, PasswordField, PhoneField } from './AuthWidgets'
import { PASSWORD_RESET_PENDING_KEY } from '../lib/authHelpers'

// The whole signed-out experience: a real intro to Flowify, then sign up
// (email or phone, verified with a one-time code), log in (email, phone, or
// Flowify ID), and forgot password (also code-based).
//
// How the OTP-based signup hands off to account setup: verifying the code
// is enough for Supabase to sign the person in, so App.jsx's session watcher
// takes over the instant that happens — the "create a password / pick your
// Flowify ID" step lives in ProfileSetup.jsx, shown automatically once
// there's a session but no profile row yet. That's a DB-backed condition,
// not tied to this component staying mounted, so it can't race with it.
//
// Forgot password works the same way: verifying the reset code signs the
// person in (that's the standard Supabase OTP behaviour), which would
// normally drop them straight into the app with their OLD password still
// set. To force the "choose a new password" step in first, this component
// sets a small sessionStorage flag (PASSWORD_RESET_PENDING_KEY, defined in
// ./AuthWidgets) right before verifying the code — App.jsx checks that flag
// (alongside session + profile) and shows PasswordReset.jsx until it's
// cleared.

export default function AuthFlow() {
  const [screen, setScreen] = useState('landing') // 'landing' | 'signup' | 'login' | 'forgot'

  return (
    <div className="authx-shell">
      {screen === 'landing' && <Landing onSignup={() => setScreen('signup')} onLogin={() => setScreen('login')} />}
      {screen === 'signup' && <SignupScreen onLogin={() => setScreen('login')} onBack={() => setScreen('landing')} />}
      {screen === 'login' && <LoginScreen onSignup={() => setScreen('signup')} onForgot={() => setScreen('forgot')} onBack={() => setScreen('landing')} />}
      {screen === 'forgot' && <ForgotScreen onBackToLogin={() => setScreen('login')} />}
    </div>
  )
}

function Landing({ onSignup, onLogin }) {
  const FEATURES = [
    { icon: '↻', bg: 'var(--cat-health-soft)', fg: 'var(--cat-health)', title: 'Habits', body: 'Real calendars, streaks, and habits you can build together with a friend.' },
    { icon: '✓', bg: 'var(--cat-study-soft)', fg: 'var(--cat-study)', title: 'Tasks', body: 'A simple board that keeps what’s critical in front of what’s just noise.' },
    { icon: '◐', bg: 'var(--authx-brand-soft)', fg: 'var(--authx-brand-deep)', title: 'Focus', body: 'Distraction-free sessions, solo or alongside someone else.' },
    { icon: '∿', bg: 'var(--current-soft)', fg: 'var(--current-deep)', title: 'Messages', body: 'A private circle to check in with and cheer each other on.' },
  ]

  return (
    <div className="landing-page authx-blobs">
      <div className="landing-nav">
        <Logo />
        <div className="landing-nav-actions">
          <button className="authx-btn-ghost" onClick={onLogin}>Log in</button>
          <button className="authx-btn-brand" onClick={onSignup}>Sign up free</button>
        </div>
      </div>

      <div className="landing-hero">
        <span className="landing-eyebrow">✦ Habits, tasks, focus, and messages — one calm place</span>
        <h1>
          One place to plan your day, build habits that stick, and stay in <em>flow</em> with people who matter.
        </h1>
        <p>
          Flowify brings your tasks, habits, journal, focus sessions, and messages into a single, uncluttered
          space — built for people who want momentum without the noise of ten different apps.
        </p>
        <div className="landing-ctas">
          <button className="authx-btn-brand-lg" onClick={onSignup}>Get started — it's free</button>
          <button className="authx-btn-ghost landing-ghost-lg" onClick={onLogin}>I already have an account</button>
        </div>
        <div className="landing-sub-note">No credit card needed · takes about a minute</div>
      </div>

      <div className="landing-feature-row">
        {FEATURES.map((f) => (
          <div className="landing-feature-card" key={f.title}>
            <div className="landing-feature-icon" style={{ background: f.bg, color: f.fg }}>{f.icon}</div>
            <h4>{f.title}</h4>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignupScreen({ onLogin, onBack }) {
  const [step, setStep] = useState('method') // 'method' | 'otp'
  const [method, setMethod] = useState('email') // 'email' | 'phone'
  const [contact, setContact] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Email needs an "@"; phone needs a real number of digits after the
  // country code, not just a non-empty string, since PhoneField always
  // carries at least a dial code ("+91") even before anything's typed.
  const canSend = method === 'email' ? contact.trim().includes('@') : contact.replace(/\D/g, '').length >= 6

  async function sendCode() {
    setError('')
    const trimmed = contact.trim()
    if (!canSend) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp(
      method === 'email' ? { email: trimmed, options: { shouldCreateUser: true } } : { phone: trimmed, options: { shouldCreateUser: true } }
    )
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('otp')
  }

  async function verifyCode() {
    setError('')
    const token = otp.join('')
    if (token.length !== 6) {
      setError('Enter all 6 digits.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.verifyOtp(
      method === 'email' ? { email: contact.trim(), token, type: 'email' } : { phone: contact.trim(), token, type: 'sms' }
    )
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Success: App.jsx's session watcher takes it from here — it'll see a
    // session with no profile yet and show ProfileSetup automatically.
  }

  return (
    <AuthCard>
      {step === 'method' && (
        <>
          <h2>Create your account</h2>
          <p className="authx-sub">Choose how you'd like to sign up — you'll verify it with a one-time code.</p>

          <div className="authx-method-row">
            <div
              className={'authx-method-card' + (method === 'email' ? ' active' : '')}
              onClick={() => { setMethod('email'); setContact('') }}
            >
              <div className="ic">📧</div>
              <div className="t">Email</div>
            </div>
            <div
              className={'authx-method-card' + (method === 'phone' ? ' active' : '')}
              onClick={() => { setMethod('phone'); setContact('+91') }}
            >
              <div className="ic">📱</div>
              <div className="t">Phone number</div>
            </div>
          </div>

          <div className="authx-field-label">{method === 'email' ? 'Email address' : 'Phone number'}</div>
          {method === 'email' ? (
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com" />
          ) : (
            <PhoneField value={contact} onChange={setContact} />
          )}

          {error && <div className="authx-error">{error}</div>}

          <button className="authx-primary-btn" disabled={!canSend || loading} onClick={sendCode}>
            {loading ? 'Sending…' : 'Send verification code'}
          </button>
          <div className="authx-secondary-link" onClick={onLogin}>Already have an account? <b>Log in</b></div>
          <div className="authx-secondary-link" onClick={onBack}>← Back</div>
        </>
      )}

      {step === 'otp' && (
        <>
          <h2>Enter the code</h2>
          <p className="authx-sub">We sent a 6-digit code to {method === 'email' ? 'your email' : 'your phone'}.</p>

          <OtpInputs values={otp} onChange={setOtp} />
          <div className="authx-otp-hint">
            Didn't get it? <a onClick={sendCode}>Resend code</a> · <a onClick={() => setStep('method')}>Change {method === 'email' ? 'email' : 'phone'}</a>
          </div>

          {error && <div className="authx-error">{error}</div>}

          <button className="authx-primary-btn" disabled={loading} onClick={verifyCode}>
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
        </>
      )}
    </AuthCard>
  )
}

const LOGIN_METHODS = [
  { key: 'email', icon: '📧', label: 'Email' },
  { key: 'phone', icon: '📱', label: 'Phone' },
  { key: 'flowid', icon: '🪪', label: 'Flowify ID' },
]

function LoginScreen({ onSignup, onForgot, onBack }) {
  const [method, setMethod] = useState('email') // 'email' | 'phone' | 'flowid'
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Same idea as the signup/forgot screens: a phone identifier always
  // carries at least a dial code from PhoneField, so a plain
  // non-empty check would let someone submit with no digits typed at all.
  const canLogin =
    !!password &&
    (method === 'phone' ? identifier.replace(/\D/g, '').length >= 6 : identifier.trim().length > 0)

  function handleMethodChange(next) {
    setMethod(next)
    setIdentifier(next === 'phone' ? '+91' : '')
  }

  async function handleLogin() {
    setError('')
    const trimmed = identifier.trim()
    if (!canLogin) return
    setLoading(true)

    let email = trimmed
    if (!trimmed.includes('@')) {
      const { data, error: resolveError } = await supabase.rpc('resolve_login_email', { p_identifier: trimmed })
      if (resolveError || !data) {
        setLoading(false)
        setError('No account found with that email, phone, or Flowify ID.')
        return
      }
      email = data
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  return (
    <AuthCard>
      <h2>Welcome back</h2>
      <p className="authx-sub">Log in with your email, phone number, or Flowify ID.</p>

      <div className="authx-method-row authx-method-row-3">
        {LOGIN_METHODS.map((m) => (
          <div
            key={m.key}
            className={'authx-method-card' + (method === m.key ? ' active' : '')}
            onClick={() => handleMethodChange(m.key)}
          >
            <div className="ic">{m.icon}</div>
            <div className="t">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="authx-field-label">
        {method === 'email' ? 'Email address' : method === 'phone' ? 'Phone number' : 'Flowify ID'}
      </div>
      {method === 'email' && (
        <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="you@example.com" />
      )}
      {method === 'phone' && <PhoneField value={identifier} onChange={setIdentifier} />}
      {method === 'flowid' && (
        <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="AB-1234" />
      )}

      <div className="authx-field-label">Password</div>
      <PasswordField value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" />
      <div className="authx-row-between">
        <span />
        <span className="authx-forgot-link" onClick={onForgot}>Forgot password?</span>
      </div>

      {error && <div className="authx-error">{error}</div>}

      <button className="authx-primary-btn" disabled={!canLogin || loading} onClick={handleLogin}>
        {loading ? 'Logging in…' : 'Log in'}
      </button>
      <div className="authx-secondary-link" onClick={onSignup}>New to Flowify? <b>Create an account</b></div>
      <div className="authx-secondary-link" onClick={onBack}>← Back</div>
    </AuthCard>
  )
}

function ForgotScreen({ onBackToLogin }) {
  const [step, setStep] = useState('request') // 'request' | 'otp'
  const [method, setMethod] = useState('email')
  const [contact, setContact] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = method === 'email' ? contact.trim().includes('@') : contact.replace(/\D/g, '').length >= 6

  async function sendCode() {
    setError('')
    const trimmed = contact.trim()
    if (!canSend) return
    setLoading(true)
    // shouldCreateUser: false — this is "I forgot my password", not signup,
    // so a mistyped/unknown contact should fail rather than create an account.
    const { error } = await supabase.auth.signInWithOtp(
      method === 'email' ? { email: trimmed, options: { shouldCreateUser: false } } : { phone: trimmed, options: { shouldCreateUser: false } }
    )
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('otp')
  }

  async function verifyCode() {
    setError('')
    const token = otp.join('')
    if (token.length !== 6) {
      setError('Enter all 6 digits.')
      return
    }
    setLoading(true)
    // Set the flag BEFORE verifying — the moment verifyOtp succeeds, App.jsx
    // sees a new session and re-renders; this flag is what tells it to show
    // "set a new password" instead of dropping straight into the app.
    try {
      sessionStorage.setItem(PASSWORD_RESET_PENDING_KEY, '1')
    } catch {
      // Private browsing / storage disabled — the reset will still work,
      // it'll just also drop them into the app; they can change it from Profile.
    }
    const { error } = await supabase.auth.verifyOtp(
      method === 'email' ? { email: contact.trim(), token, type: 'email' } : { phone: contact.trim(), token, type: 'sms' }
    )
    setLoading(false)
    if (error) {
      try {
        sessionStorage.removeItem(PASSWORD_RESET_PENDING_KEY)
      } catch {
        // ignore
      }
      setError(error.message)
    }
    // On success, App.jsx takes over and shows PasswordReset.jsx.
  }

  return (
    <AuthCard>
      {step === 'request' && (
        <>
          <h2>Reset your password</h2>
          <p className="authx-sub">Tell us the email or phone number on your account and we'll send a one-time code.</p>

          <div className="authx-method-row">
            <div
              className={'authx-method-card' + (method === 'email' ? ' active' : '')}
              onClick={() => { setMethod('email'); setContact('') }}
            >
              <div className="ic">📧</div>
              <div className="t">Email</div>
            </div>
            <div
              className={'authx-method-card' + (method === 'phone' ? ' active' : '')}
              onClick={() => { setMethod('phone'); setContact('+91') }}
            >
              <div className="ic">📱</div>
              <div className="t">Phone number</div>
            </div>
          </div>

          <div className="authx-field-label">{method === 'email' ? 'Email address' : 'Phone number'}</div>
          {method === 'email' ? (
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com" />
          ) : (
            <PhoneField value={contact} onChange={setContact} />
          )}

          {error && <div className="authx-error">{error}</div>}

          <button className="authx-primary-btn" disabled={!canSend || loading} onClick={sendCode}>
            {loading ? 'Sending…' : 'Send code'}
          </button>
          <div className="authx-secondary-link" onClick={onBackToLogin}><b>Back to log in</b></div>
        </>
      )}

      {step === 'otp' && (
        <>
          <h2>Enter the code</h2>
          <p className="authx-sub">We sent a 6-digit code — enter it below to continue.</p>

          <OtpInputs values={otp} onChange={setOtp} />
          <div className="authx-otp-hint">
            Didn't get it? <a onClick={sendCode}>Resend code</a>
          </div>

          {error && <div className="authx-error">{error}</div>}

          <button className="authx-primary-btn" disabled={loading} onClick={verifyCode}>
            {loading ? 'Verifying…' : 'Verify code'}
          </button>
        </>
      )}
    </AuthCard>
  )
}
