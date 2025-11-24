<script setup>
import { ref, computed, onMounted } from 'vue'
import { collection, query, where, orderBy, doc, getDoc, setDoc } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Leaderboard type
const activeType = ref('effort')

// Leaderboard preferences (which tabs to show)
const showSettings = ref(false)
const leaderboardPrefs = ref({
  effort: true,
  season: true,
  skill: true,
  ranks: true,
  doubles: true
})

// All available types
const allTypes = [
  { id: 'effort', label: 'Fleiß', sublabel: '(XP)', icon: '💪' },
  { id: 'season', label: 'Season', sublabel: '(Punkte)', icon: '⭐' },
  { id: 'skill', label: 'Skill', sublabel: '(Elo)', icon: '⚡' },
  { id: 'ranks', label: 'Ränge', sublabel: '(Level)', icon: '🏆' },
  { id: 'doubles', label: 'Doppel', sublabel: '(Teams)', icon: '🎾' },
]

// Filtered types based on preferences
const types = computed(() => allTypes.filter(t => leaderboardPrefs.value[t.id]))

// Load preferences on mount
onMounted(async () => {
  await loadLeaderboardPrefs()
})

async function loadLeaderboardPrefs() {
  if (!userStore.userData?.id) return
  try {
    const prefsRef = doc(db, 'users', userStore.userData.id, 'preferences', 'leaderboard')
    const prefsDoc = await getDoc(prefsRef)
    if (prefsDoc.exists()) {
      leaderboardPrefs.value = { ...leaderboardPrefs.value, ...prefsDoc.data() }
    }
  } catch (e) {
    console.error('Error loading leaderboard prefs:', e)
  }
}

async function saveLeaderboardPrefs() {
  if (!userStore.userData?.id) return
  try {
    const prefsRef = doc(db, 'users', userStore.userData.id, 'preferences', 'leaderboard')
    await setDoc(prefsRef, leaderboardPrefs.value)

    // If current tab is hidden, switch to first visible
    if (!leaderboardPrefs.value[activeType.value]) {
      const firstVisible = allTypes.find(t => leaderboardPrefs.value[t.id])
      if (firstVisible) activeType.value = firstVisible.id
    }
  } catch (e) {
    console.error('Error saving leaderboard prefs:', e)
  }
}

// Count of enabled leaderboards
const enabledCount = computed(() => Object.values(leaderboardPrefs.value).filter(v => v).length)

// Rank definitions (matching original)
const RANKS = [
  { id: 0, name: 'Rekrut', emoji: '🔰', color: '#9CA3AF', minElo: 800, minXP: 0 },
  { id: 1, name: 'Bronze', emoji: '🥉', color: '#CD7F32', minElo: 850, minXP: 50, requiresGrundlagen: true, grundlagenRequired: 5 },
  { id: 2, name: 'Silber', emoji: '🥈', color: '#C0C0C0', minElo: 1000, minXP: 200 },
  { id: 3, name: 'Gold', emoji: '🥇', color: '#FFD700', minElo: 1200, minXP: 500 },
  { id: 4, name: 'Platin', emoji: '💎', color: '#E5E4E2', minElo: 1400, minXP: 1000 },
  { id: 5, name: 'Champion', emoji: '👑', color: '#9333EA', minElo: 1600, minXP: 1800 },
]

// Calculate rank for a player
function calculateRank(eloRating, xp, grundlagenCount = 0) {
  const elo = eloRating ?? 800
  const totalXP = xp || 0

  for (let i = RANKS.length - 1; i >= 0; i--) {
    const rank = RANKS[i]
    const meetsBasicRequirements = elo >= rank.minElo && totalXP >= rank.minXP

    if (rank.requiresGrundlagen) {
      const required = rank.grundlagenRequired || 5
      if (meetsBasicRequirements && grundlagenCount >= required) {
        return rank
      }
    } else {
      if (meetsBasicRequirements) {
        return rank
      }
    }
  }
  return RANKS[0]
}

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

// Doubles pairings query (matching original implementation)
const doublesPairingsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'doublesPairings'),
    where('clubId', '==', userStore.clubId),
    orderBy('matchesWon', 'desc')
  )
})
const rawDoublesPairings = useCollection(doublesPairingsQuery)

// Enrich pairings with photo URLs from club players and filter by subgroup
const doublesPairings = computed(() => {
  if (!rawDoublesPairings.value || !clubPlayers.value) return rawDoublesPairings.value

  const filter = userStore.currentSubgroupFilter

  let filteredPairings = rawDoublesPairings.value

  // Filter by subgroup if a specific subgroup is selected
  if (filter !== 'club' && filter !== 'global') {
    filteredPairings = rawDoublesPairings.value.filter(pairing => {
      const player1 = clubPlayers.value.find(p => p.id === pairing.player1Id)
      const player2 = clubPlayers.value.find(p => p.id === pairing.player2Id)
      const player1Subgroups = player1?.subgroupIDs || []
      const player2Subgroups = player2?.subgroupIDs || []
      // Both players must be in the selected subgroup
      return player1Subgroups.includes(filter) && player2Subgroups.includes(filter)
    })
  }

  return filteredPairings.map(pairing => {
    const player1 = clubPlayers.value.find(p => p.id === pairing.player1Id)
    const player2 = clubPlayers.value.find(p => p.id === pairing.player2Id)

    return {
      ...pairing,
      player1PhotoURL: player1?.photoURL || null,
      player2PhotoURL: player2?.photoURL || null,
      player1Initials: player1 ? (player1.firstName?.[0] || '') + (player1.lastName?.[0] || '') : '??',
      player2Initials: player2 ? (player2.firstName?.[0] || '') + (player2.lastName?.[0] || '') : '??'
    }
  })
})

// Filter players based on current subgroup filter
const players = computed(() => {
  const filter = userStore.currentSubgroupFilter

  if (filter === 'global') {
    return globalPlayers.value
  } else if (filter === 'club') {
    return clubPlayers.value
  } else {
    // Specific subgroup - filter club players
    if (!clubPlayers.value) return []
    return clubPlayers.value.filter(player => {
      const playerSubgroups = player.subgroupIDs || []
      return playerSubgroups.includes(filter)
    })
  }
})

// Group players by rank for Ranks view (uses filtered players)
const playersByRank = computed(() => {
  // Use the filtered players based on current subgroup filter
  const filteredPlayers = players.value
  if (!filteredPlayers) return []

  const grouped = {}
  RANKS.forEach(rank => {
    grouped[rank.id] = []
  })

  filteredPlayers.forEach(player => {
    const rank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0)
    grouped[rank.id].push({ ...player, rank })
  })

  // Return in reverse order (highest rank first)
  return RANKS.slice().reverse().map(rank => ({
    rank,
    players: grouped[rank.id].sort((a, b) => (b.xp || 0) - (a.xp || 0))
  })).filter(group => group.players.length > 0)
})

function getDisplayValue(player) {
  if (activeType.value === 'effort') return `${player.xp || 0} XP`
  if (activeType.value === 'season') return `${player.points || 0} Pkt`
  return `${player.eloRating || 1000} Elo`
}

function getSecondaryValue(player) {
  const rank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0)
  return `${rank.emoji} ${rank.name}`
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
  <div class="space-y-4">
    <!-- Settings Section (Collapsible) -->
    <div class="bg-white rounded-xl shadow-md border border-gray-200">
      <button
        @click="showSettings = !showSettings"
        class="w-full p-4 flex justify-between items-center text-left hover:bg-gray-50 transition rounded-xl"
      >
        <div>
          <h2 class="text-lg font-semibold text-gray-800">⚙️ Ranglisten-Einstellungen</h2>
          <p class="text-xs text-gray-600">Passe an, welche Ranglisten angezeigt werden ({{ enabledCount }}/5 aktiv)</p>
        </div>
        <svg
          :class="showSettings ? 'rotate-180' : ''"
          class="w-5 h-5 text-gray-600 transition-transform"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      <div v-if="showSettings" class="px-4 pb-4">
        <div class="space-y-2">
          <label
            v-for="type in allTypes"
            :key="type.id"
            class="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded-md transition"
          >
            <input
              type="checkbox"
              v-model="leaderboardPrefs[type.id]"
              @change="saveLeaderboardPrefs"
              :disabled="enabledCount <= 1 && leaderboardPrefs[type.id]"
              class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span class="text-gray-700">{{ type.icon }} {{ type.label }} {{ type.sublabel }}</span>
          </label>
        </div>
        <p class="text-xs text-gray-500 mt-3">Die Einstellungen werden automatisch gespeichert. Mindestens eine Rangliste muss aktiv sein.</p>
      </div>
    </div>

    <!-- Main Leaderboard Card -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

    <!-- Type Tabs -->
    <div class="overflow-x-auto border-b border-gray-200 mb-4 -mx-6 px-6">
      <div class="flex justify-center min-w-max">
        <button
          v-for="type in types"
          :key="type.id"
          @click="activeType = type.id"
          class="flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 transition-colors"
          :class="activeType === type.id
            ? 'border-indigo-600 text-indigo-600'
            : 'border-transparent text-gray-600 hover:border-gray-300'"
        >
          <div>{{ type.icon }} {{ type.label }}</div>
          <div class="text-xs text-gray-500 font-normal">{{ type.sublabel }}</div>
        </button>
      </div>
    </div>

    <!-- Regular Player List (effort, season, skill) -->
    <div v-if="['effort', 'season', 'skill'].includes(activeType)" class="space-y-2 max-h-96 overflow-y-auto">
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
          class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4"
        />
        <div class="flex-grow">
          <p class="text-sm font-medium text-gray-900">{{ player.firstName }} {{ player.lastName }}</p>
          <p v-if="userStore.currentSubgroupFilter === 'global'" class="text-xs text-gray-400">{{ player.clubId || 'Kein Verein' }}</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-bold text-gray-900">{{ getDisplayValue(player) }}</p>
          <p class="text-xs text-gray-500">{{ getSecondaryValue(player) }}</p>
        </div>
      </div>
    </div>

    <!-- Ranks View (grouped by rank) -->
    <div v-if="activeType === 'ranks'" class="space-y-4 max-h-[500px] overflow-y-auto">
      <div v-if="!playersByRank?.length" class="text-center py-8 text-gray-500">
        Keine Spieler gefunden.
      </div>

      <div v-for="group in playersByRank" :key="group.rank.id" class="rank-section">
        <!-- Rank Header -->
        <div
          class="flex items-center justify-between p-3 rounded-lg"
          :style="{ backgroundColor: group.rank.color + '20', borderLeft: `4px solid ${group.rank.color}` }"
        >
          <div class="flex items-center space-x-2">
            <span class="text-2xl">{{ group.rank.emoji }}</span>
            <span class="font-bold text-lg" :style="{ color: group.rank.color }">{{ group.rank.name }}</span>
          </div>
          <span class="text-sm text-gray-600">{{ group.players.length }} Spieler</span>
        </div>

        <!-- Players in Rank -->
        <div class="mt-2 space-y-1 pl-4">
          <div
            v-for="player in group.players"
            :key="player.id"
            class="flex items-center p-2 rounded"
            :class="player.id === userStore.userData?.id ? 'bg-indigo-100 font-bold' : 'bg-gray-50'"
          >
            <img
              :src="player.photoURL || `https://placehold.co/32x32/e2e8f0/64748b?text=${getInitials(player)}`"
              :alt="player.firstName"
              class="h-8 w-8 rounded-full object-cover mr-3"
            />
            <div class="flex-grow">
              <p class="text-sm">{{ player.firstName }} {{ player.lastName }}</p>
            </div>
            <div class="text-xs text-gray-600">
              {{ player.eloRating || 800 }} Elo | {{ player.xp || 0 }} XP
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Doubles View -->
    <div v-if="activeType === 'doubles'" class="space-y-2 max-h-96 overflow-y-auto">
      <div v-if="!doublesPairings?.length" class="text-center py-8 text-gray-500">
        <div class="text-4xl mb-2">🎾</div>
        <p class="font-medium">Noch keine Doppel-Paarungen</p>
        <p class="text-sm mt-1">Paarungen werden erstellt, sobald Doppel-Matches gespielt werden.</p>
      </div>

      <div
        v-for="(pairing, index) in doublesPairings"
        :key="pairing.id"
        class="flex items-center p-4 rounded-lg bg-gradient-to-r from-green-50 to-teal-50 border border-green-200"
      >
        <div class="w-10 text-center font-bold text-lg">{{ getRankDisplay(index) }}</div>
        <div class="flex-grow">
          <div class="flex items-center gap-2">
            <div class="flex -space-x-2">
              <img
                :src="pairing.player1PhotoURL || `https://placehold.co/32x32/e2e8f0/64748b?text=${pairing.player1Initials || '??'}`"
                class="h-8 w-8 rounded-full border-2 border-white object-cover"
              />
              <img
                :src="pairing.player2PhotoURL || `https://placehold.co/32x32/e2e8f0/64748b?text=${pairing.player2Initials || '??'}`"
                class="h-8 w-8 rounded-full border-2 border-white object-cover"
              />
            </div>
            <div class="ml-2">
              <p class="text-sm font-semibold text-gray-900">
                {{ pairing.player1Name }} & {{ pairing.player2Name }}
              </p>
              <p class="text-xs text-gray-500">
                {{ pairing.matchesWon || 0 }} Siege • {{ pairing.matchesLost || 0 }} Niederlagen •
                {{ pairing.matchesPlayed > 0 ? ((pairing.matchesWon / pairing.matchesPlayed) * 100).toFixed(1) : 0 }}% Siegrate
              </p>
            </div>
          </div>
        </div>
        <div class="text-right">
          <p class="text-lg font-bold text-green-600">{{ Math.round(pairing.currentEloRating || 800) }}</p>
          <p class="text-xs text-gray-500">Doppel-Elo</p>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
