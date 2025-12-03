<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const activeTab = ref('requests')
const tabs = [
  { id: 'requests', label: 'Anfragen', icon: 'fas fa-inbox' },
  { id: 'players', label: 'Spieler', icon: 'fas fa-users' },
  { id: 'exercises', label: 'Übungen', icon: 'fas fa-dumbbell' },
  { id: 'settings', label: 'Einstellungen', icon: 'fas fa-cog' }
]

function goToDashboard() {
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <!-- Header -->
    <header class="bg-gradient-to-r from-green-600 to-teal-600 text-white safe-top">
      <div class="px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold">Coach-Bereich</h1>
            <p class="text-green-200 text-sm">{{ authStore.club?.name || 'Verein' }}</p>
          </div>
          <button
            @click="goToDashboard"
            class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <i class="fas fa-home"></i>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="px-4 pt-4 max-w-4xl mx-auto">
      <!-- Tabs -->
      <div class="bg-white rounded-xl shadow-md mb-6 overflow-hidden">
        <div class="flex border-b">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
              : 'text-gray-500 hover:text-gray-700'"
          >
            <i :class="tab.icon" class="mr-2"></i>{{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div v-if="activeTab === 'requests'" class="card">
        <h2 class="text-xl font-bold mb-4">📥 Offene Anfragen</h2>
        <p class="text-gray-500 text-center py-8">
          Hier werden Match-Anfragen angezeigt, die auf deine Genehmigung warten.
        </p>
      </div>

      <div v-if="activeTab === 'players'" class="card">
        <h2 class="text-xl font-bold mb-4">👥 Spieler verwalten</h2>
        <p class="text-gray-500 text-center py-8">
          Spielerverwaltung wird hier angezeigt.
        </p>
      </div>

      <div v-if="activeTab === 'exercises'" class="card">
        <h2 class="text-xl font-bold mb-4">💪 Übungen verwalten</h2>
        <p class="text-gray-500 text-center py-8">
          Übungsverwaltung wird hier angezeigt.
        </p>
      </div>

      <div v-if="activeTab === 'settings'" class="card">
        <h2 class="text-xl font-bold mb-4">⚙️ Vereinseinstellungen</h2>
        <p class="text-gray-500 text-center py-8">
          Vereinseinstellungen werden hier angezeigt.
        </p>
      </div>
    </main>
  </div>
</template>
