<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const activeSection = ref('rules')

const isLoggedIn = computed(() => authStore.isAuthenticated)

const sections = [
  { id: 'rules', label: 'Spielregeln', icon: '📋' },
  { id: 'points', label: 'Punktesystem', icon: '🏆' },
  { id: 'faq', label: 'FAQ', icon: '❓' }
]

const faqItems = ref([
  {
    question: 'Wie melde ich ein Match?',
    answer: 'Gehe zum Tab "Wettkampf", suche deinen Gegner und trage die Satzergebnisse ein. Nach dem Absenden erhält dein Gegner eine Bestätigungsanfrage.',
    open: false
  },
  {
    question: 'Was passiert bei einer Ablehnung?',
    answer: 'Wenn dein Gegner das Match ablehnt, wird es nicht gewertet. Bei häufigen Streitigkeiten kann ein Trainer vermitteln.',
    open: false
  },
  {
    question: 'Wie funktioniert das Elo-System?',
    answer: 'Das Elo-System bewertet deine Spielstärke. Bei Siegen gegen stärkere Gegner gewinnst du mehr Punkte, bei Niederlagen gegen schwächere verlierst du mehr. Startelo ist 1000.',
    open: false
  },
  {
    question: 'Was ist der Unterschied zwischen XP und Elo?',
    answer: 'XP (Erfahrungspunkte) zeigen deinen Fleiß - sie können nie verloren gehen. Elo misst deine echte Spielstärke und kann steigen oder fallen.',
    open: false
  },
  {
    question: 'Wie steige ich im Rang auf?',
    answer: 'Dein Rang steigt automatisch mit deinen gesammelten XP-Punkten. Jeder Rang hat eine bestimmte XP-Schwelle.',
    open: false
  },
  {
    question: 'Was sind Saisonpunkte?',
    answer: 'Saisonpunkte werden im 6-Wochen-Wettbewerb gesammelt. Am Ende der Saison werden die besten Spieler belohnt und die Punkte zurückgesetzt.',
    open: false
  },
  {
    question: 'Kann ich in mehreren Vereinen sein?',
    answer: 'Nein, du kannst nur einem Verein zur gleichen Zeit angehören. Du kannst aber den Verein wechseln.',
    open: false
  },
  {
    question: 'Wie funktionieren Doppel-Matches?',
    answer: 'Bei Doppel-Matches spielen zwei Teams gegeneinander. Beide Partner müssen das Match bestätigen, bevor es gewertet wird.',
    open: false
  }
])

function toggleFaq(index) {
  faqItems.value[index].open = !faqItems.value[index].open
}

function goBack() {
  if (isLoggedIn.value) {
    router.push('/dashboard')
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 pb-6">
    <!-- Header -->
    <header class="bg-white shadow-sm safe-top">
      <div class="container mx-auto px-4 py-4 max-w-4xl">
        <div class="flex items-center gap-4">
          <button @click="goBack" class="text-gray-600 hover:text-gray-900">
            <i class="fas fa-arrow-left text-xl"></i>
          </button>
          <h1 class="text-2xl font-bold text-gray-900">FAQ & Regeln</h1>
        </div>
      </div>

      <!-- Section Tabs -->
      <div class="border-t border-gray-200">
        <div class="container mx-auto px-4 max-w-4xl">
          <nav class="-mb-px flex space-x-6">
            <button
              v-for="section in sections"
              :key="section.id"
              @click="activeSection = section.id"
              class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors"
              :class="activeSection === section.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              {{ section.icon }} {{ section.label }}
            </button>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto p-4 max-w-4xl">
      <!-- Spielregeln -->
      <div v-show="activeSection === 'rules'" class="space-y-6">
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold mb-4 text-indigo-600">🏓 Tischtennis-Grundregeln</h2>

          <div class="space-y-4 text-gray-700">
            <div>
              <h3 class="font-semibold text-lg mb-2">Satzgewinn</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>Ein Satz wird bis 11 Punkte gespielt</li>
                <li>Bei 10:10 muss mit 2 Punkten Vorsprung gewonnen werden</li>
                <li>Ein Match geht über Best-of-5 (3 Sätze zum Sieg)</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-lg mb-2">Aufschlag</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>Der Ball muss auf der offenen Handfläche liegen</li>
                <li>Der Ball muss mindestens 16 cm hochgeworfen werden</li>
                <li>Der Ball muss zuerst die eigene, dann die gegnerische Seite berühren</li>
                <li>Alle 2 Punkte wechselt der Aufschlag</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-lg mb-2">Ballwechsel</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>Der Ball darf nur einmal auf der eigenen Seite aufkommen</li>
                <li>Der Ball muss über das Netz auf die gegnerische Seite gespielt werden</li>
                <li>Das Berühren des Netzes ist erlaubt, solange der Ball drübergeht</li>
              </ul>
            </div>

            <div>
              <h3 class="font-semibold text-lg mb-2">Doppel-Besonderheiten</h3>
              <ul class="list-disc pl-5 space-y-1">
                <li>Der Aufschlag muss diagonal gespielt werden</li>
                <li>Die Partner müssen abwechselnd schlagen</li>
                <li>Nach jedem Satz wechselt die Aufschlagreihenfolge</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 class="font-semibold text-blue-800 mb-2">
            <i class="fas fa-info-circle mr-2"></i>Hinweis
          </h3>
          <p class="text-blue-700 text-sm">
            Bei Streitigkeiten über Regeln oder Ergebnisse wendet euch bitte an euren Trainer.
            Fair Play steht immer an erster Stelle!
          </p>
        </div>
      </div>

      <!-- Punktesystem -->
      <div v-show="activeSection === 'points'" class="space-y-6">
        <!-- XP Section -->
        <div class="bg-purple-50 border border-purple-200 rounded-xl p-6">
          <h2 class="text-xl font-bold mb-4 text-purple-700">💪 Erfahrungspunkte (XP)</h2>
          <p class="text-purple-800 mb-4">
            XP zeigen deinen Fleiß und können <strong>nie verloren gehen</strong>.
            Sie bestimmen deinen Rang und werden für folgende Aktivitäten vergeben:
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-purple-600">+50 XP</span>
              <p class="text-sm text-gray-600">Match gespielt</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-purple-600">+20 XP</span>
              <p class="text-sm text-gray-600">Training besucht</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-purple-600">+30 XP</span>
              <p class="text-sm text-gray-600">Übung absolviert</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-purple-600">+100 XP</span>
              <p class="text-sm text-gray-600">Challenge-Meilenstein</p>
            </div>
          </div>
        </div>

        <!-- Elo Section -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 class="text-xl font-bold mb-4 text-blue-700">⚡ Spielstärke (Elo)</h2>
          <p class="text-blue-800 mb-4">
            Elo misst deine echte Spielstärke und kann steigen oder fallen:
          </p>
          <ul class="space-y-2 text-blue-800">
            <li class="flex items-center gap-2">
              <i class="fas fa-arrow-up text-green-500"></i>
              <span>Sieg gegen stärkeren Gegner: <strong>+20-30 Elo</strong></span>
            </li>
            <li class="flex items-center gap-2">
              <i class="fas fa-arrow-up text-green-500"></i>
              <span>Sieg gegen gleichstarken Gegner: <strong>+15-20 Elo</strong></span>
            </li>
            <li class="flex items-center gap-2">
              <i class="fas fa-arrow-up text-green-500"></i>
              <span>Sieg gegen schwächeren Gegner: <strong>+5-15 Elo</strong></span>
            </li>
            <li class="flex items-center gap-2">
              <i class="fas fa-arrow-down text-red-500"></i>
              <span>Niederlage gegen schwächeren Gegner: <strong>-20-30 Elo</strong></span>
            </li>
          </ul>
          <p class="text-sm text-blue-600 mt-4">
            Startelo: 1000 | Minimum: 100 | Kein Maximum
          </p>
        </div>

        <!-- Season Points -->
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <h2 class="text-xl font-bold mb-4 text-yellow-700">🏆 Saisonpunkte</h2>
          <p class="text-yellow-800 mb-4">
            Temporäre Punkte für den 6-Wochen-Wettbewerb.
            Werden am Saisonende <strong>zurückgesetzt</strong>.
          </p>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-yellow-600">+100 P</span>
              <p class="text-sm text-gray-600">Match gewonnen</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-yellow-600">+50 P</span>
              <p class="text-sm text-gray-600">Match verloren</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-yellow-600">+25 P</span>
              <p class="text-sm text-gray-600">Training besucht</p>
            </div>
            <div class="bg-white p-3 rounded-lg">
              <span class="font-bold text-yellow-600">Bonus</span>
              <p class="text-sm text-gray-600">Streak-Multiplikator</p>
            </div>
          </div>
        </div>

        <!-- Ranks -->
        <div class="bg-white rounded-xl shadow-md p-6">
          <h2 class="text-xl font-bold mb-4 text-indigo-600">🎖️ Ränge</h2>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div class="text-center p-3 bg-gray-100 rounded-lg">
              <span class="text-2xl">🥉</span>
              <p class="font-semibold">Rekrut</p>
              <p class="text-xs text-gray-500">0 XP</p>
            </div>
            <div class="text-center p-3 bg-green-100 rounded-lg">
              <span class="text-2xl">🌱</span>
              <p class="font-semibold">Anfänger</p>
              <p class="text-xs text-gray-500">500 XP</p>
            </div>
            <div class="text-center p-3 bg-blue-100 rounded-lg">
              <span class="text-2xl">⭐</span>
              <p class="font-semibold">Fortgeschritten</p>
              <p class="text-xs text-gray-500">1.500 XP</p>
            </div>
            <div class="text-center p-3 bg-purple-100 rounded-lg">
              <span class="text-2xl">💫</span>
              <p class="font-semibold">Erfahren</p>
              <p class="text-xs text-gray-500">3.000 XP</p>
            </div>
            <div class="text-center p-3 bg-yellow-100 rounded-lg">
              <span class="text-2xl">🏅</span>
              <p class="font-semibold">Experte</p>
              <p class="text-xs text-gray-500">6.000 XP</p>
            </div>
            <div class="text-center p-3 bg-red-100 rounded-lg">
              <span class="text-2xl">👑</span>
              <p class="font-semibold">Meister</p>
              <p class="text-xs text-gray-500">10.000 XP</p>
            </div>
          </div>
        </div>
      </div>

      <!-- FAQ -->
      <div v-show="activeSection === 'faq'" class="space-y-3">
        <div
          v-for="(item, index) in faqItems"
          :key="index"
          class="bg-white rounded-xl shadow-md overflow-hidden"
        >
          <button
            @click="toggleFaq(index)"
            class="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <span class="font-medium text-gray-900">{{ item.question }}</span>
            <i
              class="fas fa-chevron-down text-gray-400 transition-transform"
              :class="{ 'rotate-180': item.open }"
            ></i>
          </button>
          <div
            v-show="item.open"
            class="px-6 pb-4 text-gray-600 border-t border-gray-100 pt-3"
          >
            {{ item.answer }}
          </div>
        </div>

        <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mt-6">
          <h3 class="font-semibold text-indigo-800 mb-2">
            <i class="fas fa-question-circle mr-2"></i>Weitere Fragen?
          </h3>
          <p class="text-indigo-700 text-sm">
            Kontaktiere deinen Trainer oder schreibe an
            <a href="mailto:support@sc-champions.de" class="underline font-semibold">
              support@sc-champions.de
            </a>
          </p>
        </div>
      </div>
    </main>
  </div>
</template>
