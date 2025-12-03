<script setup>
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4='

function goToCoach() {
  router.push('/coach')
}
</script>

<template>
  <header class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white safe-top">
    <div class="px-4 py-4">
      <div class="flex items-center justify-between">
        <!-- Profile Info -->
        <div class="flex items-center gap-3">
          <img
            :src="authStore.avatarUrl || DEFAULT_AVATAR"
            class="w-12 h-12 rounded-full border-2 border-white/30"
            alt="Profilbild"
            @error="(e) => e.target.src = DEFAULT_AVATAR"
          />
          <div>
            <p class="font-semibold">Willkommen zurück!</p>
            <p class="text-indigo-200 text-sm">{{ authStore.displayName }}</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <!-- Coach Button (if coach) -->
          <button
            v-if="authStore.isCoach"
            @click="goToCoach"
            class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            title="Coach-Bereich"
          >
            <i class="fas fa-chalkboard-teacher"></i>
          </button>

          <!-- Notifications -->
          <button
            class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors relative"
            title="Benachrichtigungen"
          >
            <i class="fas fa-bell"></i>
            <!-- <span class="absolute -top-1 -right-1 bg-red-500 text-xs w-5 h-5 rounded-full flex items-center justify-center">3</span> -->
          </button>
        </div>
      </div>

      <!-- Club Info -->
      <div v-if="authStore.club" class="mt-3 bg-white/10 rounded-lg px-3 py-2">
        <p class="text-sm">
          <i class="fas fa-users mr-2"></i>{{ authStore.club.name }}
        </p>
      </div>
      <div v-else class="mt-3 bg-yellow-500/20 rounded-lg px-3 py-2">
        <p class="text-sm">
          <i class="fas fa-info-circle mr-2"></i>Du bist noch keinem Verein beigetreten
        </p>
      </div>
    </div>
  </header>
</template>
