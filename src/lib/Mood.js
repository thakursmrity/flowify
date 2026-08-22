// A small, fixed mood vocabulary rather than free text, so it can be
// graphed. Order matters, it's also the display order in the picker.
export const MOOD_OPTIONS = [
  { key: 'rough', label: 'Rough', level: 1 },
  { key: 'low', label: 'Low', level: 2 },
  { key: 'okay', label: 'Okay', level: 3 },
  { key: 'good', label: 'Good', level: 4 },
  { key: 'great', label: 'Great', level: 5 },
]

export function moodLevel(key) {
  const found = MOOD_OPTIONS.find((m) => m.key === key)
  return found ? found.level : 0
}

export function moodLabel(key) {
  const found = MOOD_OPTIONS.find((m) => m.key === key)
  return found ? found.label : ''
}
