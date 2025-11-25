<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Current month for calendar
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

// Load subgroups
const subgroupsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'subgroups'),
    where('clubId', '==', userStore.clubId)
  )
})
const subgroups = useCollection(subgroupsQuery)

// Attendance records
const attendanceQuery = computed(() => {
  if (!userStore.userData?.id || !userStore.clubId) return null
  return query(
    collection(db, 'attendance'),
    where('clubId', '==', userStore.clubId),
    where('presentPlayerIds', 'array-contains', userStore.userData.id)
  )
})
const attendanceRecords = useCollection(attendanceQuery)

// Get attendance dates as set for quick lookup
const attendanceDatesSet = computed(() => {
  if (!attendanceRecords.value) return new Set()

  const dates = attendanceRecords.value.map(record => {
    return typeof record.date === 'string' ? record.date : record.date?.toDate?.()?.toISOString().split('T')[0]
  })

  return new Set(dates.filter(d => d))
})

// Calendar days for current month
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []

  // Add empty days for alignment (week starts on Monday)
  const firstDayOfWeek = firstDay.getDay() || 7 // Convert Sunday (0) to 7
  for (let i = 1; i < firstDayOfWeek; i++) {
    days.push({ day: null, hasTraining: false })
  }

  // Add days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const hasTraining = attendanceDatesSet.value.has(dateStr)

    days.push({
      day: d,
      dateStr,
      hasTraining
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

  const daysInMonth = attendanceRecords.value.filter(record => {
    const dateStr = typeof record.date === 'string' ? record.date : record.date?.toDate?.()?.toISOString().split('T')[0]
    return dateStr && dateStr >= startOfMonth && dateStr <= endOfMonth
  }).length

  return {
    trainingDays: daysInMonth
  }
})

// Streaks per subgroup
const streaks = ref([])

onMounted(async () => {
  await loadStreaks()
})

async function loadStreaks() {
  if (!userStore.userData?.id || !userStore.clubId) return

  try {
    // Load player's subgroups
    const playerSubgroupIds = userStore.userData.subgroupIDs || []

    // Load streaks for each subgroup
    const streakPromises = playerSubgroupIds.map(async (subgroupId) => {
      const streakDoc = await getDocs(
        query(
          collection(db, 'users', userStore.userData.id, 'streaks'),
          where('subgroupId', '==', subgroupId)
        )
      )

      const subgroup = subgroups.value?.find(s => s.id === subgroupId)

      if (streakDoc.docs.length > 0) {
        const streakData = streakDoc.docs[0].data()
        return {
          subgroupName: subgroup?.name || 'Training',
          subgroupColor: subgroup?.color || '#6366f1',
          currentStreak: streakData.currentStreak || 0,
          longestStreak: streakData.longestStreak || 0
        }
      }

      return {
        subgroupName: subgroup?.name || 'Training',
        subgroupColor: subgroup?.color || '#6366f1',
        currentStreak: 0,
        longestStreak: 0
      }
    })

    streaks.value = await Promise.all(streakPromises)
  } catch (error) {
    console.error('Error loading streaks:', error)
    streaks.value = []
  }
}
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
          class="aspect-square flex items-center justify-center text-sm rounded-lg transition-colors"
          :class="{
            'bg-indigo-500 text-white font-bold hover:bg-indigo-600': dayInfo.hasTraining,
            'bg-gray-100 text-gray-700 hover:bg-gray-200': !dayInfo.hasTraining && dayInfo.day,
            'cursor-pointer': dayInfo.day,
            'cursor-default': !dayInfo.day
          }"
          :title="dayInfo.hasTraining ? 'Training' : ''"
        >
          <span v-if="dayInfo.day">{{ dayInfo.day }}</span>
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
                  {{ streak.currentStreak }}🔥
                  <span v-if="streak.longestStreak > streak.currentStreak" class="text-xs text-gray-500">
                    (Rekord: {{ streak.longestStreak }})
                  </span>
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
  </div>
</template>
