<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { collection, query, where, orderBy, limit, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'
import MatchRequestCard from '@/components/MatchRequestCard.vue'

const userStore = useUserStore()

// Widget Settings
const showWidgetSettings = ref(false)
const widgetSettings = ref({})
const WIDGETS = [
  { id: 'info-banner', name: '📚 Info-Banner', description: 'Erklärt die drei Systeme', default: true, essential: true },
  { id: 'statistics', name: '📊 Statistiken', description: 'XP, Elo und Saisonpunkte', default: true },
  { id: 'season-countdown', name: '⏳ Saison-Countdown', description: 'Zeit bis zum Saisonende', default: true },
  { id: 'match-requests', name: '🏓 Wettkampf-Anfragen', description: 'Ausstehende Match-Anfragen', default: true, essential: true },
  { id: 'rank', name: '🏆 Dein Rang', description: 'Aktuelle Rangstufe', default: true },
  { id: 'skill-rival', name: '⚡ Skill-Rivale', description: 'Nächster Gegner in Elo-Rangliste', default: true },
  { id: 'effort-rival', name: '💪 Fleiß-Rivale', description: 'Nächster Konkurrent in XP-Rangliste', default: true },
  { id: 'points-history', name: '📜 Punkte-Historie', description: 'Letzte Punkteänderungen', default: true },
  { id: 'challenges', name: '🎯 Challenges', description: 'Aktive Herausforderungen', default: true },
]

// Initialize widget settings
onMounted(async () => {
  await loadWidgetSettings()
  updateSeasonCountdown()
  setInterval(updateSeasonCountdown, 1000)
})

async function loadWidgetSettings() {
  const defaults = {}
  WIDGETS.forEach(w => { defaults[w.id] = w.default })

  if (userStore.userData?.id) {
    try {
      const settingsRef = doc(db, 'users', userStore.userData.id, 'preferences', 'dashboardWidgets')
      const settingsDoc = await getDoc(settingsRef)
      if (settingsDoc.exists()) {
        widgetSettings.value = { ...defaults, ...settingsDoc.data().widgets }
      } else {
        widgetSettings.value = defaults
      }
    } catch (e) {
      widgetSettings.value = defaults
    }
  } else {
    widgetSettings.value = defaults
  }
}

async function saveWidgetSettings() {
  if (!userStore.userData?.id) return
  try {
    const settingsRef = doc(db, 'users', userStore.userData.id, 'preferences', 'dashboardWidgets')
    await setDoc(settingsRef, { widgets: widgetSettings.value })
    showWidgetSettings.value = false
  } catch (e) {
    console.error('Error saving widget settings:', e)
  }
}

function resetWidgetSettings() {
  WIDGETS.forEach(w => {
    widgetSettings.value[w.id] = w.default
  })
}

function isWidgetVisible(id) {
  return widgetSettings.value[id] !== false
}

// Season countdown
const seasonCountdown = ref('Lädt...')

// Pending SINGLES match requests (where I'm playerB and need to respond)
const pendingSingles = ref([])
let singlesUnsubscribe = null

// Pending DOUBLES match requests (where I'm in teamB and need to respond)
const allPendingDoubles = ref([])
let doublesUnsubscribe = null

// Watch for user changes and set up listeners
watch(() => userStore.userData?.id, (userId) => {
  // Clean up old listener
  if (singlesUnsubscribe) {
    singlesUnsubscribe()
    singlesUnsubscribe = null
  }

  if (userId) {
    const q = query(
      collection(db, 'matchRequests'),
      where('playerBId', '==', userId),
      where('status', '==', 'pending_player')
    )

    singlesUnsubscribe = onSnapshot(q, (snapshot) => {
      pendingSingles.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    })
  } else {
    pendingSingles.value = []
  }
}, { immediate: true })

watch(() => userStore.clubId, (clubId) => {
  // Clean up old listener
  if (doublesUnsubscribe) {
    doublesUnsubscribe()
    doublesUnsubscribe = null
  }

  if (clubId) {
    const q = query(
      collection(db, 'doublesMatchRequests'),
      where('clubId', '==', clubId),
      where('status', '==', 'pending_opponent')
    )

    doublesUnsubscribe = onSnapshot(q, (snapshot) => {
      allPendingDoubles.value = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    })
  } else {
    allPendingDoubles.value = []
  }
}, { immediate: true })

// Clean up listeners on unmount
onUnmounted(() => {
  if (singlesUnsubscribe) singlesUnsubscribe()
  if (doublesUnsubscribe) doublesUnsubscribe()
})

// Filter doubles to only show where I'm in teamB and not the initiator AND I haven't confirmed yet
const pendingDoubles = computed(() => {
  if (!allPendingDoubles.value || !userStore.userData?.id) return []
  return allPendingDoubles.value.filter(r => {
    const isInTeamB = r.teamB?.player1Id === userStore.userData.id || r.teamB?.player2Id === userStore.userData.id
    const isInitiator = r.initiatedBy === userStore.userData.id
    const hasConfirmed = r.confirmations?.[userStore.userData.id]?.status === 'confirmed'
    return isInTeamB && !isInitiator && !hasConfirmed
  })
})

// Combined pending requests for display
const pendingRequests = computed(() => {
  const singles = (pendingSingles.value || []).map(r => ({ ...r, matchType: 'singles' }))
  const doubles = (pendingDoubles.value || []).map(r => ({ ...r, matchType: 'doubles' }))
  return [...singles, ...doubles].sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0
    const bTime = b.createdAt?.toMillis?.() || 0
    return bTime - aTime
  })
})

// Handle doubles request confirmation
async function confirmDoublesRequest(request) {
  try {
    const myId = userStore.userData.id
    const otherOpponentId = request.teamB.player1Id === myId
      ? request.teamB.player2Id
      : request.teamB.player1Id

    // Check if the other opponent has already confirmed
    const otherOpponentConfirmed = request.confirmations?.[otherOpponentId]?.status === 'confirmed'

    // If both opponents confirm, change status to pending_coach
    const newStatus = otherOpponentConfirmed ? 'pending_coach' : 'pending_opponent'

    await updateDoc(doc(db, 'doublesMatchRequests', request.id), {
      status: newStatus,
      [`confirmations.${myId}`]: {
        status: 'confirmed',
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    })
  } catch (error) {
    console.error('Error confirming doubles request:', error)
    alert('Fehler beim Annehmen der Anfrage: ' + error.message)
  }
}

// Handle doubles request rejection
async function rejectDoublesRequest(request) {
  try {
    await updateDoc(doc(db, 'doublesMatchRequests', request.id), {
      status: 'rejected',
      [`confirmations.${userStore.userData.id}`]: {
        status: 'rejected',
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    })
  } catch (error) {
    console.error('Error rejecting doubles request:', error)
  }
}

// Players query based on current subgroup filter
const playersQuery = computed(() => {
  const filter = userStore.currentSubgroupFilter

  if (filter === 'club') {
    // Show all players in club
    return query(
      collection(db, 'users'),
      where('clubId', '==', userStore.clubId),
      where('role', '==', 'player')
    )
  } else if (filter === 'global') {
    // Show all players globally
    return query(
      collection(db, 'users'),
      where('role', '==', 'player')
    )
  } else {
    // Show players in specific subgroup
    return query(
      collection(db, 'users'),
      where('clubId', '==', userStore.clubId),
      where('role', '==', 'player'),
      where('subgroupIDs', 'array-contains', filter)
    )
  }
})
const filteredPlayers = useCollection(playersQuery)

// Skill Rival (closest Elo above, from filtered players)
const skillRival = computed(() => {
  if (!filteredPlayers.value || !userStore.userData) return null
  const myElo = userStore.userData.eloRating || 1000

  // Sort by Elo and find first player above current user
  const skillRanking = [...filteredPlayers.value].sort((a, b) => (b.eloRating || 0) - (a.eloRating || 0))
  const myIndex = skillRanking.findIndex(p => p.id === userStore.userData.id)

  if (myIndex > 0) {
    return skillRanking[myIndex - 1]
  }
  return null
})

// Effort Rival (closest XP above, from filtered players)
const effortRival = computed(() => {
  if (!filteredPlayers.value || !userStore.userData) return null
  const myXp = userStore.userData.xp || 0

  // Sort by XP and find first player above current user
  const effortRanking = [...filteredPlayers.value].sort((a, b) => (b.xp || 0) - (a.xp || 0))
  const myIndex = effortRanking.findIndex(p => p.id === userStore.userData.id)

  if (myIndex > 0) {
    return effortRanking[myIndex - 1]
  }
  return null
})

// Challenges
const challengesQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'challenges'),
    where('clubId', '==', userStore.clubId),
    where('isActive', '==', true),
    limit(20)
  )
})
const allChallenges = useCollection(challengesQuery)

// Filter out expired challenges (like the original implementation)
const challenges = computed(() => {
  if (!allChallenges.value) return []
  const now = new Date()
  return allChallenges.value.filter(challenge => {
    const expiresAt = calculateExpiry(challenge.createdAt, challenge.type)
    return expiresAt > now
  })
})

// Calculate expiry date based on challenge type (from original implementation)
function calculateExpiry(createdAt, type) {
  if (!createdAt || !createdAt.toDate) return new Date()
  const startDate = createdAt.toDate()
  const expiryDate = new Date(startDate)
  switch (type) {
    case 'daily':
      expiryDate.setDate(startDate.getDate() + 1)
      break
    case 'weekly':
      expiryDate.setDate(startDate.getDate() + 7)
      break
    case 'monthly':
      expiryDate.setMonth(startDate.getMonth() + 1)
      break
  }
  return expiryDate
}

// Points history - subcollection under user (no limit to show full history like original)
const pointsHistoryQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'users', userStore.userData.id, 'pointsHistory'),
    orderBy('timestamp', 'desc')
  )
})
const pointsHistory = useCollection(pointsHistoryQuery)

function updateSeasonCountdown() {
  const startDate = new Date('2024-01-01')
  const now = new Date()
  const weeksSinceStart = Math.floor((now - startDate) / (7 * 24 * 60 * 60 * 1000))
  const currentSeasonWeek = weeksSinceStart % 6
  const weeksRemaining = 6 - currentSeasonWeek - 1
  const daysIntoWeek = Math.floor((now - startDate) / (24 * 60 * 60 * 1000)) % 7
  const daysRemaining = (weeksRemaining * 7) + (7 - daysIntoWeek)

  if (daysRemaining <= 0) {
    seasonCountdown.value = 'Saison endet bald!'
  } else if (daysRemaining === 1) {
    seasonCountdown.value = '1 Tag'
  } else {
    seasonCountdown.value = `${daysRemaining} Tage`
  }
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

// Rank system (from original ranks.js)
const RANKS = {
  REKRUT: { id: 0, name: 'Rekrut', emoji: '🔰', color: '#9CA3AF', minElo: 800, minXP: 0, description: 'Willkommen! Absolviere 5 Grundlagen-Übungen.', requiresGrundlagen: false },
  BRONZE: { id: 1, name: 'Bronze', emoji: '🥉', color: '#CD7F32', minElo: 850, minXP: 50, description: 'Du hast die Grundlagen gemeistert!', requiresGrundlagen: true, grundlagenRequired: 5 },
  SILBER: { id: 2, name: 'Silber', emoji: '🥈', color: '#C0C0C0', minElo: 1000, minXP: 200, description: 'Du bist auf dem besten Weg!', requiresGrundlagen: false },
  GOLD: { id: 3, name: 'Gold', emoji: '🥇', color: '#FFD700', minElo: 1200, minXP: 500, description: 'Ein echter Champion!', requiresGrundlagen: false },
  PLATIN: { id: 4, name: 'Platin', emoji: '💎', color: '#E5E4E2', minElo: 1400, minXP: 1000, description: 'Du gehörst zur Elite!', requiresGrundlagen: false },
  CHAMPION: { id: 5, name: 'Champion', emoji: '👑', color: '#9333EA', minElo: 1600, minXP: 1800, description: 'Der höchste Rang - du bist ein Vereinsmeister!', requiresGrundlagen: false }
}

const RANK_ORDER = [RANKS.REKRUT, RANKS.BRONZE, RANKS.SILBER, RANKS.GOLD, RANKS.PLATIN, RANKS.CHAMPION]

function calculateRank(eloRating, xp, grundlagenCount = 0) {
  const elo = eloRating ?? 800
  const totalXP = xp || 0

  for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
    const rank = RANK_ORDER[i]
    const meetsBasicRequirements = elo >= rank.minElo && totalXP >= rank.minXP

    if (rank.requiresGrundlagen) {
      const required = rank.grundlagenRequired || 5
      if (meetsBasicRequirements && grundlagenCount >= required) return rank
    } else {
      if (meetsBasicRequirements) return rank
    }
  }
  return RANKS.REKRUT
}

function getRankProgress(eloRating, xp, grundlagenCount = 0) {
  const currentRank = calculateRank(eloRating, xp, grundlagenCount)
  const currentIndex = RANK_ORDER.findIndex(r => r.id === currentRank.id)

  if (currentIndex === RANK_ORDER.length - 1) {
    return { currentRank, nextRank: null, eloProgress: 100, xpProgress: 100, eloNeeded: 0, xpNeeded: 0, grundlagenNeeded: 0, grundlagenProgress: 100, isMaxRank: true }
  }

  const nextRank = RANK_ORDER[currentIndex + 1]
  const elo = eloRating || 0
  const totalXP = xp || 0

  const eloNeeded = Math.max(0, nextRank.minElo - elo)
  const xpNeeded = Math.max(0, nextRank.minXP - totalXP)
  const grundlagenRequired = nextRank.grundlagenRequired || 5
  const grundlagenNeeded = nextRank.requiresGrundlagen ? Math.max(0, grundlagenRequired - grundlagenCount) : 0

  const eloProgress = nextRank.minElo === 0 ? (elo > 0 ? 100 : 0) : Math.min(100, (elo / nextRank.minElo) * 100)
  const xpProgress = nextRank.minXP === 0 ? (totalXP > 0 ? 100 : 0) : Math.min(100, (totalXP / nextRank.minXP) * 100)
  const grundlagenProgress = nextRank.requiresGrundlagen ? Math.min(100, (grundlagenCount / grundlagenRequired) * 100) : 100

  return {
    currentRank, nextRank,
    eloProgress: Math.round(eloProgress),
    xpProgress: Math.round(xpProgress),
    grundlagenProgress: Math.round(grundlagenProgress),
    eloNeeded, xpNeeded, grundlagenNeeded,
    isMaxRank: false
  }
}

const rankProgress = computed(() => {
  if (!userStore.userData) return null
  return getRankProgress(
    userStore.userData.eloRating || 800,
    userStore.userData.xp || 0,
    userStore.userData.grundlagenCompleted || 0
  )
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header with Edit Button -->
    <div class="flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-700">Deine Übersicht</h2>
      <button
        @click="showWidgetSettings = true"
        class="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        Dashboard anpassen
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Info Banner -->
      <div v-if="isWidgetVisible('info-banner')" class="lg:col-span-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-indigo-500 p-4 rounded-lg">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm font-medium text-indigo-800">Drei Systeme für deinen Fortschritt</p>
            <p class="text-xs text-indigo-700 mt-1">
              <strong class="text-purple-700">XP</strong> = Permanenter Fleiß für Rang-Aufstieg •
              <strong class="text-blue-700">Elo</strong> = Wettkampf-Spielstärke •
              <strong class="text-yellow-700">Saisonpunkte</strong> = Temporärer 6-Wochen-Wettbewerb
            </p>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div v-if="isWidgetVisible('statistics')" class="lg:col-span-3 bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-lg font-semibold text-gray-500 mb-4 text-center">Deine Statistiken</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- XP Card -->
          <div class="text-center p-4 bg-purple-50 rounded-lg border-2 border-purple-200 relative group">
            <div class="flex items-center justify-center gap-2 mb-1">
              <p class="text-sm font-semibold text-purple-800">💪 Erfahrung (XP)</p>
              <span class="cursor-help text-purple-400 hover:text-purple-600" title="Permanente Punkte für Fleiß. Bestimmt deinen Rang.">ⓘ</span>
            </div>
            <p class="text-4xl font-bold text-purple-600 mb-2">{{ userStore.userData?.xp || 0 }}</p>
            <p class="text-xs text-purple-700 font-medium">Für Rang-Aufstieg</p>
          </div>
          <!-- ELO Card -->
          <div class="text-center p-4 bg-blue-50 rounded-lg border-2 border-blue-200 relative group">
            <div class="flex items-center justify-center gap-2 mb-1">
              <p class="text-sm font-semibold text-blue-800">⚡ Spielstärke (Elo)</p>
              <span class="cursor-help text-blue-400 hover:text-blue-600" title="Misst deine echte Spielstärke. Steigt bei Siegen, sinkt bei Niederlagen.">ⓘ</span>
            </div>
            <p class="text-4xl font-bold text-blue-600 mb-2">{{ userStore.userData?.eloRating || 1000 }}</p>
            <p class="text-xs text-blue-700 font-medium">Wettkampf-Skill</p>
          </div>
          <!-- Season Points Card -->
          <div class="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200 relative group">
            <div class="flex items-center justify-center gap-2 mb-1">
              <p class="text-sm font-semibold text-yellow-800">🏆 Saisonpunkte</p>
              <span class="cursor-help text-yellow-400 hover:text-yellow-600" title="Temporäre Punkte für den 6-Wochen-Wettbewerb. Werden am Saisonende zurückgesetzt.">ⓘ</span>
            </div>
            <p class="text-4xl font-bold text-yellow-600 mb-2">{{ userStore.userData?.points || 0 }}</p>
            <p class="text-xs text-yellow-700 font-medium">Aktueller Wettbewerb</p>
          </div>
        </div>
      </div>

      <!-- Season Countdown -->
      <div v-if="isWidgetVisible('season-countdown')" class="lg:col-span-3 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 p-4 rounded-xl shadow-md">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="bg-yellow-400 p-3 rounded-full">
              <svg class="w-6 h-6 text-yellow-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-yellow-900">⏳ Saison-Ende</h3>
              <p class="text-xs text-yellow-700">Saison-Punkte werden zurückgesetzt</p>
            </div>
          </div>
          <p class="text-2xl font-bold text-yellow-900">{{ seasonCountdown }}</p>
        </div>
      </div>

      <!-- Match Requests -->
      <div v-if="isWidgetVisible('match-requests')" class="lg:col-span-3 bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-200 p-6 rounded-xl shadow-md">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-indigo-800">🏓 Wettkampf-Anfragen</h2>
          <span v-if="pendingRequests?.length" class="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            {{ pendingRequests.length }}
          </span>
        </div>
        <div class="space-y-3">
          <template v-if="pendingRequests?.length">
            <template v-for="request in pendingRequests" :key="request.id">
              <!-- Singles Request -->
              <MatchRequestCard
                v-if="request.matchType === 'singles'"
                :request="request"
                type="incoming"
              />
              <!-- Doubles Request -->
              <div v-else class="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">Doppel</span>
                    <p class="font-medium text-gray-900 mt-1">
                      {{ request.teamA?.player1Name }} & {{ request.teamA?.player2Name }}
                    </p>
                    <p class="text-sm text-gray-600">
                      vs {{ request.teamB?.player1Name }} & {{ request.teamB?.player2Name }}
                    </p>
                    <!-- Show if partner already confirmed -->
                    <p v-if="request.confirmations?.[request.teamB.player1Id === userStore.userData.id ? request.teamB.player2Id : request.teamB.player1Id]?.status === 'confirmed'"
                       class="text-xs text-green-600 mt-1">
                      ✓ Dein Partner hat bereits zugestimmt
                    </p>
                  </div>
                  <div class="flex space-x-2">
                    <button
                      v-if="!request.confirmations?.[userStore.userData.id]"
                      @click="confirmDoublesRequest(request)"
                      class="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      Annehmen
                    </button>
                    <span v-else class="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-md">
                      ✓ Angenommen
                    </span>
                    <button
                      v-if="!request.confirmations?.[userStore.userData.id]"
                      @click="rejectDoublesRequest(request)"
                      class="px-3 py-1 bg-red-100 text-red-600 text-sm rounded-md hover:bg-red-200"
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
                <div v-if="request.sets?.length" class="mt-2 text-sm text-gray-600">
                  Sätze: {{ request.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ') }}
                </div>
              </div>
            </template>
          </template>
          <p v-else class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>
        </div>
      </div>

      <!-- Rank Widget -->
      <div v-if="isWidgetVisible('rank')" class="bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">Dein Rang</h2>
        <div v-if="rankProgress">
          <!-- Current Rank Badge -->
          <div class="flex items-center justify-center space-x-2 mb-2">
            <span class="text-4xl">{{ rankProgress.currentRank.emoji }}</span>
            <div>
              <p class="font-bold text-xl" :style="{ color: rankProgress.currentRank.color }">
                {{ rankProgress.currentRank.name }}
              </p>
              <p class="text-xs text-gray-500">{{ rankProgress.currentRank.description }}</p>
            </div>
          </div>

          <!-- Progress to Next Rank -->
          <div v-if="!rankProgress.isMaxRank" class="mt-3 text-sm">
            <p class="text-gray-600 font-medium mb-2">
              Fortschritt zu {{ rankProgress.nextRank.emoji }} {{ rankProgress.nextRank.name }}:
            </p>

            <!-- Elo Progress Bar (only if required) -->
            <div v-if="rankProgress.nextRank.minElo > 0" class="mb-2">
              <div class="flex justify-between text-xs text-gray-600 mb-1">
                <span>Elo: {{ userStore.userData?.eloRating || 0 }}/{{ rankProgress.nextRank.minElo }}</span>
                <span>{{ rankProgress.eloProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full transition-all" :style="{ width: rankProgress.eloProgress + '%' }"></div>
              </div>
              <p v-if="rankProgress.eloNeeded > 0" class="text-xs text-gray-500 mt-1">
                Noch {{ rankProgress.eloNeeded }} Elo benötigt
              </p>
              <p v-else class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>
            </div>

            <!-- XP Progress Bar -->
            <div class="mb-2">
              <div class="flex justify-between text-xs text-gray-600 mb-1">
                <span>XP: {{ userStore.userData?.xp || 0 }}/{{ rankProgress.nextRank.minXP }}</span>
                <span>{{ rankProgress.xpProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-purple-600 h-2 rounded-full transition-all" :style="{ width: rankProgress.xpProgress + '%' }"></div>
              </div>
              <p v-if="rankProgress.xpNeeded > 0" class="text-xs text-gray-500 mt-1">
                Noch {{ rankProgress.xpNeeded }} XP benötigt
              </p>
              <p v-else class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>
            </div>

            <!-- Grundlagen Progress Bar (only if required) -->
            <div v-if="rankProgress.nextRank.requiresGrundlagen">
              <div class="flex justify-between text-xs text-gray-600 mb-1">
                <span>Grundlagen-Übungen: {{ userStore.userData?.grundlagenCompleted || 0 }}/{{ rankProgress.nextRank.grundlagenRequired || 5 }}</span>
                <span>{{ rankProgress.grundlagenProgress }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-green-600 h-2 rounded-full transition-all" :style="{ width: rankProgress.grundlagenProgress + '%' }"></div>
              </div>
              <p v-if="rankProgress.grundlagenNeeded > 0" class="text-xs text-gray-500 mt-1">
                Noch {{ rankProgress.grundlagenNeeded }} Übung{{ rankProgress.grundlagenNeeded > 1 ? 'en' : '' }} bis du Wettkämpfe spielen kannst
              </p>
              <p v-else class="text-xs text-green-600 mt-1">
                ✓ Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!
              </p>
            </div>
          </div>

          <!-- Max Rank Message -->
          <p v-else class="text-sm text-green-600 font-medium mt-2">
            🏆 Höchster Rang erreicht!
          </p>
        </div>
      </div>

      <!-- Skill Rival -->
      <div v-if="isWidgetVisible('skill-rival')" class="bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">⚡ Skill-Rivale (Elo)</h2>
        <div v-if="skillRival" class="flex items-center gap-4">
          <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
            {{ skillRival.firstName?.[0] }}{{ skillRival.lastName?.[0] }}
          </div>
          <div>
            <p class="font-semibold text-gray-800">{{ skillRival.firstName }} {{ skillRival.lastName }}</p>
            <p class="text-sm text-blue-600">{{ skillRival.eloRating || 1000 }} Elo</p>
            <p class="text-xs text-gray-500">+{{ (skillRival.eloRating || 1000) - (userStore.userData?.eloRating || 1000) }} über dir</p>
          </div>
        </div>
        <p v-else class="text-gray-500">Du bist die Nr. 1!</p>
      </div>

      <!-- Effort Rival -->
      <div v-if="isWidgetVisible('effort-rival')" class="bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">💪 Fleiß-Rivale (XP)</h2>
        <div v-if="effortRival" class="flex items-center gap-4">
          <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">
            {{ effortRival.firstName?.[0] }}{{ effortRival.lastName?.[0] }}
          </div>
          <div>
            <p class="font-semibold text-gray-800">{{ effortRival.firstName }} {{ effortRival.lastName }}</p>
            <p class="text-sm text-purple-600">{{ effortRival.xp || 0 }} XP</p>
            <p class="text-xs text-gray-500">+{{ (effortRival.xp || 0) - (userStore.userData?.xp || 0) }} über dir</p>
          </div>
        </div>
        <p v-else class="text-gray-500">Du bist die Nr. 1!</p>
      </div>

      <!-- Points History -->
      <div v-if="isWidgetVisible('points-history')" class="md:col-span-1 lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">Punkte-Historie</h2>
        <ul class="space-y-3 max-h-64 overflow-y-auto">
          <template v-if="pointsHistory?.length">
            <li v-for="entry in pointsHistory" :key="entry.id" class="flex justify-between items-start text-sm border-b pb-2">
              <div class="flex-1">
                <p class="font-medium text-gray-800">{{ entry.reason }}</p>
                <p class="text-xs text-gray-500">{{ formatDate(entry.timestamp) }}</p>
              </div>
              <div class="text-right">
                <span class="font-bold" :class="entry.points >= 0 ? 'text-green-600' : 'text-red-600'">
                  {{ entry.points >= 0 ? '+' : '' }}{{ entry.points }} Pkt
                </span>
                <div class="text-xs text-gray-500 mt-1">
                  <span v-if="entry.xp !== undefined && entry.xp !== 0" :class="entry.xp >= 0 ? 'text-purple-600' : 'text-red-600'">
                    {{ entry.xp >= 0 ? '+' : '' }}{{ entry.xp }} XP
                  </span>
                  <span v-if="entry.eloChange !== undefined && entry.eloChange !== 0" class="ml-1" :class="entry.eloChange >= 0 ? 'text-blue-600' : 'text-red-600'">
                    • {{ entry.eloChange >= 0 ? '+' : '' }}{{ entry.eloChange }} Elo
                  </span>
                </div>
              </div>
            </li>
          </template>
          <li v-else class="text-gray-500 text-center py-4">Noch keine Punkte-Historie</li>
        </ul>
      </div>

      <!-- Challenges -->
      <div v-if="isWidgetVisible('challenges')" class="md:col-span-2 lg:col-span-3 bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">Aktive Challenges</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <template v-if="challenges?.length">
            <div
              v-for="challenge in challenges"
              :key="challenge.id"
              class="bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200 cursor-pointer hover:shadow-md transition"
            >
              <h4 class="font-semibold text-gray-900">{{ challenge.name }}</h4>
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{{ challenge.description }}</p>
              <div class="mt-2 flex justify-between items-center">
                <span class="text-xs text-yellow-700 font-medium">+{{ challenge.xpReward || 0 }} XP</span>
                <span class="text-xs text-gray-500">{{ challenge.pointsReward || 0 }} Pkt</span>
              </div>
            </div>
          </template>
          <p v-else class="text-gray-500 col-span-3 text-center py-4">Keine aktiven Challenges</p>
        </div>
      </div>
    </div>

    <!-- Widget Settings Modal -->
    <div
      v-if="showWidgetSettings"
      class="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4"
      @click.self="showWidgetSettings = false"
    >
      <div class="relative mx-auto w-full max-w-2xl bg-white rounded-md shadow-lg border">
        <div class="p-6">
          <!-- Header -->
          <div class="flex justify-between items-center mb-6">
            <div>
              <h3 class="text-2xl leading-6 font-bold text-gray-900">Startseite anpassen</h3>
              <p class="text-sm text-gray-600 mt-1">Wähle aus, welche Widgets auf deiner Startseite angezeigt werden sollen</p>
            </div>
            <button
              @click="showWidgetSettings = false"
              class="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-2 transition-colors"
            >
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Scrollable Widget List -->
          <div class="space-y-3 max-h-96 overflow-y-auto mb-6">
            <div
              v-for="widget in WIDGETS"
              :key="widget.id"
              class="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ widget.name }}</span>
                  <span v-if="widget.essential" class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Pflicht</span>
                </div>
                <p class="text-xs text-gray-600 mt-1">{{ widget.description }}</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer" :class="{ 'opacity-50 cursor-not-allowed': widget.essential }">
                <input
                  type="checkbox"
                  v-model="widgetSettings[widget.id]"
                  :disabled="widget.essential"
                  class="sr-only peer"
                />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          <!-- Fixed Footer with Buttons -->
          <div class="flex justify-between items-center pt-4 border-t">
            <button
              @click="resetWidgetSettings"
              class="text-gray-600 hover:text-gray-800 font-medium text-sm transition-colors"
            >
              <i class="fas fa-undo mr-1"></i> Auf Standard zurücksetzen
            </button>
            <div class="flex gap-3">
              <button
                @click="showWidgetSettings = false"
                class="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
              <button
                @click="saveWidgetSettings"
                class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors shadow-md"
              >
                <i class="fas fa-save mr-2"></i> Speichern
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
