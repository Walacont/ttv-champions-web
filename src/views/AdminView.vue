<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const activeTab = ref('overview')
const tabs = [
  { id: 'overview', label: 'Übersicht', icon: 'fas fa-chart-line' },
  { id: 'users', label: 'Benutzer', icon: 'fas fa-users' },
  { id: 'clubs', label: 'Vereine', icon: 'fas fa-building' },
  { id: 'system', label: 'System', icon: 'fas fa-cog' }
]

function goToDashboard() {
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <!-- Header -->
    <header class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white safe-top">
      <div class="px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold">Admin-Bereich</h1>
            <p class="text-purple-200 text-sm">Systemverwaltung</p>
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
    <main class="px-4 pt-4 max-w-6xl mx-auto">
      <!-- Tabs -->
      <div class="bg-white rounded-xl shadow-md mb-6 overflow-hidden">
        <div class="flex border-b">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="activeTab === tab.id
              ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
              : 'text-gray-500 hover:text-gray-700'"
          >
            <i :class="tab.icon" class="mr-2"></i>{{ tab.label }}
          </button>
        </div>
      </div>

      <!-- Tab Content -->
      <div v-if="activeTab === 'overview'" class="card">
        <h2 class="text-xl font-bold mb-4">📊 Systemübersicht</h2>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-blue-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-blue-600">--</div>
            <div class="text-sm text-gray-600">Aktive Benutzer</div>
          </div>
          <div class="bg-green-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-green-600">--</div>
            <div class="text-sm text-gray-600">Vereine</div>
          </div>
          <div class="bg-yellow-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-yellow-600">--</div>
            <div class="text-sm text-gray-600">Matches heute</div>
          </div>
          <div class="bg-purple-50 rounded-lg p-4 text-center">
            <div class="text-2xl font-bold text-purple-600">--</div>
            <div class="text-sm text-gray-600">Offene Anfragen</div>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'users'" class="card">
        <h2 class="text-xl font-bold mb-4">👥 Benutzerverwaltung</h2>
        <p class="text-gray-500 text-center py-8">
          Benutzerverwaltung wird hier angezeigt.
        </p>
      </div>

      <div v-if="activeTab === 'clubs'" class="card">
        <h2 class="text-xl font-bold mb-4">🏢 Vereinsverwaltung</h2>
        <p class="text-gray-500 text-center py-8">
          Vereinsverwaltung wird hier angezeigt.
        </p>
      </div>

      <div v-if="activeTab === 'system'" class="card">
        <h2 class="text-xl font-bold mb-4">⚙️ Systemeinstellungen</h2>
        <p class="text-gray-500 text-center py-8">
          Systemeinstellungen werden hier angezeigt.
        </p>
      </div>
    </main>
  </div>
</template>
