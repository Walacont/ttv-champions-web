<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'
import MatchRequestCard from '@/components/MatchRequestCard.vue'

const userStore = useUserStore()

// New match request form
const showRequestForm = ref(false)
const selectedOpponent = ref('')
const proposedDate = ref('')
const submitting = ref(false)

// Club players for opponent selection
const clubPlayersQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'users'),
    where('clubId', '==', userStore.clubId),
    where('role', '==', 'player'),
    orderBy('lastName', 'asc')
  )
})
const clubPlayers = useCollection(clubPlayersQuery)

// Filter out current user from opponents list
const availableOpponents = computed(() => {
  if (!clubPlayers.value) return []
  return clubPlayers.value.filter(p => p.id !== userStore.userData?.id)
})

// Incoming requests
const incomingRequestsQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matchRequests'),
    where('opponentId', '==', userStore.userData.id),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  )
})
const incomingRequests = useCollection(incomingRequestsQuery)

// Outgoing requests
const outgoingRequestsQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matchRequests'),
    where('requesterId', '==', userStore.userData.id),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  )
})
const outgoingRequests = useCollection(outgoingRequestsQuery)

// Match history
const matchHistoryQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matches'),
    where('playerIds', 'array-contains', userStore.userData.id),
    orderBy('playedAt', 'desc'),
    limit(20)
  )
})
const matchHistory = useCollection(matchHistoryQuery)

// Submit new match request
async function submitRequest() {
  if (!selectedOpponent.value || submitting.value) return

  submitting.value = true
  const opponent = clubPlayers.value.find(p => p.id === selectedOpponent.value)

  try {
    await addDoc(collection(db, 'matchRequests'), {
      requesterId: userStore.userData.id,
      requesterName: `${userStore.userData.firstName} ${userStore.userData.lastName}`,
      requesterElo: userStore.userData.eloRating || 1000,
      opponentId: selectedOpponent.value,
      opponentName: `${opponent.firstName} ${opponent.lastName}`,
      opponentElo: opponent.eloRating || 1000,
      clubId: userStore.clubId,
      status: 'pending',
      proposedDate: proposedDate.value ? new Date(proposedDate.value) : null,
      createdAt: serverTimestamp()
    })

    // Reset form
    showRequestForm.value = false
    selectedOpponent.value = ''
    proposedDate.value = ''
  } catch (error) {
    console.error('Error creating match request:', error)
  } finally {
    submitting.value = false
  }
}

// Format date helper
function formatDate(timestamp) {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Check if current user won the match
function didWin(match) {
  const isPlayer1 = match.player1Id === userStore.userData?.id
  return isPlayer1 ? match.winner === 1 : match.winner === 2
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold text-gray-900">Matches</h1>
      <button
        @click="showRequestForm = !showRequestForm"
        class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
      >
        <span>{{ showRequestForm ? '✕ Abbrechen' : '+ Neues Match' }}</span>
      </button>
    </div>

    <!-- New Match Request Form -->
    <div v-if="showRequestForm" class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Match anfragen</h2>

      <form @submit.prevent="submitRequest" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Gegner auswählen</label>
          <select
            v-model="selectedOpponent"
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">-- Gegner wählen --</option>
            <option
              v-for="player in availableOpponents"
              :key="player.id"
              :value="player.id"
            >
              {{ player.firstName }} {{ player.lastName }} ({{ player.eloRating || 1000 }} Elo)
            </option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Vorgeschlagenes Datum (optional)</label>
          <input
            v-model="proposedDate"
            type="datetime-local"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          :disabled="!selectedOpponent || submitting"
          class="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ submitting ? 'Wird gesendet...' : 'Anfrage senden' }}
        </button>
      </form>
    </div>

    <!-- Incoming Requests -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">
        📬 Eingehende Anfragen
        <span v-if="incomingRequests?.length" class="text-indigo-600">({{ incomingRequests.length }})</span>
      </h2>

      <div v-if="incomingRequests?.length" class="space-y-2">
        <MatchRequestCard
          v-for="request in incomingRequests"
          :key="request.id"
          :request="request"
          type="incoming"
        />
      </div>
      <p v-else class="text-gray-500 text-center py-4">
        Keine eingehenden Anfragen
      </p>
    </div>

    <!-- Outgoing Requests -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">
        📤 Gesendete Anfragen
        <span v-if="outgoingRequests?.length" class="text-yellow-600">({{ outgoingRequests.length }})</span>
      </h2>

      <div v-if="outgoingRequests?.length" class="space-y-2">
        <MatchRequestCard
          v-for="request in outgoingRequests"
          :key="request.id"
          :request="request"
          type="outgoing"
        />
      </div>
      <p v-else class="text-gray-500 text-center py-4">
        Keine ausstehenden Anfragen
      </p>
    </div>

    <!-- Match History -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">📜 Match-Historie</h2>

      <div v-if="matchHistory?.length" class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="text-left text-sm text-gray-500 border-b">
              <th class="pb-2">Datum</th>
              <th class="pb-2">Gegner</th>
              <th class="pb-2">Ergebnis</th>
              <th class="pb-2">Elo</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="match in matchHistory"
              :key="match.id"
              class="border-b border-gray-100"
            >
              <td class="py-3 text-sm">{{ formatDate(match.playedAt) }}</td>
              <td class="py-3">
                <span class="font-medium">
                  {{ match.player1Id === userStore.userData?.id ? match.player2Name : match.player1Name }}
                </span>
              </td>
              <td class="py-3">
                <span
                  class="px-2 py-1 rounded text-sm font-medium"
                  :class="didWin(match) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ didWin(match) ? 'Sieg' : 'Niederlage' }}
                </span>
              </td>
              <td class="py-3 text-sm">
                <span :class="(match.eloChange || 0) >= 0 ? 'text-green-600' : 'text-red-600'">
                  {{ (match.eloChange || 0) >= 0 ? '+' : '' }}{{ match.eloChange || 0 }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-gray-500 text-center py-4">
        Noch keine Matches gespielt
      </p>
    </div>
  </div>
</template>
