<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Leaderboard type and scope
const activeType = ref('effort')
const scope = ref('club')

const types = [
  { id: 'effort', label: 'Fleiß', sublabel: '(XP)', icon: '💪' },
  { id: 'season', label: 'Season', sublabel: '(Punkte)', icon: '⭐' },
  { id: 'skill', label: 'Skill', sublabel: '(Elo)', icon: '⚡' },
  { id: 'ranks', label: 'Ränge', sublabel: '(Level)', icon: '🏆' },
]

// Club players query
const clubPlayersQuery = computed(() => {
  if (!userStore.clubId) return null
  const sortField = activeType.value === 'effort' ? 'xp'
    : activeType.value === 'season' ? 'points' : 'eloRating'
  return query(
    collection(db, 'users'),
    where('clubId', '==', userStore.clubId),
    where('role', '==', 'player'),
    orderBy(sortField, 'desc')
  )
})
const clubPlayers = useCollection(clubPlayersQuery)

// Global players query
const globalPlayersQuery = computed(() => {
  const sortField = activeType.value === 'effort' ? 'xp'
    : activeType.value === 'season' ? 'points' : 'eloRating'
  return query(
    collection(db, 'users'),
    where('role', '==', 'player'),
    orderBy(sortField, 'desc')
  )
})
const globalPlayers = useCollection(globalPlayersQuery)

const players = computed(() => scope.value === 'club' ? clubPlayers.value : globalPlayers.value)

function getDisplayValue(player) {
  if (activeType.value === 'effort') return `${player.xp || 0} XP`
  if (activeType.value === 'season') return `${player.points || 0} Pkt`
  return `${player.eloRating || 0} Elo`
}

function getRankDisplay(index) {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return index + 1
}

function getInitials(player) {
  return (player.firstName?.[0] || '') + (player.lastName?.[0] || '')
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

    <!-- Type Tabs -->
    <div class="flex justify-center border-b border-gray-200 mb-4 overflow-x-auto">
      <button
        v-for="type in types"
        :key="type.id"
        @click="activeType = type.id"
        class="px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap"
        :class="activeType === type.id
          ? 'border-indigo-600 text-indigo-600'
          : 'border-transparent text-gray-600 hover:border-gray-300'"
      >
        <div>{{ type.icon }} {{ type.label }}</div>
        <div class="text-xs text-gray-500 font-normal">{{ type.sublabel }}</div>
      </button>
    </div>

    <!-- Scope Toggle -->
    <div v-if="activeType !== 'ranks'" class="flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100 mb-6">
      <button
        @click="scope = 'club'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="scope === 'club' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
      >
        🏠 Mein Verein
      </button>
      <button
        @click="scope = 'global'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="scope === 'global' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
      >
        🌍 Global
      </button>
    </div>

    <!-- Player List -->
    <div class="space-y-2 max-h-96 overflow-y-auto">
      <div v-if="!players?.length" class="text-center py-8 text-gray-500">
        Keine Spieler gefunden.
      </div>

      <div
        v-for="(player, index) in players"
        :key="player.id"
        class="flex items-center p-3 rounded-lg"
        :class="player.id === userStore.userData?.id ? 'bg-indigo-100 font-bold' : 'bg-gray-50'"
      >
        <div class="w-10 text-center font-bold text-lg">{{ getRankDisplay(index) }}</div>
        <img
          :src="player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${getInitials(player)}`"
          :alt="player.firstName"
          class="h-10 w-10 rounded-full object-cover mr-4"
        />
        <div class="flex-grow">
          <p class="text-sm font-medium text-gray-900">{{ player.firstName }} {{ player.lastName }}</p>
          <p v-if="scope === 'global'" class="text-xs text-gray-400">{{ player.clubId || 'Kein Verein' }}</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold text-gray-900">{{ getDisplayValue(player) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
