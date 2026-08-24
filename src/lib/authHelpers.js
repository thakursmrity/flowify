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
