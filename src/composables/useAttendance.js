import { ref } from 'vue'
import { supabase } from './useSupabase'

export function useAttendance() {
  const loading = ref(false)
  const error = ref(null)

  // Get attendance records for user
  async function getAttendance(userId, options = {}) {
    loading.value = true
    error.value = null
    try {
      let query = supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })

      if (options.startDate) {
        query = query.gte('date', options.startDate)
      }

      if (options.endDate) {
        query = query.lte('date', options.endDate)
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

  // Get attendance for a month
  async function getMonthAttendance(userId, year, month) {
    const startDate = new Date(year, month, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

    return getAttendance(userId, { startDate, endDate })
  }

  // Mark attendance
  async function markAttendance(userId, date, status = 'present') {
    loading.value = true
    error.value = null
    try {
      const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date

      // Check if already marked
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', userId)
        .eq('date', dateStr)
        .single()

      if (existing) {
        // Update existing
        const { data, error: err } = await supabase
          .from('attendance')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single()

        if (err) throw err
        return data
      } else {
        // Create new
        const { data, error: err } = await supabase
          .from('attendance')
          .insert({
            user_id: userId,
            date: dateStr,
            status,
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

  // Calculate streaks
  async function calculateStreaks(userId) {
    loading.value = true
    error.value = null
    try {
      const { data: attendance, error: err } = await supabase
        .from('attendance')
        .select('date, status')
        .eq('user_id', userId)
        .eq('status', 'present')
        .order('date', { ascending: false })

      if (err) throw err

      if (!attendance || attendance.length === 0) {
        return { currentStreak: 0, longestStreak: 0, totalDays: 0 }
      }

      const dates = attendance.map(a => new Date(a.date))
      let currentStreak = 0
      let longestStreak = 0
      let tempStreak = 1

      // Calculate current streak (from today backwards)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const sortedDates = dates.sort((a, b) => b - a)

      // Check if most recent attendance is today or yesterday
      const mostRecent = sortedDates[0]
      const daysSinceLast = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24))

      if (daysSinceLast <= 1) {
        currentStreak = 1
        for (let i = 1; i < sortedDates.length; i++) {
          const diff = Math.floor((sortedDates[i - 1] - sortedDates[i]) / (1000 * 60 * 60 * 24))
          if (diff === 1) {
            currentStreak++
          } else {
            break
          }
        }
      }

      // Calculate longest streak
      for (let i = 1; i < sortedDates.length; i++) {
        const diff = Math.floor((sortedDates[i - 1] - sortedDates[i]) / (1000 * 60 * 60 * 24))
        if (diff === 1) {
          tempStreak++
        } else {
          longestStreak = Math.max(longestStreak, tempStreak)
          tempStreak = 1
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak)

      return {
        currentStreak,
        longestStreak,
        totalDays: attendance.length
      }
    } catch (err) {
      error.value = err.message
      return { currentStreak: 0, longestStreak: 0, totalDays: 0 }
    } finally {
      loading.value = false
    }
  }

  // Get training stats for a month
  async function getMonthStats(userId, year, month) {
    const attendance = await getMonthAttendance(userId, year, month)
    const presentDays = attendance.filter(a => a.status === 'present').length
    const missedDays = attendance.filter(a => a.status === 'missed').length

    return {
      presentDays,
      missedDays,
      totalMarked: attendance.length
    }
  }

  // Get training day details
  async function getTrainingDayDetails(userId, date) {
    loading.value = true
    error.value = null
    try {
      const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date

      // Get attendance
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('date', dateStr)
        .single()

      // Get points earned that day
      const { data: points } = await supabase
        .from('points_history')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`)

      return {
        attendance,
        points: points || []
      }
    } catch (err) {
      error.value = err.message
      return { attendance: null, points: [] }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    getAttendance,
    getMonthAttendance,
    markAttendance,
    calculateStreaks,
    getMonthStats,
    getTrainingDayDetails
  }
}
