<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/composables/useSupabase'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4='

const requests = ref([])
const profiles = ref({})
const loading = ref(true)

async function loadRequests() {
  if (!authStore.user) return

  loading.value = true
  try {
    const { data, error } = await supabase
      .from('match_requests')
      .select('*')
      .or(`player_a_id.eq.${authStore.user.id},player_b_id.eq.${authStore.user.id}`)
      .in('status', ['pending_player', 'pending_coach'])
      .order('created_at', { ascending: false })

    if (error) throw error
    requests.value = data || []

    // Load profiles
    const userIds = [...new Set(requests.value.flatMap(r => [r.player_a_id, r.player_b_id]))]
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds)

      profileData?.forEach(p => { profiles.value[p.id] = p })
    }
  } catch (error) {
    console.error('Error loading requests:', error)
  } finally {
    loading.value = false
  }
}

function formatSets(sets) {
  if (!sets || sets.length === 0) return 'Keine Sätze'
  return sets.map(s => `${s.playerA}:${s.playerB}`).join(', ')
}

async function respond(requestId, accept) {
  try {
    const { error } = await supabase
      .from('match_requests')
      .update({ status: accept ? 'pending_coach' : 'rejected' })
      .eq('id', requestId)

    if (error) throw error
    loadRequests()
  } catch (error) {
    console.error('Error responding:', error)
    alert('Fehler beim Verarbeiten')
  }
}

async function deleteRequest(requestId) {
  if (!confirm('Anfrage zurückziehen?')) return

  try {
    const { error } = await supabase
      .from('match_requests')
      .delete()
      .eq('id', requestId)

    if (error) throw error
    loadRequests()
  } catch (error) {
    console.error('Error deleting:', error)
  }
}

onMounted(() => {
  loadRequests()
})
</script>

<template>
  <div class="card">
    <h2 class="text-xl font-bold mb-4">📋 Ausstehende Anfragen</h2>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <!-- Request List -->
    <div v-else class="space-y-3">
      <div
        v-for="req in requests"
        :key="req.id"
        class="border rounded-lg p-4"
        :class="req.player_b_id === authStore.user?.id && req.status === 'pending_player'
          ? 'border-indigo-300 bg-indigo-50'
          : 'border-gray-200'"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <img
              :src="profiles[req.player_a_id === authStore.user?.id ? req.player_b_id : req.player_a_id]?.avatar_url || DEFAULT_AVATAR"
              class="w-10 h-10 rounded-full"
            />
            <div>
              <p class="font-medium">
                {{ req.player_a_id === authStore.user?.id ? 'Anfrage an' : 'Anfrage von' }}
                {{ profiles[req.player_a_id === authStore.user?.id ? req.player_b_id : req.player_a_id]?.display_name || 'Unbekannt' }}
              </p>
              <p class="text-sm text-gray-500">{{ formatSets(req.sets) }}</p>
            </div>
          </div>
          <span
            class="text-xs px-2 py-1 rounded-full"
            :class="req.status === 'pending_coach' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'"
          >
            {{ req.status === 'pending_coach' ? 'Wartet auf Coach' : 'Wartet auf Bestätigung' }}
          </span>
        </div>

        <!-- Actions -->
        <div class="mt-3 flex gap-2">
          <!-- Incoming request - needs response -->
          <template v-if="req.player_b_id === authStore.user?.id && req.status === 'pending_player'">
            <button @click="respond(req.id, true)" class="flex-1 btn-success text-sm py-2">
              <i class="fas fa-check mr-1"></i> Akzeptieren
            </button>
            <button @click="respond(req.id, false)" class="flex-1 btn-danger text-sm py-2">
              <i class="fas fa-times mr-1"></i> Ablehnen
            </button>
          </template>

          <!-- My request - can delete -->
          <template v-else-if="req.player_a_id === authStore.user?.id">
            <button @click="deleteRequest(req.id)" class="flex-1 btn-danger text-sm py-2">
              <i class="fas fa-trash mr-1"></i> Zurückziehen
            </button>
          </template>
        </div>
      </div>

      <!-- Empty state -->
      <p v-if="requests.length === 0" class="text-center text-gray-500 py-4">
        Keine ausstehenden Anfragen
      </p>
    </div>
  </div>
</template>
