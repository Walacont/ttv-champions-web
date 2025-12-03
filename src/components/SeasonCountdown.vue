<script setup>
import { ref, onMounted, computed } from 'vue'
import { useSeason } from '@/composables/useSeason'

const { getCurrentSeason, getSeasonCountdown, currentSeason } = useSeason()

const countdown = ref('Lädt...')

onMounted(async () => {
  await getCurrentSeason()
  updateCountdown()
})

function updateCountdown() {
  countdown.value = getSeasonCountdown() || 'Keine aktive Saison'
}
</script>

<template>
  <div class="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 p-4 rounded-xl shadow-md">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="bg-yellow-400 p-3 rounded-full">
          <svg class="w-6 h-6 text-yellow-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-yellow-900">Saison-Ende</h3>
          <p class="text-xs text-yellow-700">Saison-Punkte werden zurückgesetzt</p>
        </div>
      </div>
      <div class="text-right">
        <p class="text-2xl font-bold text-yellow-900">{{ countdown }}</p>
      </div>
    </div>
  </div>
</template>
