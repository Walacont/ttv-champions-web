import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qdpmvxfhgtssbpgmxuyf.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcG12eGZoZ3Rzc2JwZ214dXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMxNzIyMzcsImV4cCI6MjA0ODc0ODIzN30.GRTdLtBwhsuqwwsRJmCdhU70mjyWyduXS48lrNKt1c8'

// Create Supabase client singleton
let supabaseInstance = null

export function useSupabase() {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
    })
  }

  return supabaseInstance
}

// Export the instance directly for convenience
export const supabase = useSupabase()
