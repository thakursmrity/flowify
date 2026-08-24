import { useRef, useState } from 'react'
import { PHONE_COUNTRIES } from '../lib/authHelpers'

// Small presentational building blocks shared by the signed-out screens
// (AuthFlow.jsx) and the signed-in ones that also touch auth
// (ProfileSetup.jsx, PasswordReset.jsx, ProfilePanel.jsx). Components only —
// see ../lib/authHelpers.js for the plain constants/functions, kept separate
// so fast refresh can do its job on both files.

export function OtpInputs({ values, onChange }) {
  const refs = useRef([])
  return (
    <div className="authx-otp-row">
      {values.map((v, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={v}
          onChange={(e) => {
            const digit = e.target.value.replace(/[^0-9]/g, '').slice(-1)
            const next = [...values]
            next[i] = digit
            onChange(next)
            if (digit && refs.current[i + 1]) refs.current[i + 1].focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !values[i] && refs.current[i - 1]) refs.current[i - 1].focus()
          }}
        />
      ))}
    </div>
  )
}

// A phone number field with its own country-code dropdown, instead of one
// free-text box a person has to remember to prefix with "+" themselves.
// `value`/`onChange` carry the full combined number (e.g. "+919876543210")
// so callers don't need to know anything about country codes — the digits
// shown in the box are just derived from whatever comes after the
// currently-selected country's dial code.
export function PhoneField({ value, onChange }) {
  const [countryIdx, setCountryIdx] = useState(0) // India, first in the list

  const country = PHONE_COUNTRIES[countryIdx]
  const digits = value.startsWith(country.dial) ? value.slice(country.dial.length) : value.replace(/^\+?\d*/, '')

  function handleCountryChange(idx) {
    setCountryIdx(idx)
    onChange(PHONE_COUNTRIES[idx].dial + digits)
  }

  function handleDigitsChange(raw) {
    const nextDigits = raw.replace(/[^0-9]/g, '').slice(0, country.maxDigits)
    onChange(country.dial + nextDigits)
  }

  return (
    <div className="authx-phone-field">
      <select
        className="authx-phone-country"
        value={countryIdx}
        onChange={(e) => handleCountryChange(Number(e.target.value))}
        aria-label="Country code"
      >
        {PHONE_COUNTRIES.map((c, i) => (
          <option key={c.code} value={i}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        className="authx-phone-number"
        value={digits}
        maxLength={country.maxDigits}
        placeholder={'X'.repeat(country.maxDigits)}
        onChange={(e) => handleDigitsChange(e.target.value)}
      />
    </div>
  )
}

export function PasswordField({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="authx-password-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" className="authx-eye-btn" onClick={() => setShow((v) => !v)} tabIndex={-1}>
        {show ? '🙈' : '👁'}
      </button>
    </div>
  )
}

export function Logo() {
  return (
    <div className="authx-logo">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="46" fill="none" viewBox="0 0 48 46">
        <path fill="#863bff" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z" />
      </svg>
      <span>Flowify</span>
    </div>
  )
}

export function AuthCard({ children }) {
  return (
    <div className="authx-wrap authx-blobs">
      <div className="authx-card">
        <Logo />
        {children}
      </div>
    </div>
  )
}
