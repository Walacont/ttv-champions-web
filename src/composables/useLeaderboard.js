import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useLeaderboard() {
  const loading = ref(false)
  const error = ref(null)

  // Get leaderboard by type
  async function getLeaderboard(type, options = {}) {
    loading.value = true
    error.value = null
    try {
      let orderBy = 'total_xp'
      switch (type) {
        case 'xp':
        case 'effort':
          orderBy = 'total_xp'
          break
        case 'elo':
        case 'skill':
          orderBy = 'elo_rating'
          break
        case 'points':
        case 'season':
          orderBy = 'total_points'
          break
      }

      let query = supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, avatar_url, total_xp, elo_rating, total_points, club_id, gender')
        .order(orderBy, { ascending: false })

      if (options.clubId && options.clubId !== 'global') {
        query = query.eq('club_id', options.clubId)
      }

      if (options.gender && options.gender !== 'all') {
        query = query.eq('gender', options.gender)
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      const { data, error: err } = await query
      if (err) throw err

      // Add rank
      return (data || []).map((player, index) => ({
        ...player,
        rank: index + 1
      }))
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get XP leaderboard
  async function getXpLeaderboard(options = {}) {
    return getLeaderboard('xp', options)
  }

  // Get Elo leaderboard
  async function getEloLeaderboard(options = {}) {
    return getLeaderboard('elo', options)
  }

  // Get Season Points leaderboard
  async function getPointsLeaderboard(options = {}) {
    return getLeaderboard('points', options)
  }

  // Get doubles leaderboard
  async function getDoublesLeaderboard(options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('doubles_pairings')
        .select(`
          *,
          player1:profiles!doubles_pairings_player1_id_fkey(id, display_name, avatar_url),
          player2:profiles!doubles_pairings_player2_id_fkey(id, display_name, avatar_url)
        `)
        .order('elo_rating', { ascending: false })

      if (options.clubId && options.clubId !== 'global') {
        query = query.eq('club_id', options.clubId)
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      const { data, error: err } = await query
      if (err) throw err

      return (data || []).map((pairing, index) => ({
        ...pairing,
        rank: index + 1
      }))
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get player's rank in leaderboard
  async function getPlayerRank(userId, type, options = {}) {
    const leaderboard = await getLeaderboard(type, { ...options, limit: null })
    const playerIndex = leaderboard.findIndex(p => p.id === userId)
    return playerIndex >= 0 ? playerIndex + 1 : null
  }

  // Get ranks leaderboard (by XP level/rank name)
  async function getRanksLeaderboard(options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('profiles')
        .select('id, display_name, first_name, last_name, avatar_url, total_xp, rank_name, club_id, gender')
        .order('total_xp', { ascending: false })

      if (options.clubId && options.clubId !== 'global') {
        query = query.eq('club_id', options.clubId)
      }

      if (options.gender && options.gender !== 'all') {
        query = query.eq('gender', options.gender)
      }

      if (options.limit) {
        query = query.limit(options.limit)
      }

      const { data, error: err } = await query
      if (err) throw err

      return (data || []).map((player, index) => ({
        ...player,
        rank: index + 1
      }))
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
    getLeaderboard,
    getXpLeaderboard,
    getEloLeaderboard,
    getPointsLeaderboard,
    getDoublesLeaderboard,
    getPlayerRank,
    getRanksLeaderboard
  }
}
