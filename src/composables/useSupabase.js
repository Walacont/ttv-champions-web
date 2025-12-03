import { createClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wmrbjuyqgbmvtzrujuxs.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NzkzMzksImV4cCI6MjA4MDI1NTMzOX0.pLAfrsmS8A9FEByMTiMyO4dN-agHd6_aCJuKS9Sn9vw'

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
