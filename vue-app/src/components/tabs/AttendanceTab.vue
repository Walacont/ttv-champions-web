<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy, limit } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Current month
const currentDate = ref(new Date())

const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const weekDays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const currentMonthName = computed(() => {
  return `${monthNames[currentDate.value.getMonth()]} ${currentDate.value.getFullYear()}`
})

// Navigate months
function prevMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
}

function goToToday() {
  currentDate.value = new Date()
}

// Attendance records
const attendanceQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'attendance'),
    where('userId', '==', userStore.userData.id),
    orderBy('date', 'desc'),
    limit(100)
  )
})
const attendanceRecords = useCollection(attendanceQuery)

// Training sessions (for club)
const trainingSessionsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'trainingSessions'),
    where('clubId', '==', userStore.clubId),
    orderBy('date', 'desc'),
    limit(50)
  )
})
const trainingSessions = useCollection(trainingSessionsQuery)

// Calendar days
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []
  const today = new Date().toISOString().split('T')[0]

  // Add empty days for alignment (week starts on Monday)
  const firstDayOfWeek = firstDay.getDay() || 7 // Convert Sunday (0) to 7
  for (let i = 1; i < firstDayOfWeek; i++) {
    days.push({ day: null, status: null, isToday: false })
  }

  // Add days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const record = attendanceRecords.value?.find(r => {
      const recordDate = r.date?.toDate ? r.date.toDate() : new Date(r.date)
      return recordDate.toISOString().split('T')[0] === dateStr
    })

    // Check if there was a training session on this date
    const hadTraining = trainingSessions.value?.some(s => {
      const sessionDate = s.date?.toDate ? s.date.toDate() : new Date(s.date)
      return sessionDate.toISOString().split('T')[0] === dateStr
    })

    let status = null
    if (record?.present) {
      status = 'present'
    } else if (record?.present === false || (hadTraining && !record?.present)) {
      status = 'missed'
    }

    days.push({
      day: d,
      status,
      isToday: dateStr === today,
      hadTraining,
      date: dateStr
    })
  }

  return days
})

// Stats
const stats = computed(() => {
  const records = attendanceRecords.value || []
  const present = records.filter(r => r.present).length
  const missed = records.filter(r => r.present === false).length
  const total = present + missed
  return {
    present,
    missed,
    total,
    percentage: total > 0 ? Math.round((present / total) * 100) : 0
  }
})

// Calculate current streak
const streak = computed(() => {
  const records = attendanceRecords.value || []
  const presentRecords = records
    .filter(r => r.present)
    .map(r => {
      const date = r.date?.toDate ? r.date.toDate() : new Date(r.date)
      return date.toISOString().split('T')[0]
    })
    .sort((a, b) => b.localeCompare(a)) // Sort descending

  if (presentRecords.length === 0) return 0

  let currentStreak = 0
  let checkDate = new Date()

  // Check for consecutive days
  for (let i = 0; i < 100; i++) {
    const dateStr = checkDate.toISOString().split('T')[0]
    if (presentRecords.includes(dateStr)) {
      currentStreak++
    } else {
      // Allow for one day gap (weekend, etc.)
      checkDate.setDate(checkDate.getDate() - 1)
      const prevDateStr = checkDate.toISOString().split('T')[0]
      if (!presentRecords.includes(prevDateStr)) {
        break
      }
    }
    checkDate.setDate(checkDate.getDate() - 1)
  }

  return currentStreak
})

// Best streak (from user data)
const bestStreak = computed(() => {
  return userStore.userData?.bestStreak || streak.value
})

// Recent attendance
const recentAttendance = computed(() => {
  return (attendanceRecords.value || []).slice(0, 5)
})

function formatDate(timestamp) {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Streak & Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <!-- Current Streak -->
      <div class="bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-xl shadow-md border border-orange-200">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">🔥</span>
          <span class="text-sm font-semibold text-orange-800">Aktuelle Serie</span>
        </div>
        <div class="text-3xl font-bold text-orange-600">{{ streak }}</div>
        <div class="text-xs text-orange-700">Trainings in Folge</div>
      </div>

      <!-- Best Streak -->
      <div class="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl shadow-md border border-purple-200">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">⭐</span>
          <span class="text-sm font-semibold text-purple-800">Beste Serie</span>
        </div>
        <div class="text-3xl font-bold text-purple-600">{{ bestStreak }}</div>
        <div class="text-xs text-purple-700">Persönlicher Rekord</div>
      </div>

      <!-- Attendance Rate -->
      <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl shadow-md border border-green-200">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">📊</span>
          <span class="text-sm font-semibold text-green-800">Quote</span>
        </div>
        <div class="text-3xl font-bold text-green-600">{{ stats.percentage }}%</div>
        <div class="text-xs text-green-700">Anwesenheitsquote</div>
      </div>

      <!-- Total Trainings -->
      <div class="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl shadow-md border border-blue-200">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">🏆</span>
          <span class="text-sm font-semibold text-blue-800">Gesamt</span>
        </div>
        <div class="text-3xl font-bold text-blue-600">{{ stats.present }}</div>
        <div class="text-xs text-blue-700">Trainings besucht</div>
      </div>
    </div>

    <!-- Calendar -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <div class="flex items-center justify-between mb-4">
        <button @click="prevMonth" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="text-center">
          <h3 class="text-lg font-semibold text-gray-900">{{ currentMonthName }}</h3>
          <button @click="goToToday" class="text-xs text-indigo-600 hover:text-indigo-800">Heute</button>
        </div>
        <button @click="nextMonth" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div v-for="day in weekDays" :key="day" class="text-center text-xs text-gray-500 font-medium py-2">
          {{ day }}
        </div>
      </div>

      <!-- Calendar grid -->
      <div class="grid grid-cols-7 gap-1">
        <div
          v-for="(dayInfo, index) in calendarDays"
          :key="index"
          class="aspect-square flex items-center justify-center text-sm rounded-lg transition-colors"
          :class="{
            'bg-green-500 text-white font-bold': dayInfo.status === 'present',
            'bg-red-400 text-white': dayInfo.status === 'missed',
            'bg-gray-100 hover:bg-gray-200': !dayInfo.status && dayInfo.day,
            'ring-2 ring-indigo-500 ring-offset-1': dayInfo.isToday,
            'cursor-default': !dayInfo.day
          }"
          :title="dayInfo.status === 'present' ? 'Anwesend' : (dayInfo.status === 'missed' ? 'Gefehlt' : '')"
        >
          <span v-if="dayInfo.day">{{ dayInfo.day }}</span>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex justify-center flex-wrap gap-4 mt-4 text-sm">
        <div class="flex items-center">
          <div class="w-4 h-4 bg-green-500 rounded mr-2"></div>
          <span class="text-gray-700">Anwesend ({{ stats.present }})</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-red-400 rounded mr-2"></div>
          <span class="text-gray-700">Gefehlt ({{ stats.missed }})</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-gray-100 border rounded mr-2"></div>
          <span class="text-gray-700">Kein Training</span>
        </div>
      </div>
    </div>

    <!-- Recent Attendance -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Letzte Trainings</h3>
      <div v-if="recentAttendance.length" class="space-y-2">
        <div
          v-for="record in recentAttendance"
          :key="record.id"
          class="flex items-center justify-between p-3 rounded-lg"
          :class="record.present ? 'bg-green-50' : 'bg-red-50'"
        >
          <div class="flex items-center gap-3">
            <span class="text-xl">{{ record.present ? '✅' : '❌' }}</span>
            <div>
              <p class="font-medium text-gray-900">{{ formatDate(record.date) }}</p>
              <p v-if="record.notes" class="text-xs text-gray-500">{{ record.notes }}</p>
            </div>
          </div>
          <span
            class="px-2 py-1 rounded text-xs font-medium"
            :class="record.present ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'"
          >
            {{ record.present ? 'Anwesend' : 'Abwesend' }}
          </span>
        </div>
      </div>
      <p v-else class="text-gray-500 text-center py-4">Noch keine Anwesenheitsdaten</p>
    </div>

    <!-- Motivation -->
    <div v-if="streak >= 3" class="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-xl border-2 border-yellow-300">
      <div class="flex items-center gap-3">
        <span class="text-3xl">🔥</span>
        <div>
          <p class="font-bold text-yellow-900">Super Serie!</p>
          <p class="text-sm text-yellow-800">
            Du bist seit {{ streak }} Trainings dabei. Weiter so!
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
