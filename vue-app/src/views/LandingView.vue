<script setup>
import { ref } from 'vue'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/config/firebase'
import { useRouter } from 'vue-router'

const router = useRouter()
const showLoginModal = ref(false)
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function openLoginModal() {
  showLoginModal.value = true
  error.value = ''
}

function closeLoginModal() {
  showLoginModal.value = false
  email.value = ''
  password.value = ''
  error.value = ''
}

async function login() {
  loading.value = true
  error.value = ''

  try {
    await signInWithEmailAndPassword(auth, email.value, password.value)
    router.push('/dashboard')
  } catch (err) {
    error.value = 'Login fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100">
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-40">
      <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
        <div class="text-2xl font-bold text-indigo-600">
          <i class="fas fa-trophy mr-2"></i>
          TTV Champions
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

    <!-- Research Project Notice -->
    <div class="bg-blue-100 border-b border-blue-300 text-blue-900 text-sm p-4">
      <div class="container mx-auto px-6 flex items-center justify-center">
        <i class="fas fa-info-circle mr-3 text-lg text-blue-700"></i>
        <div class="text-center">
          <strong>Hinweis:</strong> TTV Champions ist derzeit ein Forschungsprojekt im Rahmen einer Bachelorarbeit und befindet sich in der Testphase.
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
            Willkommen bei TTV Champions – der Gamification-Plattform, die dein Tischtennis-Training im Verein auf ein neues Level hebt.
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
          <h2 class="text-3xl font-bold text-gray-900 mb-12 text-center">Training. Neu gedacht.</h2>
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
          <div class="space-y-6">
            <details class="group bg-white p-6 rounded-lg shadow-sm">
              <summary class="flex justify-between items-center cursor-pointer">
                <span class="font-medium text-lg text-gray-900">Was ist der Unterschied zwischen Elo, XP und Saison-Punkten?</span>
                <i class="fas fa-chevron-down transform transition-transform group-open:rotate-180"></i>
              </summary>
              <div class="mt-4 text-gray-700 space-y-2">
                <p>
                  Kurz gesagt: <strong>XP (Fleiß)</strong> sind permanente Punkte, die du für Training und Übungen bekommst und nie verlierst. Sie bestimmen deinen Rang. <strong>Elo (Skill)</strong> ist deine Spielstärke, die du in Wettkämpfen gewinnst oder verlierst. <strong>Saison-Punkte</strong> sind temporär für den 6-wöchigen Wettbewerb und werden danach zurückgesetzt.
                </p>
              </div>
            </details>

            <details class="group bg-white p-6 rounded-lg shadow-sm">
              <summary class="flex justify-between items-center cursor-pointer">
                <span class="font-medium text-lg text-gray-900">Wie werden QTTR-Punkte in Elo umgerechnet?</span>
                <i class="fas fa-chevron-down transform transition-transform group-open:rotate-180"></i>
              </summary>
              <div class="mt-4 text-gray-700 space-y-2">
                <p>Wenn ein Coach einen erfahrenen Offline-Spieler erstellt und dessen <strong>QTTR-Punkte</strong> eingibt, wird die Start-Elo automatisch berechnet.</p>
                <p class="font-medium">Formel: Elo = QTTR × 0,9 (mindestens 800)</p>
                <p class="text-sm">Beispiele:</p>
                <ul class="list-disc list-inside text-sm space-y-1">
                  <li>QTTR 1000 → Elo 900</li>
                  <li>QTTR 1200 → Elo 1080</li>
                  <li>QTTR 1500 → Elo 1350</li>
                  <li>QTTR 2000 → Elo 1800</li>
                </ul>
                <p class="text-sm text-gray-600 mt-2">
                  Diese konservative Umrechnung (90%) stellt sicher, dass sich neue Spieler erst im System beweisen müssen, bevor sie ihr volles Niveau erreichen.
                </p>
              </div>
            </details>

            <details class="group bg-white p-6 rounded-lg shadow-sm">
              <summary class="flex justify-between items-center cursor-pointer">
                <span class="font-medium text-lg text-gray-900">Wie steige ich im Rang auf?</span>
                <i class="fas fa-chevron-down transform transition-transform group-open:rotate-180"></i>
              </summary>
              <div class="mt-4 text-gray-700">
                <p>
                  Um im Rang aufzusteigen (z.B. von 🔰 Rekrut zu 🥉 Bronze), musst du <strong>zwei Bedingungen</strong> erfüllen: ein Mindestlevel an <strong>XP (Fleiß)</strong> und ein Mindestlevel an <strong>Elo (Skill)</strong>. Für den allerersten Aufstieg zu Bronze musst du außerdem 5 Grundlagen-Übungen absolvieren.
                </p>
              </div>
            </details>

            <details class="group bg-white p-6 rounded-lg shadow-sm">
              <summary class="flex justify-between items-center cursor-pointer">
                <span class="font-medium text-lg text-gray-900">Was ist ein "Streak"?</span>
                <i class="fas fa-chevron-down transform transition-transform group-open:rotate-180"></i>
              </summary>
              <div class="mt-4 text-gray-700">
                <p>
                  Ein "Streak" ist eine Anwesenheits-Serie. Wenn du mehrmals hintereinander am Training teilnimmst (pro Untergruppe), erhältst du Bonus-XP. Verpasst du ein Training, wird dein Streak für diese Gruppe zurückgesetzt. Regelmäßigkeit lohnt sich also!
                </p>
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

    <!-- Login Modal -->
    <div
      v-if="showLoginModal"
      class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50"
      @click.self="closeLoginModal"
    >
      <div class="relative w-full max-w-md p-8 space-y-8 bg-white rounded-xl shadow-lg">
        <button
          @click="closeLoginModal"
          class="absolute top-4 right-5 text-gray-400 hover:text-gray-700"
        >
          <i class="fas fa-times text-2xl"></i>
        </button>

        <div>
          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Anmelden
          </h2>
        </div>

        <form @submit.prevent="login" class="mt-8 space-y-6">
          <div class="rounded-md shadow-sm -space-y-px">
            <div>
              <label for="email-address" class="sr-only">E-Mail-Adresse</label>
              <input
                id="email-address"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
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
                class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Passwort"
              />
            </div>
          </div>

          <div v-if="error" class="text-red-500 text-sm text-center">
            {{ error }}
          </div>

          <div>
            <button
              type="submit"
              :disabled="loading"
              class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {{ loading ? 'Laden...' : 'Anmelden' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
