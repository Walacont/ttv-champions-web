import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '@/config/firebase'

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref(null)
  const userData = ref(null)
  const loading = ref(true)
  const error = ref(null)
  const currentSubgroupFilter = ref('club') // 'club', 'global', or subgroup ID

  // Getters
  const isAuthenticated = computed(() => !!user.value)
  const isPlayer = computed(() => userData.value?.role === 'player')
  const isCoach = computed(() => userData.value?.role === 'coach')
  const isAdmin = computed(() => userData.value?.role === 'admin')
  const clubId = computed(() => userData.value?.clubId)

  // Actions
  let unsubscribeUserData = null

  function init() {
    loading.value = true

    onAuthStateChanged(auth, async (firebaseUser) => {
      user.value = firebaseUser

      if (firebaseUser) {
        // Subscribe to user data
        if (unsubscribeUserData) unsubscribeUserData()

        unsubscribeUserData = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              userData.value = { id: docSnap.id, ...docSnap.data() }
            } else {
              userData.value = null
            }
            loading.value = false
          },
          (err) => {
            console.error('Error fetching user data:', err)
            error.value = err.message
            loading.value = false
          }
        )
      } else {
        userData.value = null
        loading.value = false
        if (unsubscribeUserData) {
          unsubscribeUserData()
          unsubscribeUserData = null
        }
      }
    })
  }

  function logout() {
    return auth.signOut()
  }

  function setSubgroupFilter(filter) {
    currentSubgroupFilter.value = filter
    console.log('[Vue] Subgroup filter changed to:', filter)
  }

  return {
    // State
    user,
    userData,
    loading,
    error,
    currentSubgroupFilter,
    // Getters
    isAuthenticated,
    isPlayer,
    isCoach,
    isAdmin,
    clubId,
    // Actions
    init,
    logout,
    setSubgroupFilter
  }
})
