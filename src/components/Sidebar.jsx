import { supabase } from '../supabaseClient'

const NAV_ITEMS = [
  { key: 'today', label: 'Today', icon: '☀' },
  { key: 'focus', label: 'Focus', icon: '◐' },
  { key: 'habits', label: 'Habits', icon: '↻' },
  { key: 'journal', label: 'Journal', icon: '✎' },
  { key: 'tasks', label: 'Tasks', icon: '✓' },
  { key: 'goals', label: 'Goals', icon: '◎' },
  { key: 'messages', label: 'Messages', icon: '∿' },
]

const THEMES = [
  { key: 'ocean', label: 'Ocean', swatch: '#1f8a8c' },
  { key: 'forest', label: 'Forest', swatch: '#4c7a3f' },
  { key: 'sky', label: 'Sky', swatch: '#2f8fd0' },
  { key: 'dark', label: 'Dark', swatch: '#35b0ac' },
]

// Left-hand app nav, always visible. Switches which main view is shown,
// carries the signed-in user's identity, theme picker, and sign-out control,
// and can be collapsed down to just icons to give the main view more room.
// A couple of items (Focus, Journal) are visible but not built yet, they're
// marked "soon" rather than hidden so the eventual shape of the app is clear.
export default function Sidebar({ profile, view, onChangeView, collapsed, onToggleCollapsed, theme, onChangeTheme }) {
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
            className={'app-nav-item' + (view === item.key ? ' active' : '') + (item.soon ? ' soon' : '')}
            onClick={() => !item.soon && onChangeView(item.key)}
            disabled={item.soon}
            title={collapsed ? item.label + (item.soon ? ' (coming soon)' : '') : undefined}
          >
            <span className="app-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            {!collapsed && (
              <span className="app-nav-item-label">
                {item.label}
                {item.soon && <span className="soon-tag">soon</span>}
              </span>
            )}
          </button>
        ))}
      </nav>

      {!collapsed && (
        <div className="app-nav-theme">
          <div className="app-nav-theme-label">Theme</div>
          <div className="app-nav-theme-row">
            {THEMES.map((t) => (
              <button
                key={t.key}
                className={'theme-swatch' + (theme === t.key ? ' active' : '')}
                style={{ background: t.swatch }}
                onClick={() => onChangeTheme(t.key)}
                aria-label={`Switch to ${t.label} theme`}
                title={t.label}
              />
            ))}
          </div>
        </div>
      )}

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
