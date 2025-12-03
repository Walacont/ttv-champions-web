<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/composables/useSupabase'

const authStore = useAuthStore()

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4='

// State
const activeTab = ref('xp')
const scope = ref('club')
const players = ref([])
const loading = ref(true)

const tabs = [
  { id: 'xp', label: 'Fleiß', sublabel: 'XP' },
  { id: 'elo', label: 'Skill', sublabel: 'Elo' },
  { id: 'points', label: 'Season', sublabel: 'Punkte' }
]

// Computed
const sortedPlayers = computed(() => {
  const field = activeTab.value === 'elo' ? 'elo_rating' : activeTab.value
  return [...players.value].sort((a, b) => (b[field] || 0) - (a[field] || 0))
})

const top10 = computed(() => sortedPlayers.value.slice(0, 10))

const currentUserRank = computed(() => {
  const index = sortedPlayers.value.findIndex(p => p.id === authStore.user?.id)
  return index >= 0 ? index + 1 : null
})

const currentUserData = computed(() => {
  return sortedPlayers.value.find(p => p.id === authStore.user?.id)
})

// Load players
async function loadPlayers() {
  loading.value = true
  try {
    let query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, xp, elo_rating, points')
      .neq('role', 'admin')
      .limit(100)

    if (scope.value === 'club' && authStore.profile?.club_id) {
      query = query.eq('club_id', authStore.profile.club_id)
    }

    const { data, error } = await query
    if (error) throw error
    players.value = data || []
  } catch (error) {
    console.error('Error loading leaderboard:', error)
  } finally {
    loading.value = false
  }
}

// Medal helper
function getMedal(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}.`
}

// Get value based on active tab
function getValue(player) {
  const field = activeTab.value === 'elo' ? 'elo_rating' : activeTab.value
  return player[field] || 0
}

onMounted(() => {
  loadPlayers()
})
</script>

<template>
  <div class="card">
    <h2 class="text-xl font-bold text-center mb-4">🏆 Rangliste</h2>

    <!-- Tabs -->
    <div class="flex justify-center border-b border-gray-200 mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors"
        :class="activeTab === tab.id
          ? 'border-indigo-500 text-indigo-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'"
      >
        <div>{{ tab.label }}</div>
        <div class="text-xs font-normal text-gray-400">{{ tab.sublabel }}</div>
      </button>
    </div>

    <!-- Scope Toggle -->
    <div v-if="authStore.profile?.club_id" class="flex justify-center mb-4">
      <div class="inline-flex bg-gray-100 rounded-lg p-1">
        <button
          @click="scope = 'club'; loadPlayers()"
          class="px-4 py-1 text-sm font-medium rounded-md transition-colors"
          :class="scope === 'club' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
        >
          Mein Verein
        </button>
        <button
          @click="scope = 'global'; loadPlayers()"
          class="px-4 py-1 text-sm font-medium rounded-md transition-colors"
          :class="scope === 'global' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
        >
          Global
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <!-- Player List -->
    <div v-else class="space-y-2">
      <div
        v-for="(player, index) in top10"
        :key="player.id"
        class="flex items-center justify-between p-3 rounded-lg transition-colors"
        :class="player.id === authStore.user?.id
          ? 'bg-indigo-50 border-2 border-indigo-300'
          : 'bg-gray-50 hover:bg-gray-100'"
      >
        <div class="flex items-center gap-3">
          <span class="w-8 text-center font-bold" :class="index < 3 ? 'text-lg' : 'text-gray-500'">
            {{ getMedal(index + 1) }}
          </span>
          <img
            :src="player.avatar_url || DEFAULT_AVATAR"
            class="w-10 h-10 rounded-full border-2"
            :class="player.id === authStore.user?.id ? 'border-indigo-400' : 'border-gray-200'"
            @error="(e) => e.target.src = DEFAULT_AVATAR"
          />
          <div>
            <span :class="player.id === authStore.user?.id ? 'font-bold text-indigo-700' : 'font-medium'">
              {{ player.display_name || 'Unbekannt' }}
            </span>
            <span v-if="player.id === authStore.user?.id" class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">
              Du
            </span>
          </div>
        </div>
        <span
          class="font-bold text-lg"
          :class="{
            'text-purple-600': activeTab === 'xp',
            'text-blue-600': activeTab === 'elo',
            'text-yellow-600': activeTab === 'points'
          }"
        >
          {{ getValue(player) }}
        </span>
      </div>

      <!-- Show current user if not in top 10 -->
      <div v-if="currentUserRank && currentUserRank > 10 && currentUserData" class="border-t-2 border-dashed border-gray-300 mt-4 pt-4">
        <div class="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border-2 border-indigo-300">
          <div class="flex items-center gap-3">
            <span class="w-8 text-center font-bold text-gray-500">{{ currentUserRank }}.</span>
            <img
              :src="currentUserData.avatar_url || DEFAULT_AVATAR"
              class="w-10 h-10 rounded-full border-2 border-indigo-400"
            />
            <div>
              <span class="font-bold text-indigo-700">{{ currentUserData.display_name }}</span>
              <span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>
            </div>
          </div>
          <span
            class="font-bold text-lg"
            :class="{
              'text-purple-600': activeTab === 'xp',
              'text-blue-600': activeTab === 'elo',
              'text-yellow-600': activeTab === 'points'
            }"
          >
            {{ getValue(currentUserData) }}
          </span>
        </div>
      </div>

      <!-- Empty state -->
      <p v-if="players.length === 0" class="text-center text-gray-500 py-8">
        Keine Spieler gefunden
      </p>
    </div>
  </div>
</template>
