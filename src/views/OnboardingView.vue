<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const firstName = ref('')
const lastName = ref('')
const birthYear = ref('')
const birthMonth = ref('')
const birthDay = ref('')
const gender = ref('')
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  if (!firstName.value || !lastName.value) {
    error.value = 'Bitte Vor- und Nachname eingeben'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const birthdate = birthYear.value && birthMonth.value && birthDay.value
      ? `${birthYear.value}-${birthMonth.value.padStart(2, '0')}-${birthDay.value.padStart(2, '0')}`
      : null

    await authStore.updateProfile({
      first_name: firstName.value,
      last_name: lastName.value,
      display_name: `${firstName.value} ${lastName.value}`,
      birthdate,
      gender: gender.value || null,
      onboarding_complete: true
    })

    router.push('/dashboard')
  } catch (err) {
    console.error('Onboarding error:', err)
    error.value = 'Fehler beim Speichern: ' + err.message
  } finally {
    loading.value = false
  }
}

// Generate year options
const currentYear = new Date().getFullYear()
const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
    <div class="max-w-md mx-auto pt-8">
      <!-- Header -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">Willkommen bei SC Champions!</h1>
        <p class="text-indigo-200">Lass uns dein Profil vervollständigen</p>
      </div>

      <!-- Form Card -->
      <div class="bg-white rounded-2xl shadow-xl p-6">
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- First Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
            <input
              v-model="firstName"
              type="text"
              placeholder="Max"
              class="input-field"
              required
            />
          </div>

          <!-- Last Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
            <input
              v-model="lastName"
              type="text"
              placeholder="Mustermann"
              class="input-field"
              required
            />
          </div>

          <!-- Birthdate -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Geburtsdatum</label>
            <div class="grid grid-cols-3 gap-2">
              <select v-model="birthDay" class="input-field">
                <option value="">Tag</option>
                <option v-for="d in 31" :key="d" :value="d">{{ d }}</option>
              </select>
              <select v-model="birthMonth" class="input-field">
                <option value="">Monat</option>
                <option v-for="m in 12" :key="m" :value="m">{{ m }}</option>
              </select>
              <select v-model="birthYear" class="input-field">
                <option value="">Jahr</option>
                <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
          </div>

          <!-- Gender -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Geschlecht</label>
            <select v-model="gender" class="input-field">
              <option value="">Keine Angabe</option>
              <option value="male">Männlich</option>
              <option value="female">Weiblich</option>
              <option value="other">Divers</option>
            </select>
          </div>

          <!-- Error -->
          <div v-if="error" class="bg-red-100 text-red-700 p-3 rounded-lg text-sm">
            {{ error }}
          </div>

          <!-- Submit -->
          <button type="submit" class="w-full btn-primary py-3 text-lg" :disabled="loading">
            <span v-if="loading">Speichern...</span>
            <span v-else>Profil speichern</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
