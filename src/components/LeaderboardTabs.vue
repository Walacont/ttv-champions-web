<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLeaderboard } from '@/composables/useLeaderboard'

const props = defineProps({
  filter: {
    type: String,
    default: 'club' // 'club' or 'global'
  },
  genderFilter: {
    type: String,
    default: 'all'
  }
})

const authStore = useAuthStore()
const {
  getXpLeaderboard,
  getEloLeaderboard,
  getPointsLeaderboard,
  getRanksLeaderboard,
  getDoublesLeaderboard,
  loading
} = useLeaderboard()

const activeTab = ref('xp')
const leaderboard = ref([])

const tabs = [
  { id: 'xp', label: '💪 XP', color: 'purple' },
  { id: 'elo', label: '⚡ Elo', color: 'blue' },
  { id: 'points', label: '🏆 Punkte', color: 'yellow' },
  { id: 'ranks', label: '🎖️ Ränge', color: 'indigo' },
  { id: 'doubles', label: '🎾 Doppel', color: 'green' }
]

const clubId = computed(() => {
  return props.filter === 'global' ? null : authStore.profile?.club_id
})

const options = computed(() => ({
  clubId: clubId.value,
  gender: props.genderFilter,
  limit: 50
}))

async function loadLeaderboard() {
  const opts = options.value

  switch (activeTab.value) {
    case 'xp':
      leaderboard.value = await getXpLeaderboard(opts)
      break
    case 'elo':
      leaderboard.value = await getEloLeaderboard(opts)
      break
    case 'points':
      leaderboard.value = await getPointsLeaderboard(opts)
      break
    case 'ranks':
      leaderboard.value = await getRanksLeaderboard(opts)
      break
    case 'doubles':
      leaderboard.value = await getDoublesLeaderboard(opts)
      break
  }
}

function getStatValue(player) {
  switch (activeTab.value) {
    case 'xp':
      return `${player.total_xp || 0} XP`
    case 'elo':
      return `${player.elo_rating || 1000} Elo`
    case 'points':
      return `${player.total_points || 0} P`
    case 'ranks':
      return player.rank_name || 'Rekrut'
    case 'doubles':
      return `${player.elo_rating || 1000} Elo`
    default:
      return ''
  }
}

function getDisplayName(player) {
  if (activeTab.value === 'doubles') {
    const p1 = player.player1?.display_name || 'Unbekannt'
    const p2 = player.player2?.display_name || 'Unbekannt'
    return `${p1} & ${p2}`
  }
  return player.display_name || 'Unbekannt'
}

function isCurrentUser(player) {
  if (activeTab.value === 'doubles') {
    return player.player1_id === authStore.user?.id || player.player2_id === authStore.user?.id
  }
  return player.id === authStore.user?.id
}

function getRankBadgeClass(rank) {
  if (rank === 1) return 'bg-yellow-400 text-yellow-900'
  if (rank === 2) return 'bg-gray-300 text-gray-800'
  if (rank === 3) return 'bg-orange-400 text-orange-900'
  return 'bg-gray-100 text-gray-600'
}

watch([activeTab, () => props.filter, () => props.genderFilter], loadLeaderboard)
onMounted(loadLeaderboard)
</script>

<template>
  <div class="bg-white rounded-xl shadow-md overflow-hidden">
    <!-- Tabs -->
    <div class="flex border-b overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex-1 min-w-0 py-3 px-2 text-sm font-medium transition-colors whitespace-nowrap"
        :class="activeTab === tab.id
          ? `text-${tab.color}-600 border-b-2 border-${tab.color}-600 bg-${tab.color}-50`
          : 'text-gray-500 hover:text-gray-700'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="p-4">
      <div v-if="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="text-sm text-gray-500 mt-2">Lade Rangliste...</p>
      </div>

      <div v-else-if="leaderboard.length === 0" class="text-center py-8">
        <p class="text-gray-500">Keine Spieler gefunden</p>
      </div>

      <ul v-else class="space-y-2 max-h-96 overflow-y-auto">
        <li
          v-for="player in leaderboard"
          :key="player.id"
          class="flex items-center gap-3 p-3 rounded-lg transition-colors"
          :class="isCurrentUser(player) ? 'bg-indigo-50 ring-2 ring-indigo-200' : 'bg-gray-50 hover:bg-gray-100'"
        >
          <!-- Rank Badge -->
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            :class="getRankBadgeClass(player.rank)"
          >
            {{ player.rank }}
          </div>

          <!-- Avatar -->
          <div
            v-if="activeTab !== 'doubles'"
            class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold"
          >
            {{ getDisplayName(player).charAt(0).toUpperCase() }}
          </div>

          <!-- Name & Stats -->
          <div class="flex-1 min-w-0">
            <p class="font-semibold truncate" :class="isCurrentUser(player) ? 'text-indigo-700' : ''">
              {{ getDisplayName(player) }}
              <span v-if="isCurrentUser(player)" class="text-xs text-indigo-500">(Du)</span>
            </p>
          </div>

          <!-- Value -->
          <div class="text-right">
            <span class="font-bold text-gray-700">{{ getStatValue(player) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
