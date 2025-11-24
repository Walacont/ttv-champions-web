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

    <!-- Main Content - No global header, each view handles its own layout -->
    <div v-else class="container mx-auto p-4 sm:p-6 md:p-8 max-w-7xl">
      <router-view />
    </div>
  </div>
</template>
