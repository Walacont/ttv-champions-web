<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useAttendance } from '@/composables/useAttendance'

const emit = defineEmits(['openDay'])

const authStore = useAuthStore()
const { getMonthAttendance, calculateStreaks, loading } = useAttendance()

const currentDate = ref(new Date())
const attendance = ref([])
const streaks = ref({ currentStreak: 0, longestStreak: 0, totalDays: 0 })

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

const monthName = computed(() => {
  return currentDate.value.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
})

const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
})

const firstDayOfMonth = computed(() => {
  const day = new Date(currentYear.value, currentMonth.value, 1).getDay()
  // Convert Sunday (0) to 7 for Monday-first calendar
  return day === 0 ? 6 : day - 1
})

const calendarDays = computed(() => {
  const days = []

  // Empty cells for days before month starts
  for (let i = 0; i < firstDayOfMonth.value; i++) {
    days.push({ day: null, status: null })
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth.value; day++) {
    const dateStr = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = attendance.value.find(a => a.date === dateStr)
    days.push({
      day,
      date: dateStr,
      status: record?.status || null,
      isToday: isToday(day),
      isFuture: isFuture(day)
    })
  }

  return days
})

const monthStats = computed(() => {
  const present = attendance.value.filter(a => a.status === 'present').length
  const missed = attendance.value.filter(a => a.status === 'missed').length
  return { present, missed }
})

function isToday(day) {
  const today = new Date()
  return today.getDate() === day &&
    today.getMonth() === currentMonth.value &&
    today.getFullYear() === currentYear.value
}

function isFuture(day) {
  const date = new Date(currentYear.value, currentMonth.value, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date > today
}

function prevMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(currentYear.value, currentMonth.value + 1, 1)
}

function getDayClass(day) {
  if (!day.day) return 'invisible'

  const classes = ['w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all cursor-pointer']

  if (day.isFuture) {
    classes.push('text-gray-300 cursor-not-allowed')
  } else if (day.status === 'present') {
    classes.push('bg-green-500 text-white hover:bg-green-600')
  } else if (day.status === 'missed') {
    classes.push('bg-red-400 text-white opacity-70')
  } else if (day.isToday) {
    classes.push('bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500')
  } else {
    classes.push('bg-gray-100 hover:bg-gray-200 text-gray-700')
  }

  return classes.join(' ')
}

function openDay(day) {
  if (!day.day || day.isFuture) return
  emit('openDay', day.date)
}

async function loadData() {
  if (authStore.user) {
    attendance.value = await getMonthAttendance(
      authStore.user.id,
      currentYear.value,
      currentMonth.value
    )
    streaks.value = await calculateStreaks(authStore.user.id)
  }
}

watch(currentDate, loadData)
onMounted(loadData)
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-bold text-gray-800">Monatsübersicht</h2>
      <div class="flex items-center space-x-4">
        <button @click="prevMonth" class="text-gray-500 hover:text-indigo-600 p-2">
          <i class="fas fa-chevron-left"></i>
        </button>
        <h3 class="font-semibold text-lg w-40 text-center">{{ monthName }}</h3>
        <button @click="nextMonth" class="text-gray-500 hover:text-indigo-600 p-2">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>

    <!-- Calendar Grid -->
    <div class="grid grid-cols-7 gap-2 text-center text-sm font-semibold text-gray-500 mb-2">
      <div>Mo</div>
      <div>Di</div>
      <div>Mi</div>
      <div>Do</div>
      <div>Fr</div>
      <div>Sa</div>
      <div>So</div>
    </div>

    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <div v-else class="grid grid-cols-7 gap-2">
      <div
        v-for="(day, index) in calendarDays"
        :key="index"
        @click="openDay(day)"
        :class="getDayClass(day)"
      >
        {{ day.day }}
      </div>
    </div>

    <!-- Statistics -->
    <div class="mt-6 pt-6 border-t">
      <h3 class="text-xl font-semibold mb-4">Statistiken für {{ monthName }}</h3>
      <div class="grid grid-cols-2 gap-4 text-center">
        <div class="bg-green-50 p-4 rounded-lg">
          <p class="text-sm text-gray-500">Trainingstage</p>
          <p class="text-2xl font-bold text-green-600">{{ monthStats.present }}</p>
        </div>
        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-500">Aktuelle Serie:</span>
              <span class="font-bold text-orange-500">{{ streaks.currentStreak }} 🔥</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-500">Längste Serie:</span>
              <span class="font-bold text-indigo-600">{{ streaks.longestStreak }} 🏆</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-500">Gesamt:</span>
              <span class="font-bold text-gray-700">{{ streaks.totalDays }} Tage</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-4 flex flex-wrap gap-4 justify-center text-sm">
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-green-500 rounded"></div>
        <span>Anwesend</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-red-400 opacity-70 rounded"></div>
        <span>Verpasst</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-4 h-4 bg-gray-100 rounded"></div>
        <span>Nicht markiert</span>
      </div>
    </div>
  </div>
</template>
