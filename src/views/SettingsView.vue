<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/composables/useSupabase'

const router = useRouter()
const authStore = useAuthStore()

// Form state
const displayName = ref('')
const gender = ref('')
const birthYear = ref('')
const notifications = ref({
  matchRequests: true,
  challengeUpdates: true,
  seasonReminders: true,
  weeklyDigest: false
})
const loading = ref(false)
const saving = ref(false)
const success = ref('')
const error = ref('')

// Computed
const profile = computed(() => authStore.profile)
const hasChanges = computed(() => {
  if (!profile.value) return false
  return displayName.value !== profile.value.display_name ||
         gender.value !== profile.value.gender ||
         birthYear.value !== profile.value.birth_year
})

// Load settings
onMounted(async () => {
  loading.value = true
  try {
    if (profile.value) {
      displayName.value = profile.value.display_name || ''
      gender.value = profile.value.gender || ''
      birthYear.value = profile.value.birth_year || ''

      // Load notification settings
      if (profile.value.notification_settings) {
        notifications.value = { ...notifications.value, ...profile.value.notification_settings }
      }
    }
  } finally {
    loading.value = false
  }
})

// Save profile
async function saveProfile() {
  error.value = ''
  success.value = ''

  if (!displayName.value.trim()) {
    error.value = 'Anzeigename ist erforderlich'
    return
  }

  saving.value = true
  try {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.value.trim(),
        gender: gender.value || null,
        birth_year: birthYear.value || null,
        notification_settings: notifications.value,
        updated_at: new Date().toISOString()
      })
      .eq('id', authStore.user.id)

    if (updateError) throw updateError

    await authStore.refreshProfile()
    success.value = 'Einstellungen gespeichert!'
    setTimeout(() => success.value = '', 3000)
  } catch (err) {
    console.error('Save error:', err)
    error.value = 'Fehler beim Speichern: ' + err.message
  } finally {
    saving.value = false
  }
}

// Delete account
const showDeleteConfirm = ref(false)
const deleteConfirmText = ref('')

async function deleteAccount() {
  if (deleteConfirmText.value !== 'LÖSCHEN') {
    error.value = 'Bitte gib "LÖSCHEN" ein, um zu bestätigen'
    return
  }

  saving.value = true
  try {
    // Delete profile first
    await supabase
      .from('profiles')
      .delete()
      .eq('id', authStore.user.id)

    // Then delete auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(authStore.user.id)
    if (deleteError) throw deleteError

    await authStore.signOut()
    router.push('/login')
  } catch (err) {
    console.error('Delete error:', err)
    error.value = 'Fehler beim Löschen: ' + err.message
    saving.value = false
  }
}

function goBack() {
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-6">
    <!-- Header -->
    <header class="bg-white shadow-sm safe-top">
      <div class="container mx-auto px-4 py-4 max-w-2xl">
        <div class="flex items-center gap-4">
          <button @click="goBack" class="text-gray-600 hover:text-gray-900">
            <i class="fas fa-arrow-left text-xl"></i>
          </button>
          <h1 class="text-2xl font-bold text-gray-900">Einstellungen</h1>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto p-4 max-w-2xl">
      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p class="text-gray-500 mt-4">Lade Einstellungen...</p>
      </div>

      <div v-else class="space-y-6">
        <!-- Profile Settings -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-user text-indigo-600"></i>
            Profil
          </h2>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Anzeigename</label>
              <input
                v-model="displayName"
                type="text"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Dein Name"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Geschlecht</label>
              <select
                v-model="gender"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Nicht angegeben</option>
                <option value="male">Männlich</option>
                <option value="female">Weiblich</option>
                <option value="diverse">Divers</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Geburtsjahr</label>
              <input
                v-model="birthYear"
                type="number"
                min="1950"
                max="2020"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="z.B. 2005"
              />
            </div>
          </div>
        </div>

        <!-- Notification Settings -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-bell text-indigo-600"></i>
            Benachrichtigungen
          </h2>

          <div class="space-y-3">
            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-gray-700">Match-Anfragen</span>
              <input
                v-model="notifications.matchRequests"
                type="checkbox"
                class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
            </label>

            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-gray-700">Challenge-Updates</span>
              <input
                v-model="notifications.challengeUpdates"
                type="checkbox"
                class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
            </label>

            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-gray-700">Saison-Erinnerungen</span>
              <input
                v-model="notifications.seasonReminders"
                type="checkbox"
                class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
            </label>

            <label class="flex items-center justify-between cursor-pointer">
              <span class="text-gray-700">Wöchentliche Zusammenfassung</span>
              <input
                v-model="notifications.weeklyDigest"
                type="checkbox"
                class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
            </label>
          </div>
        </div>

        <!-- Account Info -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-info-circle text-indigo-600"></i>
            Account-Info
          </h2>

          <div class="space-y-2 text-sm text-gray-600">
            <p><strong>E-Mail:</strong> {{ authStore.user?.email }}</p>
            <p><strong>Verein:</strong> {{ authStore.club?.name || 'Kein Verein' }}</p>
            <p><strong>Rolle:</strong> {{ profile?.role || 'Spieler' }}</p>
            <p><strong>Mitglied seit:</strong> {{ new Date(profile?.created_at).toLocaleDateString('de-DE') }}</p>
          </div>
        </div>

        <!-- Messages -->
        <div v-if="error" class="bg-red-100 text-red-700 p-4 rounded-lg">
          {{ error }}
        </div>
        <div v-if="success" class="bg-green-100 text-green-700 p-4 rounded-lg">
          {{ success }}
        </div>

        <!-- Save Button -->
        <button
          @click="saveProfile"
          :disabled="saving"
          class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          <span v-if="saving">Speichern...</span>
          <span v-else><i class="fas fa-save mr-2"></i>Änderungen speichern</span>
        </button>

        <!-- Danger Zone -->
        <div class="bg-white rounded-xl shadow-md p-6 border-2 border-red-200">
          <h2 class="text-lg font-semibold mb-4 text-red-600 flex items-center gap-2">
            <i class="fas fa-exclamation-triangle"></i>
            Gefahrenzone
          </h2>

          <p class="text-sm text-gray-600 mb-4">
            Das Löschen deines Accounts ist dauerhaft und kann nicht rückgängig gemacht werden.
            Alle deine Daten, Punkte und Fortschritte werden gelöscht.
          </p>

          <button
            v-if="!showDeleteConfirm"
            @click="showDeleteConfirm = true"
            class="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            <i class="fas fa-trash mr-2"></i>Account löschen
          </button>

          <div v-else class="space-y-3">
            <p class="text-sm text-red-600 font-medium">
              Gib "LÖSCHEN" ein, um zu bestätigen:
            </p>
            <input
              v-model="deleteConfirmText"
              type="text"
              class="w-full px-4 py-2 border border-red-300 rounded-lg"
              placeholder="LÖSCHEN"
            />
            <div class="flex gap-2">
              <button
                @click="showDeleteConfirm = false; deleteConfirmText = ''"
                class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg"
              >
                Abbrechen
              </button>
              <button
                @click="deleteAccount"
                :disabled="saving"
                class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50"
              >
                Endgültig löschen
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
