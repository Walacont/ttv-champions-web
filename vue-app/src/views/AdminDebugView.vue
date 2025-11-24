<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRouter } from 'vue-router'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db } from '@/config/firebase'

const userStore = useUserStore()
const router = useRouter()
const functions = getFunctions(undefined, 'europe-west1')

const statusLog = ref([])
const processAllLog = ref([])
const processSingleLog = ref([])
const requestId = ref('')
const loading = ref(false)

onMounted(() => {
  // Check if user is admin or coach
  if (!userStore.userData || !['admin', 'coach'].includes(userStore.userData.role)) {
    alert('⛔ Zugriff verweigert: Du musst Admin oder Coach sein!')
    router.push('/')
  }
})

function addLog(logArray, message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('de-DE')
  logArray.value.push({ timestamp, message, type })
}

function clearLog(logArray) {
  logArray.value = []
}

async function checkStatus() {
  clearLog(statusLog)
  addLog(statusLog, '🔍 Überprüfe Status...', 'info')

  try {
    // Check for unprocessed doublesMatches
    const doublesMatchesQuery = query(
      collection(db, 'doublesMatches'),
      where('processed', '==', false)
    )
    const unprocessedMatches = await getDocs(doublesMatchesQuery)
    addLog(statusLog, `📊 Unverarbeitete doublesMatches: ${unprocessedMatches.size}`, unprocessedMatches.size > 0 ? 'error' : 'success')

    // Check for approved doublesMatchRequests without processedMatchId
    const requestsQuery = query(
      collection(db, 'doublesMatchRequests'),
      where('status', '==', 'approved')
    )
    const approvedRequests = await getDocs(requestsQuery)
    const unprocessedRequests = approvedRequests.docs.filter(doc => !doc.data().processedMatchId)
    addLog(statusLog, `📋 Approved Requests ohne processedMatchId: ${unprocessedRequests.length}`, unprocessedRequests.length > 0 ? 'error' : 'success')

    if (unprocessedRequests.length > 0) {
      addLog(statusLog, '📝 IDs der unverarbeiteten Requests:', 'info')
      unprocessedRequests.forEach(doc => {
        addLog(statusLog, `  - ${doc.id}`, 'info')
      })
    }

    if (unprocessedMatches.size === 0 && unprocessedRequests.length === 0) {
      addLog(statusLog, '✅ Alles OK! Keine unverarbeiteten Matches gefunden.', 'success')
    } else {
      addLog(statusLog, '⚠️ Es gibt unverarbeitete Matches. Verwende die Buttons unten, um sie zu verarbeiten.', 'error')
    }
  } catch (error) {
    addLog(statusLog, `❌ Fehler: ${error.message}`, 'error')
    console.error(error)
  }
}

async function processAllUnprocessed() {
  if (!confirm('Möchtest du wirklich ALLE unverarbeiteten Doppel-Matches verarbeiten?')) {
    return
  }

  loading.value = true
  clearLog(processAllLog)
  addLog(processAllLog, '🚀 Starte Verarbeitung...', 'info')

  try {
    const processUnprocessedDoublesMatches = httpsCallable(functions, 'processUnprocessedDoublesMatches')
    addLog(processAllLog, '⏳ Rufe Cloud Function auf...', 'info')

    const result = await processUnprocessedDoublesMatches()

    addLog(processAllLog, `✅ Verarbeitung abgeschlossen!`, 'success')
    addLog(processAllLog, `📊 Ergebnis: ${result.data.processed} von ${result.data.total} Matches verarbeitet`, 'success')

    if (result.data.errors && result.data.errors.length > 0) {
      addLog(processAllLog, `⚠️ ${result.data.errors.length} Fehler aufgetreten:`, 'error')
      result.data.errors.forEach(err => {
        addLog(processAllLog, `  - ${err}`, 'error')
      })
    }

    if (result.data.processed > 0) {
      addLog(processAllLog, '🎉 Bitte aktualisiere die Seite, um die Änderungen zu sehen.', 'success')
    }
  } catch (error) {
    addLog(processAllLog, `❌ Fehler: ${error.message}`, 'error')
    console.error('Error:', error)
  } finally {
    loading.value = false
  }
}

async function processSingleRequest() {
  if (!requestId.value.trim()) {
    alert('⚠️ Bitte gib eine Request ID ein!')
    return
  }

  loading.value = true
  clearLog(processSingleLog)
  addLog(processSingleLog, `🎯 Verarbeite Request ${requestId.value}...`, 'info')

  try {
    const manualProcessDoublesRequest = httpsCallable(functions, 'manualProcessDoublesRequest')
    addLog(processSingleLog, '⏳ Rufe Cloud Function auf...', 'info')

    const result = await manualProcessDoublesRequest({ requestId: requestId.value })

    addLog(processSingleLog, `✅ Request erfolgreich verarbeitet!`, 'success')
    addLog(processSingleLog, `📄 Match ID: ${result.data.matchId}`, 'success')
    addLog(processSingleLog, `📊 ${result.data.processed} Spieler verarbeitet`, 'success')
    addLog(processSingleLog, '🎉 Bitte aktualisiere die Seite, um die Änderungen zu sehen.', 'success')
  } catch (error) {
    addLog(processSingleLog, `❌ Fehler: ${error.message}`, 'error')
    console.error('Error:', error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6 p-6">
    <!-- Header -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
            🔧 Admin Debug Tool
          </h1>
          <p class="text-gray-600 mt-1">Tools zur manuellen Verarbeitung von Doppel-Matches</p>
        </div>
        <button
          @click="router.push('/')"
          class="text-gray-500 hover:text-gray-700"
        >
          ← Zurück
        </button>
      </div>

      <div class="mt-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
        <p class="text-sm text-yellow-800">
          <strong>⚠️ Warnung:</strong> Diese Tools sind nur für Admins und Coaches. Verwende sie nur, wenn die automatischen Cloud Functions nicht funktionieren.
        </p>
      </div>
    </div>

    <!-- Status Check -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">📊 Status Check</h2>
      <button
        @click="checkStatus"
        :disabled="loading"
        class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Status überprüfen
      </button>

      <div v-if="statusLog.length > 0" class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div
          v-for="(entry, index) in statusLog"
          :key="index"
          class="mb-2 pb-2 border-l-3 pl-3 text-sm font-mono"
          :class="{
            'border-green-500 text-green-700': entry.type === 'success',
            'border-red-500 text-red-700': entry.type === 'error',
            'border-blue-500 text-blue-700': entry.type === 'info'
          }"
        >
          [{{ entry.timestamp }}] {{ entry.message }}
        </div>
      </div>
    </div>

    <!-- Process All -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">🔄 Alle unverarbeiteten Doppel-Matches verarbeiten</h2>
      <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
        <p class="text-sm text-blue-800">
          Diese Funktion findet alle approved Doppel-Matches, die noch nicht verarbeitet wurden, und verarbeitet sie (Elo-Update, Punkte-Historie, Paarungsstatistiken).
        </p>
      </div>
      <button
        @click="processAllUnprocessed"
        :disabled="loading"
        class="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Alle verarbeiten
      </button>

      <div v-if="processAllLog.length > 0" class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div
          v-for="(entry, index) in processAllLog"
          :key="index"
          class="mb-2 pb-2 border-l-3 pl-3 text-sm font-mono"
          :class="{
            'border-green-500 text-green-700': entry.type === 'success',
            'border-red-500 text-red-700': entry.type === 'error',
            'border-blue-500 text-blue-700': entry.type === 'info'
          }"
        >
          [{{ entry.timestamp }}] {{ entry.message }}
        </div>
      </div>
    </div>

    <!-- Process Single -->
    <div class="bg-white rounded-xl shadow-md p-6">
      <h2 class="text-lg font-semibold text-gray-900 mb-4">🎯 Einzelne Anfrage verarbeiten</h2>
      <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded mb-4">
        <p class="text-sm text-blue-800">
          Verarbeite eine spezifische Doppel-Anfrage anhand ihrer ID. Die ID findest du in Firestore unter doublesMatchRequests.
        </p>
      </div>
      <input
        v-model="requestId"
        type="text"
        placeholder="Request ID (z.B. abc123xyz456)"
        class="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
      />
      <button
        @click="processSingleRequest"
        :disabled="loading || !requestId.trim()"
        class="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Einzelne verarbeiten
      </button>

      <div v-if="processSingleLog.length > 0" class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div
          v-for="(entry, index) in processSingleLog"
          :key="index"
          class="mb-2 pb-2 border-l-3 pl-3 text-sm font-mono"
          :class="{
            'border-green-500 text-green-700': entry.type === 'success',
            'border-red-500 text-red-700': entry.type === 'error',
            'border-blue-500 text-blue-700': entry.type === 'info'
          }"
        >
          [{{ entry.timestamp }}] {{ entry.message }}
        </div>
      </div>
    </div>
  </div>
</template>
