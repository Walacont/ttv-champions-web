<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy, limit } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

// Components
import StatCard from '@/components/StatCard.vue'
import MatchRequestCard from '@/components/MatchRequestCard.vue'
import RivalCard from '@/components/RivalCard.vue'

const userStore = useUserStore()

// Active tab
const activeTab = ref('overview')

const tabs = [
  { id: 'overview', label: 'Übersicht', icon: '📊' },
  { id: 'matches', label: 'Matches', icon: '🏓' },
  { id: 'training', label: 'Training', icon: '💪' }
]

// Pending match requests (incoming)
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

// My sent requests
const myRequestsQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matchRequests'),
    where('requesterId', '==', userStore.userData.id),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(5)
  )
})
const myRequests = useCollection(myRequestsQuery)

// Recent matches
const recentMatchesQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matches'),
    where('playerIds', 'array-contains', userStore.userData.id),
    orderBy('playedAt', 'desc'),
    limit(5)
  )
})
const recentMatches = useCollection(recentMatchesQuery)

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

// Find rivals (players with similar Elo)
const rivals = computed(() => {
  if (!clubPlayers.value || !userStore.userData) return []
  const myElo = userStore.userData.eloRating || 1000

  return clubPlayers.value
    .filter(p => p.id !== userStore.userData.id)
    .map(p => ({
      ...p,
      eloDiff: Math.abs((p.eloRating || 1000) - myElo)
    }))
    .sort((a, b) => a.eloDiff - b.eloDiff)
    .slice(0, 3)
})

// Active challenges
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
    <!-- Welcome Header -->
    <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-xl shadow-lg">
      <h1 class="text-2xl font-bold">
        Willkommen zurück, {{ userStore.userData?.firstName }}!
      </h1>
      <p class="text-indigo-100 mt-1">
        Hier ist dein persönliches Dashboard.
      </p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        title="Elo Rating"
        :value="userStore.userData?.eloRating || 1000"
        icon="⚡"
        color="indigo"
      />
      <StatCard
        title="XP"
        :value="userStore.userData?.xp || 0"
        icon="💪"
        color="green"
      />
      <StatCard
        title="Season Punkte"
        :value="userStore.userData?.points || 0"
        icon="⭐"
        color="yellow"
      />
      <StatCard
        title="Siege"
        :value="userStore.userData?.wins || 0"
        icon="🏆"
        color="purple"
      />
    </div>

    <!-- Tabs -->
    <div class="bg-white rounded-xl shadow-md overflow-hidden">
      <div class="flex border-b border-gray-200">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex-1 py-4 px-4 text-sm font-medium transition-colors"
          :class="activeTab === tab.id
            ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
            : 'text-gray-500 hover:text-gray-700'"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      </div>

      <div class="p-6">
        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="space-y-6">
          <!-- Pending Match Requests -->
          <div v-if="pendingRequests?.length">
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
          <div v-if="rivals?.length">
            <h3 class="text-lg font-semibold text-gray-900 mb-3">
              🎯 Deine Rivalen
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RivalCard
                v-for="rival in rivals"
                :key="rival.id"
                :player="rival"
                :currentUserElo="userStore.userData?.eloRating || 1000"
              />
            </div>
          </div>

          <!-- Active Challenges -->
          <div v-if="challenges?.length">
            <h3 class="text-lg font-semibold text-gray-900 mb-3">
              🎯 Aktive Challenges
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                v-for="challenge in challenges"
                :key="challenge.id"
                class="bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200"
              >
                <h4 class="font-semibold text-gray-900">{{ challenge.name }}</h4>
                <p class="text-sm text-gray-600 mt-1">{{ challenge.description }}</p>
                <div class="mt-2 text-xs text-yellow-700">
                  +{{ challenge.xpReward || 0 }} XP
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="!pendingRequests?.length && !rivals?.length && !challenges?.length" class="text-center py-8">
            <p class="text-gray-500">Alles erledigt! Keine offenen Aufgaben.</p>
          </div>
        </div>

        <!-- Matches Tab -->
        <div v-if="activeTab === 'matches'" class="space-y-6">
          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-3">📤 Meine Anfragen</h3>
            <div v-if="myRequests?.length" class="space-y-2">
              <MatchRequestCard
                v-for="request in myRequests"
                :key="request.id"
                :request="request"
                type="outgoing"
              />
            </div>
            <p v-else class="text-gray-500 text-center py-4">Keine offenen Anfragen</p>
          </div>

          <div>
            <h3 class="text-lg font-semibold text-gray-900 mb-3">📜 Letzte Matches</h3>
            <div v-if="recentMatches?.length" class="space-y-2">
              <div
                v-for="match in recentMatches"
                :key="match.id"
                class="bg-gray-50 p-4 rounded-lg flex justify-between items-center"
              >
                <span class="font-medium">{{ match.player1Name }} vs {{ match.player2Name }}</span>
                <span class="text-sm text-gray-500">{{ match.score }}</span>
              </div>
            </div>
            <p v-else class="text-gray-500 text-center py-4">Noch keine Matches gespielt</p>
          </div>
        </div>

        <!-- Training Tab -->
        <div v-if="activeTab === 'training'" class="text-center py-12">
          <div class="text-6xl mb-4">🏋️</div>
          <h3 class="text-xl font-semibold text-gray-900">Training Features</h3>
          <p class="text-gray-500 mt-2">Übungen und Trainingspläne werden hier angezeigt.</p>
        </div>
      </div>
    </div>

    <!-- Quick Links -->
    <div class="grid grid-cols-2 gap-4">
      <router-link
        to="/leaderboard"
        class="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center space-x-3"
      >
        <span class="text-2xl">🏆</span>
        <span class="font-medium text-gray-900">Rangliste</span>
      </router-link>
      <a
        href="/settings.html"
        class="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center space-x-3"
      >
        <span class="text-2xl">⚙️</span>
        <span class="font-medium text-gray-900">Einstellungen</span>
      </a>
    </div>
  </div>
</template>
