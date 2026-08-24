import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { PasswordField } from './AuthWidgets'

const THEMES = [
  { key: 'ocean', label: 'Ocean', swatch: '#1f8a8c' },
  { key: 'forest', label: 'Forest', swatch: '#4c7a3f' },
  { key: 'sky', label: 'Sky', swatch: '#2f8fd0' },
  { key: 'dark', label: 'Dark', swatch: '#35b0ac' },
]

function initial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

// The slide-over profile panel opened from the sidebar's account menu —
// view/edit your name and picture, your Flowify ID (the short handle people
// use to add you), your theme, change your password, and log out. Account
// ID (the underlying UUID) is shown read-only for reference/support, never
// editable — every habit, message, and contact link in the database points
// to it, so letting it change would break those connections. The Flowify ID
// is the separate, editable, shareable one.
export default function ProfilePanel({ profile, theme, onChangeTheme, onUpdateProfile, initialEdit, onClose }) {
  const [editingName, setEditingName] = useState(!!initialEdit)
  const [nameDraft, setNameDraft] = useState(profile.display_name)

  const [editingId, setEditingId] = useState(false)
  const [idDraft, setIdDraft] = useState(profile.flow_id)
  const [idStatus, setIdStatus] = useState('ok')
  const [idSaving, setIdSaving] = useState(false)

  const [pwOpen, setPwOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwNew2, setPwNew2] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const fileRef = useRef(null)
  const idCheckTimer = useRef(null)
  const idPattern = /^[A-Za-z0-9_-]{3,24}$/

  useEffect(() => () => clearTimeout(idCheckTimer.current), [])

  function toast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2400)
  }

  async function saveName() {
    const trimmed = nameDraft.trim()
    if (!trimmed) return
    setEditingName(false)
    onUpdateProfile({ display_name: trimmed })
    await supabase.from('profiles').update({ display_name: trimmed }).eq('id', profile.id)
    toast('Name updated')
  }

  function checkIdAvailability(value) {
    setIdDraft(value)
    if (!idPattern.test(value)) {
      setIdStatus('invalid')
      return
    }
    setIdStatus('checking')
    clearTimeout(idCheckTimer.current)
    idCheckTimer.current = setTimeout(async () => {
      if (value.toLowerCase() === profile.flow_id.toLowerCase()) {
        setIdStatus('ok')
        return
      }
      const { data } = await supabase.from('profiles').select('id').ilike('flow_id', value).maybeSingle()
      setIdStatus(data ? 'taken' : 'ok')
    }, 400)
  }

  async function saveFlowId() {
    if (idStatus !== 'ok') return
    setIdSaving(true)
    const { error } = await supabase.from('profiles').update({ flow_id: idDraft }).eq('id', profile.id)
    setIdSaving(false)
    if (error) {
      toast(error.code === '23505' ? 'That ID was just taken — try another.' : 'Could not update your Flowify ID.')
      return
    }
    onUpdateProfile({ flow_id: idDraft })
    setEditingId(false)
    toast('Flowify ID updated')
  }

  async function savePassword() {
    setPwError('')
    if (pwNew.length < 8) {
      setPwError('New password needs to be at least 8 characters.')
      return
    }
    if (pwNew !== pwNew2) {
      setPwError("Passwords don't match.")
      return
    }
    setPwSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const email = userData?.user?.email
    if (email) {
      // Confirm the current password is right before changing anything —
      // Supabase has no direct "verify current password" call, so
      // re-authenticating with it is the standard way to check.
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: pwCurrent })
      if (reauthError) {
        setPwSaving(false)
        setPwError('Current password is incorrect.')
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setPwSaving(false)
    if (error) {
      setPwError(error.message)
      return
    }
    setPwOpen(false)
    setPwCurrent('')
    setPwNew('')
    setPwNew2('')
    toast('Password updated')
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    const path = `${profile.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) {
      setUploading(false)
      toast('Could not upload that picture.')
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = data?.publicUrl
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    onUpdateProfile({ avatar_url: publicUrl })
    setUploading(false)
    toast('Photo updated')
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="profile-panel">
        <button className="panel-close" onClick={onClose}>✕</button>

        <div className="profile-head">
          <div className="profile-avatar-wrap">
            {profile.avatar_url ? (
              <img className="profile-avatar-img" src={profile.avatar_url} alt="" />
            ) : (
              <div className="profile-avatar">{initial(profile.display_name)}</div>
            )}
            <button className="avatar-edit-btn" title="Change picture" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '…' : '📷'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarPick} />
          </div>

          {!editingName ? (
            <div className="profile-name-row">
              <h2>{profile.display_name}</h2>
              <button className="name-edit-btn" title="Edit name" onClick={() => { setNameDraft(profile.display_name); setEditingName(true) }}>✎</button>
            </div>
          ) : (
            <div className="name-edit-row">
              <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={40} autoFocus />
              <button className="name-save-btn" onClick={saveName}>Save</button>
              <button className="name-cancel-btn" onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          )}
        </div>

        <div className="profile-field">
          <div className="profile-field-label">🔗 Flowify ID</div>
          {!editingId ? (
            <div className="profile-id-row">
              <code>@{profile.flow_id}</code>
              <button className="id-copy-btn" onClick={() => { setIdDraft(profile.flow_id); setIdStatus('ok'); setEditingId(true) }}>Change</button>
            </div>
          ) : (
            <>
              <div className="authx-id-check-row">
                <input type="text" value={idDraft} onChange={(e) => checkIdAvailability(e.target.value)} maxLength={24} autoFocus />
                <span className={'authx-id-status ' + (idStatus === 'ok' ? 'ok' : idStatus === 'checking' ? 'checking' : 'taken')}>
                  {idStatus === 'ok' && '✓ Available'}
                  {idStatus === 'checking' && 'Checking…'}
                  {idStatus === 'taken' && '✕ Taken'}
                  {idStatus === 'invalid' && '3–24 chars'}
                </span>
              </div>
              <div className="profile-modal-actions">
                <button className="name-cancel-btn" onClick={() => setEditingId(false)}>Cancel</button>
                <button className="name-save-btn" disabled={idStatus !== 'ok' || idSaving} onClick={saveFlowId}>
                  {idSaving ? 'Saving…' : 'Save ID'}
                </button>
              </div>
            </>
          )}
          <div className="id-helper-text">Share this instead of the Account ID below — it's the same idea, just easier to type.</div>
        </div>

        <div className="profile-field">
          <div className="profile-field-label">Account ID</div>
          <div className="profile-id-row muted">
            <code>{profile.id}</code>
            <button
              className="id-copy-btn"
              onClick={() => {
                navigator.clipboard?.writeText(profile.id)
                toast('Account ID copied')
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <div className="panel-divider" />

        <div className="profile-field">
          <div className="profile-field-label">Theme</div>
          <div className="profile-theme-row">
            {THEMES.map((t) => (
              <button
                key={t.key}
                className={'profile-theme-swatch' + (theme === t.key ? ' active' : '')}
                style={{ background: t.swatch }}
                onClick={() => onChangeTheme(t.key)}
                title={t.label}
                aria-label={`Switch to ${t.label} theme`}
              />
            ))}
          </div>
        </div>

        <div className="panel-divider" />

        <div className="profile-actions">
          <button className="profile-action-btn" onClick={() => setPwOpen(true)}>🔒 Change password</button>
          <button className="profile-action-btn logout" onClick={() => supabase.auth.signOut()}>🚪 Log out</button>
        </div>

        {pwOpen && (
          <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPwOpen(false) }}>
            <div className="modal-card">
              <h3>Change your password</h3>
              <p className="sub">Enter your current password, then choose a new one.</p>

              <div className="authx-field-label" style={{ marginTop: 0 }}>Current password</div>
              <PasswordField value={pwCurrent} onChange={setPwCurrent} autoComplete="current-password" />

              <div className="authx-field-label">New password</div>
              <PasswordField value={pwNew} onChange={setPwNew} placeholder="At least 8 characters" autoComplete="new-password" />

              <div className="authx-field-label">Confirm new password</div>
              <PasswordField value={pwNew2} onChange={setPwNew2} placeholder="Type it again" autoComplete="new-password" />

              {pwError && <div className="authx-error">{pwError}</div>}

              <div className="modal-actions">
                <button className="modal-cancel" onClick={() => setPwOpen(false)}>Cancel</button>
                <button className="modal-confirm" disabled={pwSaving} onClick={savePassword}>
                  {pwSaving ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </>
  )
}
