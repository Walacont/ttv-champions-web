<script setup>
import { ref } from 'vue'

const isVisible = ref(true)

function close() {
  isVisible.value = false
  // Optionally save to localStorage to not show again
  localStorage.setItem('infoBannerDismissed', 'true')
}

// Check if user dismissed before
if (localStorage.getItem('infoBannerDismissed') === 'true') {
  isVisible.value = false
}
</script>

<template>
  <div
    v-if="isVisible"
    class="bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-indigo-500 p-4 rounded-lg relative"
  >
    <button
      @click="close"
      class="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
    >
      <i class="fas fa-times"></i>
    </button>

    <div class="flex items-start">
      <div class="flex-shrink-0">
        <svg class="h-5 w-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
      <div class="ml-3 flex-1">
        <p class="text-sm font-medium text-indigo-800">
          Drei Systeme für deinen Fortschritt
        </p>
        <p class="text-xs text-indigo-700 mt-1">
          <strong class="text-purple-700">XP</strong> = Permanenter Fleiß für Rang-Aufstieg •
          <strong class="text-blue-700">Elo</strong> = Wettkampf-Spielstärke •
          <strong class="text-yellow-700">Saisonpunkte</strong> = Temporärer 6-Wochen-Wettbewerb
        </p>
      </div>
    </div>
  </div>
</template>
