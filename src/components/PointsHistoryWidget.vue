<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePointsHistory } from '@/composables/usePointsHistory'

const authStore = useAuthStore()
const { getPointsHistory, loading } = usePointsHistory()

const history = ref([])

onMounted(async () => {
  if (authStore.user) {
    history.value = await getPointsHistory(authStore.user.id, { limit: 10 })
  }
})

function formatDate(dateStr) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getTypeIcon(type) {
  const icons = {
    match: '🏓',
    exercise: '💪',
    challenge: '🎯',
    attendance: '📅',
    bonus: '🎁'
  }
  return icons[type] || '⭐'
}

function getTypeColor(type) {
  const colors = {
    match: 'blue',
    exercise: 'purple',
    challenge: 'green',
    attendance: 'yellow',
    bonus: 'pink'
  }
  return colors[type] || 'gray'
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-xl font-semibold mb-4">Punkte-Historie</h2>

    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <ul v-else-if="history.length > 0" class="space-y-3 max-h-64 overflow-y-auto">
      <li
        v-for="entry in history"
        :key="entry.id"
        class="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
      >
        <div class="flex items-center gap-3">
          <span class="text-xl">{{ getTypeIcon(entry.type) }}</span>
          <div>
            <p class="text-sm font-medium">{{ entry.description || entry.type }}</p>
            <p class="text-xs text-gray-500">{{ formatDate(entry.created_at) }}</p>
          </div>
        </div>
        <div class="text-right">
          <p v-if="entry.xp_amount" class="text-sm font-bold text-purple-600">
            +{{ entry.xp_amount }} XP
          </p>
          <p v-if="entry.points_amount" class="text-sm font-bold text-yellow-600">
            +{{ entry.points_amount }} P
          </p>
          <p v-if="entry.elo_change" class="text-xs" :class="entry.elo_change >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ entry.elo_change >= 0 ? '+' : '' }}{{ entry.elo_change }} Elo
          </p>
        </div>
      </li>
    </ul>

    <div v-else class="text-center py-4">
      <p class="text-gray-500">Noch keine Punkte gesammelt</p>
    </div>
  </div>
</template>
