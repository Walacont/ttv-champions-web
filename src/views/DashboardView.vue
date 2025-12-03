<script setup>
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/composables/useSupabase'

// Components
import DashboardHeader from '@/components/DashboardHeader.vue'
import StatsCard from '@/components/StatsCard.vue'
import LeaderboardCard from '@/components/LeaderboardCard.vue'
import ExercisesList from '@/components/ExercisesList.vue'
import MatchRequestForm from '@/components/MatchRequestForm.vue'
import PendingRequests from '@/components/PendingRequests.vue'

const authStore = useAuthStore()

// Active tab
const activeTab = ref('home')
const tabs = [
  { id: 'home', label: 'Start', icon: 'fas fa-home' },
  { id: 'matches', label: 'Wettkämpfe', icon: 'fas fa-table-tennis' },
  { id: 'training', label: 'Training', icon: 'fas fa-dumbbell' },
  { id: 'profile', label: 'Profil', icon: 'fas fa-user' }
]

// User stats
const stats = computed(() => ({
  xp: authStore.profile?.xp || 0,
  elo: authStore.profile?.elo_rating || 1000,
  points: authStore.profile?.points || 0,
  rank: calculateRank(authStore.profile?.xp || 0)
}))

// Ranks definition
const RANKS = [
  { name: 'Rekrut', minXP: 0, icon: '🔰' },
  { name: 'Lehrling', minXP: 100, icon: '📘' },
  { name: 'Geselle', minXP: 300, icon: '⚒️' },
  { name: 'Adept', minXP: 600, icon: '🎯' },
  { name: 'Veteran', minXP: 1000, icon: '⚔️' },
  { name: 'Experte', minXP: 1500, icon: '🛡️' },
  { name: 'Meister', minXP: 2500, icon: '👑' },
  { name: 'Großmeister', minXP: 4000, icon: '🏆' },
  { name: 'Champion', minXP: 6000, icon: '💎' },
]

function calculateRank(xp) {
  let currentRank = RANKS[0]
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].minXP) {
      currentRank = RANKS[i]
      break
    }
  }
  return currentRank
}

// Reload data
async function refreshData() {
  await authStore.refreshProfile()
}

onMounted(() => {
  refreshData()
})
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <!-- Header -->
    <DashboardHeader />

    <!-- Main Content -->
    <main class="px-4 pt-4 max-w-4xl mx-auto">
      <!-- Stats Overview -->
      <div v-if="activeTab === 'home'" class="space-y-6">
        <!-- Quick Stats -->
        <div class="grid grid-cols-3 gap-3">
          <StatsCard label="XP" :value="stats.xp" icon="⭐" color="purple" />
          <StatsCard label="Elo" :value="stats.elo" icon="📊" color="blue" />
          <StatsCard label="Punkte" :value="stats.points" icon="🏆" color="yellow" />
        </div>

        <!-- Rank Card -->
        <div class="card text-center">
          <p class="text-5xl mb-2">{{ stats.rank.icon }}</p>
          <p class="text-xl font-bold text-indigo-600">{{ stats.rank.name }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ stats.xp }} XP</p>
        </div>

        <!-- Leaderboard -->
        <LeaderboardCard />

        <!-- Pending Requests -->
        <PendingRequests />
      </div>

      <!-- Matches Tab -->
      <div v-if="activeTab === 'matches'" class="space-y-6">
        <MatchRequestForm @created="refreshData" />
        <PendingRequests />
      </div>

      <!-- Training Tab -->
      <div v-if="activeTab === 'training'" class="space-y-6">
        <ExercisesList />
      </div>

      <!-- Profile Tab -->
      <div v-if="activeTab === 'profile'" class="space-y-6">
        <div class="card">
          <div class="text-center">
            <img
              :src="authStore.avatarUrl || '/default-avatar.png'"
              class="w-24 h-24 rounded-full mx-auto border-4 border-indigo-200"
              alt="Profilbild"
            />
            <h2 class="text-xl font-bold mt-4">{{ authStore.displayName }}</h2>
            <p class="text-gray-500">{{ authStore.profile?.email }}</p>
            <p v-if="authStore.club" class="text-indigo-600 mt-2">
              <i class="fas fa-users mr-1"></i>{{ authStore.club.name }}
            </p>
          </div>

          <div class="mt-6 space-y-3">
            <router-link to="/profile" class="block w-full btn-secondary text-center">
              <i class="fas fa-edit mr-2"></i>Profil bearbeiten
            </router-link>
            <button @click="authStore.signOut()" class="w-full btn-danger">
              <i class="fas fa-sign-out-alt mr-2"></i>Abmelden
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Bottom Navigation -->
    <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom">
      <div class="flex justify-around max-w-lg mx-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex flex-col items-center py-2 px-4 transition-colors"
          :class="activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500'"
        >
          <i :class="tab.icon" class="text-xl"></i>
          <span class="text-xs mt-1">{{ tab.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>
