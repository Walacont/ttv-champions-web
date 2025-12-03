<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useMatches } from '@/composables/useMatches'

const props = defineProps({
  filter: {
    type: String,
    default: 'club'
  }
})

const authStore = useAuthStore()
const { getPendingRequests, acceptMatchRequest, rejectMatchRequest, loading } = useMatches()

const pendingRequests = ref([])
const processingId = ref(null)

const incomingRequests = computed(() => {
  return pendingRequests.value.filter(r => r.player_b_id === authStore.user?.id)
})

const outgoingRequests = computed(() => {
  return pendingRequests.value.filter(r => r.player_a_id === authStore.user?.id)
})

onMounted(async () => {
  if (authStore.user) {
    pendingRequests.value = await getPendingRequests(authStore.user.id)
  }
})

async function handleAccept(request) {
  processingId.value = request.id
  const result = await acceptMatchRequest(request.id, authStore.user.id)
  if (result) {
    pendingRequests.value = pendingRequests.value.filter(r => r.id !== request.id)
  }
  processingId.value = null
}

async function handleReject(request) {
  processingId.value = request.id
  const success = await rejectMatchRequest(request.id)
  if (success) {
    pendingRequests.value = pendingRequests.value.filter(r => r.id !== request.id)
  }
  processingId.value = null
}

function getOpponentName(request) {
  if (request.player_a_id === authStore.user?.id) {
    return request.player_b?.display_name || 'Unbekannt'
  }
  return request.player_a?.display_name || 'Unbekannt'
}

function formatScore(request) {
  return `${request.score_a || 0}:${request.score_b || 0}`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
      <span>📩</span>
      <span>Match-Anfragen</span>
      <span v-if="incomingRequests.length > 0" class="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
        {{ incomingRequests.length }}
      </span>
    </h2>

    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="text-sm text-gray-500 mt-2">Lade Anfragen...</p>
    </div>

    <div v-else-if="pendingRequests.length === 0" class="text-center py-6">
      <p class="text-gray-500">Keine offenen Match-Anfragen</p>
    </div>

    <div v-else class="space-y-4">
      <!-- Incoming Requests -->
      <div v-if="incomingRequests.length > 0">
        <h3 class="text-sm font-medium text-gray-700 mb-2">📥 Eingehende Anfragen</h3>
        <div class="space-y-2">
          <div
            v-for="request in incomingRequests"
            :key="request.id"
            class="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
          >
            <div class="flex justify-between items-start mb-3">
              <div>
                <p class="font-semibold">{{ request.player_a?.display_name || 'Unbekannt' }}</p>
                <p class="text-sm text-gray-500">{{ formatDate(request.created_at) }}</p>
              </div>
              <span class="text-xl font-bold text-gray-800">{{ formatScore(request) }}</span>
            </div>

            <div v-if="request.sets && request.sets.length > 0" class="mb-3">
              <p class="text-xs text-gray-500 mb-1">Sätze:</p>
              <div class="flex gap-2">
                <span
                  v-for="(set, idx) in request.sets"
                  :key="idx"
                  class="bg-white px-2 py-1 rounded text-xs border"
                >
                  {{ set.a }}:{{ set.b }}
                </span>
              </div>
            </div>

            <div class="flex gap-2">
              <button
                @click="handleAccept(request)"
                :disabled="processingId === request.id"
                class="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <i class="fas fa-check mr-1"></i>
                Bestätigen
              </button>
              <button
                @click="handleReject(request)"
                :disabled="processingId === request.id"
                class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <i class="fas fa-times mr-1"></i>
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Outgoing Requests -->
      <div v-if="outgoingRequests.length > 0">
        <h3 class="text-sm font-medium text-gray-700 mb-2">📤 Gesendete Anfragen</h3>
        <div class="space-y-2">
          <div
            v-for="request in outgoingRequests"
            :key="request.id"
            class="bg-gray-50 border border-gray-200 rounded-lg p-4"
          >
            <div class="flex justify-between items-center">
              <div>
                <p class="font-semibold">{{ request.player_b?.display_name || 'Unbekannt' }}</p>
                <p class="text-sm text-gray-500">{{ formatDate(request.created_at) }}</p>
              </div>
              <div class="text-right">
                <span class="text-lg font-bold text-gray-800">{{ formatScore(request) }}</span>
                <p class="text-xs text-yellow-600">⏳ Ausstehend</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
