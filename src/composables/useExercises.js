import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useExercises() {
  const loading = ref(false)
  const error = ref(null)

  // Get all exercises
  async function getExercises(options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (options.tags && options.tags.length > 0) {
        query = query.contains('tags', options.tags)
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

  // Get exercise by ID
  async function getExercise(exerciseId) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('exercises')
        .select('*')
        .eq('id', exerciseId)
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

  // Get all unique tags
  async function getAllTags() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('exercises')
        .select('tags')
        .eq('is_active', true)

      if (err) throw err

      const tagsSet = new Set()
      for (const exercise of data || []) {
        if (exercise.tags) {
          for (const tag of exercise.tags) {
            tagsSet.add(tag)
          }
        }
      }

      return Array.from(tagsSet).sort()
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  // Create exercise (admin/coach)
  async function createExercise(exerciseData) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('exercises')
        .insert({
          ...exerciseData,
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

  // Update exercise (admin/coach)
  async function updateExercise(exerciseId, updates) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('exercises')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', exerciseId)
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

  // Delete exercise (admin)
  async function deleteExercise(exerciseId) {
    loading.value = true
    error.value = null
    try {
      // Soft delete by setting is_active to false
      const { error: err } = await supabase
        .from('exercises')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', exerciseId)

      if (err) throw err
      return true
    } catch (err) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  // Get player's exercise completions
  async function getPlayerCompletions(userId, exerciseId = null) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('exercise_completions')
        .select('*')
        .eq('user_id', userId)

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
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

  // Complete exercise (log completion)
  async function completeExercise(userId, exerciseId, milestoneId = null) {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await supabase
        .from('exercise_completions')
        .insert({
          user_id: userId,
          exercise_id: exerciseId,
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

  return {
    loading,
    error,
    getExercises,
    getExercise,
    getAllTags,
    createExercise,
    updateExercise,
    deleteExercise,
    getPlayerCompletions,
    completeExercise
  }
}
