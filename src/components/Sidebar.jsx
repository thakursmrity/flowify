import { supabase } from '../supabaseClient'

const NAV_ITEMS = [
  { key: 'today', label: 'Today', icon: '☀' },
  { key: 'tasks', label: 'Tasks & Habits', icon: '✓' },
  { key: 'goals', label: 'Goals', icon: '◎' },
  { key: 'messages', label: 'Current & Sync', icon: '∿' },
]

// Left-hand app nav, always visible. Switches which main view is shown,
// carries the signed-in user's identity + sign-out control, and can be
// collapsed down to just icons to give the main view more room. The
// collapse/expand handle floats on the seam between the nav and the main
// view (top-right edge of the sidebar), like a drawer being pushed in or
// pulled back out.
export default function Sidebar({ profile, view, onChangeView, collapsed, onToggleCollapsed }) {
  return (
    <div className={'app-nav' + (collapsed ? ' collapsed' : '')}>
      <button
        className="app-nav-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <div className="app-nav-header">
        {!collapsed && <div className="app-nav-brand">Flowify</div>}
      </div>

      <nav className="app-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={'app-nav-item' + (view === item.key ? ' active' : '')}
            onClick={() => onChangeView(item.key)}
            title={collapsed ? item.label : undefined}
          >
            <span className="app-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <div className="app-nav-footer">
        <div className="app-nav-user">
          <div className="avatar" title={collapsed ? profile.display_name : undefined}>
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div>
              <div className="app-nav-name">{profile.display_name}</div>
              <div className="app-nav-id">{profile.flow_id}</div>
            </div>
          )}
        </div>
        <button
          className="link-button"
          onClick={() => supabase.auth.signOut()}
          title={collapsed ? 'Sign out' : undefined}
        >
          {collapsed ? '⏻' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
