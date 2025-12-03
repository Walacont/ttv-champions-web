<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(async () => {
  // Initialize auth state
  await authStore.initialize()
})
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Loading state -->
    <div v-if="authStore.loading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">Laden...</p>
      </div>
    </div>

    <!-- Main content -->
    <router-view v-else />
  </div>
</template>

<style>
/* Safe area handling for mobile */
.safe-top {
  padding-top: env(safe-area-inset-top);
}

.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
