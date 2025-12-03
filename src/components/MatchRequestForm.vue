<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '@/composables/useSupabase'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits(['created'])
const authStore = useAuthStore()

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4='

// Match type: singles or doubles
const matchType = ref('singles')

// Singles state
const searchQuery = ref('')
const searchResults = ref([])
const selectedOpponent = ref(null)

// Doubles state
const partnerSearchQuery = ref('')
const partnerSearchResults = ref([])
const selectedPartner = ref(null)

const opponent1SearchQuery = ref('')
const opponent1SearchResults = ref([])
const selectedOpponent1 = ref(null)

const opponent2SearchQuery = ref('')
const opponent2SearchResults = ref([])
const selectedOpponent2 = ref(null)

// Match config
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

const isDoublesComplete = computed(() => {
  return matchType.value === 'doubles' &&
         selectedPartner.value &&
         selectedOpponent1.value &&
         selectedOpponent2.value
})

const isSinglesComplete = computed(() => {
  return matchType.value === 'singles' && selectedOpponent.value
})

// Clear selections when match type changes
watch(matchType, () => {
  clearAllSelections()
})

function clearAllSelections() {
  selectedOpponent.value = null
  selectedPartner.value = null
  selectedOpponent1.value = null
  selectedOpponent2.value = null
  searchQuery.value = ''
  partnerSearchQuery.value = ''
  opponent1SearchQuery.value = ''
  opponent2SearchQuery.value = ''
  searchResults.value = []
  partnerSearchResults.value = []
  opponent1SearchResults.value = []
  opponent2SearchResults.value = []
  sets.value = [
    { playerA: '', playerB: '' },
    { playerA: '', playerB: '' },
    { playerA: '', playerB: '' }
  ]
  error.value = ''
}

// Generic search function
let searchTimeout = null
async function searchPlayers(query, resultsRef, excludeIds = []) {
  if (query.length < 2) {
    resultsRef.value = []
    return
  }

  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    try {
      let queryBuilder = supabase
        .from('profiles')
        .select('id, display_name, avatar_url, elo_rating')
        .eq('club_id', authStore.profile.club_id)
        .neq('id', authStore.user.id)
        .ilike('display_name', `%${query}%`)
        .limit(5)

      // Exclude already selected players
      if (excludeIds.length > 0) {
        excludeIds.forEach(id => {
          if (id) queryBuilder = queryBuilder.neq('id', id)
        })
      }

      const { data, error: searchError } = await queryBuilder

      if (searchError) throw searchError
      resultsRef.value = data || []
    } catch (err) {
      console.error('Search error:', err)
    }
  }, 300)
}

// Singles search
function searchOpponents() {
  searchPlayers(searchQuery.value, searchResults)
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

// Doubles search functions
function searchPartner() {
  const excludeIds = [selectedOpponent1.value?.id, selectedOpponent2.value?.id]
  searchPlayers(partnerSearchQuery.value, partnerSearchResults, excludeIds)
}

function selectPartner(player) {
  selectedPartner.value = player
  partnerSearchQuery.value = player.display_name
  partnerSearchResults.value = []
}

function clearPartner() {
  selectedPartner.value = null
  partnerSearchQuery.value = ''
}

function searchOpponent1() {
  const excludeIds = [selectedPartner.value?.id, selectedOpponent2.value?.id]
  searchPlayers(opponent1SearchQuery.value, opponent1SearchResults, excludeIds)
}

function selectOpponent1(player) {
  selectedOpponent1.value = player
  opponent1SearchQuery.value = player.display_name
  opponent1SearchResults.value = []
}

function clearOpponent1() {
  selectedOpponent1.value = null
  opponent1SearchQuery.value = ''
}

function searchOpponent2() {
  const excludeIds = [selectedPartner.value?.id, selectedOpponent1.value?.id]
  searchPlayers(opponent2SearchQuery.value, opponent2SearchResults, excludeIds)
}

function selectOpponent2(player) {
  selectedOpponent2.value = player
  opponent2SearchQuery.value = player.display_name
  opponent2SearchResults.value = []
}

function clearOpponent2() {
  selectedOpponent2.value = null
  opponent2SearchQuery.value = ''
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

  // Validate player selection
  if (matchType.value === 'singles' && !selectedOpponent.value) {
    error.value = 'Bitte wähle einen Gegner'
    return
  }

  if (matchType.value === 'doubles') {
    if (!selectedPartner.value) {
      error.value = 'Bitte wähle deinen Doppelpartner'
      return
    }
    if (!selectedOpponent1.value || !selectedOpponent2.value) {
      error.value = 'Bitte wähle beide Gegenspieler'
      return
    }
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
    error.value = 'Ein Spieler/Team muss 3 Sätze gewinnen'
    return
  }

  loading.value = true
  try {
    if (matchType.value === 'singles') {
      // Singles match
      const winnerId = aWins >= 3 ? authStore.user.id : selectedOpponent.value.id
      const loserId = aWins >= 3 ? selectedOpponent.value.id : authStore.user.id

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
          match_type: 'singles',
          winner_id: winnerId,
          loser_id: loserId,
          status: 'pending_player'
        })

      if (insertError) throw insertError
    } else {
      // Doubles match
      const { error: insertError } = await supabase
        .from('doubles_match_requests')
        .insert({
          team_a_player1_id: authStore.user.id,
          team_a_player2_id: selectedPartner.value.id,
          team_b_player1_id: selectedOpponent1.value.id,
          team_b_player2_id: selectedOpponent2.value.id,
          club_id: authStore.profile.club_id,
          sets: filledSets.map(s => ({
            teamA: parseInt(s.playerA),
            teamB: parseInt(s.playerB)
          })),
          match_mode: matchMode.value,
          team_a_wins: aWins >= 3,
          status: 'pending_partner', // Partner must confirm first
          created_by: authStore.user.id
        })

      if (insertError) throw insertError
    }

    success.value = matchType.value === 'singles'
      ? 'Anfrage gesendet!'
      : 'Doppel-Anfrage gesendet! Dein Partner muss bestätigen.'

    clearAllSelections()
    emit('created')

    setTimeout(() => { success.value = '' }, 4000)
  } catch (err) {
    console.error('Submit error:', err)
    error.value = 'Fehler: ' + err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-md p-6">
    <h2 class="text-xl font-bold mb-4">🏓 Wettkampf melden</h2>

    <!-- No club warning -->
    <div v-if="!hasClub" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
      <p class="text-yellow-800">
        <i class="fas fa-exclamation-triangle mr-2"></i>
        Du musst einem Verein beitreten, um Wettkämpfe zu melden.
      </p>
    </div>

    <form v-else @submit.prevent="submitRequest" class="space-y-5">
      <!-- Match Type Toggle -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Spielart</label>
        <div class="flex bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            @click="matchType = 'singles'"
            class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors"
            :class="matchType === 'singles'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'"
          >
            <i class="fas fa-user mr-2"></i>Einzel
          </button>
          <button
            type="button"
            @click="matchType = 'doubles'"
            class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors"
            :class="matchType === 'doubles'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'"
          >
            <i class="fas fa-users mr-2"></i>Doppel
          </button>
        </div>
      </div>

      <!-- Singles: Opponent Search -->
      <div v-if="matchType === 'singles'">
        <label class="block text-sm font-medium text-gray-700 mb-1">Gegner</label>
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="searchOpponents"
            type="text"
            placeholder="Spieler suchen..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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

      <!-- Doubles: Player Selection -->
      <div v-if="matchType === 'doubles'" class="space-y-4">
        <!-- Team A (Your Team) -->
        <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-indigo-800 mb-3">
            <i class="fas fa-user-friends mr-2"></i>Dein Team
          </h3>

          <!-- You (fixed) -->
          <div class="flex items-center gap-3 p-2 bg-white rounded-lg mb-3">
            <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
              {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'S' }}
            </div>
            <div>
              <p class="font-medium text-gray-800">{{ authStore.displayName }} (Du)</p>
              <p class="text-xs text-gray-500">Elo: {{ authStore.profile?.elo_rating || 1000 }}</p>
            </div>
          </div>

          <!-- Partner Search -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Dein Partner</label>
            <div class="relative">
              <input
                v-model="partnerSearchQuery"
                @input="searchPartner"
                type="text"
                placeholder="Partner suchen..."
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                :disabled="!!selectedPartner"
              />
              <button
                v-if="selectedPartner"
                @click="clearPartner"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
              >
                <i class="fas fa-times text-sm"></i>
              </button>
            </div>

            <div v-if="partnerSearchResults.length > 0" class="mt-1 border rounded-lg overflow-hidden bg-white">
              <div
                v-for="player in partnerSearchResults"
                :key="player.id"
                @click="selectPartner(player)"
                class="flex items-center gap-2 p-2 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0 text-sm"
              >
                <img :src="player.avatar_url || DEFAULT_AVATAR" class="w-6 h-6 rounded-full" />
                <span>{{ player.display_name }}</span>
              </div>
            </div>

            <div v-if="selectedPartner" class="mt-2 flex items-center gap-2 p-2 bg-white rounded-lg">
              <i class="fas fa-check text-green-500 text-sm"></i>
              <span class="font-medium text-sm">{{ selectedPartner.display_name }}</span>
            </div>
          </div>
        </div>

        <!-- Team B (Opponents) -->
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-red-800 mb-3">
            <i class="fas fa-user-friends mr-2"></i>Gegner-Team
          </h3>

          <!-- Opponent 1 -->
          <div class="mb-3">
            <label class="block text-xs font-medium text-gray-600 mb-1">Gegner 1</label>
            <div class="relative">
              <input
                v-model="opponent1SearchQuery"
                @input="searchOpponent1"
                type="text"
                placeholder="Gegner 1 suchen..."
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                :disabled="!!selectedOpponent1"
              />
              <button
                v-if="selectedOpponent1"
                @click="clearOpponent1"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
              >
                <i class="fas fa-times text-sm"></i>
              </button>
            </div>

            <div v-if="opponent1SearchResults.length > 0" class="mt-1 border rounded-lg overflow-hidden bg-white">
              <div
                v-for="player in opponent1SearchResults"
                :key="player.id"
                @click="selectOpponent1(player)"
                class="flex items-center gap-2 p-2 hover:bg-red-50 cursor-pointer border-b last:border-b-0 text-sm"
              >
                <img :src="player.avatar_url || DEFAULT_AVATAR" class="w-6 h-6 rounded-full" />
                <span>{{ player.display_name }}</span>
              </div>
            </div>

            <div v-if="selectedOpponent1" class="mt-2 flex items-center gap-2 p-2 bg-white rounded-lg">
              <i class="fas fa-check text-green-500 text-sm"></i>
              <span class="font-medium text-sm">{{ selectedOpponent1.display_name }}</span>
            </div>
          </div>

          <!-- Opponent 2 -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Gegner 2</label>
            <div class="relative">
              <input
                v-model="opponent2SearchQuery"
                @input="searchOpponent2"
                type="text"
                placeholder="Gegner 2 suchen..."
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                :disabled="!!selectedOpponent2"
              />
              <button
                v-if="selectedOpponent2"
                @click="clearOpponent2"
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
              >
                <i class="fas fa-times text-sm"></i>
              </button>
            </div>

            <div v-if="opponent2SearchResults.length > 0" class="mt-1 border rounded-lg overflow-hidden bg-white">
              <div
                v-for="player in opponent2SearchResults"
                :key="player.id"
                @click="selectOpponent2(player)"
                class="flex items-center gap-2 p-2 hover:bg-red-50 cursor-pointer border-b last:border-b-0 text-sm"
              >
                <img :src="player.avatar_url || DEFAULT_AVATAR" class="w-6 h-6 rounded-full" />
                <span>{{ player.display_name }}</span>
              </div>
            </div>

            <div v-if="selectedOpponent2" class="mt-2 flex items-center gap-2 p-2 bg-white rounded-lg">
              <i class="fas fa-check text-green-500 text-sm"></i>
              <span class="font-medium text-sm">{{ selectedOpponent2.display_name }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Set Scores -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Satzergebnisse</label>
        <div class="space-y-2">
          <div v-for="(set, index) in sets" :key="index" class="flex items-center gap-3">
            <span class="text-sm text-gray-600 w-16">Satz {{ index + 1 }}:</span>
            <div class="flex items-center gap-2">
              <span v-if="matchType === 'doubles'" class="text-xs text-indigo-600">Team A</span>
              <input
                v-model="set.playerA"
                type="number"
                min="0"
                max="99"
                placeholder="0"
                class="w-16 px-2 py-2 border rounded-lg text-center"
              />
            </div>
            <span class="text-gray-500">:</span>
            <div class="flex items-center gap-2">
              <input
                v-model="set.playerB"
                type="number"
                min="0"
                max="99"
                placeholder="0"
                class="w-16 px-2 py-2 border rounded-lg text-center"
              />
              <span v-if="matchType === 'doubles'" class="text-xs text-red-600">Team B</span>
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          * Mindestens 3 Sätze ausfüllen. Ein Satz geht bis 11 (bei 10:10 bis 2 Punkte Vorsprung).
        </p>
      </div>

      <!-- Error/Success -->
      <div v-if="error" class="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
        {{ error }}
      </div>
      <div v-if="success" class="bg-green-100 text-green-700 p-3 rounded-lg text-sm">
        {{ success }}
      </div>

      <!-- Submit -->
      <button
        type="submit"
        class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
        :disabled="loading || (matchType === 'singles' && !selectedOpponent) || (matchType === 'doubles' && !isDoublesComplete)"
      >
        <span v-if="loading">Senden...</span>
        <span v-else>
          <i class="fas fa-paper-plane mr-2"></i>
          {{ matchType === 'singles' ? 'Anfrage senden' : 'Doppel-Anfrage senden' }}
        </span>
      </button>
    </form>
  </div>
</template>
