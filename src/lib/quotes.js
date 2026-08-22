// A rotating "quote of the day" for Focus and Today, same quote all day
// (indexed off the calendar day), rather than a new one on every render.
export const QUOTES = [
  'Small steps, repeated daily, outrun big plans done once.',
  'Discipline is choosing between what you want now and what you want most.',
  'You do not rise to the level of your goals, you fall to the level of your systems.',
  'Done is better than perfect, and today is better than someday.',
  'A little progress each day adds up to big results.',
  'Focus on being productive instead of busy.',
  'The secret of getting ahead is getting started.',
  'Consistency is what transforms average into excellence.',
  'One day or day one, you decide.',
  'Your future is created by what you do today, not tomorrow.',
]

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date - start
  return Math.floor(diff / 86400000)
}

export function quoteOfTheDay() {
  const idx = dayOfYear(new Date()) % QUOTES.length
  return QUOTES[idx]
}
