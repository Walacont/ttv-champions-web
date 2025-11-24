<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { collection, query, where, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore'
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

// Pending match requests
const pendingRequestsQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(
    collection(db, 'matchRequests'),
    where('opponentId', '==', userStore.userData.id),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(10)
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
    limit(50)
  )
})
const clubPlayers = useCollection(clubPlayersQuery)

// Skill Rival (closest Elo above)
const skillRival = computed(() => {
  if (!clubPlayers.value || !userStore.userData) return null
  const myElo = userStore.userData.eloRating || 1000
  return clubPlayers.value
    .filter(p => p.id !== userStore.userData.id && (p.eloRating || 1000) > myElo)
    .sort((a, b) => (a.eloRating || 1000) - (b.eloRating || 1000))[0] || null
})

// Effort Rival (closest XP above)
const effortRival = computed(() => {
  if (!clubPlayers.value || !userStore.userData) return null
  const myXp = userStore.userData.xp || 0
  return clubPlayers.value
    .filter(p => p.id !== userStore.userData.id && (p.xp || 0) > myXp)
    .sort((a, b) => (a.xp || 0) - (b.xp || 0))[0] || null
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
            <MatchRequestCard
              v-for="request in pendingRequests"
              :key="request.id"
              :request="request"
              type="incoming"
            />
          </template>
          <p v-else class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>
        </div>
      </div>

      <!-- Rank Widget -->
      <div v-if="isWidgetVisible('rank')" class="bg-white p-6 rounded-xl shadow-md">
        <h2 class="text-xl font-semibold mb-4">Dein Rang</h2>
        <div class="text-center">
          <div class="text-4xl mb-2">🎖️</div>
          <p class="text-lg font-bold text-gray-800">{{ userStore.userData?.rank || 'Rekrut' }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ userStore.userData?.xp || 0 }} XP</p>
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
      class="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 overflow-y-auto p-4"
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
