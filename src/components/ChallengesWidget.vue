<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChallenges } from '@/composables/useChallenges'

const emit = defineEmits(['openChallenge'])

const authStore = useAuthStore()
const { getActiveChallenges, getPlayerProgress, loading } = useChallenges()

const challenges = ref([])
const progress = ref({})

onMounted(async () => {
  challenges.value = await getActiveChallenges()

  if (authStore.user && challenges.value.length > 0) {
    const playerProgress = await getPlayerProgress(authStore.user.id)
    for (const p of playerProgress) {
      progress.value[p.challenge_id] = p
    }
  }
})

function getChallengeProgress(challengeId) {
  return progress.value[challengeId]?.current_progress || 0
}

function getChallengeTarget(challenge) {
  if (challenge.milestones && challenge.milestones.length > 0) {
    return challenge.milestones[challenge.milestones.length - 1].target
  }
  return challenge.target || 1
}

function getProgressPercent(challenge) {
  const current = getChallengeProgress(challenge.id)
  const target = getChallengeTarget(challenge)
  return Math.min((current / target) * 100, 100)
}

function formatEndDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'Beendet'
  if (diffDays === 1) return 'Endet morgen'
  if (diffDays <= 7) return `Noch ${diffDays} Tage`
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function openChallenge(challenge) {
  emit('openChallenge', challenge)
}
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-xl font-semibold mb-4">Aktive Challenges</h2>

    <div v-if="loading" class="text-center py-4">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
    </div>

    <div
      v-else-if="challenges.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <div
        v-for="challenge in challenges"
        :key="challenge.id"
        @click="openChallenge(challenge)"
        class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow border border-indigo-100"
      >
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-semibold text-gray-800">{{ challenge.title }}</h3>
          <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
            {{ formatEndDate(challenge.end_date) }}
          </span>
        </div>

        <p class="text-sm text-gray-600 mb-3 line-clamp-2">
          {{ challenge.description }}
        </p>

        <div class="space-y-2">
          <div class="flex justify-between text-xs text-gray-500">
            <span>Fortschritt</span>
            <span>{{ getChallengeProgress(challenge.id) }} / {{ getChallengeTarget(challenge) }}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              :style="{ width: `${getProgressPercent(challenge)}%` }"
            ></div>
          </div>
        </div>

        <div class="mt-3 text-right">
          <span class="text-sm font-bold text-indigo-600">
            {{ challenge.points || 0 }} Punkte
          </span>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8">
      <p class="text-gray-500">Keine aktiven Challenges</p>
      <p class="text-sm text-gray-400 mt-1">Neue Challenges kommen bald!</p>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
