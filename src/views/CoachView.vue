<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProfiles } from '@/composables/useProfiles'
import { useMatches } from '@/composables/useMatches'
import { useLeaderboard } from '@/composables/useLeaderboard'
import { useExercises } from '@/composables/useExercises'
import { useClubs } from '@/composables/useClubs'
import { usePointsHistory } from '@/composables/usePointsHistory'

const router = useRouter()
const authStore = useAuthStore()
const { getClubMembers, updateProfile } = useProfiles()
const { createMatchRequest } = useMatches()
const { getXpLeaderboard, getEloLeaderboard, getPointsLeaderboard } = useLeaderboard()
const { getExercises, createExercise } = useExercises()
const { getSubgroups } = useClubs()
const { addPoints } = usePointsHistory()

// State
const activeTab = ref('statistics')
const subgroupFilter = ref('all')
const genderFilter = ref('all')
const loading = ref(false)

// Data
const players = ref([])
const leaderboard = ref([])
const exercises = ref([])
const subgroups = ref([])
const selectedPlayer = ref(null)

// Match form
const matchForm = ref({
  matchType: 'singles',
  matchMode: 'best-of-5',
  playerA: null,
  playerB: null,
  sets: [{ a: '', b: '' }]
})

// Points form
const pointsForm = ref({
  playerId: null,
  xpAmount: 0,
  pointsAmount: 0,
  reason: '',
  type: 'bonus'
})

// Exercise form
const exerciseForm = ref({
  title: '',
  description: '',
  points: 10,
  tags: ''
})

// Modals
const showPlayerModal = ref(false)
const showExerciseModal = ref(false)

// Tabs
const tabs = [
  { id: 'statistics', label: 'Statistik' },
  { id: 'leaderboard', label: 'Rangliste' },
  { id: 'attendance', label: 'Anwesenheit' },
  { id: 'matches', label: 'Wettkampf' },
  { id: 'points', label: 'Punkte vergeben' },
  { id: 'exercises', label: 'Übungen' },
  { id: 'subgroups', label: '👥 Gruppen' }
]

// Computed
const profile = computed(() => authStore.profile)
const clubId = computed(() => profile.value?.club_id)

const filteredPlayers = computed(() => {
  let result = players.value
  if (genderFilter.value !== 'all') {
    result = result.filter(p => p.gender === genderFilter.value)
  }
  if (subgroupFilter.value !== 'all') {
    result = result.filter(p => p.subgroup_ids && p.subgroup_ids.includes(subgroupFilter.value))
  }
  return result
})

const clubStats = computed(() => {
  const totalXp = players.value.reduce((sum, p) => sum + (p.total_xp || 0), 0)
  const totalPoints = players.value.reduce((sum, p) => sum + (p.total_points || 0), 0)
  const avgElo = players.value.length > 0
    ? Math.round(players.value.reduce((sum, p) => sum + (p.elo_rating || 1000), 0) / players.value.length)
    : 1000
  return { totalPlayers: players.value.length, totalXp, totalPoints, avgElo }
})

// Methods
async function loadData() {
  loading.value = true
  try {
    if (clubId.value) {
      players.value = await getClubMembers(clubId.value)
      subgroups.value = await getSubgroups(clubId.value)
      exercises.value = await getExercises()
    }
  } finally {
    loading.value = false
  }
}

async function loadLeaderboard(type = 'xp') {
  const options = { clubId: clubId.value, gender: genderFilter.value }
  switch (type) {
    case 'xp': leaderboard.value = await getXpLeaderboard(options); break
    case 'elo': leaderboard.value = await getEloLeaderboard(options); break
    case 'points': leaderboard.value = await getPointsLeaderboard(options); break
  }
}

function goToDashboard() { router.push('/dashboard') }
function goToSettings() { router.push('/settings') }
async function handleLogout() { await authStore.signOut(); router.push('/login') }

// Match handling
function addSet() { matchForm.value.sets.push({ a: '', b: '' }) }
function removeSet(index) { if (matchForm.value.sets.length > 1) matchForm.value.sets.splice(index, 1) }

async function submitMatch() {
  let winsA = 0, winsB = 0
  for (const set of matchForm.value.sets) {
    if (parseInt(set.a) > parseInt(set.b)) winsA++
    else if (parseInt(set.b) > parseInt(set.a)) winsB++
  }
  const result = await createMatchRequest({
    match_type: matchForm.value.matchType,
    match_mode: matchForm.value.matchMode,
    player_a_id: matchForm.value.playerA,
    player_b_id: matchForm.value.playerB,
    score_a: winsA,
    score_b: winsB,
    sets: matchForm.value.sets,
    club_id: clubId.value
  })
  if (result) {
    matchForm.value.sets = [{ a: '', b: '' }]
    matchForm.value.playerA = null
    matchForm.value.playerB = null
  }
}

// Points handling
async function submitPoints() {
  if (!pointsForm.value.playerId) return
  await addPoints(pointsForm.value.playerId, {
    xp_amount: pointsForm.value.xpAmount,
    points_amount: pointsForm.value.pointsAmount,
    description: pointsForm.value.reason,
    type: pointsForm.value.type
  })
  const player = players.value.find(p => p.id === pointsForm.value.playerId)
  if (player) {
    await updateProfile(player.id, {
      total_xp: (player.total_xp || 0) + pointsForm.value.xpAmount,
      total_points: (player.total_points || 0) + pointsForm.value.pointsAmount
    })
  }
  pointsForm.value = { playerId: null, xpAmount: 0, pointsAmount: 0, reason: '', type: 'bonus' }
  await loadData()
}

// Exercise handling
async function submitExercise() {
  const tags = exerciseForm.value.tags.split(',').map(t => t.trim()).filter(t => t)
  await createExercise({
    title: exerciseForm.value.title,
    description: exerciseForm.value.description,
    points: exerciseForm.value.points,
    tags
  })
  exerciseForm.value = { title: '', description: '', points: 10, tags: '' }
  showExerciseModal.value = false
  exercises.value = await getExercises()
}

watch([activeTab, genderFilter, subgroupFilter], () => {
  if (activeTab.value === 'leaderboard') loadLeaderboard()
})

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-6">
    <!-- Header -->
    <header class="bg-white shadow-sm safe-top">
      <div class="container mx-auto px-4 py-4 max-w-7xl">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-start gap-3 flex-1">
            <div class="h-14 w-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-md flex-shrink-0">
              {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'C' }}
            </div>
            <div class="flex-1">
              <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Coach Dashboard</h1>
              <p class="text-sm sm:text-base text-gray-600">Willkommen zurück, {{ authStore.displayName }}!</p>
              <p v-if="authStore.club" class="text-xs sm:text-sm text-gray-500 mt-1">
                <i class="fas fa-building mr-1"></i>{{ authStore.club.name }}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-3">
            <button @click="goToDashboard" class="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-1.5 px-3 text-sm rounded-lg shadow">
              <i class="fas fa-table-tennis mr-1"></i><span class="hidden sm:inline">Spieler</span>
            </button>
            <button @click="goToSettings" class="text-gray-500 hover:text-gray-800 p-2"><i class="fas fa-cog text-xl"></i></button>
            <button @click="handleLogout" class="bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 px-3 text-sm rounded-lg shadow">Logout</button>
          </div>
        </div>
        <!-- Filter -->
        <div class="flex flex-col sm:flex-row gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div class="flex items-center gap-2 flex-1">
            <label class="text-sm font-medium text-gray-700">👥 Gruppe:</label>
            <select v-model="subgroupFilter" class="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white">
              <option value="all">Alle</option>
              <option v-for="group in subgroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
          </div>
          <div class="flex items-center gap-2 flex-1 sm:flex-none">
            <label class="text-sm font-medium text-gray-700">⚧ Geschlecht:</label>
            <select v-model="genderFilter" class="flex-1 sm:flex-none px-3 py-2 text-sm border border-gray-300 rounded-md bg-white">
              <option value="all">Alle</option>
              <option value="male">Jungen/Herren</option>
              <option value="female">Mädchen/Damen</option>
            </select>
          </div>
        </div>
      </div>
    </header>

    <!-- Action Buttons -->
    <div class="container mx-auto px-4 py-4 max-w-7xl">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button @click="showPlayerModal = true" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md flex items-center justify-center space-x-2">
          <i class="fas fa-users"></i><span>Spieler verwalten</span>
        </button>
        <button class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-md flex items-center justify-center space-x-2">
          <i class="fas fa-user-plus"></i><span>Offline-Spieler erstellen</span>
        </button>
        <button class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md flex items-center justify-center space-x-2">
          <i class="fas fa-key"></i><span>Codes verwalten</span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="container mx-auto px-4 max-w-7xl border-b border-gray-200">
      <nav class="-mb-px flex space-x-6 overflow-x-auto">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.id ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'">
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Main Content -->
    <main class="container mx-auto p-4 sm:p-6 max-w-7xl">
      <!-- Statistics Tab -->
      <div v-show="activeTab === 'statistics'" class="space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white p-6 rounded-xl shadow-md text-center">
            <p class="text-3xl font-bold text-blue-600">{{ clubStats.totalPlayers }}</p>
            <p class="text-sm text-gray-500">Spieler</p>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-md text-center">
            <p class="text-3xl font-bold text-purple-600">{{ clubStats.totalXp.toLocaleString('de-DE') }}</p>
            <p class="text-sm text-gray-500">Gesamt XP</p>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-md text-center">
            <p class="text-3xl font-bold text-yellow-600">{{ clubStats.totalPoints.toLocaleString('de-DE') }}</p>
            <p class="text-sm text-gray-500">Gesamt Punkte</p>
          </div>
          <div class="bg-white p-6 rounded-xl shadow-md text-center">
            <p class="text-3xl font-bold text-green-600">{{ clubStats.avgElo }}</p>
            <p class="text-sm text-gray-500">Ø Elo</p>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-md overflow-hidden">
          <div class="p-4 border-b"><h2 class="text-xl font-semibold">Spieler ({{ filteredPlayers.length }})</h2></div>
          <div class="max-h-96 overflow-y-auto">
            <table class="w-full">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">XP</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Elo</th>
                  <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Punkte</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="player in filteredPlayers" :key="player.id" class="hover:bg-gray-50 cursor-pointer">
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {{ player.display_name?.charAt(0)?.toUpperCase() || '?' }}
                      </div>
                      <span class="font-medium">{{ player.display_name }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right text-purple-600 font-semibold">{{ player.total_xp || 0 }}</td>
                  <td class="px-4 py-3 text-right text-blue-600 font-semibold">{{ player.elo_rating || 1000 }}</td>
                  <td class="px-4 py-3 text-right text-yellow-600 font-semibold">{{ player.total_points || 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Leaderboard Tab -->
      <div v-show="activeTab === 'leaderboard'" class="max-w-2xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6">
          <div class="flex gap-2 mb-4">
            <button @click="loadLeaderboard('xp')" class="px-4 py-2 rounded-lg bg-purple-100 text-purple-700 font-medium">XP</button>
            <button @click="loadLeaderboard('elo')" class="px-4 py-2 rounded-lg bg-blue-100 text-blue-700 font-medium">Elo</button>
            <button @click="loadLeaderboard('points')" class="px-4 py-2 rounded-lg bg-yellow-100 text-yellow-700 font-medium">Punkte</button>
          </div>
          <ul class="space-y-2">
            <li v-for="(player, index) in leaderboard" :key="player.id" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <span class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">{{ index + 1 }}</span>
              <span class="flex-1 font-medium">{{ player.display_name }}</span>
              <span class="font-bold text-gray-700">{{ player.total_xp || player.elo_rating || player.total_points || 0 }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Attendance Tab -->
      <div v-show="activeTab === 'attendance'" class="max-w-3xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6 text-center">
          <p class="text-gray-500">Anwesenheits-Kalender wird hier angezeigt</p>
        </div>
      </div>

      <!-- Matches Tab -->
      <div v-show="activeTab === 'matches'" class="max-w-2xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-semibold mb-4">Wettkampf-Match melden</h2>
          <div class="flex justify-center mb-6">
            <div class="inline-flex rounded-lg border border-gray-300 p-1">
              <button @click="matchForm.matchType = 'singles'" class="px-6 py-2 rounded-md text-sm font-medium transition-all" :class="matchForm.matchType === 'singles' ? 'bg-indigo-600 text-white' : 'text-gray-500'">Einzel</button>
              <button @click="matchForm.matchType = 'doubles'" class="px-6 py-2 rounded-md text-sm font-medium transition-all" :class="matchForm.matchType === 'doubles' ? 'bg-indigo-600 text-white' : 'text-gray-500'">Doppel</button>
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Spielmodus</label>
            <select v-model="matchForm.matchMode" class="w-full px-4 py-2 border rounded-md">
              <option value="single-set">1 Satz</option>
              <option value="best-of-3">Best of 3</option>
              <option value="best-of-5">Best of 5</option>
              <option value="best-of-7">Best of 7</option>
            </select>
          </div>
          <div v-if="matchForm.matchType === 'singles'" class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Spieler A</label>
              <select v-model="matchForm.playerA" class="w-full px-3 py-2 border rounded-md">
                <option value="">Wählen...</option>
                <option v-for="player in filteredPlayers" :key="player.id" :value="player.id">{{ player.display_name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Spieler B</label>
              <select v-model="matchForm.playerB" class="w-full px-3 py-2 border rounded-md">
                <option value="">Wählen...</option>
                <option v-for="player in filteredPlayers" :key="player.id" :value="player.id">{{ player.display_name }}</option>
              </select>
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Satzergebnisse</label>
            <div class="space-y-2">
              <div v-for="(set, index) in matchForm.sets" :key="index" class="flex items-center gap-2">
                <span class="text-sm text-gray-500 w-16">Satz {{ index + 1 }}</span>
                <input v-model="set.a" type="number" min="0" class="w-16 px-2 py-1 border rounded text-center" />
                <span>:</span>
                <input v-model="set.b" type="number" min="0" class="w-16 px-2 py-1 border rounded text-center" />
                <button v-if="matchForm.sets.length > 1" @click="removeSet(index)" class="text-red-500 p-1"><i class="fas fa-times"></i></button>
              </div>
            </div>
            <button @click="addSet" class="mt-2 text-indigo-600 text-sm">+ Satz hinzufügen</button>
          </div>
          <button @click="submitMatch" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">Match speichern</button>
        </div>
      </div>

      <!-- Points Tab -->
      <div v-show="activeTab === 'points'" class="max-w-2xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-semibold mb-4">Punkte vergeben</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Spieler</label>
              <select v-model="pointsForm.playerId" class="w-full px-3 py-2 border rounded-md">
                <option value="">Spieler wählen...</option>
                <option v-for="player in filteredPlayers" :key="player.id" :value="player.id">{{ player.display_name }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">XP</label>
                <input v-model.number="pointsForm.xpAmount" type="number" min="0" class="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Saisonpunkte</label>
                <input v-model.number="pointsForm.pointsAmount" type="number" min="0" class="w-full px-3 py-2 border rounded-md" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Grund</label>
              <input v-model="pointsForm.reason" type="text" placeholder="z.B. Übung geschafft" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <button @click="submitPoints" :disabled="!pointsForm.playerId" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50">Punkte vergeben</button>
          </div>
        </div>
      </div>

      <!-- Exercises Tab -->
      <div v-show="activeTab === 'exercises'" class="max-w-4xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-semibold">Übungen</h2>
            <button @click="showExerciseModal = true" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg">
              <i class="fas fa-plus mr-2"></i>Neue Übung
            </button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="exercise in exercises" :key="exercise.id" class="border rounded-lg p-4 hover:shadow-md cursor-pointer">
              <h3 class="font-semibold">{{ exercise.title }}</h3>
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{{ exercise.description }}</p>
              <div class="flex flex-wrap gap-1 mt-2">
                <span v-for="tag in exercise.tags" :key="tag" class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{{ tag }}</span>
              </div>
              <p class="text-sm text-purple-600 font-semibold mt-2">{{ exercise.points }} Punkte</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Subgroups Tab -->
      <div v-show="activeTab === 'subgroups'" class="max-w-2xl mx-auto">
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-semibold mb-4">Gruppen verwalten</h2>
          <div v-if="subgroups.length === 0" class="text-center py-8 text-gray-500">Keine Gruppen erstellt</div>
          <ul v-else class="space-y-2">
            <li v-for="group in subgroups" :key="group.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span class="font-medium">{{ group.name }}</span>
              <span class="text-sm text-gray-500">{{ group.member_count || 0 }} Mitglieder</span>
            </li>
          </ul>
        </div>
      </div>
    </main>

    <!-- Player Modal -->
    <Teleport to="body">
      <div v-if="showPlayerModal" class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex justify-center items-center p-4" @click.self="showPlayerModal = false">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div class="flex justify-between items-center p-4 border-b">
            <h3 class="text-xl font-semibold">Spieler verwalten</h3>
            <button @click="showPlayerModal = false" class="text-gray-500 hover:text-gray-700"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-4 overflow-y-auto max-h-[70vh]">
            <ul class="space-y-2">
              <li v-for="player in filteredPlayers" :key="player.id" class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">{{ player.display_name?.charAt(0)?.toUpperCase() || '?' }}</div>
                  <div>
                    <p class="font-medium">{{ player.display_name }}</p>
                    <p class="text-sm text-gray-500">{{ player.email }}</p>
                  </div>
                </div>
                <div class="text-right text-sm">
                  <p class="text-purple-600 font-semibold">{{ player.total_xp || 0 }} XP</p>
                  <p class="text-blue-600">{{ player.elo_rating || 1000 }} Elo</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Exercise Modal -->
    <Teleport to="body">
      <div v-if="showExerciseModal" class="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex justify-center items-center p-4" @click.self="showExerciseModal = false">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div class="flex justify-between items-center p-4 border-b">
            <h3 class="text-xl font-semibold">Neue Übung erstellen</h3>
            <button @click="showExerciseModal = false" class="text-gray-500 hover:text-gray-700"><i class="fas fa-times text-xl"></i></button>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Titel</label>
              <input v-model="exerciseForm.title" type="text" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
              <textarea v-model="exerciseForm.description" rows="3" class="w-full px-3 py-2 border rounded-md"></textarea>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Punkte</label>
              <input v-model.number="exerciseForm.points" type="number" min="1" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tags (kommagetrennt)</label>
              <input v-model="exerciseForm.tags" type="text" placeholder="z.B. Aufschlag, Beinarbeit" class="w-full px-3 py-2 border rounded-md" />
            </div>
            <button @click="submitExercise" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">Übung speichern</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
