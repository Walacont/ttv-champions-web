<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const displayName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleRegister() {
  // Validation
  if (!displayName.value || !email.value || !password.value) {
    error.value = 'Bitte alle Felder ausfüllen'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwörter stimmen nicht überein'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Passwort muss mindestens 6 Zeichen lang sein'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.signUp(email.value, password.value, displayName.value)
    success.value = true

    // Wait a moment then redirect to login
    setTimeout(() => {
      router.push('/login')
    }, 3000)
  } catch (err) {
    console.error('Register error:', err)
    if (err.message.includes('already registered')) {
      error.value = 'Diese E-Mail ist bereits registriert'
    } else {
      error.value = 'Fehler bei der Registrierung: ' + err.message
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-white mb-2">🏓 SC Champions</h1>
        <p class="text-indigo-200">Werde Teil der Community</p>
      </div>

      <!-- Register Card -->
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <h2 class="text-2xl font-bold text-gray-800 text-center mb-6">Registrieren</h2>

        <!-- Success Message -->
        <div v-if="success" class="mb-4 p-4 bg-green-100 text-green-700 rounded-lg text-center">
          <p class="font-semibold">Registrierung erfolgreich!</p>
          <p class="text-sm mt-1">Bitte bestätige deine E-Mail-Adresse.</p>
          <p class="text-sm mt-2">Du wirst gleich weitergeleitet...</p>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {{ error }}
        </div>

        <form v-if="!success" @submit.prevent="handleRegister" class="space-y-4">
          <!-- Display Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Anzeigename</label>
            <input
              v-model="displayName"
              type="text"
              placeholder="Max Mustermann"
              class="input-field"
              required
            />
          </div>

          <!-- Email -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
            <input
              v-model="email"
              type="email"
              placeholder="deine@email.de"
              class="input-field"
              required
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
            <input
              v-model="password"
              type="password"
              placeholder="Mindestens 6 Zeichen"
              class="input-field"
              required
              minlength="6"
            />
          </div>

          <!-- Confirm Password -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
            <input
              v-model="confirmPassword"
              type="password"
              placeholder="Passwort wiederholen"
              class="input-field"
              required
            />
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            class="w-full btn-primary py-3 text-lg"
            :disabled="loading"
          >
            <span v-if="loading" class="flex items-center justify-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Registrieren...
            </span>
            <span v-else>Registrieren</span>
          </button>
        </form>

        <!-- Login Link -->
        <div class="mt-6 text-center">
          <p class="text-gray-600">
            Bereits ein Konto?
            <router-link to="/login" class="text-indigo-600 hover:text-indigo-800 font-semibold">
              Jetzt anmelden
            </router-link>
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-8 text-center text-indigo-200 text-sm">
        <p>&copy; 2025 SC Champions</p>
      </div>
    </div>
  </div>
</template>
