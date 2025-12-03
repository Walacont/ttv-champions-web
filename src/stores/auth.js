import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/composables/useSupabase'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref(null)
  const profile = ref(null)
  const club = ref(null)
  const loading = ref(true)
  const initialized = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!user.value)
  const isCoach = computed(() => profile.value?.role === 'coach' || profile.value?.role === 'admin')
  const isAdmin = computed(() => profile.value?.role === 'admin')
  const displayName = computed(() => profile.value?.display_name || profile.value?.first_name || 'Spieler')
  const avatarUrl = computed(() => profile.value?.avatar_url || null)

  // Actions
  async function initialize() {
    if (initialized.value) return

    try {
      loading.value = true

      // Get current session
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        user.value = session.user
        await loadProfile()
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] State changed:', event)

        if (event === 'SIGNED_IN' && session?.user) {
          user.value = session.user
          await loadProfile()
        } else if (event === 'SIGNED_OUT') {
          user.value = null
          profile.value = null
          club.value = null
        }
      })

      initialized.value = true
    } catch (error) {
      console.error('[Auth] Initialization error:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadProfile() {
    if (!user.value) return

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          club:clubs(id, name)
        `)
        .eq('id', user.value.id)
        .single()

      if (error) throw error

      profile.value = data
      club.value = data.club
    } catch (error) {
      console.error('[Auth] Error loading profile:', error)
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) throw error

    user.value = data.user
    await loadProfile()

    return data
  }

  async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName
        }
      }
    })

    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()

    if (error) throw error

    user.value = null
    profile.value = null
    club.value = null
  }

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) throw error
  }

  async function updateProfile(updates) {
    if (!user.value) return

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.value.id)
      .select()
      .single()

    if (error) throw error

    profile.value = { ...profile.value, ...data }
    return data
  }

  async function refreshProfile() {
    await loadProfile()
  }

  return {
    // State
    user,
    profile,
    club,
    loading,
    initialized,

    // Getters
    isAuthenticated,
    isCoach,
    isAdmin,
    displayName,
    avatarUrl,

    // Actions
    initialize,
    loadProfile,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateProfile,
    refreshProfile
  }
})
