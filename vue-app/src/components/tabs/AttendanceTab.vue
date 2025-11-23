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

// Attendance records
const attendanceQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'attendance'),
    where('userId', '==', userStore.userData.id),
    orderBy('date', 'desc'),
    limit(50)
  )
})
const attendanceRecords = useCollection(attendanceQuery)

// Calendar days
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days = []

  // Add empty days for alignment
  for (let i = 0; i < (firstDay.getDay() || 7) - 1; i++) {
    days.push({ day: null, status: null })
  }

  // Add days of month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const record = attendanceRecords.value?.find(r => {
      const recordDate = r.date?.toDate ? r.date.toDate() : new Date(r.date)
      return recordDate.toISOString().split('T')[0] === dateStr
    })
    days.push({
      day: d,
      status: record?.present ? 'present' : (record ? 'missed' : null),
      isToday: new Date().toISOString().split('T')[0] === dateStr
    })
  }

  return days
})

// Stats
const stats = computed(() => {
  const records = attendanceRecords.value || []
  const present = records.filter(r => r.present).length
  const total = records.length
  return {
    present,
    total,
    percentage: total > 0 ? Math.round((present / total) * 100) : 0
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white p-4 rounded-xl shadow-md text-center">
        <div class="text-2xl font-bold text-green-600">{{ stats.present }}</div>
        <div class="text-sm text-gray-500">Anwesend</div>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-md text-center">
        <div class="text-2xl font-bold text-gray-600">{{ stats.total }}</div>
        <div class="text-sm text-gray-500">Trainings</div>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-md text-center">
        <div class="text-2xl font-bold text-indigo-600">{{ stats.percentage }}%</div>
        <div class="text-sm text-gray-500">Quote</div>
      </div>
    </div>

    <!-- Calendar -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <div class="flex items-center justify-between mb-4">
        <button @click="prevMonth" class="p-2 hover:bg-gray-100 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 class="text-lg font-semibold text-gray-900">{{ currentMonthName }}</h3>
        <button @click="nextMonth" class="p-2 hover:bg-gray-100 rounded-lg">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Weekday headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div v-for="day in ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']" :key="day" class="text-center text-xs text-gray-500 font-medium">
          {{ day }}
        </div>
      </div>

      <!-- Calendar grid -->
      <div class="grid grid-cols-7 gap-1">
        <div
          v-for="(dayInfo, index) in calendarDays"
          :key="index"
          class="aspect-square flex items-center justify-center text-sm rounded-lg"
          :class="{
            'bg-green-500 text-white': dayInfo.status === 'present',
            'bg-red-400 text-white': dayInfo.status === 'missed',
            'bg-gray-100': !dayInfo.status && dayInfo.day,
            'ring-2 ring-indigo-500': dayInfo.isToday
          }"
        >
          {{ dayInfo.day }}
        </div>
      </div>

      <!-- Legend -->
      <div class="flex justify-center space-x-6 mt-4 text-sm">
        <div class="flex items-center">
          <div class="w-4 h-4 bg-green-500 rounded mr-2"></div>
          <span>Anwesend</span>
        </div>
        <div class="flex items-center">
          <div class="w-4 h-4 bg-red-400 rounded mr-2"></div>
          <span>Gefehlt</span>
        </div>
      </div>
    </div>
  </div>
</template>
