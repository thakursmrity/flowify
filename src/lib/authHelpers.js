// Small plain (non-component) helpers shared across the auth screens — kept
// separate from AuthWidgets.jsx so that file can stay components-only.

// Set by AuthFlow right before it verifies a "forgot password" code —
// verifying signs the person in with their OLD password still active, so
// this flag (not which component happens to be mounted) is what forces
// the "set a new password" screen before they see the rest of the app.
export const PASSWORD_RESET_PENDING_KEY = 'flowify-password-reset-pending'

export function generateFlowIdSuggestion() {
  const letters = Array.from({ length: 2 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
  const digits = String(Math.floor(1000 + Math.random() * 9000))
  return `${letters}-${digits}`
}

// A short, deliberately small list — not every country on earth, just the
// common ones — with how many local digits each expects, so PhoneField's
// number input can be digit-only and capped to a sane length per country
// instead of accepting anything typed. Defaults to India first since
// that's Flowify's primary market.
export const PHONE_COUNTRIES = [
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳', maxDigits: 10 },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', maxDigits: 10 },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', maxDigits: 10 },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦', maxDigits: 10 },
  { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪', maxDigits: 9 },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺', maxDigits: 9 },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬', maxDigits: 8 },
]
