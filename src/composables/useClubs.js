import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useClubs() {
  const loading = ref(false)
  const error = ref(null)

  // Get club by ID
  async function getClub(clubId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
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

  // Get all clubs
  async function getAllClubs() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('clubs')
        .select('*')
        .order('name', { ascending: true })

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Search clubs
  async function searchClubs(searchTerm) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('clubs')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .limit(10)

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get club subgroups
  async function getSubgroups(clubId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('subgroups')
        .select('*')
        .eq('club_id', clubId)
        .order('name', { ascending: true })

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get club statistics
  async function getClubStats(clubId) {
    loading.value = true
    error.value = null
    try {
      // Get member count
      const { count: memberCount, error: memberErr } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', clubId)

      if (memberErr) throw memberErr

      // Get total XP
      const { data: xpData, error: xpErr } = await supabase
        .from('profiles')
        .select('total_xp')
        .eq('club_id', clubId)

      if (xpErr) throw xpErr

      const totalXp = (xpData || []).reduce((sum, p) => sum + (p.total_xp || 0), 0)

      // Get match count
      const { count: matchCount, error: matchErr } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', clubId)

      if (matchErr) throw matchErr

      return {
        memberCount: memberCount || 0,
        totalXp,
        matchCount: matchCount || 0
      }
    } catch (err) {
      error.value = err.message
      return { memberCount: 0, totalXp: 0, matchCount: 0 }
    } finally {
      loading.value = false
    }
  }

  // Request to join club
  async function requestJoinClub(userId, clubId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('club_requests')
        .insert({
          user_id: userId,
          club_id: clubId,
          status: 'pending',
          created_at: new Date().toISOString()
        })
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

  // Get pending club requests (for coach)
  async function getPendingRequests(clubId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('club_requests')
        .select(`
          *,
          user:profiles(id, display_name, email, avatar_url)
        `)
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Accept club request
  async function acceptRequest(requestId, userId, clubId) {
    loading.value = true
    error.value = null
    try {
      // Update request status
      const { error: requestErr } = await supabase
        .from('club_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (requestErr) throw requestErr

      // Update user's club
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ club_id: clubId, updated_at: new Date().toISOString() })
        .eq('id', userId)

      if (profileErr) throw profileErr

      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  // Reject club request
  async function rejectRequest(requestId) {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('club_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (err) throw err
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    getClub,
    getAllClubs,
    searchClubs,
    getSubgroups,
    getClubStats,
    requestJoinClub,
    getPendingRequests,
    acceptRequest,
    rejectRequest
  }
}
