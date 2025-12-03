<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCoach = computed(() => ['coach', 'admin'].includes(authStore.profile?.role))

const navItems = computed(() => {
  const items = [
    { id: 'dashboard', path: '/dashboard', icon: 'fa-home', label: 'Home' },
    { id: 'matches', path: '/dashboard', query: { tab: 'matches' }, icon: 'fa-trophy', label: 'Wettkampf' },
    { id: 'leaderboard', path: '/dashboard', query: { tab: 'leaderboard' }, icon: 'fa-chart-bar', label: 'Rangliste' },
    { id: 'profile', path: '/profile', icon: 'fa-user', label: 'Profil' }
  ]

  if (isCoach.value) {
    items.splice(3, 0, { id: 'coach', path: '/coach', icon: 'fa-user-shield', label: 'Coach' })
  }

  return items
})

function isActive(item) {
  if (item.path === '/dashboard' && item.query?.tab) {
    return false // Tab items handled differently
  }
  return route.path === item.path
}

function navigate(item) {
  if (item.query) {
    router.push({ path: item.path, query: item.query })
  } else {
    router.push(item.path)
  }
}
</script>

<template>
  <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom md:hidden z-50">
    <div class="flex justify-around items-center h-16 px-2">
      <button
        v-for="item in navItems"
        :key="item.id"
        @click="navigate(item)"
        class="flex flex-col items-center justify-center flex-1 py-2 transition-colors"
        :class="isActive(item)
          ? 'text-indigo-600'
          : 'text-gray-500 hover:text-gray-700'"
      >
        <i :class="['fas', item.icon, 'text-lg']"></i>
        <span class="text-xs mt-1">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
