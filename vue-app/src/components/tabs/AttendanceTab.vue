<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Current month for calendar
const currentDate = ref(new Date())

// Modal state
const showModal = ref(false)
const selectedDate = ref(null)
const selectedDateFormatted = ref('')
const modalSessions = ref([])

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

// Load subgroups
const subgroupsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'subgroups'),
    where('clubId', '==', userStore.clubId)
  )
})
const subgroups = useCollection(subgroupsQuery)

// Training sessions for current month
const sessionsQuery = computed(() => {
  if (!userStore.clubId) return null

  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-31`

  return query(
    collection(db, 'trainingSessions'),
    where('clubId', '==', userStore.clubId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    where('cancelled', '==', false)
  )
})
const trainingSessions = useCollection(sessionsQuery)

// Attendance records
const attendanceQuery = computed(() => {
  if (!userStore.userData?.id || !userStore.clubId) return null

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 90)
  const startString = cutoffDate.toISOString().split('T')[0]

  return query(
    collection(db, 'attendance'),
    where('clubId', '==', userStore.clubId),
    where('date', '>=', startString),
    orderBy('date', 'desc')
  )
})
const attendanceRecords = useCollection(attendanceQuery)

// Sessions per day map
const sessionsPerDay = computed(() => {
  if (!trainingSessions.value) return new Map()

  const map = new Map()
  const userSubgroups = userStore.userData?.subgroupIDs || []
  const subgroupFilter = userStore.currentSubgroupFilter

  trainingSessions.value.forEach(session => {
    // Only include sessions for player's subgroups
    if (userSubgroups.length === 0 || userSubgroups.includes(session.subgroupId)) {
      // Apply subgroup filter
      if (subgroupFilter && subgroupFilter !== 'club' && subgroupFilter !== 'global') {
        // Filter by specific subgroup
        if (session.subgroupId !== subgroupFilter) {
          return
        }
      }

      if (!map.has(session.date)) {
        map.set(session.date, [])
      }
      map.get(session.date).push({
        ...session,
        id: session.id
      })
    }
  })

  return map
})

// Calendar days for current month
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []
  const today = new Date().toDateString()

  // Add empty days for alignment (week starts on Monday)
  const firstDayOfWeek = firstDay.getDay() || 7 // Convert Sunday (0) to 7
  for (let i = 1; i < firstDayOfWeek; i++) {
    days.push({ day: null, dateStr: null, sessions: [], isToday: false })
  }

  // Add days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const sessionsOnDay = sessionsPerDay.value.get(dateStr) || []
    const isToday = new Date(year, month, d).toDateString() === today

    // Calculate attendance status
    let statusIcon = null
    if (sessionsOnDay.length > 0) {
      const attendedCount = sessionsOnDay.filter(session => {
        const attendance = attendanceRecords.value?.find(a =>
          a.date === dateStr &&
          a.sessionId === session.id &&
          a.presentPlayerIds &&
          a.presentPlayerIds.includes(userStore.userData.id)
        )
        return attendance !== undefined
      }).length

      const completedCount = sessionsOnDay.filter(s => s.completed === true).length
      const totalSessions = sessionsOnDay.length

      if (attendedCount === totalSessions && totalSessions > 0) {
        // Attended ALL sessions
        statusIcon = { symbol: '✓', color: 'text-green-600' }
      } else if (attendedCount === 0 && totalSessions > 0) {
        // No sessions attended
        if (completedCount === totalSessions) {
          // All completed - truly missed
          statusIcon = { symbol: '✗', color: 'text-red-600' }
        } else {
          // Some/all not completed yet - pending
          statusIcon = { symbol: '○', color: 'text-gray-400' }
        }
      } else if (attendedCount > 0 && attendedCount < totalSessions) {
        // Attended SOME sessions (partial attendance)
        statusIcon = { symbol: '◐', color: 'text-orange-600' }
      }
    }

    days.push({
      day: d,
      dateStr,
      sessions: sessionsOnDay,
      isToday,
      statusIcon
    })
  }

  return days
})

// Statistics for current month
const currentMonthStats = computed(() => {
  if (!attendanceRecords.value) return { trainingDays: 0 }

  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-31`

  // Count unique dates where player attended
  const uniqueDates = new Set()
  attendanceRecords.value.forEach(record => {
    if (record.date >= startOfMonth && record.date <= endOfMonth) {
      if (record.presentPlayerIds && record.presentPlayerIds.includes(userStore.userData.id)) {
        uniqueDates.add(record.date)
      }
    }
  })

  return {
    trainingDays: uniqueDates.size
  }
})

// Streaks per subgroup
const streaks = ref([])

async function loadStreaks() {
  if (!userStore.userData?.id || !userStore.clubId) return

  try {
    const playerSubgroupIds = userStore.userData.subgroupIDs || []

    const streakPromises = playerSubgroupIds.map(async (subgroupId) => {
      const subgroup = subgroups.value?.find(s => s.id === subgroupId)

      // Query streaks collection for this subgroup
      const streaksQuery = query(
        collection(db, 'users', userStore.userData.id, 'streaks'),
        where('subgroupId', '==', subgroupId)
      )

      return new Promise((resolve) => {
        const unsubscribe = onSnapshot(streaksQuery, (snapshot) => {
          if (snapshot.docs.length > 0) {
            const streakData = snapshot.docs[0].data()
            resolve({
              subgroupName: subgroup?.name || 'Training',
              subgroupColor: subgroup?.color || '#6366f1',
              count: streakData.count || 0
            })
          } else {
            resolve({
              subgroupName: subgroup?.name || 'Training',
              subgroupColor: subgroup?.color || '#6366f1',
              count: 0
            })
          }
          unsubscribe()
        })
      })
    })

    streaks.value = await Promise.all(streakPromises)
  } catch (error) {
    console.error('Error loading streaks:', error)
    streaks.value = []
  }
}

// Open modal for a day
function openDayModal(dayInfo) {
  if (!dayInfo.sessions || dayInfo.sessions.length === 0) return

  selectedDate.value = dayInfo.dateStr

  // Format date nicely
  const [year, month, day] = dayInfo.dateStr.split('-')
  const dateObj = new Date(year, parseInt(month) - 1, parseInt(day))
  selectedDateFormatted.value = dateObj.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  // Prepare session data with attendance info
  modalSessions.value = dayInfo.sessions.map(session => {
    const subgroup = subgroups.value?.find(s => s.id === session.subgroupId)

    const attendance = attendanceRecords.value?.find(a =>
      a.date === dayInfo.dateStr &&
      a.sessionId === session.id &&
      a.presentPlayerIds &&
      a.presentPlayerIds.includes(userStore.userData.id)
    )

    const attended = attendance !== undefined
    const isCompleted = session.completed === true

    let status, statusColor, bgColor, borderColor, icon
    if (attended) {
      status = 'Teilgenommen'
      statusColor = 'text-green-700'
      bgColor = 'bg-green-50'
      borderColor = 'border-green-300'
      icon = '✓'
    } else if (!isCompleted) {
      status = 'Noch ausstehend'
      statusColor = 'text-gray-600'
      bgColor = 'bg-gray-50'
      borderColor = 'border-gray-300'
      icon = '○'
    } else {
      status = 'Verpasst'
      statusColor = 'text-red-700'
      bgColor = 'bg-red-50'
      borderColor = 'border-red-300'
      icon = '✗'
    }

    return {
      ...session,
      subgroupName: subgroup?.name || 'Unbekannt',
      subgroupColor: subgroup?.color || '#6366f1',
      status,
      statusColor,
      bgColor,
      borderColor,
      icon,
      attended,
      isCompleted
    }
  })

  showModal.value = true
}

function closeModal() {
  showModal.value = false
  selectedDate.value = null
  modalSessions.value = []
}

onMounted(() => {
  loadStreaks()
})

// Reload streaks when subgroups change
watch(() => subgroups.value, () => {
  if (subgroups.value) {
    loadStreaks()
  }
})

// Reload streaks when subgroup filter changes
watch(() => userStore.currentSubgroupFilter, () => {
  loadStreaks()
})
</script>

<template>
  <div class="space-y-8">
    <!-- Monthly Overview -->
    <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Monatsübersicht</h2>
        <div class="flex items-center space-x-4">
          <button
            @click="prevMonth"
            class="text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 class="font-semibold text-lg w-48 text-center">{{ currentMonthName }}</h3>
          <button
            @click="nextMonth"
            class="text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-gray-500 mb-2">
        <div v-for="day in weekDays" :key="day">{{ day }}</div>
      </div>

      <!-- Calendar grid -->
      <div class="grid grid-cols-7 gap-2">
        <div
          v-for="(dayInfo, index) in calendarDays"
          :key="index"
          class="border rounded-md p-2 min-h-[80px] transition-shadow"
          :class="{
            'ring-2 ring-indigo-500': dayInfo.isToday,
            'cursor-pointer hover:shadow-md hover:bg-gray-50': dayInfo.sessions.length > 0,
            'cursor-default': !dayInfo.day || dayInfo.sessions.length === 0
          }"
          @click="dayInfo.sessions.length > 0 ? openDayModal(dayInfo) : null"
        >
          <!-- Day number with status indicator -->
          <div v-if="dayInfo.day" class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">{{ dayInfo.day }}</span>
            <span
              v-if="dayInfo.statusIcon"
              class="text-xs font-bold"
              :class="dayInfo.statusIcon.color"
            >
              {{ dayInfo.statusIcon.symbol }}
            </span>
          </div>

          <!-- Colored dots for sessions -->
          <div v-if="dayInfo.sessions.length > 0" class="flex gap-1 flex-wrap">
            <div
              v-for="(session, sessionIndex) in dayInfo.sessions.slice(0, 4)"
              :key="sessionIndex"
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: subgroups?.find(s => s.id === session.subgroupId)?.color || '#6366f1' }"
              :title="subgroups?.find(s => s.id === session.subgroupId)?.name || 'Training'"
            ></div>
            <span v-if="dayInfo.sessions.length > 4" class="text-xs text-gray-500">
              +{{ dayInfo.sessions.length - 4 }}
            </span>
          </div>
        </div>
      </div>

      <!-- Statistics for current month -->
      <div class="mt-6 pt-6 border-t">
        <h3 class="text-xl font-semibold mb-4">
          Statistiken für {{ monthNames[currentDate.getMonth()] }}
        </h3>
        <div class="grid grid-cols-2 gap-4 text-center">
          <!-- Training days -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-500">Trainingstage</p>
            <p class="text-2xl font-bold text-indigo-600">{{ currentMonthStats.trainingDays }}</p>
          </div>

          <!-- Streaks -->
          <div class="bg-gray-50 p-4 rounded-lg">
            <p class="text-sm text-gray-500 mb-2">Deine Streaks</p>
            <div v-if="streaks.length > 0" class="space-y-1">
              <div
                v-for="(streak, index) in streaks"
                :key="index"
                class="flex items-center justify-between text-sm"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="w-3 h-3 rounded-full"
                    :style="{ backgroundColor: streak.subgroupColor }"
                  ></div>
                  <span class="text-gray-700">{{ streak.subgroupName }}:</span>
                </div>
                <div class="font-semibold text-gray-900">
                  {{ streak.count }}🔥
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400">Noch keine Streaks</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Achievements Section -->
    <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
      <h2 class="text-xl font-semibold mb-4">Deine Erfolge</h2>
      <p class="text-gray-500">Hier werden bald deine freigeschalteten Abzeichen und Erfolge angezeigt.</p>
    </div>

    <!-- Training Day Modal -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background-color: rgba(0, 0, 0, 0.5);"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold text-gray-800">Training am {{ selectedDateFormatted }}</h2>
            <button
              @click="closeModal"
              class="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="space-y-3">
            <div
              v-for="(session, index) in modalSessions"
              :key="index"
              class="border rounded-lg p-3"
              :class="[session.bgColor, session.borderColor]"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-lg">{{ session.icon }}</span>
                    <span class="font-semibold text-gray-900">
                      {{ session.startTime }} - {{ session.endTime }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-gray-700 mb-2">
                    <div
                      class="w-3 h-3 rounded-full"
                      :style="{ backgroundColor: session.subgroupColor }"
                    ></div>
                    <span>{{ session.subgroupName }}</span>
                  </div>

                  <!-- Completed exercises -->
                  <div
                    v-if="session.isCompleted && session.completedExercises && session.completedExercises.length > 0"
                    class="text-xs text-gray-600 mt-2"
                  >
                    <div class="font-medium mb-1">Durchgeführte Übungen:</div>
                    <ul class="list-disc list-inside pl-2 space-y-0.5">
                      <li v-for="(ex, exIndex) in session.completedExercises" :key="exIndex">
                        {{ ex.name }} <span class="text-gray-500">(+{{ ex.points }} Pkt)</span>
                      </li>
                    </ul>
                  </div>

                  <!-- Planned exercises -->
                  <div
                    v-else-if="!session.isCompleted && session.plannedExercises && session.plannedExercises.length > 0"
                    class="text-xs text-gray-600 mt-2"
                  >
                    <div class="font-medium mb-1">Geplante Übungen:</div>
                    <ul class="list-disc list-inside pl-2 space-y-0.5">
                      <li v-for="(ex, exIndex) in session.plannedExercises" :key="exIndex">
                        {{ ex.name }} <span class="text-gray-500">(+{{ ex.points }} Pkt)</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="text-sm font-medium" :class="session.statusColor">
                  {{ session.status }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
