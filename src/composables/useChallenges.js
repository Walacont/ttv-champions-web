import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useChallenges() {
  const loading = ref(false)
  const error = ref(null)

  // Get active challenges
  async function getActiveChallenges() {
    loading.value = true
    error.value = null
    try {
      const now = new Date().toISOString()
      const { data, error: err } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', now)
        .gte('end_date', now)
        .order('end_date', { ascending: true })

      if (err) throw err
      return data || []
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Get challenge by ID
  async function getChallenge(challengeId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challengeId)
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

  // Get player's challenge progress
  async function getPlayerProgress(userId, challengeId = null) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('challenge_progress')
        .select(`
          *,
          challenge:challenges(*)
        `)
        .eq('user_id', userId)

      if (challengeId) {
        query = query.eq('challenge_id', challengeId)
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

  // Update challenge progress
  async function updateProgress(userId, challengeId, progress) {
    loading.value = true
    error.value = null
    try {
      // Check if progress entry exists
      const { data: existing } = await supabase
        .from('challenge_progress')
        .select('id, current_progress')
        .eq('user_id', userId)
        .eq('challenge_id', challengeId)
        .single()

      if (existing) {
        // Update existing
        const { data, error: err } = await supabase
          .from('challenge_progress')
          .update({
            current_progress: progress,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (err) throw err
        return data
      } else {
        // Create new
        const { data, error: err } = await supabase
          .from('challenge_progress')
          .insert({
            user_id: userId,
            challenge_id: challengeId,
            current_progress: progress,
            created_at: new Date().toISOString()
          })
          .select()
          .single()

        if (err) throw err
        return data
      }
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Complete challenge milestone
  async function completeMilestone(userId, challengeId, milestoneId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('challenge_completions')
        .insert({
          user_id: userId,
          challenge_id: challengeId,
          milestone_id: milestoneId,
          completed_at: new Date().toISOString()
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

  // Get player's completed milestones
  async function getCompletedMilestones(userId, challengeId = null) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('challenge_completions')
        .select('*')
        .eq('user_id', userId)

      if (challengeId) {
        query = query.eq('challenge_id', challengeId)
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

  // Create challenge (admin/coach)
  async function createChallenge(challengeData) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('challenges')
        .insert({
          ...challengeData,
          is_active: true,
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

  return {
    loading,
    error,
    getActiveChallenges,
    getChallenge,
    getPlayerProgress,
    updateProgress,
    completeMilestone,
    getCompletedMilestones,
    createChallenge
  }
}
