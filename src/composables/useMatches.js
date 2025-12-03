import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useMatches() {
  const loading = ref(false)
  const error = ref(null)

  // Create match request
  async function createMatchRequest(requestData) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('match_requests')
        .insert({
          ...requestData,
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

  // Get pending match requests for user
  async function getPendingRequests(userId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('match_requests')
        .select(`
          *,
          player_a:profiles!match_requests_player_a_id_fkey(id, display_name, elo_rating, avatar_url),
          player_b:profiles!match_requests_player_b_id_fkey(id, display_name, elo_rating, avatar_url)
        `)
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
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

  // Get match history for user
  async function getMatchHistory(userId, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('matches')
        .select(`
          *,
          player_a:profiles!matches_player_a_id_fkey(id, display_name, elo_rating, avatar_url),
          player_b:profiles!matches_player_b_id_fkey(id, display_name, elo_rating, avatar_url)
        `)
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
        .order('played_at', { ascending: false })

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

  // Accept match request
  async function acceptMatchRequest(requestId, userId) {
    loading.value = true
    error.value = null
    try {
      // Get the request first
      const { data: request, error: fetchErr } = await supabase
        .from('match_requests')
        .select('*')
        .eq('id', requestId)
        .single()

      if (fetchErr) throw fetchErr

      // Create the match
      const { data: match, error: matchErr } = await supabase
        .from('matches')
        .insert({
          player_a_id: request.player_a_id,
          player_b_id: request.player_b_id,
          score_a: request.score_a,
          score_b: request.score_b,
          sets: request.sets,
          match_type: request.match_type || 'singles',
          match_mode: request.match_mode || 'best-of-5',
          winner_id: request.score_a > request.score_b ? request.player_a_id : request.player_b_id,
          played_at: new Date().toISOString(),
          club_id: request.club_id
        })
        .select()
        .single()

      if (matchErr) throw matchErr

      // Update request status
      const { error: updateErr } = await supabase
        .from('match_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateErr) throw updateErr

      return match
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Reject match request
  async function rejectMatchRequest(requestId) {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('match_requests')
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

  // Get match suggestions (players not played against recently)
  async function getMatchSuggestions(userId, clubId) {
    loading.value = true
    error.value = null
    try {
      // Get club members
      const { data: members, error: membersErr } = await supabase
        .from('profiles')
        .select('id, display_name, elo_rating, avatar_url')
        .eq('club_id', clubId)
        .neq('id', userId)

      if (membersErr) throw membersErr

      // Get recent matches
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: recentMatches, error: matchesErr } = await supabase
        .from('matches')
        .select('player_a_id, player_b_id')
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
        .gte('played_at', thirtyDaysAgo.toISOString())

      if (matchesErr) throw matchesErr

      // Find opponents not played against recently
      const recentOpponents = new Set()
      for (const match of recentMatches || []) {
        if (match.player_a_id === userId) {
          recentOpponents.add(match.player_b_id)
        } else {
          recentOpponents.add(match.player_a_id)
        }
      }

      const suggestions = (members || [])
        .filter(m => !recentOpponents.has(m.id))
        .slice(0, 5)

      return suggestions
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get request history
  async function getRequestHistory(userId, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('match_requests')
        .select(`
          *,
          player_a:profiles!match_requests_player_a_id_fkey(id, display_name, avatar_url),
          player_b:profiles!match_requests_player_b_id_fkey(id, display_name, avatar_url)
        `)
        .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
        .neq('status', 'pending')
        .order('created_at', { ascending: false })

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

  return {
    loading,
    error,
    createMatchRequest,
    getPendingRequests,
    getMatchHistory,
    acceptMatchRequest,
    rejectMatchRequest,
    getMatchSuggestions,
    getRequestHistory
  }
}
