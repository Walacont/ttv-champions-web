<script setup>
import { ref, computed } from 'vue'
import { supabase } from '@/composables/useSupabase'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits(['created'])
const authStore = useAuthStore()

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4='

// State
const searchQuery = ref('')
const searchResults = ref([])
const selectedOpponent = ref(null)
const matchMode = ref('best-of-5')
const sets = ref([
  { playerA: '', playerB: '' },
  { playerA: '', playerB: '' },
  { playerA: '', playerB: '' }
])
const loading = ref(false)
const error = ref('')
const success = ref('')

const hasClub = computed(() => !!authStore.profile?.club_id)

// Search opponents
let searchTimeout = null
async function searchOpponents() {
  if (searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    try {
      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, elo_rating')
        .eq('club_id', authStore.profile.club_id)
        .neq('id', authStore.user.id)
        .ilike('display_name', `%${searchQuery.value}%`)
        .limit(5)

      if (searchError) throw searchError
      searchResults.value = data || []
    } catch (err) {
      console.error('Search error:', err)
    }
  }, 300)
}

function selectOpponent(player) {
  selectedOpponent.value = player
  searchQuery.value = player.display_name
  searchResults.value = []
}

function clearOpponent() {
  selectedOpponent.value = null
  searchQuery.value = ''
}

// Validate set
function isValidSet(scoreA, scoreB) {
  const a = parseInt(scoreA) || 0
  const b = parseInt(scoreB) || 0
  if (a < 11 && b < 11) return false
  if (a === b) return false
  if (a >= 10 && b >= 10) return Math.abs(a - b) === 2
  return (a >= 11 && a > b) || (b >= 11 && b > a)
}

// Submit
async function submitRequest() {
  error.value = ''
  success.value = ''

  if (!selectedOpponent.value) {
    error.value = 'Bitte wähle einen Gegner'
    return
  }

  // Validate sets
  const filledSets = sets.value.filter(s => s.playerA !== '' && s.playerB !== '')
  if (filledSets.length < 3) {
    error.value = 'Mindestens 3 Sätze müssen ausgefüllt sein'
    return
  }

  for (let i = 0; i < filledSets.length; i++) {
    if (!isValidSet(filledSets[i].playerA, filledSets[i].playerB)) {
      error.value = `Satz ${i + 1}: Ungültiges Ergebnis`
      return
    }
  }

  // Calculate winner
  let aWins = 0, bWins = 0
  filledSets.forEach(s => {
    const a = parseInt(s.playerA) || 0
    const b = parseInt(s.playerB) || 0
    if (a > b) aWins++
    else bWins++
  })

  if (aWins < 3 && bWins < 3) {
    error.value = 'Ein Spieler muss 3 Sätze gewinnen'
    return
  }

  const winnerId = aWins >= 3 ? authStore.user.id : selectedOpponent.value.id
  const loserId = aWins >= 3 ? selectedOpponent.value.id : authStore.user.id

  loading.value = true
  try {
    const { error: insertError } = await supabase
      .from('match_requests')
      .insert({
        player_a_id: authStore.user.id,
        player_b_id: selectedOpponent.value.id,
        club_id: authStore.profile.club_id,
        sets: filledSets.map(s => ({
          playerA: parseInt(s.playerA),
          playerB: parseInt(s.playerB)
        })),
        match_mode: matchMode.value,
        winner_id: winnerId,
        loser_id: loserId,
        status: 'pending_player'
      })

    if (insertError) throw insertError

    success.value = 'Anfrage gesendet!'
    clearOpponent()
    sets.value = [
      { playerA: '', playerB: '' },
      { playerA: '', playerB: '' },
      { playerA: '', playerB: '' }
    ]
    emit('created')

    setTimeout(() => { success.value = '' }, 3000)
  } catch (err) {
    console.error('Submit error:', err)
    error.value = 'Fehler: ' + err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2 class="text-xl font-bold mb-4">🏓 Wettkampf melden</h2>

    <!-- No club warning -->
    <div v-if="!hasClub" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
      <p class="text-yellow-800">
        <i class="fas fa-exclamation-triangle mr-2"></i>
        Du musst einem Verein beitreten, um Wettkämpfe zu melden.
      </p>
    </div>

    <form v-else @submit.prevent="submitRequest" class="space-y-4">
      <!-- Opponent Search -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Gegner</label>
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="searchOpponents"
            type="text"
            placeholder="Spieler suchen..."
            class="input-field"
            :disabled="!!selectedOpponent"
          />
          <button
            v-if="selectedOpponent"
            @click="clearOpponent"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="mt-2 border rounded-lg overflow-hidden">
          <div
            v-for="player in searchResults"
            :key="player.id"
            @click="selectOpponent(player)"
            class="flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0"
          >
            <img :src="player.avatar_url || DEFAULT_AVATAR" class="w-8 h-8 rounded-full" />
            <div>
              <p class="font-medium">{{ player.display_name }}</p>
              <p class="text-xs text-gray-500">Elo: {{ player.elo_rating || 1000 }}</p>
            </div>
          </div>
        </div>

        <!-- Selected Opponent -->
        <div v-if="selectedOpponent" class="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <i class="fas fa-check-circle text-green-500"></i>
          <span class="font-medium text-green-800">{{ selectedOpponent.display_name }}</span>
          <span class="text-sm text-green-600">(Elo: {{ selectedOpponent.elo_rating || 1000 }})</span>
        </div>
      </div>

      <!-- Set Scores -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Satzergebnisse</label>
        <div class="space-y-2">
          <div v-for="(set, index) in sets" :key="index" class="flex items-center gap-3">
            <span class="text-sm text-gray-600 w-16">Satz {{ index + 1 }}:</span>
            <input
              v-model="set.playerA"
              type="number"
              min="0"
              max="99"
              placeholder="0"
              class="w-16 px-2 py-2 border rounded-lg text-center"
            />
            <span class="text-gray-500">:</span>
            <input
              v-model="set.playerB"
              type="number"
              min="0"
              max="99"
              placeholder="0"
              class="w-16 px-2 py-2 border rounded-lg text-center"
            />
          </div>
        </div>
      </div>

      <!-- Error/Success -->
      <div v-if="error" class="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
        {{ error }}
      </div>
      <div v-if="success" class="bg-green-100 text-green-700 p-3 rounded-lg text-sm">
        {{ success }}
      </div>

      <!-- Submit -->
      <button type="submit" class="w-full btn-primary" :disabled="loading">
        <span v-if="loading">Senden...</span>
        <span v-else><i class="fas fa-paper-plane mr-2"></i>Anfrage senden</span>
      </button>
    </form>
  </div>
</template>
