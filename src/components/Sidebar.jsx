import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import ProfilePanel from './ProfilePanel'

const NAV_ITEMS = [
  { key: 'today', label: 'Today', icon: '☀', tint: '#c98a2e', tintSoft: '#fdf1de' },
  { key: 'focus', label: 'Focus', icon: '◐', tint: '#6a5acd', tintSoft: '#ece9fb' },
  { key: 'habits', label: 'Habits', icon: '↻', tint: '#2f8f5b', tintSoft: '#e4f4ea' },
  { key: 'journal', label: 'Journal', icon: '✎', tint: '#c0447a', tintSoft: '#fbe8f1' },
  { key: 'tasks', label: 'Tasks', icon: '✓', tint: '#2f5da8', tintSoft: '#e7edfa' },
  { key: 'goals', label: 'Goals', icon: '◎', tint: '#1f8a8c', tintSoft: '#e1f4f3' },
  { key: 'messages', label: 'Messages', icon: '∿', tint: '#863bff', tintSoft: '#f1ecff' },
]

function initial(name) {
  return (name || '?').charAt(0).toUpperCase()
}

// The left-hand nav — a floating "dock" that sits off the edges of the
// screen (round 6 redesign): a slim icon rail by default, pinned open or
// expanded on hover to show labels. Reserves a fixed-width spacer in normal
// document flow so the rest of the app never reflows when it expands — the
// dock itself is a fixed overlay that floats on top instead.
export default function Sidebar({ profile, view, onChangeView, theme, onChangeTheme, onUpdateProfile }) {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem('flowify-nav-pinned') === '1'
    } catch {
      return false
    }
  })
  const [accountOpen, setAccountOpen] = useState(false)
  const [profilePanel, setProfilePanel] = useState(null) // null | { editMode: boolean }
  const [hovered, setHovered] = useState(false)
  const itemsRef = useRef(null)
  const highlightRef = useRef(null)

  // Single source of truth for "is the dock showing its expanded (labels
  // visible) width right now" — driven from React instead of a plain CSS
  // :hover so the reserved spacer next to it can stay in sync. A CSS-only
  // :hover on .dock has no way to also widen its sibling .dock-spacer,
  // which is what let the dock overlap the page content while expanded.
  const expanded = pinned || hovered || accountOpen || !!profilePanel

  function togglePinned() {
    setPinned((prev) => {
      const next = !prev
      try {
        localStorage.setItem('flowify-nav-pinned', next ? '1' : '0')
      } catch {
        // Private browsing / storage disabled — pinning still works this session.
      }
      return next
    })
  }

  useEffect(() => {
    const activeBtn = itemsRef.current?.querySelector('.dock-item.active')
    if (activeBtn && highlightRef.current) {
      highlightRef.current.style.transform = `translateY(${activeBtn.offsetTop}px)`
    }
  }, [view])

  return (
    <>
      <div className={'dock-spacer' + (expanded ? ' expanded' : '')} aria-hidden="true" />
      <nav
        className={'dock' + (pinned ? ' pinned' : '') + (expanded ? ' expanded' : '')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button className="dock-pin" title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'} onClick={togglePinned}>
          📌
        </button>

        <div className="dock-top">
          <div className="brand-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="46" fill="none" viewBox="0 0 48 46">
              <path fill="#863bff" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z" />
            </svg>
          </div>
          <div className="brand-name">Flowify</div>
        </div>

        <div className="dock-items" ref={itemsRef}>
          <div className="dock-highlight" ref={highlightRef} />
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={'dock-item' + (view === item.key ? ' active' : '')}
              style={{ '--tint': item.tint, '--tint-soft': item.tintSoft }}
              onClick={() => onChangeView(item.key)}
            >
              <span className="ic">{item.icon}</span>
              <span className="lbl">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="dock-bottom">
          <button className="dock-account-btn" onClick={() => setAccountOpen((v) => !v)}>
            {profile.avatar_url ? (
              <img className="dock-avatar-img" src={profile.avatar_url} alt="" />
            ) : (
              <div className="dock-avatar">{initial(profile.display_name)}</div>
            )}
            <div className="dock-user">
              <span className="nm">{profile.display_name}</span>
              <span className="plan">@{profile.flow_id}</span>
            </div>
          </button>
        </div>
      </nav>

      {accountOpen && (
        <>
          <div className="account-scrim" onClick={() => setAccountOpen(false)} />
          <div className={'account-popover' + (expanded ? ' expanded' : '')}>
            <div className="account-popover-head">
              {profile.avatar_url ? (
                <img className="account-popover-av-img" src={profile.avatar_url} alt="" />
              ) : (
                <div className="av">{initial(profile.display_name)}</div>
              )}
              <div>
                <div className="nm">{profile.display_name}</div>
                <div className="em">@{profile.flow_id}</div>
              </div>
            </div>
            <div className="account-popover-item" onClick={() => { setAccountOpen(false); setProfilePanel({ editMode: false }) }}>
              <span className="ic">👤</span>View profile
            </div>
            <div className="account-popover-item" onClick={() => { setAccountOpen(false); setProfilePanel({ editMode: true }) }}>
              <span className="ic">✎</span>Edit profile
            </div>
            <div className="account-popover-sep" />
            <div className="account-popover-item danger" onClick={() => supabase.auth.signOut()}>
              <span className="ic">🚪</span>Log out
            </div>
          </div>
        </>
      )}

      {profilePanel && (
        <ProfilePanel
          profile={profile}
          theme={theme}
          onChangeTheme={onChangeTheme}
          onUpdateProfile={onUpdateProfile}
          initialEdit={profilePanel.editMode}
          onClose={() => setProfilePanel(null)}
        />
      )}
    </>
  )
}
