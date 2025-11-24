<template>
  <div class="min-h-screen bg-gray-100 text-gray-800">
    <div class="container mx-auto p-4 sm:p-6 md:p-8 max-w-2xl">
      <!-- Header -->
      <header class="flex justify-between items-start mb-8">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Einstellungen</h1>
          <p class="text-gray-600">Verwalte dein Profil</p>
        </div>
        <router-link to="/dashboard" class="text-indigo-600 hover:text-indigo-800 font-semibold whitespace-nowrap pt-1">
          ← Zurück zum Dashboard
        </router-link>
      </header>

      <div class="bg-white p-6 rounded-xl shadow-md space-y-8">
        <!-- Profilbild -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Profilbild</h2>
          <div class="flex items-center space-x-6">
            <img
              :src="profileImageUrl"
              alt="Profilbild"
              class="h-24 w-24 rounded-full object-cover"
            >
            <form @submit.prevent="uploadPhoto" class="flex flex-col space-y-3">
              <label class="cursor-pointer text-center bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                <span>Bild ändern</span>
                <input
                  type="file"
                  class="sr-only"
                  accept="image/*"
                  @change="onFileSelected"
                >
              </label>
              <button
                v-if="selectedFile"
                type="submit"
                :disabled="uploading"
                class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-opacity disabled:opacity-50"
              >
                {{ uploading ? 'Speichere...' : 'Speichern' }}
              </button>
            </form>
          </div>
          <p v-if="photoFeedback" :class="['mt-2 text-sm', photoFeedback.success ? 'text-green-600' : 'text-red-600']">
            {{ photoFeedback.message }}
          </p>
        </div>

        <!-- Name -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Name</h2>
          <form @submit.prevent="updateName" class="space-y-4">
            <div>
              <label for="firstName" class="block text-sm font-medium text-gray-700">Vorname</label>
              <input
                type="text"
                id="firstName"
                v-model="firstName"
                required
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
            </div>
            <div>
              <label for="lastName" class="block text-sm font-medium text-gray-700">Nachname</label>
              <input
                type="text"
                id="lastName"
                v-model="lastName"
                required
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
            </div>
            <button
              type="submit"
              :disabled="savingName"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:opacity-50"
            >
              {{ savingName ? 'Speichere...' : 'Namen speichern' }}
            </button>
          </form>
          <p v-if="nameFeedback" :class="['mt-2 text-sm', nameFeedback.success ? 'text-green-600' : 'text-red-600']">
            {{ nameFeedback.message }}
          </p>
        </div>

        <!-- Email-Adresse -->
        <div>
          <h2 class="text-xl font-semibold mb-4">Email-Adresse</h2>
          <div class="space-y-4">
            <div class="bg-gray-50 p-4 rounded-lg">
              <p class="text-sm text-gray-600 mb-1">Aktuelle Email:</p>
              <p class="font-semibold text-gray-900">{{ currentEmail }}</p>
              <div class="mt-2">
                <div v-if="emailVerified" class="flex items-center text-green-600 text-sm">
                  <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  <span>Email-Adresse verifiziert</span>
                </div>
                <div v-else class="flex flex-col space-y-2">
                  <div class="flex items-center text-amber-600 text-sm">
                    <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                    <span>Email-Adresse nicht verifiziert</span>
                  </div>
                  <button
                    @click="sendVerificationEmail"
                    class="text-indigo-600 hover:text-indigo-800 text-sm font-semibold text-left"
                  >
                    Verifizierungs-Email erneut senden
                  </button>
                </div>
              </div>
            </div>

            <form @submit.prevent="updateEmail" class="space-y-4">
              <div>
                <label for="new-email" class="block text-sm font-medium text-gray-700">Neue Email-Adresse</label>
                <input
                  type="email"
                  id="new-email"
                  v-model="newEmail"
                  required
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="neue-email@beispiel.de"
                >
              </div>
              <div>
                <label for="current-password" class="block text-sm font-medium text-gray-700">Aktuelles Passwort (zur Bestätigung)</label>
                <input
                  type="password"
                  id="current-password"
                  v-model="currentPassword"
                  required
                  class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="••••••••"
                >
                <p class="mt-1 text-sm text-gray-500">Aus Sicherheitsgründen musst du dein Passwort eingeben</p>
              </div>
              <button
                type="submit"
                :disabled="changingEmail"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:opacity-50"
              >
                {{ changingEmail ? 'Ändere...' : 'Email-Adresse ändern' }}
              </button>
            </form>
            <div v-if="emailFeedback" v-html="emailFeedback" class="text-sm"></div>
          </div>
        </div>

        <!-- Benachrichtigungen -->
        <div>
          <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            Benachrichtigungen
          </h2>

          <!-- Notification Status -->
          <div class="bg-gray-50 p-4 rounded-lg mb-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-gray-900">Push-Benachrichtigungen</p>
                <p class="text-sm text-gray-600 mt-1" v-html="notificationStatusText"></p>
              </div>
              <button
                @click="toggleNotifications"
                :disabled="!notificationSupported || notificationPermission === 'denied'"
                :class="[
                  'px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50',
                  notificationsEnabled
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                ]"
              >
                {{ notificationsEnabled ? 'Deaktivieren' : 'Aktivieren' }}
              </button>
            </div>
          </div>

          <!-- Notification Preferences -->
          <div v-if="notificationsEnabled" class="space-y-3">
            <p class="text-sm text-gray-600 mb-3">Wähle, welche Benachrichtigungen du erhalten möchtest:</p>

            <label
              v-for="pref in notificationPreferences"
              :key="pref.id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition"
            >
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ pref.icon }}</span>
                <div>
                  <p class="font-medium text-gray-900">{{ pref.label }}</p>
                  <p class="text-xs text-gray-500">{{ pref.description }}</p>
                </div>
              </div>
              <input
                type="checkbox"
                v-model="pref.enabled"
                class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
              >
            </label>

            <button
              @click="saveNotificationPreferences"
              :disabled="savingPrefs"
              class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition disabled:opacity-50"
            >
              {{ savingPrefs ? 'Speichere...' : 'Präferenzen speichern' }}
            </button>

            <p v-if="prefsFeedback" :class="['text-sm text-center mt-2', prefsFeedback.success ? 'text-green-600' : 'text-red-600']">
              {{ prefsFeedback.message }}
            </p>
          </div>

          <!-- Not supported message -->
          <div v-if="!notificationSupported" class="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <p class="text-sm text-yellow-800">
              <strong>Hinweis:</strong> Dein Browser unterstützt keine Push-Benachrichtigungen.
              Bitte verwende einen modernen Browser wie Chrome, Firefox, Edge oder Safari (ab iOS 16.4).
            </p>
          </div>
        </div>

        <!-- Tutorial & Hilfe -->
        <div>
          <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg class="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
            </svg>
            Tutorial & Hilfe
          </h2>

          <div class="space-y-3">
            <!-- Coach Tutorial -->
            <div v-if="isCoach" class="bg-gray-50 p-4 rounded-lg">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h3 class="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    Coach Tutorial
                    <span :class="[
                      'px-2 py-0.5 text-xs rounded-full',
                      coachTutorialCompleted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    ]">
                      {{ coachTutorialCompleted ? '✓ Abgeschlossen' : 'Ausstehend' }}
                    </span>
                  </h3>
                  <p class="text-sm text-gray-600 mb-3">
                    Lerne alle wichtigen Funktionen für Coaches kennen: Spielerverwaltung, Wettkämpfe, Challenges, Ranglisten und mehr.
                  </p>
                  <button
                    @click="startCoachTutorial"
                    class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-md"
                  >
                    {{ coachTutorialCompleted ? '🔄 Tutorial wiederholen' : '▶️ Tutorial starten' }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Player Tutorial -->
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <h3 class="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    Spieler Tutorial
                    <span :class="[
                      'px-2 py-0.5 text-xs rounded-full',
                      playerTutorialCompleted
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    ]">
                      {{ playerTutorialCompleted ? '✓ Abgeschlossen' : 'Ausstehend' }}
                    </span>
                  </h3>
                  <p class="text-sm text-gray-600 mb-3">
                    Lerne alle wichtigen Funktionen kennen: Ansichten wechseln, Ranglisten nutzen, Wettkämpfe anfragen, Dashboard anpassen und mehr.
                  </p>
                  <button
                    @click="startPlayerTutorial"
                    class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-transform transform hover:scale-105 shadow-md"
                  >
                    {{ playerTutorialCompleted ? '🔄 Tutorial wiederholen' : '▶️ Tutorial starten' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <p class="text-sm text-blue-800">
                <strong>Tipp:</strong> Das Tutorial kann jederzeit abgebrochen werden. Du kannst es später hier wiederholen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { db, storage } from '@/config/firebase'
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  getAuth,
  sendEmailVerification,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth'

const router = useRouter()
const userStore = useUserStore()
const auth = getAuth()

// Profile image
const selectedFile = ref(null)
const uploading = ref(false)
const photoFeedback = ref(null)
const previewUrl = ref(null)

const profileImageUrl = computed(() => {
  if (previewUrl.value) return previewUrl.value
  if (userStore.userData?.photoURL) return userStore.userData.photoURL
  const initials = (userStore.userData?.firstName?.[0] || '') + (userStore.userData?.lastName?.[0] || '')
  return `https://placehold.co/96x96/e2e8f0/64748b?text=${initials}`
})

// Name
const firstName = ref('')
const lastName = ref('')
const savingName = ref(false)
const nameFeedback = ref(null)

// Email
const currentEmail = computed(() => auth.currentUser?.email || 'Lädt...')
const emailVerified = computed(() => auth.currentUser?.emailVerified || false)
const newEmail = ref('')
const currentPassword = ref('')
const changingEmail = ref(false)
const emailFeedback = ref(null)

// Notifications
const notificationSupported = ref(false)
const notificationPermission = ref('default')
const notificationsEnabled = ref(false)
const savingPrefs = ref(false)
const prefsFeedback = ref(null)

const notificationStatusText = computed(() => {
  if (!notificationSupported.value) return 'Nicht unterstützt'
  if (notificationPermission.value === 'denied') return '<span class="text-red-600">Blockiert</span>'
  if (notificationsEnabled.value) return '<span class="text-green-600">✓ Aktiviert</span>'
  return 'Verfügbar'
})

const notificationPreferences = ref([
  { id: 'matchApproved', icon: '🏓', label: 'Match-Genehmigungen', description: 'Wenn dein Match genehmigt wurde', enabled: true },
  { id: 'matchRequest', icon: '📬', label: 'Match-Anfragen', description: 'Wenn jemand ein Match mit dir spielen möchte', enabled: true },
  { id: 'trainingReminder', icon: '⏰', label: 'Training-Erinnerungen', description: 'Täglich um 17:00 wenn Training morgen ist', enabled: true },
  { id: 'challengeAvailable', icon: '🎯', label: 'Neue Challenges', description: 'Wenn neue Challenges verfügbar sind', enabled: true },
  { id: 'rankUp', icon: '🎉', label: 'Rang-Aufstiege', description: 'Wenn du einen höheren Rang erreichst', enabled: true },
  { id: 'matchSuggestion', icon: '💡', label: 'Match-Vorschläge', description: 'Wenn dir ein Match vorgeschlagen wird', enabled: false }
])

// Tutorial
const isCoach = computed(() => ['coach', 'admin'].includes(userStore.userData?.role))
const coachTutorialCompleted = computed(() => userStore.userData?.tutorialCompleted?.coach || false)
const playerTutorialCompleted = computed(() => userStore.userData?.tutorialCompleted?.player || false)

onMounted(async () => {
  // Load user data
  if (userStore.userData) {
    firstName.value = userStore.userData.firstName || ''
    lastName.value = userStore.userData.lastName || ''
  }

  // Check notification support
  if ('Notification' in window && 'serviceWorker' in navigator) {
    notificationSupported.value = true
    notificationPermission.value = Notification.permission

    // Check if notifications are enabled (FCM token exists)
    if (Notification.permission === 'granted') {
      const prefsDoc = await getDoc(doc(db, 'users', userStore.userData.id, 'preferences', 'notifications'))
      notificationsEnabled.value = prefsDoc.exists() && prefsDoc.data().enabled !== false

      if (prefsDoc.exists()) {
        const data = prefsDoc.data()
        notificationPreferences.value.forEach(pref => {
          if (data[pref.id] !== undefined) {
            pref.enabled = data[pref.id]
          }
        })
      }
    }
  }
})

function onFileSelected(event) {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
    const reader = new FileReader()
    reader.onload = (e) => {
      previewUrl.value = e.target.result
    }
    reader.readAsDataURL(file)
  }
}

async function uploadPhoto() {
  if (!selectedFile.value) return

  uploading.value = true
  photoFeedback.value = null

  try {
    const fileRef = storageRef(storage, `profile-pictures/${userStore.userData.id}/${selectedFile.value.name}`)
    const snapshot = await uploadBytes(fileRef, selectedFile.value)
    const photoURL = await getDownloadURL(snapshot.ref)

    await updateDoc(doc(db, 'users', userStore.userData.id), { photoURL })

    photoFeedback.value = { success: true, message: 'Profilbild erfolgreich aktualisiert!' }
    selectedFile.value = null
    previewUrl.value = null
  } catch (error) {
    console.error('Error uploading photo:', error)
    photoFeedback.value = { success: false, message: 'Fehler beim Speichern des Bildes.' }
  } finally {
    uploading.value = false
  }
}

async function updateName() {
  savingName.value = true
  nameFeedback.value = null

  try {
    await updateDoc(doc(db, 'users', userStore.userData.id), {
      firstName: firstName.value,
      lastName: lastName.value
    })
    nameFeedback.value = { success: true, message: 'Name erfolgreich gespeichert!' }
  } catch (error) {
    console.error('Error updating name:', error)
    nameFeedback.value = { success: false, message: 'Fehler beim Speichern des Namens.' }
  } finally {
    savingName.value = false
  }
}

async function sendVerificationEmailHandler() {
  try {
    await sendEmailVerification(auth.currentUser)
    alert('Verifizierungs-Email wurde gesendet! Bitte prüfe dein Postfach.')
  } catch (error) {
    console.error('Error sending verification email:', error)
    alert('Fehler beim Senden der Verifizierungs-Email.')
  }
}

async function updateEmail() {
  if (newEmail.value === currentEmail.value) {
    emailFeedback.value = '<span class="text-amber-600">Die neue Email-Adresse ist identisch mit der aktuellen.</span>'
    return
  }

  changingEmail.value = true
  emailFeedback.value = null

  try {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword.value)
    await reauthenticateWithCredential(auth.currentUser, credential)
    await verifyBeforeUpdateEmail(auth.currentUser, newEmail.value)

    emailFeedback.value = `
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p class="font-semibold text-blue-900">Verifizierungs-Email gesendet!</p>
        <p class="text-sm text-blue-700 mt-1">
          Wir haben eine Verifizierungs-Email an <strong>${newEmail.value}</strong> gesendet.
          Bitte klicke auf den Link in der Email, um deine neue Email-Adresse zu bestätigen.
        </p>
      </div>
    `

    newEmail.value = ''
    currentPassword.value = ''
  } catch (error) {
    console.error('Error updating email:', error)

    let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.'
    if (error.code === 'auth/wrong-password') errorMessage = 'Das eingegebene Passwort ist falsch.'
    else if (error.code === 'auth/email-already-in-use') errorMessage = 'Diese Email-Adresse wird bereits verwendet.'
    else if (error.code === 'auth/invalid-email') errorMessage = 'Die eingegebene Email-Adresse ist ungültig.'

    emailFeedback.value = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="font-semibold text-red-900">Fehler</p>
        <p class="text-sm text-red-700 mt-1">${errorMessage}</p>
      </div>
    `
  } finally {
    changingEmail.value = false
  }
}

async function toggleNotifications() {
  if (notificationsEnabled.value) {
    // Disable
    try {
      await setDoc(doc(db, 'users', userStore.userData.id, 'preferences', 'notifications'), { enabled: false }, { merge: true })
      notificationsEnabled.value = false
    } catch (error) {
      console.error('Error disabling notifications:', error)
    }
  } else {
    // Enable
    const permission = await Notification.requestPermission()
    notificationPermission.value = permission

    if (permission === 'granted') {
      await setDoc(doc(db, 'users', userStore.userData.id, 'preferences', 'notifications'), { enabled: true }, { merge: true })
      notificationsEnabled.value = true
    }
  }
}

async function saveNotificationPreferences() {
  savingPrefs.value = true
  prefsFeedback.value = null

  try {
    const prefsData = { enabled: true }
    notificationPreferences.value.forEach(pref => {
      prefsData[pref.id] = pref.enabled
    })

    await setDoc(doc(db, 'users', userStore.userData.id, 'preferences', 'notifications'), prefsData)
    prefsFeedback.value = { success: true, message: '✓ Präferenzen gespeichert!' }

    setTimeout(() => { prefsFeedback.value = null }, 3000)
  } catch (error) {
    console.error('Error saving preferences:', error)
    prefsFeedback.value = { success: false, message: 'Fehler beim Speichern' }
  } finally {
    savingPrefs.value = false
  }
}

function startCoachTutorial() {
  sessionStorage.setItem('startTutorial', 'coach')
  router.push('/coach')
}

function startPlayerTutorial() {
  sessionStorage.setItem('startTutorial', 'player')
  router.push('/dashboard')
}
</script>
