<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/composables/useSupabase'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const exercises = ref([])
const loading = ref(true)
const selectedExercise = ref(null)
const showModal = ref(false)

async function loadExercises() {
  loading.value = true
  try {
    let query = supabase
      .from('exercises')
      .select('*')
      .order('name')

    // Filter by club if user has one
    if (authStore.profile?.club_id) {
      query = query.eq('club_id', authStore.profile.club_id)
    }

    const { data, error } = await query
    if (error) throw error
    exercises.value = data || []
  } catch (error) {
    console.error('Error loading exercises:', error)
  } finally {
    loading.value = false
  }
}

function openExercise(exercise) {
  selectedExercise.value = exercise
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  selectedExercise.value = null
}

onMounted(() => {
  loadExercises()
})
</script>

<template>
  <div class="card">
    <h2 class="text-xl font-bold mb-4">💪 Übungen</h2>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <!-- Exercise List -->
    <div v-else class="space-y-3">
      <div
        v-for="exercise in exercises"
        :key="exercise.id"
        @click="openExercise(exercise)"
        class="flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
      >
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <span class="text-2xl">🏓</span>
          </div>
          <div>
            <p class="font-semibold">{{ exercise.name }}</p>
            <p class="text-sm text-gray-500">{{ exercise.xp_reward || 0 }} XP</p>
          </div>
        </div>
        <i class="fas fa-chevron-right text-gray-400"></i>
      </div>

      <!-- Empty state -->
      <p v-if="exercises.length === 0" class="text-center text-gray-500 py-8">
        Keine Übungen verfügbar
      </p>
    </div>

    <!-- Exercise Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        @click.self="closeModal"
      >
        <div class="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
          <div class="p-6">
            <div class="flex justify-between items-start mb-4">
              <h3 class="text-xl font-bold">{{ selectedExercise?.name }}</h3>
              <button @click="closeModal" class="text-gray-400 hover:text-gray-600">
                <i class="fas fa-times text-xl"></i>
              </button>
            </div>

            <p class="text-gray-600 mb-4">{{ selectedExercise?.description }}</p>

            <div class="bg-indigo-50 rounded-lg p-4 text-center">
              <p class="text-sm text-indigo-600">Belohnung</p>
              <p class="text-2xl font-bold text-indigo-700">+{{ selectedExercise?.xp_reward || 0 }} XP</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
