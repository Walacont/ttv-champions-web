<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const profile = computed(() => authStore.profile)

// Rank definitions based on XP
const ranks = [
  { name: 'Rekrut', minXp: 0, icon: '🔰', color: 'gray' },
  { name: 'Kadett', minXp: 100, icon: '⭐', color: 'green' },
  { name: 'Gefreiter', minXp: 300, icon: '⭐⭐', color: 'blue' },
  { name: 'Unteroffizier', minXp: 600, icon: '🎖️', color: 'purple' },
  { name: 'Feldwebel', minXp: 1000, icon: '🎖️🎖️', color: 'yellow' },
  { name: 'Leutnant', minXp: 1500, icon: '🏅', color: 'orange' },
  { name: 'Hauptmann', minXp: 2200, icon: '🏅🏅', color: 'red' },
  { name: 'Major', minXp: 3000, icon: '🎯', color: 'indigo' },
  { name: 'Oberst', minXp: 4000, icon: '🏆', color: 'pink' },
  { name: 'General', minXp: 5500, icon: '👑', color: 'amber' },
  { name: 'Champion', minXp: 7500, icon: '💎', color: 'cyan' }
]

const currentRank = computed(() => {
  const xp = profile.value?.total_xp || 0
  let rank = ranks[0]
  for (const r of ranks) {
    if (xp >= r.minXp) {
      rank = r
    }
  }
  return rank
})

const nextRank = computed(() => {
  const currentIndex = ranks.findIndex(r => r.name === currentRank.value.name)
  if (currentIndex < ranks.length - 1) {
    return ranks[currentIndex + 1]
  }
  return null
})

const progressToNextRank = computed(() => {
  if (!nextRank.value) return 100
  const xp = profile.value?.total_xp || 0
  const currentMin = currentRank.value.minXp
  const nextMin = nextRank.value.minXp
  const progress = ((xp - currentMin) / (nextMin - currentMin)) * 100
  return Math.min(Math.max(progress, 0), 100)
})

const xpToNextRank = computed(() => {
  if (!nextRank.value) return 0
  const xp = profile.value?.total_xp || 0
  return nextRank.value.minXp - xp
})
</script>

<template>
  <div class="bg-white p-6 rounded-xl shadow-md">
    <h2 class="text-xl font-semibold mb-4">Dein Rang</h2>
    <div class="text-center">
      <div class="text-4xl mb-2">{{ currentRank.icon }}</div>
      <p class="text-xl font-bold" :class="`text-${currentRank.color}-600`">
        {{ currentRank.name }}
      </p>
      <p class="text-sm text-gray-500 mt-1">{{ profile?.total_xp || 0 }} XP</p>

      <div v-if="nextRank" class="mt-4">
        <div class="flex justify-between text-xs text-gray-500 mb-1">
          <span>{{ currentRank.name }}</span>
          <span>{{ nextRank.name }}</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-indigo-600 h-2 rounded-full transition-all duration-500"
            :style="{ width: `${progressToNextRank}%` }"
          ></div>
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Noch {{ xpToNextRank }} XP bis zum nächsten Rang
        </p>
      </div>

      <div v-else class="mt-4">
        <p class="text-sm text-indigo-600 font-semibold">
          Höchster Rang erreicht!
        </p>
      </div>
    </div>
  </div>
</template>
