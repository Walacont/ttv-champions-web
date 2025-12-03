<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Bitte E-Mail und Passwort eingeben'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.signIn(email.value, password.value)

    // Redirect based on role
    const profile = authStore.profile
    if (profile?.role === 'admin') {
      router.push('/admin')
    } else if (profile?.role === 'coach') {
      router.push('/coach')
    } else if (!profile?.onboarding_complete) {
      router.push('/onboarding')
    } else {
      router.push('/dashboard')
    }
  } catch (err) {
    console.error('Login error:', err)
    error.value = err.message === 'Invalid login credentials'
      ? 'E-Mail oder Passwort falsch'
      : 'Fehler beim Anmelden: ' + err.message
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
        <p class="text-indigo-200">Dein Tischtennis-Tracker</p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <h2 class="text-2xl font-bold text-gray-800 text-center mb-6">Anmelden</h2>

        <!-- Error Message -->
        <div v-if="error" class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {{ error }}
        </div>

        <form @submit.prevent="handleLogin" class="space-y-4">
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
              placeholder="••••••••"
              class="input-field"
              required
            />
          </div>

          <!-- Forgot Password -->
          <div class="text-right">
            <router-link to="/forgot-password" class="text-sm text-indigo-600 hover:text-indigo-800">
              Passwort vergessen?
            </router-link>
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
              Anmelden...
            </span>
            <span v-else>Anmelden</span>
          </button>
        </form>

        <!-- Register Link -->
        <div class="mt-6 text-center">
          <p class="text-gray-600">
            Noch kein Konto?
            <router-link to="/register" class="text-indigo-600 hover:text-indigo-800 font-semibold">
              Jetzt registrieren
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
