<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'

// Components
import SubgroupFilter from '@/components/SubgroupFilter.vue'

// Tab Components
import OverviewTab from '@/components/tabs/OverviewTab.vue'
import LeaderboardTab from '@/components/tabs/LeaderboardTab.vue'
import MatchesTab from '@/components/tabs/MatchesTab.vue'
import ExercisesTab from '@/components/tabs/ExercisesTab.vue'
import AttendanceTab from '@/components/tabs/AttendanceTab.vue'

const userStore = useUserStore()
const router = useRouter()

// Active tab
const activeTab = ref('overview')

const tabs = [
  { id: 'overview', label: 'Übersicht', icon: '📊' },
  { id: 'leaderboard', label: 'Ranglisten', icon: '🏆' },
  { id: 'matches', label: 'Wettkampf', icon: '🏓' },
  { id: 'exercises', label: 'Übungskatalog', icon: '📚' },
  { id: 'attendance', label: 'Anwesenheit', icon: '📅' },
]

async function handleLogout() {
  await userStore.logout()
  // Redirect to original index.html landing page
  window.location.href = '/index.html'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-start">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">Mein Dashboard</h1>
        <p class="text-gray-600">Willkommen zurück, {{ userStore.userData?.firstName }}!</p>
      </div>
      <div class="flex items-center space-x-3">
        <router-link to="/settings" class="text-gray-500 hover:text-gray-800 p-2">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </router-link>
        <button
          @click="handleLogout"
          class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 text-sm rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>

    <!-- Subgroup Filter -->
    <SubgroupFilter />

    <!-- Tab Navigation -->
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-4 overflow-x-auto scrollbar-thin">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="whitespace-nowrap py-4 px-3 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.id
            ? 'border-indigo-600 text-indigo-600 bg-indigo-50 rounded-t-lg'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
        <router-link
          to="/faq"
          class="whitespace-nowrap py-4 px-3 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"
        >
          ❓ FAQ & Regeln
        </router-link>
      </nav>
    </div>

    <!-- Tab Content -->
    <div>
      <OverviewTab v-if="activeTab === 'overview'" />
      <LeaderboardTab v-if="activeTab === 'leaderboard'" />
      <MatchesTab v-if="activeTab === 'matches'" />
      <ExercisesTab v-if="activeTab === 'exercises'" />
      <AttendanceTab v-if="activeTab === 'attendance'" />
    </div>
  </div>
</template>
