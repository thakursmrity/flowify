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
