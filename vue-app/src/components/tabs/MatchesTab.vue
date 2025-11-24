<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { collection, query, where, orderBy, limit, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { useCollection } from 'vuefire'
import { db } from '@/config/firebase'
import { useUserStore } from '@/stores/user'
import MatchRequestCard from '@/components/MatchRequestCard.vue'

const userStore = useUserStore()

// Match type toggle (singles/doubles)
const matchType = ref('singles')

// Match Suggestions
const matchSuggestions = ref([])
const loadingSuggestions = ref(true)
const showSuggestions = ref(false)

// Check if player is match-ready (has 5+ Grundlagen)
const isMatchReady = computed(() => {
  return (userStore.userData?.grundlagenCompleted || 0) >= 5
})

// Load match suggestions, history and requests on mount
onMounted(async () => {
  await calculateMatchSuggestions()
  await loadMatchHistory()
  await loadMatchRequests()
})

// Watch for subgroup filter changes and reload suggestions
watch(() => userStore.currentSubgroupFilter, async () => {
  await calculateMatchSuggestions()
})

// Cleanup on unmount
onUnmounted(() => {
  if (matchHistoryUnsubscribe) {
    matchHistoryUnsubscribe()
  }
  // Cleanup request listeners
  requestUnsubscribes.forEach(unsub => unsub())
})

async function calculateMatchSuggestions() {
  if (!userStore.userData?.id || !isMatchReady.value) {
    loadingSuggestions.value = false
    return
  }

  try {
    loadingSuggestions.value = true

    // Get all club players
    const playersQuery = query(
      collection(db, 'users'),
      where('clubId', '==', userStore.clubId),
      where('role', '==', 'player')
    )
    const playersSnapshot = await getDocs(playersQuery)
    let allPlayers = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    // Apply subgroup filter if not 'club' or 'global'
    const subgroupFilter = userStore.currentSubgroupFilter
    if (subgroupFilter && subgroupFilter !== 'club' && subgroupFilter !== 'global') {
      allPlayers = allPlayers.filter(player => (player.subgroupIDs || []).includes(subgroupFilter))
    }

    // Filter eligible players
    const eligiblePlayers = allPlayers.filter(p => {
      const isNotSelf = p.id !== userStore.userData.id
      const isMatchReadyPlayer = (p.grundlagenCompleted || 0) >= 5
      return isNotSelf && isMatchReadyPlayer
    })

    // Get user's match history
    // Query both new format (with playerIds array) and old format (playerAId/playerBId)
    const matchesWithPlayerIds = query(
      collection(db, 'matches'),
      where('playerIds', 'array-contains', userStore.userData.id)
    )
    const matchesAsPlayerA = query(
      collection(db, 'matches'),
      where('playerAId', '==', userStore.userData.id)
    )
    const matchesAsPlayerB = query(
      collection(db, 'matches'),
      where('playerBId', '==', userStore.userData.id)
    )

    // Execute all queries in parallel
    const [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3] = await Promise.all([
      getDocs(matchesWithPlayerIds),
      getDocs(matchesAsPlayerA),
      getDocs(matchesAsPlayerB)
    ])

    // Combine results and deduplicate by document ID
    const allMatchDocs = new Map()
    ;[matchesSnapshot1, matchesSnapshot2, matchesSnapshot3].forEach(snapshot => {
      snapshot.forEach(doc => {
        allMatchDocs.set(doc.id, doc)
      })
    })

    // Build opponent history
    const opponentHistory = {}
    allMatchDocs.forEach((doc) => {
      const match = doc.data()
      const opponentId = match.playerAId === userStore.userData.id ? match.playerBId : match.playerAId
      if (!opponentHistory[opponentId]) {
        opponentHistory[opponentId] = { matchCount: 0, lastMatchDate: null }
      }
      opponentHistory[opponentId].matchCount++
      const matchDate = match.playedAt?.toDate?.() || match.createdAt?.toDate?.()
      if (matchDate && (!opponentHistory[opponentId].lastMatchDate || matchDate > opponentHistory[opponentId].lastMatchDate)) {
        opponentHistory[opponentId].lastMatchDate = matchDate
      }
    })

    // Calculate suggestions with priority scores
    const myElo = userStore.userData.eloRating || 1000
    const suggestions = eligiblePlayers.map(player => {
      const history = opponentHistory[player.id] || { matchCount: 0, lastMatchDate: null }
      const playerElo = player.eloRating || 1000
      const eloDiff = Math.abs(myElo - playerElo)

      let score = 100
      if (history.matchCount === 0) {
        score += 50 // Never played = highest priority
      } else {
        score -= history.matchCount * 5
      }

      if (history.lastMatchDate) {
        const daysSinceLastMatch = (new Date() - history.lastMatchDate) / (1000 * 60 * 60 * 24)
        score += Math.min(daysSinceLastMatch / 7, 30)
      }

      return { ...player, suggestionScore: score, history, eloDiff }
    })

    // Sort and take top 4
    suggestions.sort((a, b) => b.suggestionScore - a.suggestionScore)
    const neverPlayedPlayers = suggestions.filter(s => s.history.matchCount === 0)

    if (neverPlayedPlayers.length > 0) {
      matchSuggestions.value = neverPlayedPlayers.slice(0, 4)
    } else {
      matchSuggestions.value = suggestions.slice(0, 4)
    }
  } catch (error) {
    console.error('Error calculating match suggestions:', error)
    matchSuggestions.value = []
  } finally {
    loadingSuggestions.value = false
  }
}

function selectSuggestion(player) {
  selectedOpponent.value = player.id
  matchType.value = 'singles'
}

// Form state
const selectedOpponent = ref('')
const selectedPartner = ref('')
const selectedOpponent1 = ref('')
const selectedOpponent2 = ref('')
const matchMode = ref('best-of-5')
const submitting = ref(false)
const feedback = ref({ message: '', type: '' })
const useHandicap = ref(false)

// Set scores
const sets = ref([
  { playerA: '', playerB: '' },
  { playerA: '', playerB: '' },
  { playerA: '', playerB: '' }
])

// Match modes
const matchModes = [
  { id: 'single-set', label: '1 Satz', setsToWin: 1, maxSets: 1 },
  { id: 'best-of-3', label: 'Best of 3', setsToWin: 2, maxSets: 3 },
  { id: 'best-of-5', label: 'Best of 5', setsToWin: 3, maxSets: 5 },
  { id: 'best-of-7', label: 'Best of 7', setsToWin: 4, maxSets: 7 },
]

const currentMode = computed(() => matchModes.find(m => m.id === matchMode.value) || matchModes[2])

// Handicap calculation based on selected opponent
const handicapInfo = computed(() => {
  if (!selectedOpponent.value || !userStore.userData) return null

  const opponent = clubPlayers.value?.find(p => p.id === selectedOpponent.value)
  if (!opponent) return null

  const myElo = userStore.userData.eloRating || 1000
  const opponentElo = opponent.eloRating || 1000
  const eloDiff = Math.abs(myElo - opponentElo)

  if (eloDiff < 25) return null

  const handicapPoints = Math.min(Math.round(eloDiff / 50), 10)
  const weakerPlayer = myElo < opponentElo ? 'Du' : `${opponent.firstName}`
  const weakerPlayerSide = myElo < opponentElo ? 'A' : 'B'

  return {
    points: handicapPoints,
    weakerPlayer,
    weakerPlayerSide,
    text: `${weakerPlayer} startet mit ${handicapPoints} Punkt${handicapPoints === 1 ? '' : 'en'} Vorsprung pro Satz.`
  }
})

// Reset sets when mode changes
watch(matchMode, () => {
  const minSets = currentMode.value.setsToWin
  sets.value = Array.from({ length: minSets }, () => ({ playerA: '', playerB: '' }))
  useHandicap.value = false
})

// Validation errors for each set
const setErrors = ref([])

// Validate a single set according to table tennis rules
function isValidSet(a, b) {
  if (a === 0 && b === 0) return { valid: false, complete: false, error: null }

  const winner = Math.max(a, b)
  const loser = Math.min(a, b)

  // Winner must have at least 11 points
  if (winner < 11) {
    return { valid: false, complete: false, error: null }
  }

  // Normal win: 11 points with at least 2 point lead (loser max 9)
  if (winner === 11 && loser <= 9) {
    return { valid: true, complete: true, error: null }
  }

  // Deuce rule: if loser has 10+, winner needs exactly 2 more
  if (loser >= 10) {
    if (winner - loser === 2) {
      return { valid: true, complete: true, error: null }
    } else if (winner - loser < 2) {
      return { valid: false, complete: false, error: null }
    } else {
      // More than 2 difference with loser >= 10 is invalid (e.g., 15:10)
      return { valid: false, complete: true, error: `Bei ${loser}+ muss der Unterschied genau 2 sein` }
    }
  }

  // Winner has 11+ but loser is 10 exactly - invalid (11:10, 12:10 etc)
  if (winner >= 11 && loser === 10 && winner - loser !== 2) {
    return { valid: false, complete: true, error: 'Ab 10:10 muss der Unterschied 2 Punkte sein' }
  }

  // Winner has 12+ with loser < 10 is invalid
  if (winner > 11 && loser < 10) {
    return { valid: false, complete: true, error: 'Satz endet bei 11 Punkten' }
  }

  return { valid: false, complete: false, error: null }
}

// Auto-add/remove set fields based on current score
function handleSetInput() {
  const mode = currentMode.value

  // Validate each set and count wins
  let playerAWins = 0
  let playerBWins = 0
  const errors = []

  for (let i = 0; i < sets.value.length; i++) {
    const set = sets.value[i]
    const a = parseInt(set.playerA) || 0
    const b = parseInt(set.playerB) || 0
    const validation = isValidSet(a, b)

    errors[i] = validation.error

    if (validation.valid && validation.complete) {
      if (a > b) playerAWins++
      else playerBWins++
    }
  }

  setErrors.value = errors

  // Single set mode - no dynamic fields
  if (mode.id === 'single-set') return

  // Check if match is already decided
  const matchDecided = playerAWins >= mode.setsToWin || playerBWins >= mode.setsToWin

  // Calculate how many valid/complete sets we have
  let completeSets = 0
  for (const set of sets.value) {
    const a = parseInt(set.playerA) || 0
    const b = parseInt(set.playerB) || 0
    const validation = isValidSet(a, b)
    if (validation.complete) completeSets++
  }

  if (matchDecided) {
    // Remove empty trailing sets if match is decided
    while (sets.value.length > completeSets && sets.value.length > mode.setsToWin) {
      const lastSet = sets.value[sets.value.length - 1]
      const a = parseInt(lastSet.playerA) || 0
      const b = parseInt(lastSet.playerB) || 0
      if (a === 0 && b === 0) {
        sets.value.pop()
      } else {
        break
      }
    }
  } else {
    // Calculate fields needed
    const remainingSetsNeeded = mode.setsToWin - Math.max(playerAWins, playerBWins)
    const fieldsNeeded = completeSets + remainingSetsNeeded

    // Add fields if needed
    while (sets.value.length < fieldsNeeded && sets.value.length < mode.maxSets) {
      sets.value.push({ playerA: '', playerB: '' })
    }

    // Remove trailing empty sets if we have too many
    while (sets.value.length > fieldsNeeded && sets.value.length > mode.setsToWin) {
      const lastSet = sets.value[sets.value.length - 1]
      const a = parseInt(lastSet.playerA) || 0
      const b = parseInt(lastSet.playerB) || 0
      if (a === 0 && b === 0) {
        sets.value.pop()
      } else {
        break
      }
    }
  }
}

// Apply handicap to set scores
function applyHandicap() {
  if (!handicapInfo.value || !useHandicap.value) return

  const { weakerPlayerSide, points } = handicapInfo.value
  sets.value.forEach((set, index) => {
    if (weakerPlayerSide === 'A') {
      const currentA = parseInt(set.playerA) || 0
      if (currentA < points) {
        sets.value[index].playerA = points.toString()
      }
    } else {
      const currentB = parseInt(set.playerB) || 0
      if (currentB < points) {
        sets.value[index].playerB = points.toString()
      }
    }
  })
}

// Watch handicap toggle
watch(useHandicap, (newVal) => {
  if (newVal) {
    applyHandicap()
  } else {
    // Reset scores when turning off handicap
    sets.value = sets.value.map(() => ({ playerA: '', playerB: '' }))
  }
})

// Club players
const clubPlayersQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'users'),
    where('clubId', '==', userStore.clubId),
    where('role', '==', 'player'),
    orderBy('lastName', 'asc')
  )
})
const clubPlayers = useCollection(clubPlayersQuery)

// Available opponents (excluding self and match-ready check)
const availableOpponents = computed(() => {
  if (!clubPlayers.value) return []

  let filteredPlayers = clubPlayers.value

  // Apply subgroup filter if not 'club' or 'global'
  const subgroupFilter = userStore.currentSubgroupFilter
  if (subgroupFilter && subgroupFilter !== 'club' && subgroupFilter !== 'global') {
    filteredPlayers = filteredPlayers.filter(player => (player.subgroupIDs || []).includes(subgroupFilter))
  }

  return filteredPlayers.filter(p => {
    if (p.id === userStore.userData?.id) return false
    const isMatchReady = p.isMatchReady === true || (p.grundlagenCompleted || 0) >= 5
    return isMatchReady
  })
})

// Check if player has online access
// isOffline: true = no online access (not registered)
// isOffline: false or missing = has online access (registered)
function hasOnlineAccess(playerId) {
  if (!clubPlayers.value) return false
  const player = clubPlayers.value.find(p => p.id === playerId)
  return player?.isOffline !== true
}

// === MATCH REQUESTS ===
// Store for all request data
const myRequests = ref([])
const incomingRequestsData = ref([])
const processedRequestsData = ref([])
const showAllRequests = ref(false)
const INITIAL_REQUESTS_SHOWN = 4
let requestUnsubscribes = []

// Doubles request data
const myDoublesRequests = ref([])
const doublesInvolvedRequests = ref([])

// Load match requests on mount
async function loadMatchRequests() {
  if (!userStore.userData?.id || !userStore.clubId) return

  const userId = userStore.userData.id
  const clubId = userStore.clubId

  // Query 1: Requests I created (playerA)
  const myRequestsQuery = query(
    collection(db, 'matchRequests'),
    where('playerAId', '==', userId)
  )

  // Query 2: Incoming requests where I need to respond (playerB, pending_player)
  const incomingQuery = query(
    collection(db, 'matchRequests'),
    where('playerBId', '==', userId),
    where('status', '==', 'pending_player')
  )

  // Query 3: Requests I processed as playerB
  const processedQuery = query(
    collection(db, 'matchRequests'),
    where('playerBId', '==', userId)
  )

  // Query 4: Doubles requests I initiated
  const myDoublesQuery = query(
    collection(db, 'doublesMatchRequests'),
    where('initiatedBy', '==', userId)
  )

  // Query 5: All doubles requests in my club (to filter for involvement)
  const doublesInvolvedQuery = query(
    collection(db, 'doublesMatchRequests'),
    where('clubId', '==', clubId)
  )

  // Listen to my requests
  const unsub1 = onSnapshot(myRequestsQuery, (snapshot) => {
    myRequests.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (error) => {
    console.error('Error loading my requests:', error)
  })

  // Listen to incoming requests
  const unsub2 = onSnapshot(incomingQuery, (snapshot) => {
    incomingRequestsData.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (error) => {
    console.error('Error loading incoming requests:', error)
  })

  // Listen to processed requests
  const unsub3 = onSnapshot(processedQuery, (snapshot) => {
    processedRequestsData.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (error) => {
    console.error('Error loading processed requests:', error)
  })

  // Listen to my doubles requests
  const unsub4 = onSnapshot(myDoublesQuery, (snapshot) => {
    myDoublesRequests.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (error) => {
    console.error('Error loading my doubles requests:', error)
  })

  // Listen to doubles requests I'm involved in
  const unsub5 = onSnapshot(doublesInvolvedQuery, (snapshot) => {
    doublesInvolvedRequests.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  }, (error) => {
    console.error('Error loading involved doubles requests:', error)
  })

  requestUnsubscribes = [unsub1, unsub2, unsub3, unsub4, unsub5]
}

// Computed: SINGLES Pending requests only
const singlesPendingRequests = computed(() => {
  if (!userStore.userData?.id) return []

  const pending = []

  // SINGLES: Incoming requests (I'm playerB, need to respond)
  pending.push(...incomingRequestsData.value)

  // SINGLES: My requests that are still pending
  const myPending = myRequests.value.filter(r =>
    r.status === 'pending_player' || r.status === 'pending_coach'
  )
  pending.push(...myPending)

  // Sort by createdAt descending
  return pending.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0
    const bTime = b.createdAt?.toMillis?.() || 0
    return bTime - aTime
  })
})

// Computed: DOUBLES Pending requests only
const doublesPendingRequests = computed(() => {
  if (!userStore.userData?.id) return []

  const pending = []
  const userId = userStore.userData.id

  // DOUBLES: My created doubles requests that are still pending
  const pendingMyDoubles = myDoublesRequests.value.filter(r =>
    r.status === 'pending_opponent' || r.status === 'pending_coach'
  ).map(r => ({ ...r, matchType: 'doubles' }))
  pending.push(...pendingMyDoubles)

  // DOUBLES: Requests where I need to confirm (I'm in teamB and status is pending_opponent)
  const pendingDoublesIncoming = doublesInvolvedRequests.value.filter(r => {
    const isInTeamB = r.teamB?.player1Id === userId || r.teamB?.player2Id === userId
    const isInitiator = r.initiatedBy === userId
    return isInTeamB && r.status === 'pending_opponent' && !isInitiator
  }).map(r => ({ ...r, matchType: 'doubles' }))
  pending.push(...pendingDoublesIncoming)

  // Sort by createdAt descending
  return pending.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0
    const bTime = b.createdAt?.toMillis?.() || 0
    return bTime - aTime
  })
})

// Computed: Combined Pending requests (for backwards compatibility)
const pendingRequests = computed(() => {
  return [...singlesPendingRequests.value, ...doublesPendingRequests.value]
})

// Computed: SINGLES History requests only
const singlesHistoryRequests = computed(() => {
  if (!userStore.userData?.id) return []

  const history = []

  // SINGLES: My completed requests
  const myCompleted = myRequests.value.filter(r =>
    r.status === 'approved' || r.status === 'rejected'
  )
  history.push(...myCompleted)

  // SINGLES: Requests I processed (approved/rejected/pending_coach)
  const processed = processedRequestsData.value.filter(r =>
    r.status === 'approved' || r.status === 'rejected' || r.status === 'pending_coach'
  )
  history.push(...processed)

  // Sort by createdAt descending and dedupe
  const uniqueHistory = [...new Map(history.map(r => [r.id, r])).values()]
  return uniqueHistory.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0
    const bTime = b.createdAt?.toMillis?.() || 0
    return bTime - aTime
  })
})

// Computed: DOUBLES History requests only
const doublesHistoryRequests = computed(() => {
  if (!userStore.userData?.id) return []

  const history = []
  const userId = userStore.userData.id

  // DOUBLES: My created doubles requests (approved/rejected only)
  const completedMyDoubles = myDoublesRequests.value.filter(r =>
    r.status === 'approved' || r.status === 'rejected'
  ).map(r => ({ ...r, matchType: 'doubles' }))
  history.push(...completedMyDoubles)

  // DOUBLES: Requests I'm involved in (but not initiator): approved/rejected/pending_coach
  const completedDoublesInvolved = doublesInvolvedRequests.value.filter(r => {
    const isInTeamA = r.teamA?.player1Id === userId || r.teamA?.player2Id === userId
    const isInTeamB = r.teamB?.player1Id === userId || r.teamB?.player2Id === userId
    const isInvolved = isInTeamA || isInTeamB
    const isInitiator = r.initiatedBy === userId
    return isInvolved && !isInitiator && (r.status === 'approved' || r.status === 'rejected' || r.status === 'pending_coach')
  }).map(r => ({ ...r, matchType: 'doubles' }))
  history.push(...completedDoublesInvolved)

  // Sort by createdAt descending and dedupe
  const uniqueHistory = [...new Map(history.map(r => [r.id, r])).values()]
  return uniqueHistory.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0
    const bTime = b.createdAt?.toMillis?.() || 0
    return bTime - aTime
  })
})

// Computed: All History requests (Combined - for backwards compatibility)
const allHistoryRequests = computed(() => {
  return [...singlesHistoryRequests.value, ...doublesHistoryRequests.value]
})

// Computed with show more/less
const historyRequests = computed(() => {
  if (showAllRequests.value) {
    return allHistoryRequests.value
  }
  return allHistoryRequests.value.slice(0, INITIAL_REQUESTS_SHOWN)
})

// Toggle and counts for request history
const totalRequestsCount = computed(() => allHistoryRequests.value.length)
const hasMoreRequests = computed(() => totalRequestsCount.value > INITIAL_REQUESTS_SHOWN)

function toggleShowAllRequests() {
  showAllRequests.value = !showAllRequests.value
}

// Helper to check if I'm the requester (playerA)
function isMyRequest(request) {
  return request.playerAId === userStore.userData?.id
}

// NOTE: Doubles requests are now loaded in loadMatchRequests() function above
// Old incomingDoublesQuery removed - now using manual onSnapshot in loadMatchRequests()

// Match history (singles) - enriched with opponent names and elo changes
const enrichedMatchHistory = ref([])
const loadingHistory = ref(true)
const showAllHistory = ref(false)
const INITIAL_MATCHES_SHOWN = 4
let matchHistoryUnsubscribe = null

// Load and enrich match history
async function loadMatchHistory() {
  if (!userStore.clubId || !userStore.userData?.id) {
    loadingHistory.value = false
    return
  }

  loadingHistory.value = true

  const matchesQuery = query(
    collection(db, 'matches'),
    where('clubId', '==', userStore.clubId),
    where('processed', '==', true),
    limit(100)
  )

  matchHistoryUnsubscribe = onSnapshot(matchesQuery, async (snapshot) => {
    const userId = userStore.userData.id

    // Filter matches for current user
    const userMatches = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(match => {
        return (
          match.winnerId === userId ||
          match.loserId === userId ||
          match.playerAId === userId ||
          match.playerBId === userId ||
          (match.playerIds && match.playerIds.includes(userId))
        )
      })
      .sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || a.playedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
        const timeB = b.timestamp?.toMillis?.() || b.playedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
        return timeB - timeA
      })
      .slice(0, 20)

    // Enrich each match with opponent name and elo change
    const enrichedMatches = await Promise.all(
      userMatches.map(match => enrichMatchData(match, userId))
    )

    enrichedMatchHistory.value = enrichedMatches
    loadingHistory.value = false
  }, (error) => {
    console.error('Error loading match history:', error)
    loadingHistory.value = false
  })
}

// Enrich match with opponent name and elo change
async function enrichMatchData(match, userId) {
  const enriched = { ...match }

  // Determine opponent ID
  const opponentId = match.winnerId === userId ? match.loserId : match.winnerId

  // Fetch opponent name
  if (opponentId) {
    try {
      const opponentDoc = await getDoc(doc(db, 'users', opponentId))
      if (opponentDoc.exists()) {
        const data = opponentDoc.data()
        enriched.opponentName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unbekannt'
      } else {
        enriched.opponentName = 'Unbekannt'
      }
    } catch (error) {
      enriched.opponentName = 'Gegner'
    }
  } else {
    enriched.opponentName = 'Unbekannt'
  }

  // Fetch elo change from pointsHistory
  try {
    const historyQuery = query(
      collection(db, 'users', userId, 'pointsHistory'),
      orderBy('timestamp', 'desc'),
      limit(200)
    )
    const historySnapshot = await getDocs(historyQuery)
    const matchTime = match.timestamp?.toMillis?.() || match.playedAt?.toMillis?.() || 0

    for (const historyDoc of historySnapshot.docs) {
      const historyData = historyDoc.data()
      const historyTime = historyData.timestamp?.toMillis?.() || 0

      // Check if this is a match history entry
      const isMatchHistory = historyData.awardedBy === 'System (Wettkampf)' ||
        (historyData.reason && (
          historyData.reason.includes('Sieg im') ||
          historyData.reason.includes('Niederlage im')
        ))

      // Match by timestamp proximity (within 30 seconds)
      if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
        enriched.eloChange = historyData.eloChange || 0
        enriched.pointsGained = historyData.points || 0
        break
      }
    }
  } catch (error) {
    console.warn('Could not fetch points history for match:', error)
  }

  // Determine if user won
  enriched.isWinner = match.winnerId === userId

  return enriched
}

// Computed for template compatibility - with show more/less
const matchHistory = computed(() => {
  if (showAllHistory.value) {
    return enrichedMatchHistory.value
  }
  return enrichedMatchHistory.value.slice(0, INITIAL_MATCHES_SHOWN)
})

// Total matches count for toggle button
const totalMatchesCount = computed(() => enrichedMatchHistory.value.length)
const hasMoreMatches = computed(() => totalMatchesCount.value > INITIAL_MATCHES_SHOWN)

function toggleShowAllHistory() {
  showAllHistory.value = !showAllHistory.value
}

// Doubles match history - load all club doubles to avoid index requirement
const allDoublesQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'doublesMatches'),
    where('clubId', '==', userStore.clubId),
    limit(100)
  )
})
const allDoubles = useCollection(allDoublesQuery)

// Also load approved doubles requests (backwards compatibility for old coach UI)
const allDoublesRequestsQuery = computed(() => {
  if (!userStore.clubId) return null
  return query(
    collection(db, 'doublesMatchRequests'),
    where('clubId', '==', userStore.clubId),
    where('status', '==', 'approved'),
    limit(100)
  )
})
const allDoublesRequests = useCollection(allDoublesRequestsQuery)

// Filter and sort doubles for current user (client-side to avoid index)
const doublesHistory = computed(() => {
  if (!userStore.userData?.id) return []

  const matches = allDoubles.value || []
  const requests = allDoublesRequests.value || []

  // Combine matches and approved requests
  const combined = [
    ...matches.filter(match => {
      // Filter matches (new format from Functions)
      const hasStatusField = 'status' in match
      const hasProcessedField = 'processed' in match

      if (hasStatusField || hasProcessedField) {
        if (match.status !== 'approved' && match.processed !== true) {
          return false
        }
      }

      const userInPlayerIds = match.playerIds && match.playerIds.includes(userStore.userData.id)
      const userInTeams = (
        match.teamA?.player1Id === userStore.userData.id ||
        match.teamA?.player2Id === userStore.userData.id ||
        match.teamB?.player1Id === userStore.userData.id ||
        match.teamB?.player2Id === userStore.userData.id
      )

      return userInPlayerIds || userInTeams
    }),
    ...requests.filter(request => {
      // Filter approved requests (old format from Coach UI)
      // Check if request was already converted to match
      if (request.processedMatchId) return false

      const userInTeams = (
        request.teamA?.player1Id === userStore.userData.id ||
        request.teamA?.player2Id === userStore.userData.id ||
        request.teamB?.player1Id === userStore.userData.id ||
        request.teamB?.player2Id === userStore.userData.id
      )

      return userInTeams
    })
  ]

  const filtered = combined
    .sort((a, b) => {
      const timeA = a.timestamp?.toMillis?.() || a.playedAt?.toMillis?.() || a.approvedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0
      const timeB = b.timestamp?.toMillis?.() || b.playedAt?.toMillis?.() || b.approvedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0
      return timeB - timeA
    })
    .slice(0, 10)

  // Debug output
  console.log('Doubles history:', {
    matchesCount: matches.length,
    requestsCount: requests.length,
    combinedCount: combined.length,
    filteredCount: filtered.length,
    userId: userStore.userData?.id,
    sample: filtered[0] || 'No matches'
  })

  return filtered
})

// Validate set scores
function validateSets() {
  const validSets = []
  let hasErrors = false

  for (let i = 0; i < sets.value.length; i++) {
    const s = sets.value[i]
    const a = parseInt(s.playerA) || 0
    const b = parseInt(s.playerB) || 0
    const validation = isValidSet(a, b)

    if (validation.error) {
      hasErrors = true
    }

    if (validation.valid && validation.complete) {
      validSets.push(s)
    }
  }

  if (hasErrors) {
    return { valid: false, error: 'Bitte korrigiere die ungültigen Sätze' }
  }

  if (validSets.length < currentMode.value.setsToWin) {
    return { valid: false, error: `Mindestens ${currentMode.value.setsToWin} gültige Sätze benötigt` }
  }

  // Check winner
  let playerAWins = 0
  let playerBWins = 0
  validSets.forEach(s => {
    const a = parseInt(s.playerA) || 0
    const b = parseInt(s.playerB) || 0
    if (a > b) playerAWins++
    else playerBWins++
  })

  if (playerAWins < currentMode.value.setsToWin && playerBWins < currentMode.value.setsToWin) {
    return { valid: false, error: `Kein Spieler hat ${currentMode.value.setsToWin} Sätze gewonnen` }
  }

  return { valid: true, sets: validSets, winner: playerAWins >= currentMode.value.setsToWin ? 'A' : 'B' }
}

// Submit singles match request
async function submitSinglesRequest() {
  if (!selectedOpponent.value || submitting.value) return

  const validation = validateSets()
  if (!validation.valid) {
    feedback.value = { message: validation.error, type: 'error' }
    return
  }

  submitting.value = true
  const opponent = clubPlayers.value.find(p => p.id === selectedOpponent.value)

  // Determine winner and loser IDs
  const winnerId = validation.winner === 'A' ? userStore.userData.id : selectedOpponent.value
  const loserId = validation.winner === 'A' ? selectedOpponent.value : userStore.userData.id

  try {
    await addDoc(collection(db, 'matchRequests'), {
      status: 'pending_player',
      playerAId: userStore.userData.id,
      playerBId: selectedOpponent.value,
      playerAName: `${userStore.userData.firstName} ${userStore.userData.lastName}`,
      playerBName: `${opponent.firstName} ${opponent.lastName}`,
      winnerId,
      loserId,
      handicapUsed: useHandicap.value,
      handicapPoints: useHandicap.value && handicapInfo.value ? handicapInfo.value.points : 0,
      handicapPlayer: useHandicap.value && handicapInfo.value ? handicapInfo.value.weakerPlayerSide : null,
      matchMode: matchMode.value,
      clubId: userStore.clubId,
      sets: validation.sets.map(s => ({ playerA: parseInt(s.playerA), playerB: parseInt(s.playerB) })),
      approvals: {
        playerB: { status: null, timestamp: null },
        coach: { status: null, timestamp: null }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      requestedBy: userStore.userData.id
    })

    feedback.value = { message: 'Anfrage gesendet! Der Gegner muss bestätigen.', type: 'success' }
    resetForm()
  } catch (error) {
    console.error('Error creating match request:', error)
    feedback.value = { message: 'Fehler beim Senden der Anfrage', type: 'error' }
  } finally {
    submitting.value = false
  }
}

// Submit doubles match request
async function submitDoublesRequest() {
  if (!selectedPartner.value || !selectedOpponent1.value || !selectedOpponent2.value || submitting.value) return

  // Validate all players are different
  const allIds = [userStore.userData.id, selectedPartner.value, selectedOpponent1.value, selectedOpponent2.value]
  if (new Set(allIds).size !== 4) {
    feedback.value = { message: 'Alle 4 Spieler müssen unterschiedlich sein!', type: 'error' }
    return
  }

  // Check if at least one opponent has online access
  const opponent1HasAccess = hasOnlineAccess(selectedOpponent1.value)
  const opponent2HasAccess = hasOnlineAccess(selectedOpponent2.value)

  if (!opponent1HasAccess && !opponent2HasAccess) {
    feedback.value = {
      message: 'Mindestens einer der Gegner muss Online-Zugriff haben, um die Anfrage bestätigen zu können!',
      type: 'error'
    }
    return
  }

  const validation = validateSets()
  if (!validation.valid) {
    feedback.value = { message: validation.error, type: 'error' }
    return
  }

  submitting.value = true

  try {
    const [partnerDoc, opp1Doc, opp2Doc] = await Promise.all([
      getDoc(doc(db, 'users', selectedPartner.value)),
      getDoc(doc(db, 'users', selectedOpponent1.value)),
      getDoc(doc(db, 'users', selectedOpponent2.value))
    ])

    const partner = partnerDoc.data()
    const opp1 = opp1Doc.data()
    const opp2 = opp2Doc.data()

    // Debug: Log all player data
    console.log('Creating doubles request:', {
      currentUser: {
        id: userStore.userData.id,
        clubId: userStore.userData.clubId,
        grundlagen: userStore.userData.grundlagenCompleted
      },
      partner: {
        id: selectedPartner.value,
        clubId: partner?.clubId,
        grundlagen: partner?.grundlagenCompleted
      },
      opponent1: {
        id: selectedOpponent1.value,
        clubId: opp1?.clubId,
        grundlagen: opp1?.grundlagenCompleted,
        isOffline: opp1?.isOffline
      },
      opponent2: {
        id: selectedOpponent2.value,
        clubId: opp2?.clubId,
        grundlagen: opp2?.grundlagenCompleted,
        isOffline: opp2?.isOffline
      }
    })

    // Create pairing IDs (sorted)
    const teamAPairingId = [userStore.userData.id, selectedPartner.value].sort().join('_')
    const teamBPairingId = [selectedOpponent1.value, selectedOpponent2.value].sort().join('_')

    await addDoc(collection(db, 'doublesMatchRequests'), {
      teamA: {
        player1Id: userStore.userData.id,
        player2Id: selectedPartner.value,
        player1Name: `${userStore.userData.firstName} ${userStore.userData.lastName}`,
        player2Name: `${partner.firstName} ${partner.lastName}`,
        pairingId: teamAPairingId
      },
      teamB: {
        player1Id: selectedOpponent1.value,
        player2Id: selectedOpponent2.value,
        player1Name: `${opp1.firstName} ${opp1.lastName}`,
        player2Name: `${opp2.firstName} ${opp2.lastName}`,
        pairingId: teamBPairingId
      },
      winningTeam: validation.winner,
      winningPairingId: validation.winner === 'A' ? teamAPairingId : teamBPairingId,
      losingPairingId: validation.winner === 'A' ? teamBPairingId : teamAPairingId,
      sets: validation.sets.map(s => ({ teamA: parseInt(s.playerA), teamB: parseInt(s.playerB) })),
      matchMode: matchMode.value,
      initiatedBy: userStore.userData.id,
      status: 'pending_opponent',
      clubId: userStore.clubId,
      playerIds: allIds,
      createdAt: serverTimestamp()
    })

    feedback.value = { message: 'Doppel-Anfrage gesendet! Ein Gegner muss bestätigen.', type: 'success' }
    resetForm()
  } catch (error) {
    console.error('Error creating doubles request:', error)
    feedback.value = { message: 'Fehler beim Senden der Doppel-Anfrage', type: 'error' }
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  selectedOpponent.value = ''
  selectedPartner.value = ''
  selectedOpponent1.value = ''
  selectedOpponent2.value = ''
  sets.value = Array.from({ length: currentMode.value.setsToWin }, () => ({ playerA: '', playerB: '' }))
  setTimeout(() => { feedback.value = { message: '', type: '' } }, 3000)
}

function formatDate(timestamp) {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function didWin(match) {
  // Use enriched isWinner if available, otherwise fallback
  if (match.isWinner !== undefined) return match.isWinner
  return match.winnerId === userStore.userData?.id
}

function isPlayerA(match) {
  // Check if current user is playerA
  return match.playerAId === userStore.userData?.id
}

function getOpponentName(match) {
  // Use enriched opponentName if available
  if (match.opponentName) return match.opponentName
  return 'Unbekannt'
}

function formatSets(match) {
  if (!match.sets || match.sets.length === 0) return 'N/A'

  const userIsPlayerA = isPlayerA(match)

  return match.sets.map(set => {
    // Check if it's doubles format (teamA/teamB) or singles (playerA/playerB)
    if (set.teamA !== undefined && set.teamB !== undefined) {
      const myScore = userIsPlayerA ? set.teamA : set.teamB
      const oppScore = userIsPlayerA ? set.teamB : set.teamA
      return `${myScore}:${oppScore}`
    } else {
      const myScore = userIsPlayerA ? set.playerA : set.playerB
      const oppScore = userIsPlayerA ? set.playerB : set.playerA
      return `${myScore}:${oppScore}`
    }
  }).join(', ')
}

function getEloChange(match) {
  // Use enriched eloChange if available
  if (match.eloChange !== undefined) return match.eloChange

  // Fallback: return 0 if not enriched
  return 0
}

function formatLastPlayed(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : date.toDate?.() || new Date(date)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

function getHandicapInfo(player) {
  const myElo = userStore.userData?.eloRating || 1000
  const playerElo = player.eloRating || 1000
  const eloDiff = Math.abs(myElo - playerElo)
  const handicapPoints = Math.min(Math.round(eloDiff / 50), 10)
  const weakerPlayerIsMe = myElo < playerElo
  const weakerPlayerName = weakerPlayerIsMe ? 'Du' : player.firstName
  return `${weakerPlayerName} ${handicapPoints} Punkt${handicapPoints === 1 ? '' : 'e'}/Satz`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Match Suggestions (collapsible) -->
    <div v-if="matchType === 'singles'" class="bg-white rounded-xl shadow-md overflow-hidden">
      <!-- Header - clickable to toggle -->
      <button
        @click="showSuggestions = !showSuggestions"
        class="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <span class="text-xl">💡</span>
          Gegner-Vorschläge
          <span v-if="matchSuggestions.length > 0" class="text-sm text-gray-500 font-normal">({{ matchSuggestions.length }})</span>
        </h3>
        <span class="text-gray-400 text-xl">{{ showSuggestions ? '−' : '+' }}</span>
      </button>

      <!-- Collapsible Content -->
      <div v-show="showSuggestions" class="px-6 pb-6">
        <!-- Not match-ready warning -->
        <div v-if="!isMatchReady" class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div class="flex items-start">
            <span class="text-xl mr-3">🔒</span>
            <div>
              <p class="font-medium text-yellow-800">Match-Vorschläge gesperrt!</p>
              <p class="text-sm text-yellow-700 mt-1">
                Du musst zuerst <strong>5 Grundlagen-Übungen</strong> absolvieren.<br>
                Fortschritt: <strong>{{ userStore.userData?.grundlagenCompleted || 0 }}/5</strong> abgeschlossen.
              </p>
            </div>
          </div>
        </div>

        <!-- Loading state -->
        <div v-else-if="loadingSuggestions" class="text-center py-4 text-gray-500">
          Lade Vorschläge...
        </div>

        <!-- No suggestions -->
        <div v-else-if="!matchSuggestions.length" class="text-center py-4 text-gray-500">
          Keine Vorschläge verfügbar
        </div>

        <!-- Suggestions list -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            v-for="player in matchSuggestions"
            :key="player.id"
            @click="selectSuggestion(player)"
            class="bg-gray-50 border border-indigo-200 rounded-lg p-3 cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition"
          >
            <div class="flex justify-between items-start">
              <div>
                <p class="font-semibold text-gray-800">{{ player.firstName }} {{ player.lastName }}</p>
                <p class="text-sm text-gray-600">Elo: {{ Math.round(player.eloRating || 1000) }}</p>
              </div>
              <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                {{ player.eloDiff > 0 ? `±${Math.round(player.eloDiff)}` : '≈' }}
              </span>
            </div>
            <div class="text-xs text-gray-600 mt-2">
              <span v-if="player.history.matchCount === 0" class="text-purple-700 font-medium">
                ⭐ Noch nie gespielt
              </span>
              <span v-else>
                {{ player.history.matchCount }} Match{{ player.history.matchCount === 1 ? '' : 'es' }}
                <span v-if="player.history.lastMatchDate">, zuletzt {{ formatLastPlayed(player.history.lastMatchDate) }}</span>
              </span>
            </div>
            <!-- Handicap info -->
            <div v-if="player.eloDiff >= 25" class="text-xs text-blue-600 mt-1">
              ⚖️ Handicap: {{ getHandicapInfo(player) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Match Type Toggle -->
    <div class="flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100">
      <button
        @click="matchType = 'singles'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="matchType === 'singles' ? 'bg-white shadow text-indigo-600' : 'text-gray-600'"
      >
        Einzel
      </button>
      <button
        @click="matchType = 'doubles'"
        class="flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors"
        :class="matchType === 'doubles' ? 'bg-white shadow text-purple-600' : 'text-gray-600'"
      >
        Doppel
      </button>
    </div>

    <!-- Feedback Message -->
    <div
      v-if="feedback.message"
      class="px-4 py-3 rounded"
      :class="feedback.type === 'success' ? 'bg-green-100 border border-green-300 text-green-700' : 'bg-red-100 border border-red-300 text-red-700'"
    >
      {{ feedback.message }}
    </div>

    <!-- Request Form -->
    <div class="bg-white p-6 rounded-xl shadow-md">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">
        {{ matchType === 'singles' ? 'Einzel-Match anfragen' : 'Doppel-Match anfragen' }}
      </h3>

      <form @submit.prevent="matchType === 'singles' ? submitSinglesRequest() : submitDoublesRequest()" class="space-y-4">
        <!-- Singles: Opponent Selection -->
        <div v-if="matchType === 'singles'">
          <label class="block text-sm font-medium text-gray-700 mb-1">Gegner</label>
          <select v-model="selectedOpponent" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option value="">-- Gegner wählen --</option>
            <option v-for="player in availableOpponents" :key="player.id" :value="player.id">
              {{ player.firstName }} {{ player.lastName }} ({{ player.eloRating || 1000 }} Elo)
            </option>
          </select>

          <!-- Handicap Suggestion -->
          <div v-if="handicapInfo" class="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-blue-600 text-lg">⚖️</span>
                <div>
                  <p class="text-sm font-medium text-blue-800">Handicap-Vorschlag</p>
                  <p class="text-xs text-blue-600">{{ handicapInfo.text }}</p>
                </div>
              </div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="useHandicap"
                  class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span class="text-sm font-medium text-blue-700">Anwenden</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Doubles: Player Selections -->
        <template v-if="matchType === 'doubles'">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Dein Partner</label>
            <select v-model="selectedPartner" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">-- Partner wählen --</option>
              <option v-for="player in availableOpponents" :key="player.id" :value="player.id">
                {{ player.firstName }} {{ player.lastName }} ({{ Math.round(player.doublesEloRating || 800) }} Doppel-Elo)
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Gegner 1
              <span class="text-xs text-gray-500 ml-1">(min. 1 muss online sein)</span>
            </label>
            <select v-model="selectedOpponent1" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">-- Gegner 1 wählen --</option>
              <option v-for="player in availableOpponents" :key="player.id" :value="player.id">
                {{ player.firstName }} {{ player.lastName }} ({{ Math.round(player.doublesEloRating || 800) }} Doppel-Elo){{ hasOnlineAccess(player.id) ? ' 🟢' : ' ⚫' }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Gegner 2
              <span class="text-xs text-gray-500 ml-1">(min. 1 muss online sein)</span>
            </label>
            <select v-model="selectedOpponent2" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">-- Gegner 2 wählen --</option>
              <option v-for="player in availableOpponents" :key="player.id" :value="player.id">
                {{ player.firstName }} {{ player.lastName }} ({{ Math.round(player.doublesEloRating || 800) }} Doppel-Elo){{ hasOnlineAccess(player.id) ? ' 🟢' : ' ⚫' }}
              </option>
            </select>
          </div>
          <!-- Online access warning -->
          <div v-if="selectedOpponent1 && selectedOpponent2 && !hasOnlineAccess(selectedOpponent1) && !hasOnlineAccess(selectedOpponent2)" class="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <div class="flex items-center gap-2">
              <span class="text-yellow-600">⚠️</span>
              <p class="text-sm text-yellow-800">
                Keiner der Gegner hat Online-Zugriff. Mindestens einer muss online sein, um die Anfrage zu bestätigen!
              </p>
            </div>
          </div>
        </template>

        <!-- Match Mode -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Match-Modus</label>
          <select v-model="matchMode" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option v-for="mode in matchModes" :key="mode.id" :value="mode.id">
              {{ mode.label }}
            </option>
          </select>
        </div>

        <!-- Set Scores -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Satz-Ergebnisse</label>
          <div v-for="(set, index) in sets" :key="index" class="mb-3">
            <div class="flex items-center gap-3">
              <span class="text-sm font-medium text-gray-700 w-16">Satz {{ index + 1 }}:</span>
              <input
                v-model="set.playerA"
                type="number"
                min="0"
                max="99"
                placeholder="0"
                @input="handleSetInput"
                class="w-20 px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
                :class="setErrors[index] ? 'border-red-500 bg-red-50' : 'border-gray-300'"
              />
              <span class="text-gray-500">:</span>
              <input
                v-model="set.playerB"
                type="number"
                min="0"
                max="99"
                placeholder="0"
                @input="handleSetInput"
                class="w-20 px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
                :class="setErrors[index] ? 'border-red-500 bg-red-50' : 'border-gray-300'"
              />
            </div>
            <p v-if="setErrors[index]" class="text-xs text-red-600 mt-1 ml-16">
              {{ setErrors[index] }}
            </p>
          </div>
          <p class="text-xs text-gray-500 mt-2">
            {{ matchType === 'singles' ? 'Du' : 'Dein Team' }} = links, {{ matchType === 'singles' ? 'Gegner' : 'Gegner-Team' }} = rechts
          </p>
          <p class="text-xs text-gray-400 mt-1">
            Tischtennis-Regeln: Satz bis 11, ab 10:10 muss der Unterschied 2 Punkte sein
          </p>
        </div>

        <button
          type="submit"
          :disabled="submitting"
          class="w-full py-3 text-white font-semibold rounded-lg disabled:opacity-50"
          :class="matchType === 'singles' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-purple-600 hover:bg-purple-700'"
        >
          {{ submitting ? 'Wird gesendet...' : 'Anfrage senden' }}
        </button>
      </form>
    </div>

    <!-- Singles Content -->
    <template v-if="matchType === 'singles'">
      <!-- Pending Requests (Ausstehend) -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">
          ⏳ Ausstehende Einzel-Anfragen
          <span v-if="singlesPendingRequests?.length" class="text-yellow-600">({{ singlesPendingRequests.length }})</span>
        </h3>
        <div v-if="singlesPendingRequests?.length" class="space-y-2">
          <MatchRequestCard
            v-for="request in singlesPendingRequests"
            :key="request.id"
            :request="request"
            :type="isMyRequest(request) ? 'outgoing' : 'incoming'"
          />
        </div>
        <p v-else class="text-gray-500 text-center py-4">Keine ausstehenden Einzel-Anfragen</p>
      </div>

      <!-- Request History (Anfragen-Historie) -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">
          📋 Einzel Anfragen-Historie
          <span v-if="singlesHistoryRequests?.length" class="text-gray-500">({{ singlesHistoryRequests.length }})</span>
        </h3>
        <div v-if="singlesHistoryRequests?.length" class="space-y-2">
          <div
            v-for="request in singlesHistoryRequests.slice(0, showAllRequests ? undefined : INITIAL_REQUESTS_SHOWN)"
            :key="request.id"
            class="bg-gray-50 p-4 rounded-lg border border-gray-200"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center"
                  :class="request.status === 'approved' ? 'bg-green-100' : request.status === 'rejected' ? 'bg-red-100' : 'bg-yellow-100'">
                  <span :class="request.status === 'approved' ? 'text-green-600' : request.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'">
                    {{ request.status === 'approved' ? '✓' : request.status === 'rejected' ? '✕' : '⏳' }}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-gray-900">
                    {{ isMyRequest(request) ? request.playerBName : request.playerAName }}
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ formatDate(request.createdAt) }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <span
                  class="px-2 py-1 rounded text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-700': request.status === 'approved',
                    'bg-red-100 text-red-700': request.status === 'rejected',
                    'bg-yellow-100 text-yellow-700': request.status === 'pending_coach'
                  }"
                >
                  {{ request.status === 'approved' ? 'Bestätigt' : request.status === 'rejected' ? 'Abgelehnt' : 'Wartet auf Coach' }}
                </span>
              </div>
            </div>
            <!-- Set scores -->
            <div v-if="request.sets?.length" class="mt-2 text-sm text-gray-600">
              Sätze: {{ request.sets.map(s => `${s.playerA}:${s.playerB}`).join(', ') }}
            </div>
            <!-- Handicap info -->
            <div v-if="request.handicapUsed && request.handicapPoints" class="mt-2 flex items-center gap-2 text-sm">
              <span class="text-blue-600">⚖️</span>
              <span class="text-blue-700 font-medium">
                Handicap: {{ request.handicapPoints }} Punkt{{ request.handicapPoints === 1 ? '' : 'e' }} für
                {{ request.handicapPlayer === 'A'
                  ? (isMyRequest(request) ? 'Dich' : request.playerAName)
                  : (isMyRequest(request) ? request.playerBName : 'Dich')
                }}
              </span>
            </div>
          </div>
          <!-- Toggle Button -->
          <div v-if="singlesHistoryRequests.length > INITIAL_REQUESTS_SHOWN" class="text-center mt-4">
            <button
              @click="toggleShowAllRequests"
              class="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors"
            >
              {{ showAllRequests
                ? '− Weniger anzeigen'
                : `+ ${singlesHistoryRequests.length - INITIAL_REQUESTS_SHOWN} weitere Anfragen anzeigen`
              }}
            </button>
          </div>
        </div>
        <p v-else class="text-gray-500 text-center py-4">Keine Einzel Anfragen-Historie</p>
      </div>

      <!-- Match History -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">📜 Match-Historie (Einzel)</h3>
        <!-- Loading state -->
        <div v-if="loadingHistory" class="text-center py-4 text-gray-500">
          Lade Match-Historie...
        </div>
        <div v-else-if="matchHistory?.length" class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="text-left text-sm text-gray-500 border-b">
                <th class="pb-2">Datum</th>
                <th class="pb-2">Gegner</th>
                <th class="pb-2">Sätze</th>
                <th class="pb-2">Elo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="match in matchHistory" :key="match.id" class="border-b border-gray-100">
                <td class="py-3 text-sm">{{ formatDate(match.timestamp || match.playedAt || match.createdAt) }}</td>
                <td class="py-3 font-medium">
                  {{ getOpponentName(match) }}
                </td>
                <td class="py-3">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-1 rounded text-xs font-medium" :class="didWin(match) ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'">
                        {{ didWin(match) ? 'S' : 'N' }}
                      </span>
                      <span class="text-sm font-medium text-gray-800">{{ formatSets(match) }}</span>
                    </div>
                    <div v-if="match.handicapUsed" class="flex items-center gap-1 text-xs text-blue-600">
                      <span>⚖️</span>
                      <span v-if="match.handicapPoints && match.handicapPlayer">
                        Handicap: {{ match.handicapPoints }}P für {{ match.handicapPlayer === 'A' ? (isPlayerA(match) ? 'Dich' : getOpponentName(match)) : (isPlayerA(match) ? getOpponentName(match) : 'Dich') }}
                      </span>
                      <span v-else>Handicap verwendet</span>
                    </div>
                  </div>
                </td>
                <td class="py-3 text-sm" :class="getEloChange(match) >= 0 ? 'text-green-600' : 'text-red-600'">
                  {{ getEloChange(match) >= 0 ? '+' : '' }}{{ getEloChange(match) }}
                </td>
              </tr>
            </tbody>
          </table>
          <!-- Toggle Button -->
          <div v-if="hasMoreMatches" class="text-center mt-4">
            <button
              @click="toggleShowAllHistory"
              class="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors"
            >
              {{ showAllHistory
                ? '− Weniger anzeigen'
                : `+ ${totalMatchesCount - INITIAL_MATCHES_SHOWN} weitere Wettkämpfe anzeigen`
              }}
            </button>
          </div>
        </div>
        <p v-else class="text-gray-500 text-center py-4">Noch keine Einzel-Matches gespielt</p>
      </div>
    </template>

    <!-- Doubles Content -->
    <template v-if="matchType === 'doubles'">
      <!-- Pending Doubles Requests (Ausstehend) -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">
          ⏳ Ausstehende Doppel-Anfragen
          <span v-if="doublesPendingRequests?.length" class="text-yellow-600">({{ doublesPendingRequests.length }})</span>
        </h3>
        <div v-if="doublesPendingRequests?.length" class="space-y-2">
          <div
            v-for="request in doublesPendingRequests"
            :key="request.id"
            class="bg-purple-50 p-4 rounded-lg border border-purple-200"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-gray-900 text-sm mb-1">
                  <span class="text-indigo-700">{{ request.teamA?.player1Name }} & {{ request.teamA?.player2Name }}</span>
                  <span class="text-gray-500 mx-2">vs</span>
                  <span class="text-orange-700">{{ request.teamB?.player1Name }} & {{ request.teamB?.player2Name }}</span>
                </p>
                <p class="text-xs text-gray-500">{{ formatDate(request.createdAt) }}</p>
                <!-- Set scores -->
                <div v-if="request.sets?.length" class="mt-2 text-sm text-gray-600">
                  Sätze: {{ request.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ') }}
                </div>
              </div>
              <div class="text-right">
                <span
                  class="px-2 py-1 rounded text-xs font-medium"
                  :class="{
                    'bg-yellow-100 text-yellow-700': request.status === 'pending_opponent',
                    'bg-orange-100 text-orange-700': request.status === 'pending_coach'
                  }"
                >
                  {{ request.status === 'pending_opponent' ? 'Wartet auf Gegner' : 'Wartet auf Coach' }}
                </span>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="text-gray-500 text-center py-4">Keine ausstehenden Doppel-Anfragen</p>
      </div>

      <!-- Doubles Request History (Anfragen-Historie) -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">
          📋 Doppel Anfragen-Historie
          <span v-if="doublesHistoryRequests?.length" class="text-gray-500">({{ doublesHistoryRequests.length }})</span>
        </h3>
        <div v-if="doublesHistoryRequests?.length" class="space-y-2">
          <div
            v-for="request in doublesHistoryRequests.slice(0, showAllRequests ? undefined : INITIAL_REQUESTS_SHOWN)"
            :key="request.id"
            class="bg-purple-50 p-4 rounded-lg border border-purple-200"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center"
                  :class="request.status === 'approved' ? 'bg-green-100' : request.status === 'rejected' ? 'bg-red-100' : 'bg-yellow-100'">
                  <span :class="request.status === 'approved' ? 'text-green-600' : request.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'">
                    {{ request.status === 'approved' ? '✓' : request.status === 'rejected' ? '✕' : '⏳' }}
                  </span>
                </div>
                <div>
                  <p class="font-medium text-gray-900 text-sm">
                    <span class="text-indigo-700">{{ request.teamA?.player1Name }} & {{ request.teamA?.player2Name }}</span>
                    <span class="text-gray-500 text-xs mx-1">vs</span>
                    <span class="text-orange-700">{{ request.teamB?.player1Name }} & {{ request.teamB?.player2Name }}</span>
                  </p>
                  <p class="text-xs text-gray-500">
                    {{ formatDate(request.createdAt) }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <span
                  class="px-2 py-1 rounded text-xs font-medium"
                  :class="{
                    'bg-green-100 text-green-700': request.status === 'approved',
                    'bg-red-100 text-red-700': request.status === 'rejected',
                    'bg-yellow-100 text-yellow-700': request.status === 'pending_coach'
                  }"
                >
                  {{ request.status === 'approved' ? 'Bestätigt' : request.status === 'rejected' ? 'Abgelehnt' : 'Wartet auf Coach' }}
                </span>
              </div>
            </div>
            <!-- Set scores -->
            <div v-if="request.sets?.length" class="mt-2 text-sm text-gray-600">
              Sätze: {{ request.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ') }}
            </div>
          </div>
          <!-- Toggle Button -->
          <div v-if="doublesHistoryRequests.length > INITIAL_REQUESTS_SHOWN" class="text-center mt-4">
            <button
              @click="toggleShowAllRequests"
              class="text-sm text-purple-600 hover:text-purple-800 font-medium px-4 py-2 rounded-md hover:bg-purple-50 transition-colors"
            >
              {{ showAllRequests
                ? '− Weniger anzeigen'
                : `+ ${doublesHistoryRequests.length - INITIAL_REQUESTS_SHOWN} weitere Anfragen anzeigen`
              }}
            </button>
          </div>
        </div>
        <p v-else class="text-gray-500 text-center py-4">Keine Doppel Anfragen-Historie</p>
      </div>

      <!-- Doubles Match History -->
      <div class="bg-white p-6 rounded-xl shadow-md">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold text-gray-900">🎾 Doppel-Historie</h3>
          <span v-if="(allDoubles?.length || 0) + (allDoublesRequests?.length || 0) > 0" class="text-sm text-gray-500">
            ({{ doublesHistory?.length || 0 }} von {{ (allDoubles?.length || 0) + (allDoublesRequests?.length || 0) }})
          </span>
        </div>
        <div v-if="doublesHistory?.length" class="space-y-3">
          <div
            v-for="match in doublesHistory"
            :key="match.id"
            class="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200"
          >
            <div class="flex justify-between items-start">
              <div>
                <p class="font-semibold text-gray-900">
                  {{ match.teamA?.player1Name || 'Spieler 1' }} & {{ match.teamA?.player2Name || 'Spieler 2' }}
                </p>
                <p class="text-sm text-gray-600">vs</p>
                <p class="font-semibold text-gray-900">
                  {{ match.teamB?.player1Name || 'Spieler 3' }} & {{ match.teamB?.player2Name || 'Spieler 4' }}
                </p>
                <p v-if="!match.teamA?.player1Name" class="text-xs text-red-500 mt-1">
                  ⚠️ Namen fehlen - Match-ID: {{ match.id }}
                </p>
              </div>
              <div class="text-right">
                <span
                  class="px-2 py-1 rounded text-sm font-medium"
                  :class="match.winningTeam === 'A' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ match.winningTeam === 'A' ? 'Team A' : 'Team B' }}
                </span>
                <p class="text-sm font-medium text-gray-800 mt-1">
                  {{ match.sets?.map(s => `${s.teamA}:${s.teamB}`).join(', ') || 'N/A' }}
                </p>
                <p class="text-xs text-gray-500 mt-1">{{ formatDate(match.timestamp || match.playedAt || match.createdAt) }}</p>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-8">
          <p class="text-gray-500 mb-2">Noch keine genehmigten Doppel-Matches</p>
          <p class="text-xs text-gray-400">
            Matches: {{ allDoubles?.length || 0 }} | Genehmigte Anfragen: {{ allDoublesRequests?.length || 0 }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
