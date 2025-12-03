<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Components
import StatsCard from '@/components/StatsCard.vue'
import InfoBanner from '@/components/InfoBanner.vue'
import SeasonCountdown from '@/components/SeasonCountdown.vue'
import MatchRequestsWidget from '@/components/MatchRequestsWidget.vue'
import RankWidget from '@/components/RankWidget.vue'
import RivalWidget from '@/components/RivalWidget.vue'
import PointsHistoryWidget from '@/components/PointsHistoryWidget.vue'
import ChallengesWidget from '@/components/ChallengesWidget.vue'
import LeaderboardTabs from '@/components/LeaderboardTabs.vue'
import LeaderboardCard from '@/components/LeaderboardCard.vue'
import ExercisesList from '@/components/ExercisesList.vue'
import MatchRequestForm from '@/components/MatchRequestForm.vue'
import PendingRequests from '@/components/PendingRequests.vue'
import AttendanceCalendar from '@/components/AttendanceCalendar.vue'

const router = useRouter()
const authStore = useAuthStore()

// State
const activeTab = ref('overview')
const viewFilter = ref('club')
const genderFilter = ref('all')
const selectedExercise = ref(null)
const selectedChallenge = ref(null)
const showExerciseModal = ref(false)
const showChallengeModal = ref(false)

// Tabs configuration (like original dashboard.html)
const tabs = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'leaderboard', label: 'Ranglisten' },
  { id: 'matches', label: 'Wettkampf' },
  { id: 'exercises', label: 'Übungskatalog' },
  { id: 'attendance', label: 'Anwesenheit' }
]

// Computed
const profile = computed(() => authStore.profile)
const isCoach = computed(() => ['coach', 'admin'].includes(profile.value?.role))
const clubId = computed(() => profile.value?.club_id)

// Methods
function setActiveTab(tabId) {
  activeTab.value = tabId
}

function openExercise(exercise) {
  selectedExercise.value = exercise
  showExerciseModal.value = true
}

function closeExerciseModal() {
  showExerciseModal.value = false
  selectedExercise.value = null
}

function openChallenge(challenge) {
  selectedChallenge.value = challenge
  showChallengeModal.value = true
}

function closeChallengeModal() {
  showChallengeModal.value = false
  selectedChallenge.value = null
}

function goToCoach() {
  router.push('/coach')
}

function goToSettings() {
  router.push('/settings')
}

function goToProfile() {
  router.push('/profile')
}

async function handleLogout() {
  await authStore.signOut()
  router.push('/login')
}

onMounted(async () => {
  if (!authStore.profile && authStore.user) {
    await authStore.fetchProfile()
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-6">
    <!-- Header -->
    <header class="bg-white shadow-sm safe-top">
      <div class="container mx-auto px-4 py-4 max-w-7xl">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-start gap-3 flex-1">
            <!-- Profile Picture -->
            <div
              @click="goToProfile"
              class="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xl cursor-pointer shadow-md flex-shrink-0"
            >
              {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'S' }}
            </div>

            <!-- Title and Club Info -->
            <div class="flex-1">
              <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Mein Dashboard</h1>
              <p class="text-sm sm:text-base text-gray-600">
                Willkommen zurück, {{ authStore.displayName }}!
              </p>
              <p v-if="authStore.club" class="text-xs sm:text-sm text-gray-500 mt-1">
                <i class="fas fa-building mr-1"></i>{{ authStore.club.name }}
              </p>
            </div>
          </div>

          <div class="flex items-center space-x-3">
            <!-- Coach Button -->
            <button
              v-if="isCoach"
              @click="goToCoach"
              class="bg-purple-500 hover:bg-purple-600 text-white font-bold py-1.5 px-3 text-sm rounded-lg shadow transition-transform transform hover:scale-105"
            >
              <i class="fas fa-user-shield mr-1"></i>
              <span class="hidden sm:inline">Coach</span>
            </button>

            <!-- Settings -->
            <button
              @click="goToSettings"
              class="text-gray-500 hover:text-gray-800 transition-colors p-2"
            >
              <i class="fas fa-cog text-xl"></i>
            </button>

            <!-- Logout -->
            <button
              @click="handleLogout"
              class="bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 px-3 text-sm rounded-lg shadow transition-transform transform hover:scale-105"
            >
              Logout
            </button>
          </div>
        </div>

        <!-- Filter Row -->
        <div class="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <label class="text-sm font-medium text-gray-700 whitespace-nowrap">👥 Ansicht:</label>
            <select
              v-model="viewFilter"
              class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white"
            >
              <option value="club">🏠 Mein Verein</option>
              <option value="global">🌍 Global</option>
            </select>
          </div>
          <div class="flex items-center gap-2 flex-1 sm:flex-none">
            <label class="text-sm font-medium text-gray-700 whitespace-nowrap">⚧ Geschlecht:</label>
            <select
              v-model="genderFilter"
              class="flex-1 sm:flex-none px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white"
            >
              <option value="all">Alle</option>
              <option value="male">Jungen/Herren</option>
              <option value="female">Mädchen/Damen</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="border-t border-gray-200">
        <div class="container mx-auto px-4 max-w-7xl">
          <nav class="-mb-px flex space-x-6 overflow-x-auto">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              @click="setActiveTab(tab.id)"
              class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors"
              :class="activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              {{ tab.label }}
            </button>
            <a
              href="/faq"
              class="whitespace-nowrap py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"
            >
              FAQ & Regeln
            </a>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto p-4 sm:p-6 md:p-8 max-w-7xl">
      <!-- Overview Tab -->
      <div v-show="activeTab === 'overview'" class="space-y-6">
        <InfoBanner />

        <!-- Stats Cards -->
        <div class="bg-white p-6 rounded-xl shadow-md">
          <h2 class="text-lg font-semibold text-gray-500 mb-4 text-center">Deine Statistiken</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard
              title="💪 Erfahrung (XP)"
              :value="profile?.total_xp || 0"
              subtitle="Für Rang-Aufstieg"
              color="purple"
              tooltip="Permanente Punkte für Fleiß und Teilnahme. Bestimmt deinen Rang. Kann nicht verloren gehen."
            />
            <StatsCard
              title="⚡ Spielstärke (Elo)"
              :value="profile?.elo_rating || 1000"
              subtitle="Wettkampf-Skill"
              color="blue"
              tooltip="Misst deine echte Spielstärke. Steigt bei Siegen, sinkt bei Niederlagen."
            />
            <StatsCard
              title="🏆 Saisonpunkte"
              :value="profile?.total_points || 0"
              subtitle="Aktueller Wettbewerb"
              color="yellow"
              tooltip="Temporäre Punkte für den aktuellen 6-Wochen-Wettbewerb. Werden am Saisonende zurückgesetzt."
            />
          </div>
        </div>

        <SeasonCountdown />

        <MatchRequestsWidget :filter="viewFilter" />

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <RankWidget />
          <RivalWidget type="skill" />
          <RivalWidget type="effort" />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PointsHistoryWidget />
          <LeaderboardCard :filter="viewFilter" :genderFilter="genderFilter" />
        </div>

        <ChallengesWidget @openChallenge="openChallenge" />
      </div>

      <!-- Leaderboard Tab -->
      <div v-show="activeTab === 'leaderboard'" class="max-w-2xl mx-auto">
        <LeaderboardTabs :filter="viewFilter" :genderFilter="genderFilter" />
      </div>

      <!-- Matches Tab -->
      <div v-show="activeTab === 'matches'" class="space-y-6 max-w-3xl mx-auto">
        <MatchRequestForm :clubId="clubId" />
        <PendingRequests />
      </div>

      <!-- Exercises Tab -->
      <div v-show="activeTab === 'exercises'">
        <ExercisesList @openExercise="openExercise" />
      </div>

      <!-- Attendance Tab -->
      <div v-show="activeTab === 'attendance'" class="space-y-6">
        <AttendanceCalendar />
      </div>
    </main>

    <!-- Exercise Modal -->
    <Teleport to="body">
      <div
        v-if="showExerciseModal"
        class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex justify-center items-start py-8 overflow-y-auto"
        @click.self="closeExerciseModal"
      >
        <div class="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white my-auto">
          <button
            @click="closeExerciseModal"
            class="absolute top-3 right-3 text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 rounded-full p-2 transition-colors shadow-lg border border-gray-200 z-10"
          >
            <i class="fas fa-times text-lg"></i>
          </button>

          <div v-if="selectedExercise" class="pr-10">
            <h3 class="text-xl font-medium text-gray-900 mb-4">{{ selectedExercise.title }}</h3>

            <img
              v-if="selectedExercise.image_url"
              :src="selectedExercise.image_url"
              :alt="selectedExercise.title"
              class="w-full max-h-96 object-contain rounded-md mb-4"
            />

            <div v-if="selectedExercise.tags?.length" class="flex flex-wrap gap-2 mb-4">
              <span
                v-for="tag in selectedExercise.tags"
                :key="tag"
                class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full text-xs"
              >
                {{ tag }}
              </span>
            </div>

            <p class="text-sm text-gray-600 mb-4 whitespace-pre-wrap">
              {{ selectedExercise.description }}
            </p>

            <div class="text-right">
              <span class="font-bold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                {{ selectedExercise.points || 0 }} Punkte
              </span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Challenge Modal -->
    <Teleport to="body">
      <div
        v-if="showChallengeModal"
        class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex justify-center items-start py-8 overflow-y-auto"
        @click.self="closeChallengeModal"
      >
        <div class="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white my-auto">
          <button
            @click="closeChallengeModal"
            class="absolute top-3 right-3 text-gray-700 hover:text-gray-900 bg-white hover:bg-gray-100 rounded-full p-2 transition-colors shadow-lg border border-gray-200 z-10"
          >
            <i class="fas fa-times text-lg"></i>
          </button>

          <div v-if="selectedChallenge" class="pr-10">
            <h3 class="text-xl font-medium text-gray-900 mb-4">{{ selectedChallenge.title }}</h3>

            <p class="text-sm text-gray-600 mb-4 whitespace-pre-wrap">
              {{ selectedChallenge.description }}
            </p>

            <div v-if="selectedChallenge.milestones?.length" class="space-y-2 mb-4">
              <h4 class="text-sm font-semibold text-gray-700">Meilensteine:</h4>
              <div
                v-for="(milestone, index) in selectedChallenge.milestones"
                :key="index"
                class="flex justify-between items-center bg-gray-50 p-2 rounded"
              >
                <span class="text-sm">{{ milestone.target }}x erreichen</span>
                <span class="font-bold text-indigo-600">{{ milestone.points }} P</span>
              </div>
            </div>

            <div class="text-right">
              <span class="font-bold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                {{ selectedChallenge.points || 0 }} Punkte
              </span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Footer -->
    <footer class="mt-12 pb-6 px-4">
      <div class="max-w-4xl mx-auto">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div class="flex items-start gap-3">
            <i class="fas fa-bug text-blue-600 text-xl mt-1"></i>
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-blue-900 mb-1">Bug gefunden?</h3>
              <p class="text-xs text-blue-800">
                Hilf uns, die App zu verbessern! Sende Fehlerberichte an
                <a href="mailto:support@sc-champions.de" class="font-semibold underline">support@sc-champions.de</a>
              </p>
            </div>
          </div>
        </div>

        <div class="text-center text-xs text-gray-600 space-y-2">
          <div class="flex justify-center items-center gap-4">
            <a href="/docs/impressum" class="hover:text-indigo-600 transition-colors">Impressum</a>
            <span class="text-gray-400">•</span>
            <a href="/docs/datenschutz" class="hover:text-indigo-600 transition-colors">Datenschutz</a>
          </div>
          <p class="text-gray-500">© 2025 SC Champions. Alle Rechte vorbehalten.</p>
        </div>
      </div>
    </footer>
  </div>
</template>
