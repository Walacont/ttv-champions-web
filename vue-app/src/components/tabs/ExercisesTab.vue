<script setup>
import { ref, computed } from 'vue'
import { collection, query, where, orderBy, doc, getDoc } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// State
const selectedTag = ref('all')
const searchQuery = ref('')
const showFilters = ref(false)
const selectedExercise = ref(null)
const playerProgress = ref({})
const showAbbreviations = ref(false)

// Exercises query (all active exercises)
const exercisesQuery = computed(() => {
  return query(
    collection(db, 'exercises'),
    orderBy('createdAt', 'desc')
  )
})
const exercises = useCollection(exercisesQuery)

// Player's completed exercises
const completedExercisesQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(collection(db, `users/${userStore.userData.id}/completedExercises`))
})
const completedExercises = useCollection(completedExercisesQuery)

// Player's exercise milestones
const exerciseMilestonesQuery = computed(() => {
  if (!userStore.userData?.id) return null
  return query(collection(db, `users/${userStore.userData.id}/exerciseMilestones`))
})
const exerciseMilestones = useCollection(exerciseMilestonesQuery)

// Extract all unique tags
const allTags = computed(() => {
  const tags = new Set()
  exercises.value?.forEach(ex => {
    (ex.tags || []).forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
})

// Filter exercises by tag and search
const filteredExercises = computed(() => {
  if (!exercises.value) return []

  return exercises.value.filter(ex => {
    // Tag filter
    if (selectedTag.value !== 'all' && !(ex.tags || []).includes(selectedTag.value)) {
      return false
    }
    // Search filter
    if (searchQuery.value) {
      const search = searchQuery.value.toLowerCase()
      const titleMatch = ex.title?.toLowerCase().includes(search)
      const descMatch = ex.description?.toLowerCase().includes(search)
      const tagMatch = (ex.tags || []).some(t => t.toLowerCase().includes(search))
      if (!titleMatch && !descMatch && !tagMatch) return false
    }
    return true
  })
})

// Group exercises by category/level
const groupedExercises = computed(() => {
  const groups = {}
  filteredExercises.value.forEach(ex => {
    const level = ex.level || 'Sonstige'
    const levelNames = {
      'grundlagen': 'Grundlagen',
      'standard': 'Standard',
      'fortgeschritten': 'Fortgeschritten'
    }
    const groupName = levelNames[level] || level
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName].push(ex)
  })
  return groups
})

const categories = computed(() => {
  const order = ['Grundlagen', 'Standard', 'Fortgeschritten', 'Sonstige']
  return Object.keys(groupedExercises.value).sort((a, b) => {
    return order.indexOf(a) - order.indexOf(b)
  })
})

// Calculate progress for an exercise
function getExerciseProgress(exerciseId, exercise) {
  const hasMilestones = exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0

  if (hasMilestones) {
    const milestone = exerciseMilestones.value?.find(m => m.id === exerciseId)
    if (!milestone) return 0
    const currentCount = milestone.currentCount || 0
    const milestones = exercise.tieredPoints.milestones
    const achievedMilestones = milestones.filter(m => currentCount >= m.count).length
    return (achievedMilestones / milestones.length) * 100
  } else {
    const completed = completedExercises.value?.find(c => c.id === exerciseId)
    return completed ? 100 : 0
  }
}

// Generate progress circle class
function getProgressClass(progress) {
  if (progress === 0) return 'text-gray-300'
  if (progress === 100) return 'text-green-500'
  return 'text-yellow-500'
}

// Parse description content if it's a string
function parseDescriptionContent(exercise) {
  if (!exercise.descriptionContent) {
    return { type: 'text', text: exercise.description || '' }
  }

  if (typeof exercise.descriptionContent === 'string') {
    try {
      return JSON.parse(exercise.descriptionContent)
    } catch (e) {
      return { type: 'text', text: exercise.description || '' }
    }
  }

  return exercise.descriptionContent
}

// Open exercise modal
function openExercise(exercise) {
  selectedExercise.value = {
    ...exercise,
    parsedDescription: parseDescriptionContent(exercise)
  }

  // Load milestone progress
  if (exercise.tieredPoints?.enabled && userStore.userData?.id) {
    const milestone = exerciseMilestones.value?.find(m => m.id === exercise.id)
    playerProgress.value = milestone || { currentCount: 0 }
  }
}

function closeExercise() {
  selectedExercise.value = null
}

function getPointsDisplay(exercise) {
  const hasMilestones = exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0
  if (hasMilestones) {
    return `Bis zu ${exercise.points} P.`
  }
  return `${exercise.points} P.`
}

function getDifficultyLabel(difficulty) {
  const labels = {
    'easy': 'Leicht',
    'normal': 'Mittel',
    'hard': 'Schwer'
  }
  return labels[difficulty] || difficulty
}

function getDifficultyColor(difficulty) {
  const colors = {
    'easy': 'bg-green-100 text-green-700',
    'normal': 'bg-yellow-100 text-yellow-700',
    'hard': 'bg-red-100 text-red-700'
  }
  return colors[difficulty] || 'bg-gray-100 text-gray-700'
}

function getNextMilestone(exercise) {
  if (!exercise?.tieredPoints?.milestones) return null
  const currentCount = playerProgress.value?.currentCount || 0
  return exercise.tieredPoints.milestones.find(m => m.count > currentCount)
}

function getMilestoneDisplayPoints(exercise, milestone, index) {
  if (!exercise?.tieredPoints?.milestones) return milestone.points
  if (index === 0) return milestone.points
  const previousPoints = exercise.tieredPoints.milestones[index - 1]?.points || 0
  return milestone.points - previousPoints
}
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-md">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-2xl font-bold text-gray-900">Übungskatalog</h2>
        <button
          @click="showFilters = !showFilters"
          class="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/>
          </svg>
          Filter
          <svg :class="showFilters ? 'rotate-180' : ''" class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      </div>

      <!-- Filters Section -->
      <div v-if="showFilters" class="mb-6 p-4 bg-gray-50 rounded-lg">
        <!-- Search -->
        <div class="mb-4">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Übung suchen..."
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-2">
          <button
            @click="selectedTag = 'all'"
            class="px-3 py-1 text-sm font-semibold rounded-full transition-colors"
            :class="selectedTag === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'"
          >
            Alle
          </button>
          <button
            v-for="tag in allTags"
            :key="tag"
            @click="selectedTag = tag"
            class="px-3 py-1 text-sm font-semibold rounded-full transition-colors"
            :class="selectedTag === tag ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'"
          >
            {{ tag }}
          </button>
        </div>
      </div>

      <p class="text-gray-600 mb-6">
        Hier findest du alle Übungen. Klicke auf eine Übung für Details und Meilensteine.
      </p>

      <!-- Exercises by Category -->
      <div v-if="categories.length" class="space-y-8">
        <div v-for="category in categories" :key="category">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <span class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-2 text-indigo-600 text-sm font-bold">
              {{ groupedExercises[category].length }}
            </span>
            {{ category }}
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="exercise in groupedExercises[category]"
              :key="exercise.id"
              @click="openExercise(exercise)"
              class="relative bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-xl transition-shadow border border-gray-100"
            >
              <!-- Progress Circle -->
              <div class="absolute top-2 right-2 z-10">
                <svg width="40" height="40" viewBox="0 0 40 40" class="transform -rotate-90">
                  <circle
                    cx="20" cy="20" r="16"
                    fill="white"
                    stroke="#E5E7EB"
                    stroke-width="3"
                  />
                  <circle
                    v-if="getExerciseProgress(exercise.id, exercise) > 0"
                    cx="20" cy="20" r="16"
                    fill="none"
                    stroke="#10B981"
                    stroke-width="3"
                    :stroke-dasharray="100.53"
                    :stroke-dashoffset="100.53 - (getExerciseProgress(exercise.id, exercise) / 100) * 100.53"
                    stroke-linecap="round"
                  />
                </svg>
                <div
                  v-if="getExerciseProgress(exercise.id, exercise) === 100"
                  class="absolute inset-0 flex items-center justify-center"
                >
                  <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <div
                  v-else-if="getExerciseProgress(exercise.id, exercise) > 0"
                  class="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-600"
                >
                  {{ Math.round(getExerciseProgress(exercise.id, exercise)) }}%
                </div>
              </div>

              <!-- Image -->
              <div v-if="exercise.imageUrl" class="w-full h-40 overflow-hidden">
                <img :src="exercise.imageUrl" :alt="exercise.title" class="w-full h-full object-cover"/>
              </div>
              <div v-else class="w-full h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <svg class="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>

              <!-- Content -->
              <div class="p-4">
                <h4 class="font-bold text-md text-gray-900 mb-2">{{ exercise.title }}</h4>
                <div class="flex flex-wrap gap-1 mb-2">
                  <span
                    v-for="tag in (exercise.tags || []).slice(0, 3)"
                    :key="tag"
                    class="inline-block bg-gray-200 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-700"
                  >
                    {{ tag }}
                  </span>
                </div>
                <p class="text-sm text-gray-600 line-clamp-2">{{ exercise.description }}</p>
                <div class="mt-3 flex justify-between items-center">
                  <span v-if="exercise.difficulty" :class="getDifficultyColor(exercise.difficulty)" class="px-2 py-1 rounded text-xs font-medium">
                    {{ getDifficultyLabel(exercise.difficulty) }}
                  </span>
                  <span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">
                    {{ exercise.tieredPoints?.enabled ? '🎯' : '+' }} {{ getPointsDisplay(exercise) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12">
        <div class="text-6xl mb-4">📖</div>
        <h3 class="text-xl font-semibold text-gray-900">Keine Übungen gefunden</h3>
        <p class="text-gray-500 mt-2">
          {{ searchQuery || selectedTag !== 'all' ? 'Versuche einen anderen Filter.' : 'Noch keine Übungen verfügbar.' }}
        </p>
      </div>
    </div>

    <!-- Exercise Detail Modal -->
    <div
      v-if="selectedExercise"
      class="fixed inset-0 flex items-center justify-center z-50 p-4"
      style="background-color: rgba(0, 0, 0, 0.5);"
      @click.self="closeExercise"
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <!-- Header Image -->
        <div v-if="selectedExercise.imageUrl" class="w-full overflow-hidden">
          <img :src="selectedExercise.imageUrl" :alt="selectedExercise.title" class="w-full object-contain max-h-96"/>
        </div>

        <div class="p-6">
          <!-- Title & Close -->
          <div class="flex justify-between items-start mb-4">
            <h2 class="text-2xl font-bold text-gray-900">{{ selectedExercise.title }}</h2>
            <button @click="closeExercise" class="text-gray-400 hover:text-gray-600 p-1">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Tags -->
          <div class="flex flex-wrap gap-2 mb-4">
            <span
              v-for="tag in (selectedExercise.tags || [])"
              :key="tag"
              class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold"
            >
              {{ tag }}
            </span>
          </div>

          <!-- Points -->
          <div class="mb-4">
            <span class="text-xl font-bold text-indigo-600">
              {{ selectedExercise.tieredPoints?.enabled ? '🎯 Bis zu' : '+' }}
              {{ selectedExercise.points }} Punkte
            </span>
          </div>

          <!-- Description -->
          <div class="prose prose-sm max-w-none mb-6">
            <!-- Text Description -->
            <div v-if="!selectedExercise.parsedDescription || selectedExercise.parsedDescription.type === 'text'">
              <p class="text-gray-700 whitespace-pre-wrap">{{ selectedExercise.parsedDescription?.text || selectedExercise.description }}</p>
            </div>

            <!-- Table Description -->
            <div v-else-if="selectedExercise.parsedDescription?.type === 'table' && selectedExercise.parsedDescription?.tableData">
              <table class="border-collapse w-full my-3">
                <thead>
                  <tr>
                    <th
                      v-for="(header, idx) in selectedExercise.parsedDescription.tableData.headers"
                      :key="idx"
                      class="border border-gray-400 bg-gray-100 px-3 py-2 font-semibold text-left"
                    >
                      {{ header }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIdx) in selectedExercise.parsedDescription.tableData.rows" :key="rowIdx">
                    <td
                      v-for="(cell, cellIdx) in row"
                      :key="cellIdx"
                      class="border border-gray-300 px-3 py-2"
                    >
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Abkürzungen Legende -->
          <div class="mb-4 border-t border-gray-200 pt-3">
            <button
              @click="showAbbreviations = !showAbbreviations"
              class="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
            >
              <svg
                class="w-4 h-4 transform transition-transform"
                :class="showAbbreviations ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
              📖 {{ showAbbreviations ? 'Abkürzungen ausblenden' : 'Abkürzungen anzeigen' }}
            </button>
            <div v-show="showAbbreviations" class="mt-3 bg-gray-50 rounded-lg p-3">
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div><span class="font-semibold">VH</span> = Vorhand</div>
                <div><span class="font-semibold">RH</span> = Rückhand</div>
                <div><span class="font-semibold">T</span> = Topspin</div>
                <div><span class="font-semibold">K</span> = Konter</div>
                <div><span class="font-semibold">B</span> = Block</div>
                <div><span class="font-semibold">S</span> = Smash</div>
                <div><span class="font-semibold">F</span> = Flip</div>
                <div><span class="font-semibold">SCH</span> = Schupf</div>
                <div><span class="font-semibold">U</span> = Unterschnitt - Abwehr</div>
                <div><span class="font-semibold">A</span> = Aufschlag</div>
                <div><span class="font-semibold">OS</span> = Oberschnitt</div>
                <div><span class="font-semibold">US</span> = Unterschnitt</div>
                <div><span class="font-semibold">SS</span> = Seitenschnitt</div>
              </div>
            </div>
          </div>

          <!-- Milestones -->
          <div v-if="selectedExercise.tieredPoints?.enabled && selectedExercise.tieredPoints?.milestones?.length" class="border-t pt-4">
            <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span class="text-2xl">📊</span>
              Meilensteine
            </h4>

            <!-- Player Progress -->
            <div v-if="userStore.userData" class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-lg">📈</span>
                <span class="font-bold text-gray-800">Deine beste Leistung</span>
              </div>
              <p class="text-base text-gray-700 mb-2">
                Persönlicher Rekord:
                <span class="font-bold text-blue-600">{{ playerProgress.currentCount || 0 }} Wiederholungen</span>
              </p>
              <p
                v-if="getNextMilestone(selectedExercise)"
                class="text-sm text-gray-600"
              >
                Noch <span class="font-semibold text-orange-600">{{ getNextMilestone(selectedExercise).count - (playerProgress.currentCount || 0) }} Wiederholungen</span> bis zum nächsten Meilenstein
              </p>
              <p v-else class="text-sm text-green-600 font-semibold">
                ✓ Alle Meilensteine erreicht!
              </p>
            </div>

            <!-- Milestone List -->
            <div class="space-y-2">
              <div
                v-for="(milestone, index) in selectedExercise.tieredPoints.milestones"
                :key="index"
                class="flex justify-between items-center py-3 px-4 rounded-lg border"
                :class="(playerProgress.currentCount || 0) >= milestone.count
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
                  : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300'"
              >
                <div class="flex items-center gap-3">
                  <span class="text-2xl">
                    {{ (playerProgress.currentCount || 0) >= milestone.count ? '✓' : '🎯' }}
                  </span>
                  <span class="text-base font-semibold" :class="(playerProgress.currentCount || 0) >= milestone.count ? 'text-green-700' : 'text-gray-700'">
                    {{ milestone.count }} Wiederholungen
                  </span>
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold" :class="(playerProgress.currentCount || 0) >= milestone.count ? 'text-green-600' : 'text-gray-600'">
                    {{ index === 0 ? '' : '+' }}{{ getMilestoneDisplayPoints(selectedExercise, milestone, index) }} P.
                  </div>
                  <div class="text-xs text-gray-500 font-medium">
                    Gesamt: {{ milestone.points }} P.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Close Button -->
          <div class="mt-6 flex justify-end">
            <button
              @click="closeExercise"
              class="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
