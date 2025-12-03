import { ref, computed } from 'vue'
import { supabase } from './useSupabase'

export function useSeason() {
  const loading = ref(false)
  const error = ref(null)
  const currentSeason = ref(null)

  // Get current season
  async function getCurrentSeason() {
    loading.value = true
    error.value = null
    try {
      const now = new Date().toISOString()
      const { data, error: err } = await supabase
        .from('seasons')
        .select('*')
        .lte('start_date', now)
        .gte('end_date', now)
        .single()

      if (err && err.code !== 'PGRST116') throw err
      currentSeason.value = data
      return data
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Calculate days until season end
  function getSeasonCountdown() {
    if (!currentSeason.value) return null

    const endDate = new Date(currentSeason.value.end_date)
    const now = new Date()
    const diffTime = endDate - now
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) return 'Saison beendet'
    if (diffDays === 1) return '1 Tag'
    return `${diffDays} Tage`
  }

  // Get season history
  async function getSeasonHistory() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false })

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get season winners
  async function getSeasonWinners(seasonId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('season_winners')
        .select(`
          *,
          player:profiles(id, display_name, avatar_url)
        `)
        .eq('season_id', seasonId)
        .order('rank', { ascending: true })

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
    currentSeason,
    getCurrentSeason,
    getSeasonCountdown,
    getSeasonHistory,
    getSeasonWinners
  }
}
