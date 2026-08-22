import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth'
import ProfileSetup from './components/ProfileSetup'
import Sidebar from './components/Sidebar'
import Today from './components/Today'
import TasksHabits from './components/TasksHabits'
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
  // name" screen.
  useEffect(() => {
    if (!session) return

    let cancelled = false
    async function loadProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, flow_id, display_name')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error(error)
        setProfile(null)
      } else {
        setProfile(data ?? null)
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
      />
      <div className="app-main">
        {view === 'today' && <Today profile={profile} />}
        {view === 'tasks' && <TasksHabits profile={profile} />}
        {view === 'goals' && <Goals profile={profile} />}
        {view === 'messages' && <MessagesPanel profile={profile} />}
      </div>
    </div>
  )
}
