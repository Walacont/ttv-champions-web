<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const isEditing = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

// Form data
const formData = ref({
  display_name: '',
  first_name: '',
  last_name: '',
  email: ''
})

// Computed
const profile = computed(() => authStore.profile)

// Initialize form data
onMounted(() => {
  if (profile.value) {
    formData.value = {
      display_name: profile.value.display_name || '',
      first_name: profile.value.first_name || '',
      last_name: profile.value.last_name || '',
      email: authStore.user?.email || ''
    }
  }
})

function goBack() {
  router.push('/dashboard')
}

function startEditing() {
  isEditing.value = true
  error.value = ''
  success.value = ''
}

function cancelEditing() {
  isEditing.value = false
  // Reset form data
  if (profile.value) {
    formData.value = {
      display_name: profile.value.display_name || '',
      first_name: profile.value.first_name || '',
      last_name: profile.value.last_name || '',
      email: authStore.user?.email || ''
    }
  }
}

async function saveProfile() {
  saving.value = true
  error.value = ''
  success.value = ''

  try {
    await authStore.updateProfile({
      display_name: formData.value.display_name,
      first_name: formData.value.first_name,
      last_name: formData.value.last_name
    })

    isEditing.value = false
    success.value = 'Profil erfolgreich gespeichert!'

    setTimeout(() => {
      success.value = ''
    }, 3000)
  } catch (err) {
    console.error('Error saving profile:', err)
    error.value = 'Fehler beim Speichern des Profils'
  } finally {
    saving.value = false
  }
}

async function handleSignOut() {
  try {
    await authStore.signOut()
    router.push('/login')
  } catch (err) {
    console.error('Error signing out:', err)
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-20">
    <!-- Header -->
    <header class="bg-gradient-to-r from-blue-600 to-cyan-600 text-white safe-top">
      <div class="px-4 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              @click="goBack"
              class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
            >
              <i class="fas fa-arrow-left"></i>
            </button>
            <div>
              <h1 class="text-xl font-bold">Mein Profil</h1>
              <p class="text-blue-200 text-sm">{{ authStore.displayName }}</p>
            </div>
          </div>
          <button
            v-if="!isEditing"
            @click="startEditing"
            class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <i class="fas fa-edit"></i>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="px-4 pt-4 max-w-lg mx-auto">
      <!-- Success Message -->
      <div v-if="success" class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-4">
        {{ success }}
      </div>

      <!-- Error Message -->
      <div v-if="error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
        {{ error }}
      </div>

      <!-- Avatar Section -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-4 text-center">
        <div class="w-24 h-24 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full mx-auto flex items-center justify-center text-white text-3xl font-bold mb-4">
          {{ authStore.displayName?.charAt(0)?.toUpperCase() || 'S' }}
        </div>
        <h2 class="text-xl font-bold">{{ authStore.displayName }}</h2>
        <p class="text-gray-500">{{ authStore.club?.name || 'Kein Verein' }}</p>
        <div class="mt-2">
          <span
            class="inline-block px-3 py-1 rounded-full text-sm font-medium"
            :class="{
              'bg-purple-100 text-purple-700': profile?.role === 'admin',
              'bg-green-100 text-green-700': profile?.role === 'coach',
              'bg-blue-100 text-blue-700': profile?.role === 'player'
            }"
          >
            {{ profile?.role === 'admin' ? 'Administrator' : profile?.role === 'coach' ? 'Coach' : 'Spieler' }}
          </span>
        </div>
      </div>

      <!-- Profile Form -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-4">
        <h3 class="text-lg font-bold mb-4">Profildaten</h3>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Anzeigename</label>
            <input
              v-model="formData.display_name"
              type="text"
              :disabled="!isEditing"
              class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="Dein Anzeigename"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Vorname</label>
              <input
                v-model="formData.first_name"
                type="text"
                :disabled="!isEditing"
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="Vorname"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
              <input
                v-model="formData.last_name"
                type="text"
                :disabled="!isEditing"
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="Nachname"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              v-model="formData.email"
              type="email"
              disabled
              class="w-full px-4 py-2 border rounded-lg bg-gray-100 text-gray-500"
            />
            <p class="text-xs text-gray-500 mt-1">E-Mail kann nicht geändert werden</p>
          </div>
        </div>

        <!-- Edit Buttons -->
        <div v-if="isEditing" class="flex gap-3 mt-6">
          <button
            @click="cancelEditing"
            class="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            @click="saveProfile"
            :disabled="saving"
            class="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <span v-if="saving">Speichern...</span>
            <span v-else>Speichern</span>
          </button>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-4">
        <h3 class="text-lg font-bold mb-4">Statistiken</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-blue-600">{{ profile?.total_xp || 0 }}</div>
            <div class="text-xs text-gray-500">XP</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600">{{ profile?.elo_rating || 1000 }}</div>
            <div class="text-xs text-gray-500">Elo</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-purple-600">{{ profile?.total_points || 0 }}</div>
            <div class="text-xs text-gray-500">Punkte</div>
          </div>
        </div>
      </div>

      <!-- Sign Out Button -->
      <button
        @click="handleSignOut"
        class="w-full py-3 px-4 bg-red-100 text-red-600 rounded-xl font-medium hover:bg-red-200 transition-colors"
      >
        <i class="fas fa-sign-out-alt mr-2"></i>
        Abmelden
      </button>
    </main>
  </div>
</template>
