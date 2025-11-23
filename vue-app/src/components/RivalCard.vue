<script setup>
import { computed } from 'vue'

const props = defineProps({
  player: Object,
  currentUserElo: Number
})

const eloDiff = computed(() => {
  const diff = (props.player.eloRating || 1000) - props.currentUserElo
  return diff > 0 ? `+${diff}` : diff
})

const initials = computed(() => {
  return (props.player.firstName?.[0] || '') + (props.player.lastName?.[0] || '')
})
</script>

<template>
  <div class="bg-white p-4 rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors">
    <div class="flex items-center space-x-3">
      <img
        :src="player.photoURL || `https://placehold.co/48x48/e2e8f0/64748b?text=${initials}`"
        :alt="player.firstName"
        class="w-12 h-12 rounded-full object-cover"
      />
      <div class="flex-grow">
        <p class="font-medium text-gray-900">
          {{ player.firstName }} {{ player.lastName }}
        </p>
        <p class="text-sm text-gray-500">
          {{ player.eloRating || 1000 }} Elo
          <span
            class="ml-1"
            :class="eloDiff > 0 ? 'text-red-500' : 'text-green-500'"
          >
            ({{ eloDiff }})
          </span>
        </p>
      </div>
      <button
        class="px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
      >
        🏓
      </button>
    </div>
  </div>
</template>
