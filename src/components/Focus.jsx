import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO, addDays, computeStreak } from '../lib/dates'
import { quoteOfTheDay } from '../lib/quotes'

const DURATIONS = [15, 25, 45]

// A simple Pomodoro-style timer. Finishing a session (or the timer running
// out) logs a row to focus_sessions, which is what the daily/weekly totals
// and streak below are built from — same table Today reads for its Focus
// card. Attaching a session to a task is optional and just for later
// reporting, it doesn't change how the timer behaves.
export default function Focus({ profile }) {
  const today = todayISO()
  const [durationMin, setDurationMin] = useState(25)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [sessions, setSessions] = useState([])
  const [tasks, setTasks] = useState([])
  const [attachTaskId, setAttachTaskId] = useState('')
  const [loading, setLoading] = useState(true)
  const [justLogged, setJustLogged] = useState(false)

  const startedAtRef = useRef(null)
  const intervalRef = useRef(null)

  async function load() {
    setLoading(true)
    const [sessionRes, taskRes] = await Promise.all([
      supabase
        .from('focus_sessions')
        .select('id, minutes, started_at')
        .eq('user_id', profile.id)
        .order('started_at', { ascending: false })
        .limit(200),
      supabase
        .from('tasks')
        .select('id, title')
        .eq('user_id', profile.id)
        .eq('status', 'todo')
        .order('created_at', { ascending: false }),
    ])
    setSessions(sessionRes.data ?? [])
    setTasks(taskRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          finishSession()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function selectDuration(min) {
    if (running) return
    setDurationMin(min)
    setSecondsLeft(min * 60)
  }

  function start() {
    startedAtRef.current = new Date()
    setRunning(true)
  }

  function pause() {
    setRunning(false)
  }

  function reset() {
    setRunning(false)
    setSecondsLeft(durationMin * 60)
  }

  async function finishSession() {
    setRunning(false)
    const startedAt = startedAtRef.current ?? new Date()
    const { data, error } = await supabase
      .from('focus_sessions')
      .insert({
        user_id: profile.id,
        minutes: durationMin,
        started_at: startedAt.toISOString(),
        task_id: attachTaskId || null,
      })
      .select()
      .single()
    if (!error && data) {
      setSessions((prev) => [data, ...prev])
      setJustLogged(true)
      setTimeout(() => setJustLogged(false), 4000)
    }
    setSecondsLeft(durationMin * 60)
  }

  const todayMinutes = sessions
    .filter((s) => s.started_at.slice(0, 10) === today)
    .reduce((sum, s) => sum + s.minutes, 0)

  const weekStart = addDays(today, -6)
  const weekMinutes = sessions
    .filter((s) => s.started_at.slice(0, 10) >= weekStart)
    .reduce((sum, s) => sum + s.minutes, 0)

  const loggedDates = new Set(sessions.map((s) => s.started_at.slice(0, 10)))
  const streak = computeStreak(loggedDates, today)

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="view-page">
      <h1>Focus</h1>
      <p className="view-subtitle">A quiet space to get one thing done.</p>

      <div className="focus-hero">
        <div className="focus-quote">"{quoteOfTheDay()}"</div>
        <div className="focus-timer">
          {mm}:{ss}
        </div>

        <div className="focus-duration-row">
          {DURATIONS.map((d) => (
            <button
              key={d}
              className={'focus-duration-btn' + (durationMin === d ? ' active' : '')}
              onClick={() => selectDuration(d)}
              disabled={running}
            >
              {d} min
            </button>
          ))}
        </div>

        {tasks.length > 0 && (
          <select
            className="focus-task-select"
            value={attachTaskId}
            onChange={(e) => setAttachTaskId(e.target.value)}
            disabled={running}
          >
            <option value="">No task attached</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}

        <div className="focus-controls">
          {!running ? (
            <button className="focus-btn" onClick={start}>
              Start focus session
            </button>
          ) : (
            <button className="focus-btn" onClick={pause}>
              Pause
            </button>
          )}
          <button className="focus-btn secondary" onClick={reset} disabled={running}>
            Reset
          </button>
        </div>

        {justLogged && <div className="focus-logged">Session logged, nice work.</div>}
      </div>

      <div className="card card-wide card-accent-personal">
        <div className="card-head">
          <h3>Your focus log</h3>
          <span className="layer-tag">Personal</span>
        </div>
        {loading ? (
          <div className="empty-hint">Loading...</div>
        ) : (
          <div className="focus-stats-row">
            <div>
              <div className="focus-stat-num">{todayMinutes}m</div>
              <div className="focus-stat-label">Today</div>
            </div>
            <div>
              <div className="focus-stat-num">{weekMinutes}m</div>
              <div className="focus-stat-label">This week</div>
            </div>
            <div>
              <div className="focus-stat-num">{streak}</div>
              <div className="focus-stat-label">Day streak</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
