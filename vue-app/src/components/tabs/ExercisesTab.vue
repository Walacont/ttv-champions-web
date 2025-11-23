<script setup>
import { computed } from 'vue'
import { collection, query, where, orderBy } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Exercises query
const exercisesQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'exercises'),
    where('clubId', '==', userStore.clubId),
    where('active', '==', true),
    orderBy('category', 'asc')
  )
})
const exercises = useCollection(exercisesQuery)

// Group exercises by category
const groupedExercises = computed(() => {
  if (!exercises.value) return {}
  return exercises.value.reduce((acc, ex) => {
    const cat = ex.category || 'Sonstige'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ex)
    return acc
  }, {})
})

const categories = computed(() => Object.keys(groupedExercises.value))
</script>

<template>
  <div class="space-y-6">
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">📚 Übungskatalog</h2>
      <p class="text-gray-600 mb-6">
        Hier findest du alle Übungen, die dein Trainer für dich zusammengestellt hat.
      </p>

      <!-- Categories -->
      <div v-if="categories.length" class="space-y-6">
        <div v-for="category in categories" :key="category">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center">
            <span class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-2 text-indigo-600">
              {{ groupedExercises[category].length }}
            </span>
            {{ category }}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="exercise in groupedExercises[category]"
              :key="exercise.id"
              class="bg-gray-50 p-4 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors cursor-pointer"
            >
              <h4 class="font-semibold text-gray-900">{{ exercise.name }}</h4>
              <p class="text-sm text-gray-600 mt-1 line-clamp-2">{{ exercise.description }}</p>
              <div class="mt-2 flex items-center space-x-2 text-xs">
                <span v-if="exercise.difficulty" class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                  {{ exercise.difficulty }}
                </span>
                <span v-if="exercise.xpReward" class="px-2 py-1 bg-green-100 text-green-700 rounded">
                  +{{ exercise.xpReward }} XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12">
        <div class="text-6xl mb-4">📖</div>
        <h3 class="text-xl font-semibold text-gray-900">Keine Übungen verfügbar</h3>
        <p class="text-gray-500 mt-2">Dein Trainer hat noch keine Übungen hinzugefügt.</p>
      </div>
    </div>
  </div>
</template>
