import { ref } from 'vue'
import { supabase } from './useSupabase'

export function usePointsHistory() {
  const loading = ref(false)
  const error = ref(null)

  // Get points history for user
  async function getPointsHistory(userId, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('points_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (options.limit) {
        query = query.limit(options.limit)
      }

      if (options.type) {
        query = query.eq('type', options.type)
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

  // Add points entry
  async function addPoints(userId, pointsData) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('points_history')
        .insert({
          user_id: userId,
          ...pointsData,
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

  // Get points summary by type
  async function getPointsSummary(userId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('points_history')
        .select('type, xp_amount, points_amount')
        .eq('user_id', userId)

      if (err) throw err

      const summary = {
        totalXp: 0,
        totalPoints: 0,
        byType: {}
      }

      for (const entry of data || []) {
        summary.totalXp += entry.xp_amount || 0
        summary.totalPoints += entry.points_amount || 0

        if (!summary.byType[entry.type]) {
          summary.byType[entry.type] = { xp: 0, points: 0 }
        }
        summary.byType[entry.type].xp += entry.xp_amount || 0
        summary.byType[entry.type].points += entry.points_amount || 0
      }

      return summary
    } catch (err) {
      error.value = err.message
      return { totalXp: 0, totalPoints: 0, byType: {} }
    } finally {
      loading.value = false
    }
  }

  // Get recent activity (points earned recently)
  async function getRecentActivity(userId, days = 7) {
    loading.value = true
    error.value = null
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const { data, error: err } = await supabase
        .from('points_history')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString())
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

  return {
    loading,
    error,
    getPointsHistory,
    addPoints,
    getPointsSummary,
    getRecentActivity
  }
}
