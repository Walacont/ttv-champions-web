import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useProfiles() {
  const loading = ref(false)
  const error = ref(null)

  // Get profile by user ID
  async function getProfile(userId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (err) throw err
      return data
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Get profiles by club ID
  async function getClubMembers(clubId, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('club_id', clubId)

      if (options.gender && options.gender !== 'all') {
        query = query.eq('gender', options.gender)
      }

      if (options.subgroupId) {
        query = query.contains('subgroup_ids', [options.subgroupId])
      }

      if (options.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? false })
      }

      const { data, error: err } = await query
      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get all profiles (for global leaderboard)
  async function getAllProfiles(options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase.from('profiles').select('*')

      if (options.gender && options.gender !== 'all') {
        query = query.eq('gender', options.gender)
      }

      if (options.orderBy) {
        query = query.order(options.orderBy, { ascending: options.ascending ?? false })
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      const { data, error: err } = await query
      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Search profiles by name
  async function searchProfiles(searchTerm, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, elo_rating, club_id, avatar_url')
        .or(`display_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)

      if (options.clubId) {
        query = query.eq('club_id', options.clubId)
      }

      if (options.excludeUserId) {
        query = query.neq('id', options.excludeUserId)
      }

      query = query.limit(options.limit || 10)

      const { data, error: err } = await query
      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Update profile
  async function updateProfile(userId, updates) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single()

      if (err) throw err
      return data
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Get rivals (players with similar stats)
  async function getRivals(userId, clubId, options = {}) {
    loading.value = true
    error.value = null
    try {
      const profile = await getProfile(userId)
      if (!profile) return { skillRival: null, effortRival: null }

      // Get club members
      const members = await getClubMembers(clubId)
      const otherMembers = members.filter(m => m.id !== userId)

      // Find skill rival (closest Elo)
      let skillRival = null
      let minEloDiff = Infinity
      for (const member of otherMembers) {
        const diff = Math.abs((member.elo_rating || 1000) - (profile.elo_rating || 1000))
        if (diff < minEloDiff && diff > 0) {
          minEloDiff = diff
          skillRival = member
        }
      }

      // Find effort rival (closest XP, but higher)
      let effortRival = null
      let minXpDiff = Infinity
      for (const member of otherMembers) {
        const memberXp = member.total_xp || 0
        const profileXp = profile.total_xp || 0
        if (memberXp > profileXp) {
          const diff = memberXp - profileXp
          if (diff < minXpDiff) {
            minXpDiff = diff
            effortRival = member
          }
        }
      }

      return { skillRival, effortRival }
    } catch (err) {
      error.value = err.message
      return { skillRival: null, effortRival: null }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    getProfile,
    getClubMembers,
    getAllProfiles,
    searchProfiles,
    updateProfile,
    getRivals
  }
}
