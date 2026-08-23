import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { todayISO } from '../lib/dates'

// Tasks lives as a priority Kanban board: Critical / Important / Later /
// Backlog, plus a Done column that's really just "status = done" dressed up
// as a column so finishing a task is as simple as dragging it there. A
// Calendar tab gives the same tasks a date-first view. Collaborative shared
// tasks (a joint task with someone else) and a Tasks-side "Supporting" tab
// are deliberately not part of this round, they need their own sharing
// table the same way Habits just got one.

const COLUMNS = [
  { key: 'critical', label: 'Critical' },
  { key: 'important', label: 'Important' },
  { key: 'later', label: 'Later' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'done', label: 'Done' },
]

function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startWeekday; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export default function Tasks({ profile }) {
  const today = todayISO()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('board') // 'board' | 'calendar'
  const [newTitles, setNewTitles] = useState({})
  const [dragId, setDragId] = useState(null)
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, status, priority')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  async function addTask(columnKey, e) {
    e.preventDefault()
    const title = (newTitles[columnKey] ?? '').trim()
    if (!title) return
    const { data, error } = await supabase
      .from('tasks')
      .insert({ user_id: profile.id, title, priority: columnKey, status: 'todo' })
      .select()
      .single()
    if (!error && data) {
      setTasks((prev) => [data, ...prev])
      setNewTitles((prev) => ({ ...prev, [columnKey]: '' }))
    }
  }

  async function moveTask(id, columnKey) {
    if (!id) return
    if (columnKey === 'done') {
      const completedAt = new Date().toISOString()
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'done', completed_at: completedAt } : t)))
      await supabase.from('tasks').update({ status: 'done', completed_at: completedAt }).eq('id', id)
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'todo', priority: columnKey, completed_at: null } : t))
      )
      await supabase.from('tasks').update({ status: 'todo', priority: columnKey, completed_at: null }).eq('id', id)
    }
    setDragId(null)
  }

  async function deleteTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    await supabase.from('tasks').delete().eq('id', id)
  }

  function columnTasks(columnKey) {
    if (columnKey === 'done') return tasks.filter((t) => t.status === 'done')
    return tasks.filter((t) => t.status !== 'done' && (t.priority ?? 'later') === columnKey)
  }

  const tasksByDate = {}
  for (const t of tasks) {
    if (!t.due_date) continue
    if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = []
    tasksByDate[t.due_date].push(t)
  }

  const weeks = buildMonthGrid(monthCursor.year, monthCursor.month)
  const monthLabel = new Date(monthCursor.year, monthCursor.month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  function shiftMonth(delta) {
    setMonthCursor((prev) => {
      let month = prev.month + delta
      let year = prev.year
      if (month < 0) {
        month = 11
        year -= 1
      } else if (month > 11) {
        month = 0
        year += 1
      }
      return { year, month }
    })
  }

  return (
    <div className="view-page-wide">
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="view-subtitle">
            Drag a card between columns to change priority, or drop it on Done to finish it.
          </p>
        </div>
        <div className="tab-row">
          <button className={'tab-btn' + (tab === 'board' ? ' active' : '')} onClick={() => setTab('board')}>
            Board
          </button>
          <button className={'tab-btn' + (tab === 'calendar' ? ' active' : '')} onClick={() => setTab('calendar')}>
            Calendar
          </button>
        </div>
      </div>

      {tab === 'board' && (
        <div className="board">
          {COLUMNS.map((col) => {
            const items = columnTasks(col.key)
            return (
              <div
                key={col.key}
                className={`column column-${col.key}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  moveTask(dragId, col.key)
                }}
              >
                <div className="column-head">
                  <span className="column-title">{col.label}</span>
                  <span className="column-count">{items.length}</span>
                </div>

                <div className="card-list">
                  {!loading && items.length === 0 && <div className="empty-hint small">Nothing here</div>}
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className={'task-card' + (t.status === 'done' ? ' done' : '')}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                    >
                      <span className="drag-handle" aria-hidden="true">
                        ⋮⋮
                      </span>
                      <span className="card-title">{t.title}</span>
                      {t.due_date && <span className="due-chip">{t.due_date}</span>}
                      <button
                        className="card-delete"
                        onClick={() => deleteTask(t.id)}
                        aria-label={t.status === 'done' ? 'Delete task' : 'Delete task'}
                      >
                        {t.status === 'done' ? '🗑' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>

                {col.key !== 'done' && (
                  <form className="add-task-row" onSubmit={(e) => addTask(col.key, e)}>
                    <input
                      type="text"
                      placeholder="Add a task..."
                      value={newTitles[col.key] ?? ''}
                      onChange={(e) => setNewTitles((prev) => ({ ...prev, [col.key]: e.target.value }))}
                      maxLength={300}
                    />
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'calendar' && (
        <div className="card calendar-card">
          <div className="calendar-head">
            <button className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="calendar-month-label">{monthLabel}</span>
            <button className="cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>

          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}

            {weeks.flat().map((iso, idx) => {
              if (!iso) return <div key={idx} className="cal-day muted" />
              const dayNum = Number(iso.slice(-2))
              const items = tasksByDate[iso] ?? []
              return (
                <div key={iso} className={'cal-day' + (iso === today ? ' today' : '')}>
                  <span className="num">{dayNum}</span>
                  {items.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className={'cal-chip' + (t.priority === 'critical' ? ' crit' : '')}
                      title={t.title}
                    >
                      {t.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className="cal-chip-more">+{items.length - 3} more</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
