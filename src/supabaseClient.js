import { createClient } from '@supabase/supabase-js'

// These come from your .env file (see .env.example) and from the
// environment variables you set in Netlify. Never hardcode real
// values here — the anon key is safe to expose in a browser app
// because Row Level Security (RLS) on the database enforces who
// can actually see or change what.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase env vars. Check your .env file (local) or Netlify environment variables (deployed).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
