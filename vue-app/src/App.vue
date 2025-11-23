<script setup>
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

onMounted(() => {
  userStore.init()
})
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Loading State -->
    <div v-if="userStore.loading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">Laden...</p>
      </div>
    </div>

    <!-- Main Content -->
    <div v-else>
      <!-- Header -->
      <header v-if="userStore.isAuthenticated" class="bg-white shadow-sm">
        <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 class="text-xl font-bold text-indigo-600">TTV Champions</h1>
          <nav class="flex items-center space-x-4">
            <router-link to="/leaderboard" class="text-gray-600 hover:text-indigo-600">
              Rangliste
            </router-link>
            <router-link to="/dashboard" class="text-gray-600 hover:text-indigo-600">
              Dashboard
            </router-link>
            <span class="text-sm text-gray-500">
              {{ userStore.userData?.firstName }} {{ userStore.userData?.lastName }}
            </span>
          </nav>
        </div>
      </header>

      <!-- Router View -->
      <main class="max-w-7xl mx-auto px-4 py-8">
        <router-view />
      </main>
    </div>
  </div>
</template>
