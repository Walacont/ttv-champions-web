<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/composables/useSupabase'

const router = useRouter()
const authStore = useAuthStore()

// Modal state
const showLoginModal = ref(false)
const activeTab = ref('email') // 'email', 'code', 'reset'

// Form state
const email = ref('')
const password = ref('')
const invitationCode = ref('')
const resetEmail = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

// FAQ items
const faqItems = ref([
  {
    question: 'Was ist der Unterschied zwischen Elo, XP und Saison-Punkten?',
    answer: 'Kurz gesagt: XP (Fleiß) sind permanente Punkte, die du für Training und Übungen bekommst und nie verlierst. Sie bestimmen deinen Rang. Elo (Skill) ist deine Spielstärke, die du in Wettkämpfen gewinnst oder verlierst. Saison-Punkte sind temporär für den 6-wöchigen Wettbewerb und werden danach zurückgesetzt.',
    open: false
  },
  {
    question: 'Wie werden QTTR-Punkte in Elo umgerechnet?',
    answer: 'Wenn ein Coach einen erfahrenen Offline-Spieler erstellt und dessen QTTR-Punkte eingibt, wird die Start-Elo automatisch berechnet. Formel: Elo = QTTR × 0,9 (mindestens 800). Beispiele: QTTR 1000 → Elo 900, QTTR 1500 → Elo 1350.',
    open: false
  },
  {
    question: 'Wie steige ich im Rang auf?',
    answer: 'Um im Rang aufzusteigen (z.B. von 🔰 Rekrut zu 🥉 Bronze), musst du zwei Bedingungen erfüllen: ein Mindestlevel an XP (Fleiß) und ein Mindestlevel an Elo (Skill). Für den allerersten Aufstieg zu Bronze musst du außerdem 5 Grundlagen-Übungen absolvieren.',
    open: false
  },
  {
    question: 'Was ist ein "Streak"?',
    answer: 'Ein "Streak" ist eine Anwesenheits-Serie. Wenn du mehrmals hintereinander am Training teilnimmst (pro Untergruppe), erhältst du Bonus-XP. Verpasst du ein Training, wird dein Streak für diese Gruppe zurückgesetzt. Regelmäßigkeit lohnt sich also!',
    open: false
  }
])

function toggleFaq(index) {
  faqItems.value[index].open = !faqItems.value[index].open
}

function openLoginModal() {
  showLoginModal.value = true
  activeTab.value = 'email'
  error.value = ''
  success.value = ''
}

function closeLoginModal() {
  showLoginModal.value = false
  email.value = ''
  password.value = ''
  invitationCode.value = ''
  resetEmail.value = ''
  error.value = ''
  success.value = ''
}

function setTab(tab) {
  activeTab.value = tab
  error.value = ''
  success.value = ''
}

// Email Login
async function handleEmailLogin() {
  if (!email.value || !password.value) {
    error.value = 'Bitte E-Mail und Passwort eingeben'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value
    })

    if (loginError) throw loginError

    await authStore.initialize()
    closeLoginModal()

    // Redirect based on role
    if (authStore.profile?.role === 'admin') {
      router.push('/admin')
    } else if (authStore.profile?.role === 'coach') {
      router.push('/coach')
    } else {
      router.push('/dashboard')
    }
  } catch (err) {
    console.error('Login error:', err)
    error.value = err.message === 'Invalid login credentials'
      ? 'Ungültige E-Mail oder Passwort'
      : 'Fehler beim Anmelden: ' + err.message
  } finally {
    loading.value = false
  }
}

// Code Login (redirect to register with code)
async function handleCodeLogin() {
  const code = invitationCode.value.trim().toUpperCase()

  if (!code || code.length < 11) {
    error.value = 'Bitte gib einen gültigen Einladungscode ein (Format: TTV-XXX-YYY)'
    return
  }

  loading.value = true
  error.value = ''

  try {
    // Check if code exists
    const { data, error: codeError } = await supabase
      .from('invitation_codes')
      .select('*')
      .eq('code', code)
      .eq('used', false)
      .single()

    if (codeError || !data) {
      error.value = 'Ungültiger oder bereits verwendeter Code'
      return
    }

    // Redirect to register with the code
    closeLoginModal()
    router.push({ path: '/register', query: { code: code } })
  } catch (err) {
    console.error('Code check error:', err)
    error.value = 'Fehler bei der Code-Überprüfung'
  } finally {
    loading.value = false
  }
}

// Password Reset
async function handlePasswordReset() {
  if (!resetEmail.value) {
    error.value = 'Bitte E-Mail-Adresse eingeben'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      resetEmail.value,
      { redirectTo: `${window.location.origin}/reset-password` }
    )

    if (resetError) throw resetError

    success.value = 'Ein Link zum Zurücksetzen wurde an deine E-Mail gesendet!'
    resetEmail.value = ''
  } catch (err) {
    console.error('Reset error:', err)
    error.value = 'Fehler beim Senden des Reset-Links'
  } finally {
    loading.value = false
  }
}

// Check if already logged in
if (authStore.isAuthenticated) {
  router.push('/dashboard')
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-50">
      <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
        <div class="text-2xl font-bold text-indigo-600">
          <i class="fas fa-trophy mr-2"></i>
          SC Champions
        </div>
        <div>
          <button
            @click="openLoginModal"
            class="bg-indigo-600 text-white font-semibold py-2 px-5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Login
          </button>
        </div>
      </nav>
    </header>

    <!-- Info Banner -->
    <div class="bg-blue-100 border-b border-blue-300 text-blue-900 text-sm p-4">
      <div class="container mx-auto px-6 flex items-center justify-center">
        <i class="fas fa-info-circle mr-3 text-lg text-blue-700"></i>
        <div class="text-center">
          <strong>Hinweis:</strong> SC Champions ist derzeit ein Forschungsprojekt im Rahmen einer Bachelorarbeit und befindet sich in der Testphase.
        </div>
      </div>
    </div>

    <main>
      <!-- Hero Section -->
      <section class="bg-gradient-to-r from-indigo-600 to-purple-700 text-white py-20 md:py-32">
        <div class="container mx-auto px-6 text-center">
          <h1 class="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
            Mach dein Training zum Spiel.
          </h1>
          <p class="text-lg md:text-xl text-indigo-100 max-w-3xl mx-auto">
            Willkommen bei SC Champions – der Gamification-Plattform, die dein Sport-Training im Verein auf ein neues Level hebt.
          </p>
          <a
            href="#features"
            class="mt-10 inline-block bg-white text-indigo-600 font-bold py-3 px-8 rounded-lg text-lg hover:bg-gray-100 transition-colors"
          >
            Mehr erfahren
          </a>
        </div>
      </section>

      <!-- Features Section -->
      <section id="features" class="container mx-auto px-6 py-20">
        <div class="max-w-4xl mx-auto">
          <h2 class="text-3xl font-bold text-gray-900 mb-12 text-center">
            Training. Neu gedacht.
          </h2>
          <ul class="space-y-8">
            <li class="flex items-start">
              <span class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-yellow-500 text-white mr-6">
                <i class="fas fa-star text-xl"></i>
              </span>
              <div>
                <h3 class="font-semibold text-xl text-gray-900">Sammle XP & Elo</h3>
                <p class="text-gray-600 mt-1">
                  Erhalte Erfahrungspunkte (XP) für Fleiß und Anwesenheit und steigere deine Spielstärke (Elo) in Wettkämpfen. Ein duales System für echten Fortschritt.
                </p>
              </div>
            </li>
            <li class="flex items-start">
              <span class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-green-500 text-white mr-6">
                <i class="fas fa-chart-line text-xl"></i>
              </span>
              <div>
                <h3 class="font-semibold text-xl text-gray-900">Steige im Rang auf</h3>
                <p class="text-gray-600 mt-1">
                  Starte als 🔰 Rekrut und kämpfe dich hoch bis zum 👑 Champion. Dein permanenter Rang zeigt deinen wahren Fortschritt und motiviert langfristig.
                </p>
              </div>
            </li>
            <li class="flex items-start">
              <span class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-500 text-white mr-6">
                <i class="fas fa-users text-xl"></i>
              </span>
              <div>
                <h3 class="font-semibold text-xl text-gray-900">Für Spieler & Coaches</h3>
                <p class="text-gray-600 mt-1">
                  Spieler melden Matches und sehen ihren Fortschritt. Coaches verwalten digital Anwesenheit, vergeben Punkte und erstellen tägliche Challenges für ganze Gruppen.
                </p>
              </div>
            </li>
            <li class="flex items-start">
              <span class="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-500 text-white mr-6">
                <i class="fas fa-fire text-xl"></i>
              </span>
              <div>
                <h3 class="font-semibold text-xl text-gray-900">Anwesenheits-Streaks</h3>
                <p class="text-gray-600 mt-1">
                  Regelmäßigkeit zahlt sich aus! Baue eine "Streak" auf, indem du kein Training verpasst, und erhalte Bonus-XP für deine Treue.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- FAQ Section -->
      <section class="bg-gray-50 py-20">
        <div class="container mx-auto px-6 max-w-4xl">
          <h2 class="text-3xl font-bold text-gray-900 mb-10 text-center">
            Häufig gestellte Fragen
          </h2>
          <div class="space-y-4">
            <details
              v-for="(item, index) in faqItems"
              :key="index"
              class="group bg-white p-6 rounded-lg shadow-sm"
              :open="item.open"
            >
              <summary
                @click.prevent="toggleFaq(index)"
                class="flex justify-between items-center cursor-pointer"
              >
                <span class="font-medium text-lg text-gray-900">{{ item.question }}</span>
                <i
                  class="fas fa-chevron-down transform transition-transform"
                  :class="{ 'rotate-180': item.open }"
                ></i>
              </summary>
              <div v-show="item.open" class="mt-4 text-gray-700">
                {{ item.answer }}
              </div>
            </details>
          </div>

          <div class="text-center mt-12">
            <router-link
              to="/faq"
              class="text-indigo-600 font-semibold text-lg hover:text-indigo-800 transition-colors"
            >
              Alle Regeln & FAQs ansehen <i class="fas fa-arrow-right ml-1"></i>
            </router-link>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 py-8">
      <div class="container mx-auto px-6 text-center text-sm text-gray-600">
        <div class="flex justify-center items-center gap-4 mb-4">
          <a href="/docs/impressum" class="hover:text-indigo-600 transition-colors">Impressum</a>
          <span class="text-gray-400">•</span>
          <a href="/docs/datenschutz" class="hover:text-indigo-600 transition-colors">Datenschutz</a>
        </div>
        <p class="text-gray-500">© 2025 SC Champions. Alle Rechte vorbehalten.</p>
      </div>
    </footer>

    <!-- Login Modal -->
    <Teleport to="body">
      <div
        v-if="showLoginModal"
        class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50"
        @click.self="closeLoginModal"
      >
        <div class="relative w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
          <!-- Close Button -->
          <button
            @click="closeLoginModal"
            class="absolute top-4 right-5 text-gray-400 hover:text-gray-700"
          >
            <i class="fas fa-times text-2xl"></i>
          </button>

          <!-- Title -->
          <div>
            <h2 class="mt-2 text-center text-3xl font-extrabold text-gray-900">
              {{ activeTab === 'reset' ? 'Passwort zurücksetzen' : 'Anmelden' }}
            </h2>
          </div>

          <!-- Tabs -->
          <div v-if="activeTab !== 'reset'" class="flex border-b border-gray-200">
            <button
              @click="setTab('email')"
              class="flex-1 py-3 px-4 text-sm font-medium transition-colors"
              :class="activeTab === 'email'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 border-b-2 border-transparent hover:border-gray-300'"
            >
              Email-Login
            </button>
            <button
              @click="setTab('code')"
              class="flex-1 py-3 px-4 text-sm font-medium transition-colors"
              :class="activeTab === 'code'
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                : 'text-gray-600 border-b-2 border-transparent hover:border-gray-300'"
            >
              Mit Code anmelden
            </button>
          </div>

          <!-- Email Login Form -->
          <form v-if="activeTab === 'email'" @submit.prevent="handleEmailLogin" class="space-y-4">
            <div class="space-y-3">
              <div>
                <label for="email-address" class="sr-only">E-Mail-Adresse</label>
                <input
                  id="email-address"
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  required
                  class="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="E-Mail-Adresse"
                />
              </div>
              <div>
                <label for="password" class="sr-only">Passwort</label>
                <input
                  id="password"
                  v-model="password"
                  type="password"
                  autocomplete="current-password"
                  required
                  class="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Passwort"
                />
              </div>
            </div>

            <div class="flex items-center justify-end">
              <button
                type="button"
                @click="setTab('reset')"
                class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                Passwort vergessen?
              </button>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <span v-if="loading">Anmelden...</span>
              <span v-else>Anmelden</span>
            </button>
          </form>

          <!-- Code Login Form -->
          <form v-if="activeTab === 'code'" @submit.prevent="handleCodeLogin" class="space-y-4">
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p class="text-sm text-blue-800 text-center">
                <i class="fas fa-info-circle mr-1"></i>
                Gib hier deinen Einladungscode vom Trainer ein, um dich zu registrieren.
              </p>
            </div>

            <div>
              <label for="invitation-code" class="block text-sm font-medium text-gray-700 mb-2">
                Einladungscode
              </label>
              <input
                id="invitation-code"
                v-model="invitationCode"
                type="text"
                maxlength="11"
                required
                class="appearance-none block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-center text-xl font-bold tracking-wider uppercase"
                placeholder="TTV-XXX-YYY"
              />
              <p class="mt-2 text-xs text-gray-500 text-center">Format: TTV-XXX-YYY</p>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <i class="fas fa-arrow-right mr-2"></i>
              Weiter zur Registrierung
            </button>
          </form>

          <!-- Password Reset Form -->
          <form v-if="activeTab === 'reset'" @submit.prevent="handlePasswordReset" class="space-y-4">
            <p class="text-center text-sm text-gray-600">
              Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
            </p>

            <div>
              <label for="reset-email" class="sr-only">E-Mail-Adresse</label>
              <input
                id="reset-email"
                v-model="resetEmail"
                type="email"
                autocomplete="email"
                required
                class="appearance-none rounded-md relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="E-Mail-Adresse"
              />
            </div>

            <div class="flex items-center justify-between">
              <button
                type="button"
                @click="setTab('email')"
                class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                ← Zurück zum Login
              </button>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Link anfordern
            </button>
          </form>

          <!-- Error/Success Messages -->
          <div v-if="error" class="bg-red-100 text-red-700 p-3 rounded-lg text-sm text-center">
            {{ error }}
          </div>
          <div v-if="success" class="bg-green-100 text-green-700 p-3 rounded-lg text-sm text-center">
            {{ success }}
          </div>

          <!-- Register Link -->
          <div v-if="activeTab !== 'reset'" class="mt-6 text-center border-t border-gray-200 pt-6">
            <p class="text-sm text-gray-600">
              Noch kein Account?
              <router-link to="/register" class="font-medium text-indigo-600 hover:text-indigo-500" @click="closeLoginModal">
                Jetzt registrieren
              </router-link>
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
