// Small date helpers shared by Habits, Today, and Focus — all three need
// "today" as a plain ISO date string, the ability to shift by N days, and a
// consistent streak calculation.

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Current streak = consecutive logged days ending today (if today is
// already logged) or ending yesterday (if today just hasn't happened yet —
// we don't want a streak to visually die the moment you wake up).
export function computeStreak(logDates, today) {
  const set = logDates instanceof Set ? logDates : new Set(logDates)
  let cursor = set.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}

// Longest run of consecutive logged days ever, not just the one ending
// today/yesterday. Used for the "best streak" stat next to the live one.
export function bestStreak(logDates) {
  const sorted = [...(logDates instanceof Set ? logDates : new Set(logDates))].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

// Calendar-month grid as a flat array of ISO date strings (or null for the
// leading/trailing blanks), always a multiple of 7 long so it renders as
// whole weeks. Shared by anything that draws a real month calendar (Tasks,
// Habits) instead of an abstract heatmap.
export function monthCells(year, month) {
  const startWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startWeekday; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
