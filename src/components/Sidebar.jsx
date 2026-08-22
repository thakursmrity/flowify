import { supabase } from '../supabaseClient'

const NAV_ITEMS = [
  { key: 'today', label: 'Today', icon: '☀' },
  { key: 'tasks', label: 'Tasks & Habits', icon: '✓' },
  { key: 'goals', label: 'Goals', icon: '◎' },
  { key: 'messages', label: 'Current & Sync', icon: '∿' },
]

// Left-hand app nav, always visible. Switches which main view is shown and
// carries the signed-in user's identity + sign-out control.
export default function Sidebar({ profile, view, onChangeView }) {
  return (
    <div className="app-nav">
      <div className="app-nav-brand">Flowify</div>

      <nav className="app-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={'app-nav-item' + (view === item.key ? ' active' : '')}
            onClick={() => onChangeView(item.key)}
          >
            <span className="app-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="app-nav-footer">
        <div className="app-nav-user">
          <div className="avatar">{profile.display_name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="app-nav-name">{profile.display_name}</div>
            <div className="app-nav-id">{profile.flow_id}</div>
          </div>
        </div>
        <button className="link-button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
