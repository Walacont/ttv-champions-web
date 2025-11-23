<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Active tab and scope
const activeTab = ref('effort')
const scope = ref('club')

// Tabs configuration
const tabs = [
  { id: 'effort', label: 'Fleiß', sublabel: '(XP)', icon: '💪' },
  { id: 'season', label: 'Season', sublabel: '(Punkte)', icon: '⭐' },
  { id: 'skill', label: 'Skill', sublabel: '(Elo)', icon: '⚡' }
]

// Query for club players
const clubPlayersQuery = computed(() => {
  if (!userStore.clubId) return null

  const sortField = activeTab.value === 'effort' ? 'xp'
    : activeTab.value === 'season' ? 'points'
    : 'eloRating'

  return query(
    collection(db, 'users'),
    where('clubId', '==', userStore.clubId),
    where('role', '==', 'player'),
    orderBy(sortField, 'desc')
  )
})

// Query for global players
const globalPlayersQuery = computed(() => {
  const sortField = activeTab.value === 'effort' ? 'xp'
    : activeTab.value === 'season' ? 'points'
    : 'eloRating'

  return query(
    collection(db, 'users'),
    where('role', '==', 'player'),
    orderBy(sortField, 'desc')
  )
})

// Get players based on scope
const clubPlayers = useCollection(clubPlayersQuery)
const globalPlayers = useCollection(globalPlayersQuery)

const players = computed(() => {
  return scope.value === 'club' ? clubPlayers.value : globalPlayers.value
})

// Get display value based on active tab
function getDisplayValue(player) {
  if (activeTab.value === 'effort') return `${player.xp || 0} XP`
  if (activeTab.value === 'season') return `${player.points || 0} Pkt`
  return `${player.eloRating || 0} Elo`
}

// Get rank display
function getRankDisplay(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return index + 1
}

// Get player initials
function getInitials(player) {
  return (player.firstName?.[0] || '') + (player.lastName?.[0] || '')
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
    <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

    <!-- Tabs -->
    <div class="flex justify-center border-b border-gray-200 mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="px-6 py-3 text-sm font-semibold border-b-2 transition-colors"
        :class="activeTab === tab.id
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-600 hover:border-gray-300'"
      >
        <div>{{ tab.icon }} {{ tab.label }}</div>
        <div class="text-xs text-gray-500 font-normal">{{ tab.sublabel }}</div>
      </button>
    </div>

    <!-- Scope Toggle -->
    <div class="flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100 mb-6">
      <button
        @click="scope = 'club'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="scope === 'club' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
      >
        Mein Verein
      </button>
      <button
        @click="scope = 'global'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="scope === 'global' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
      >
        Global
      </button>
    </div>

    <!-- Player List -->
    <div class="space-y-2">
      <div v-if="!players?.length" class="text-center py-8 text-gray-500">
        Keine Spieler gefunden.
      </div>

      <div
        v-for="(player, index) in players"
        :key="player.id"
        class="flex items-center p-3 rounded-lg"
        :class="player.id === userStore.userData?.id ? 'bg-indigo-100 font-bold' : 'bg-gray-50'"
      >
        <!-- Rank -->
        <div class="w-10 text-center font-bold text-lg">
          {{ getRankDisplay(index) }}
        </div>

        <!-- Avatar -->
        <img
          :src="player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${getInitials(player)}`"
          :alt="player.firstName"
          class="h-10 w-10 rounded-full object-cover mr-4"
        />

        <!-- Name -->
        <div class="flex-grow">
          <p class="text-sm font-medium text-gray-900">
            {{ player.firstName }} {{ player.lastName }}
          </p>
          <p v-if="scope === 'global'" class="text-xs text-gray-400">
            {{ player.clubId || 'Kein Verein' }}
          </p>
        </div>

        <!-- Score -->
        <div class="text-right">
          <p class="text-sm font-bold text-gray-900">{{ getDisplayValue(player) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
