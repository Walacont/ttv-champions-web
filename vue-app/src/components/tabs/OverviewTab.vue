<script setup>
import { computed } from 'vue'
import { collection, query, where, orderBy, limit } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'
import StatCard from '@/components/StatCard.vue'
import RivalCard from '@/components/RivalCard.vue'
import MatchRequestCard from '@/components/MatchRequestCard.vue'

const userStore = useUserStore()

// Pending match requests
const pendingRequestsQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matchRequests'),
    where('opponentId', '==', userStore.userData.id),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(5)
  )
})
const pendingRequests = useCollection(pendingRequestsQuery)

// Club players for rivals
const clubPlayersQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'users'),
    where('clubId', '==', userStore.clubId),
    where('role', '==', 'player'),
    orderBy('eloRating', 'desc'),
    limit(20)
  )
})
const clubPlayers = useCollection(clubPlayersQuery)

// Rivals
const rivals = computed(() => {
  if (!clubPlayers.value || !userStore.userData) return []
  const myElo = userStore.userData.eloRating || 1000
  return clubPlayers.value
    .filter(p => p.id !== userStore.userData.id)
    .map(p => ({ ...p, eloDiff: Math.abs((p.eloRating || 1000) - myElo) }))
    .sort((a, b) => a.eloDiff - b.eloDiff)
    .slice(0, 3)
})

// Challenges
const challengesQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'challenges'),
    where('clubId', '==', userStore.clubId),
    where('active', '==', true),
    limit(3)
  )
})
const challenges = useCollection(challengesQuery)
</script>

<template>
  <div class="space-y-6">
    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard title="Elo Rating" :value="userStore.userData?.eloRating || 1000" icon="⚡" color="indigo" />
      <StatCard title="XP" :value="userStore.userData?.xp || 0" icon="💪" color="green" />
      <StatCard title="Season Punkte" :value="userStore.userData?.points || 0" icon="⭐" color="yellow" />
      <StatCard title="Siege" :value="userStore.userData?.wins || 0" icon="🏆" color="purple" />
    </div>

    <!-- Pending Requests -->
    <div v-if="pendingRequests?.length" class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">
        📬 Offene Anfragen ({{ pendingRequests.length }})
      </h3>
      <div class="space-y-2">
        <MatchRequestCard
          v-for="request in pendingRequests"
          :key="request.id"
          :request="request"
          type="incoming"
        />
      </div>
    </div>

    <!-- Rivals -->
    <div v-if="rivals?.length" class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">🎯 Deine Rivalen</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RivalCard
          v-for="rival in rivals"
          :key="rival.id"
          :player="rival"
          :currentUserElo="userStore.userData?.eloRating || 1000"
        />
      </div>
    </div>

    <!-- Challenges -->
    <div v-if="challenges?.length" class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-3">🎯 Aktive Challenges</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          v-for="challenge in challenges"
          :key="challenge.id"
          class="bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200"
        >
          <h4 class="font-semibold text-gray-900">{{ challenge.name }}</h4>
          <p class="text-sm text-gray-600 mt-1">{{ challenge.description }}</p>
          <div class="mt-2 text-xs text-yellow-700">+{{ challenge.xpReward || 0 }} XP</div>
        </div>
      </div>
    </div>
  </div>
</template>
