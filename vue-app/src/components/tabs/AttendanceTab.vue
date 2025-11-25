<script setup>
import { ref, computed, watch } from 'vue'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Subgroup filter
const currentSubgroupFilter = ref('all')

// Load subgroups for filter
const subgroupsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'subgroups'),
    where('clubId', '==', userStore.clubId)
  )
})
const subgroups = useCollection(subgroupsQuery)

// Attendance records - FIXED: Use presentPlayerIds array-contains
const attendanceQuery = computed(() => {
  if (!userStore.userData?.id || !userStore.clubId) return null

  const constraints = [
    where('clubId', '==', userStore.clubId),
    where('presentPlayerIds', 'array-contains', userStore.userData.id)
  ]

  // Add subgroup filter if not 'all'
  if (currentSubgroupFilter.value !== 'all') {
    constraints.push(where('subgroupId', '==', currentSubgroupFilter.value))
  }

  return query(collection(db, 'attendance'), ...constraints)
})
const attendanceRecords = useCollection(attendanceQuery)

// Get training dates for stats (last 12 months)
const trainingDates = computed(() => {
  if (!attendanceRecords.value) return []

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]

  return attendanceRecords.value
    .map(record => typeof record.date === 'string' ? record.date : record.date?.toDate?.()?.toISOString().split('T')[0])
    .filter(date => date && date >= oneYearAgoStr)
    .sort()
})

// Calculate monthly stats (this month vs last month)
const monthlyStats = computed(() => {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  let currentMonthCount = 0
  let lastMonthCount = 0

  trainingDates.value.forEach(dateStr => {
    const date = new Date(dateStr + 'T12:00:00')
    const month = date.getMonth()
    const year = date.getFullYear()

    if (year === currentYear && month === currentMonth) {
      currentMonthCount++
    } else if (year === lastMonthYear && month === lastMonth) {
      lastMonthCount++
    }
  })

  // Calculate trend
  let trend = 'neutral'
  let trendPercentage = 0

  if (lastMonthCount > 0) {
    const change = currentMonthCount - lastMonthCount
    trendPercentage = Math.round((change / lastMonthCount) * 100)

    if (change > 0) trend = 'up'
    else if (change < 0) trend = 'down'
  } else if (currentMonthCount > 0) {
    trend = 'up'
    trendPercentage = 100
  }

  return {
    currentMonthCount,
    lastMonthCount,
    trend,
    trendPercentage
  }
})

// Calculate weekly average (last 4 weeks)
const weeklyAverage = computed(() => {
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0]

  const recentTrainings = trainingDates.value.filter(d => d >= fourWeeksAgoStr)
  return (recentTrainings.length / 4).toFixed(1)
})

// GitHub-style heatmap data (last 52 weeks)
const heatmapData = computed(() => {
  const dateMap = new Set(trainingDates.value)

  const now = new Date()
  const startDate = new Date(now)
  startDate.setDate(startDate.getDate() - (52 * 7))

  // Find first Sunday
  while (startDate.getDay() !== 0) {
    startDate.setDate(startDate.getDate() - 1)
  }

  const weeks = []
  let currentWeek = []
  const currentDate = new Date(startDate)

  while (currentDate <= now) {
    const dateStr = currentDate.toISOString().split('T')[0]
    const hasTraining = dateMap.has(dateStr)

    currentWeek.push({
      date: dateStr,
      hasTraining,
      dayOfWeek: currentDate.getDay()
    })

    if (currentDate.getDay() === 6) {
      weeks.push(currentWeek)
      currentWeek = []
    }

    currentDate.setDate(currentDate.getDate() + 1)
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  return weeks
})

// Month labels for heatmap
const monthLabels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// Recent attendance with session details
const recentAttendanceWithDetails = computed(() => {
  if (!attendanceRecords.value) return []

  return attendanceRecords.value
    .slice()
    .sort((a, b) => {
      const dateA = typeof a.date === 'string' ? a.date : a.date?.toDate?.()?.toISOString().split('T')[0]
      const dateB = typeof b.date === 'string' ? b.date : b.date?.toDate?.()?.toISOString().split('T')[0]
      return dateB.localeCompare(dateA)
    })
    .slice(0, 10)
    .map(record => {
      // Find subgroup name
      const subgroup = subgroups.value?.find(s => s.id === record.subgroupId)

      return {
        id: record.id,
        date: typeof record.date === 'string' ? record.date : record.date?.toDate?.()?.toISOString().split('T')[0],
        subgroupName: subgroup?.name || 'Training',
        subgroupColor: subgroup?.color || '#6366f1'
      }
    })
})

function formatDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function getSubgroupName(subgroupId) {
  const subgroup = subgroups.value?.find(s => s.id === subgroupId)
  return subgroup?.name || 'Unbekannt'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Subgroup Filter -->
    <div v-if="subgroups && subgroups.length > 1" class="bg-white p-4 rounded-xl shadow-md">
      <div class="flex items-center gap-3">
        <label class="text-sm font-medium text-gray-700">Untergruppe:</label>
        <select
          v-model="currentSubgroupFilter"
          class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">Alle Untergruppen</option>
          <option v-for="subgroup in subgroups" :key="subgroup.id" :value="subgroup.id">
            {{ subgroup.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Monthly Stats (like original) -->
    <div class="grid grid-cols-3 gap-4">
      <!-- This Month -->
      <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
        <p class="text-xs text-blue-700 font-medium mb-1">Dieser Monat</p>
        <p class="text-3xl font-bold text-blue-900">{{ monthlyStats.currentMonthCount }}</p>
        <p class="text-xs text-blue-600 mt-1">Trainings</p>
      </div>

      <!-- Last Month -->
      <div class="bg-gradient-to-br from-gray-50 to-slate-50 p-4 rounded-lg border border-gray-200">
        <p class="text-xs text-gray-700 font-medium mb-1">Letzter Monat</p>
        <p class="text-3xl font-bold text-gray-900">{{ monthlyStats.lastMonthCount }}</p>
        <p class="text-xs text-gray-600 mt-1">Trainings</p>
      </div>

      <!-- Trend -->
      <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
        <p class="text-xs text-green-700 font-medium mb-1">Trend</p>
        <div class="mt-2">
          <div v-if="monthlyStats.trend === 'up'" class="text-sm font-semibold text-green-600">
            <svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
            +{{ Math.abs(monthlyStats.trendPercentage) }}%
          </div>
          <div v-else-if="monthlyStats.trend === 'down'" class="text-sm font-semibold text-red-600">
            <svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
            {{ monthlyStats.trendPercentage }}%
          </div>
          <div v-else class="text-sm font-semibold text-gray-600">
            <svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
            </svg>
            ±0%
          </div>
        </div>
        <p class="text-xs text-green-600 mt-1">{{ weeklyAverage }}x pro Woche</p>
      </div>
    </div>

    <!-- GitHub-style Heatmap -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-gray-800">📈 Aktivitätsverlauf</h2>
        <span class="text-xs text-gray-500">Letztes Jahr</span>
      </div>

      <div class="overflow-x-auto pb-2">
        <svg :width="heatmapData.length * 15" :height="7 * 15" class="min-w-full">
          <!-- Draw cells -->
          <g v-for="(week, weekIndex) in heatmapData" :key="weekIndex">
            <rect
              v-for="day in week"
              :key="day.date"
              :x="weekIndex * 15"
              :y="day.dayOfWeek * 15"
              width="12"
              height="12"
              rx="2"
              :fill="day.hasTraining ? '#10b981' : '#e5e7eb'"
              :class="day.hasTraining ? 'hover:opacity-80 cursor-pointer' : 'hover:opacity-80'"
            >
              <title>{{ day.date }}{{ day.hasTraining ? ' - Training' : '' }}</title>
            </rect>
          </g>

          <!-- Month labels -->
          <g v-for="(week, weekIndex) in heatmapData" :key="'label-' + weekIndex">
            <text
              v-if="week.length > 0 && new Date(week[0].date + 'T12:00:00').getDate() === 1"
              :x="weekIndex * 15"
              y="-5"
              font-size="10"
              fill="#6b7280"
            >
              {{ monthLabels[new Date(week[0].date + 'T12:00:00').getMonth()] }}
            </text>
          </g>
        </svg>
      </div>

      <!-- Legend -->
      <div class="flex items-center gap-2 mt-3 text-xs text-gray-600">
        <span>Weniger</span>
        <div class="w-3 h-3 bg-gray-200 rounded-sm"></div>
        <div class="w-3 h-3 bg-green-500 rounded-sm"></div>
        <span>Mehr</span>
      </div>
    </div>

    <!-- Recent Attendance with Session Details -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Letzte Trainings</h3>
      <div v-if="recentAttendanceWithDetails.length" class="space-y-2">
        <div
          v-for="record in recentAttendanceWithDetails"
          :key="record.id"
          class="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200"
        >
          <div class="flex items-center gap-3">
            <span class="text-xl">✅</span>
            <div>
              <p class="font-medium text-gray-900">{{ formatDate(record.date) }}</p>
              <div class="flex items-center gap-2 mt-1">
                <div
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: record.subgroupColor }"
                ></div>
                <p class="text-xs text-gray-600">{{ record.subgroupName }}</p>
              </div>
            </div>
          </div>
          <span class="px-2 py-1 rounded text-xs font-medium bg-green-200 text-green-800">
            Anwesend
          </span>
        </div>
      </div>
      <p v-else class="text-gray-500 text-center py-4">Noch keine Anwesenheitsdaten</p>
    </div>
  </div>
</template>
