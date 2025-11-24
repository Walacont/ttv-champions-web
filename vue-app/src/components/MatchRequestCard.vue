<script setup>
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/config/firebase'

const props = defineProps({
  request: Object,
  type: {
    type: String,
    default: 'incoming' // 'incoming' or 'outgoing'
  }
})

const emit = defineEmits(['accepted', 'rejected'])

async function acceptRequest() {
  try {
    await updateDoc(doc(db, 'matchRequests', props.request.id), {
      status: 'accepted',
      respondedAt: serverTimestamp()
    })
    emit('accepted', props.request)
  } catch (error) {
    console.error('Error accepting request:', error)
  }
}

async function rejectRequest() {
  try {
    await updateDoc(doc(db, 'matchRequests', props.request.id), {
      status: 'rejected',
      respondedAt: serverTimestamp()
    })
    emit('rejected', props.request)
  } catch (error) {
    console.error('Error rejecting request:', error)
  }
}

async function cancelRequest() {
  try {
    await deleteDoc(doc(db, 'matchRequests', props.request.id))
  } catch (error) {
    console.error('Error canceling request:', error)
  }
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
          <span class="text-indigo-600 font-medium">
            {{ type === 'incoming' ? (request.playerAName || request.requesterName)?.[0] : (request.playerBName || request.opponentName)?.[0] }}
          </span>
        </div>
        <div>
          <p class="font-medium text-gray-900">
            {{ type === 'incoming' ? (request.playerAName || request.requesterName) : (request.playerBName || request.opponentName) }}
          </p>
          <p class="text-xs text-gray-500">
            {{ formatDate(request.createdAt) }}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex space-x-2">
        <template v-if="type === 'incoming'">
          <button
            @click="acceptRequest"
            class="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
          >
            Annehmen
          </button>
          <button
            @click="rejectRequest"
            class="px-3 py-1 bg-red-100 text-red-600 text-sm rounded-md hover:bg-red-200"
          >
            Ablehnen
          </button>
        </template>
        <template v-else>
          <span class="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded-md">
            Ausstehend
          </span>
          <button
            @click="cancelRequest"
            class="px-3 py-1 text-gray-500 text-sm hover:text-red-600"
          >
            ✕
          </button>
        </template>
      </div>
    </div>

    <!-- Match Details -->
    <div class="mt-3 pt-3 border-t border-gray-200">
      <!-- Set scores -->
      <div v-if="request.sets?.length" class="flex items-center gap-2 text-sm">
        <span class="text-gray-600">Sätze:</span>
        <span class="font-mono font-medium text-gray-800">
          {{ request.sets.map(s => `${s.playerA}:${s.playerB}`).join(', ') }}
        </span>
      </div>
      <!-- Winner info -->
      <div class="mt-1 text-sm">
        <span
          class="px-2 py-0.5 rounded text-xs font-medium"
          :class="(request.winner === 'requester' || request.winnerId === request.playerAId) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
        >
          {{ type === 'incoming'
            ? ((request.winner === 'requester' || request.winnerId === request.playerAId) ? 'Absender gewinnt' : 'Du gewinnst')
            : ((request.winner === 'requester' || request.winnerId === request.playerAId) ? 'Du gewinnst' : 'Gegner gewinnt')
          }}
        </span>
        <span class="text-gray-500 ml-2">{{ request.matchMode || request.mode }}</span>
      </div>
    </div>
  </div>
</template>
