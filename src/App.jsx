import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import ProfileSetup from './components/ProfileSetup'
import Sidebar from './components/Sidebar'
import Today from './components/Today'
import Habits from './components/Habits'
import Tasks from './components/Tasks'
import Goals from './components/Goals'
import MessagesPanel from './components/MessagesPanel'
import './App.css'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(undefined) // undefined = still checking, null = no profile yet
  const [view, setView] = useState('today')
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('flowify-nav-collapsed') === '1'
    } catch {
      return false
    }
  })
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('flowify-theme') || 'ocean'
    } catch {
      return 'ocean'
    }
  })

  function toggleNavCollapsed() {
    setNavCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('flowify-nav-collapsed', next ? '1' : '0')
      } catch {
        // Private browsing / storage disabled — collapsing still works for this session, just won't be remembered.
      }
      return next
    })
  }

  // Applies the active theme to the whole document (every CSS custom
  // property the theme touches lives under `:root[data-theme="..."]`, see
  // App.css), so this one line is what actually re-skins the app.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  async function changeTheme(next) {
    setTheme(next)
    try {
      localStorage.setItem('flowify-theme', next)
    } catch {
      // Private browsing / storage disabled — theme still applies for this session.
    }
    if (profile) {
      setProfile((prev) => (prev ? { ...prev, theme: next } : prev))
      await supabase.from('profiles').update({ theme: next }).eq('id', profile.id)
    }
  }

  // Watch auth state: check for an existing session on load, then keep
  // listening for sign in / sign out events.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  // Once we know who's signed in, look up (or notice the absence of) their
  // profile row — that's what tells us whether to show the "pick a display
  // name" screen. Their saved theme preference (if any) takes over from
  // whatever we guessed from localStorage as soon as it's known.
  useEffect(() => {
    if (!session) return

    let cancelled = false
    async function loadProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, flow_id, display_name, theme')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error(error)
        setProfile(null)
      } else {
        setProfile(data ?? null)
        if (data?.theme) {
          setTheme(data.theme)
          try {
            localStorage.setItem('flowify-theme', data.theme)
          } catch {
            // Private browsing / storage disabled.
          }
        }
      }
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [session])

  if (session === undefined || (session && profile === undefined)) {
    return (
      <div className="auth-screen">
        <div className="empty-hint">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return <Auth />
  }

  if (!profile) {
    return <ProfileSetup userId={session.user.id} onDone={setProfile} />
  }

  return (
    <div className={'app-shell' + (navCollapsed ? ' nav-collapsed' : '')}>
      <Sidebar
        profile={profile}
        view={view}
        onChangeView={setView}
        collapsed={navCollapsed}
        onToggleCollapsed={toggleNavCollapsed}
        theme={theme}
        onChangeTheme={changeTheme}
      />
      <div className="app-main">
        {view === 'today' && <Today profile={profile} />}
        {view === 'habits' && <Habits profile={profile} />}
        {view === 'tasks' && <Tasks profile={profile} />}
        {view === 'goals' && <Goals profile={profile} />}
        {view === 'messages' && <MessagesPanel profile={profile} />}
      </div>
    </div>
  )
}
