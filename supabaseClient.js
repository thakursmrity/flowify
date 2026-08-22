import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // This is the #1 setup mistake — missing or misnamed .env file.
  // eslint-disable-next-line no-console
  console.error(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and anon key, then restart the dev server.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
