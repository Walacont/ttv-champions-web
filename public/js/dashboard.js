import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, writeBatch, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, setupLeaderboardToggle, loadLeaderboard, loadGlobalLeaderboard, renderLeaderboardHTML } from './leaderboard.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- State ---
let currentUserData = null;
let unsubscribes = [];
let currentDisplayDate = new Date();

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await user.getIdToken(true);
            unsubscribes.forEach(unsub => unsub());
            unsubscribes = [];
            try {
                const userDocRef = doc(db, "users", user.uid);
                const initialDocSnap = await getDoc(userDocRef);
                if (!initialDocSnap.exists()) { signOut(auth); return; }
                
                await handleSeasonReset(initialDocSnap.id, initialDocSnap.data());

                const userListener = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const userData = docSnap.data();
                        if (userData.role === 'player') {
                            const isFirstLoad = !currentUserData;
                            currentUserData = { id: docSnap.id, ...userData };
                            if (isFirstLoad) {
                                initializeDashboard(currentUserData);
                            } else {
                                updateDashboard(currentUserData);
                            }
                        } else {
                            window.location.href = userData.role === 'admin' ? '/admin.html' : '/coach.html';
                        }
                    } else { signOut(auth); }
                });
                unsubscribes.push(userListener);
            } catch (error) {
                console.error("Initialer Ladefehler:", error);
                signOut(auth);
            }
        } else {
            window.location.href = '/index.html';
        }
    });
});

function initializeDashboard(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

    // Render leaderboard HTML
    renderLeaderboardHTML('tab-content-leaderboard', {
        showToggle: true,
        showLeagueSelect: false,
        showLeagueIcons: true,
        showSeasonCountdown: true
    });

    loadOverviewData(userData);
    loadProfileData(userData);
    loadExercises();
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
    loadTodaysMatches(userData);

    updateSeasonCountdown();
    setInterval(updateSeasonCountdown, 1000);
    logoutButton.addEventListener('click', () => signOut(auth));
    setupTabs();
    setupLeaderboardToggle();

    // Event Listeners for Modals
    document.getElementById('exercises-list').addEventListener('click', handleExerciseClick);
    document.getElementById('close-exercise-modal').addEventListener('click', closeExerciseModal);
    document.getElementById('exercise-modal').addEventListener('click', (e) => { if (e.target === document.getElementById('exercise-modal')) closeExerciseModal(); });
    
    document.getElementById('challenges-list').addEventListener('click', (e) => {
        const card = e.target.closest('.challenge-card');
        if (card) {
            openChallengeModal(card.dataset);
        }
    });
    document.getElementById('close-challenge-modal').addEventListener('click', () => document.getElementById('challenge-modal').classList.add('hidden'));

    // Calendar listeners
    document.getElementById('prev-month').addEventListener('click', () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); renderCalendar(currentDisplayDate); });
    document.getElementById('next-month').addEventListener('click', () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); renderCalendar(currentDisplayDate); });

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';
}

function updateDashboard(userData) {
    const playerPointsEl = document.getElementById('player-points');
    const statsCurrentStreak = document.getElementById('stats-current-streak');
    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (statsCurrentStreak) statsCurrentStreak.innerHTML = `${userData.streak || 0} 🔥`;

    loadRivalData(userData);
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
}

// --- Navigation ---
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const overviewButton = document.querySelector('.tab-button[data-tab="overview"]');
    
    if (overviewButton) {
        overviewButton.classList.add('tab-active');
        document.getElementById('tab-content-overview').classList.remove('hidden');
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('tab-active'));
            tabContents.forEach(content => content.classList.add('hidden'));
            button.classList.add('tab-active');
            document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
        });
    });
}


// --- Saison & Countdown ---
async function handleSeasonReset(userId, userData) {
    const now = new Date();
    const lastReset = userData.lastSeasonReset?.toDate();
    
    if (!lastReset) {
        await updateDoc(doc(db, 'users', userId), { 
            lastSeasonReset: serverTimestamp(), 
            league: userData.league || 'Bronze' 
        });
        return;
    }

    const lastResetDay = lastReset.getDate();
    const lastResetMonth = lastReset.getMonth();
    const lastResetYear = lastReset.getFullYear();

    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const needsReset = (currentYear > lastResetYear) || 
                       (currentMonth > lastResetMonth) ||
                       (lastResetDay < 15 && currentDay >= 15);

    if (!needsReset) return;
    
    document.getElementById('loader-text').textContent = "Neue Saison startet! Berechne Ergebnisse...";
    document.getElementById('page-loader').style.display = 'flex';

    try {
        const clubId = userData.clubId;
        const batch = writeBatch(db);
        const allPlayersQuery = query(collection(db, "users"), where("clubId", "==", clubId), where("role", "==", "player"));
        const allPlayersSnapshot = await getDocs(allPlayersQuery);
        const allPlayers = allPlayersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const playersByLeague = allPlayers.reduce((acc, player) => {
            const league = player.league || 'Bronze';
            if (!acc[league]) acc[league] = [];
            acc[league].push(player);
            return acc;
        }, {});

        for (const leagueName in playersByLeague) {
            const playersInLeague = playersByLeague[leagueName];
            const sortedPlayers = playersInLeague.sort((a, b) => (b.points || 0) - (a.points || 0));
            const totalPlayers = sortedPlayers.length;
            const leagueKeys = Object.keys(LEAGUES);

            sortedPlayers.forEach((player, index) => {
                const rank = index + 1;
                const playerRef = doc(db, 'users', player.id);
                let newLeague = leagueName;

                if (rank <= PROMOTION_COUNT) {
                    const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                    if (currentLeagueIndex < leagueKeys.length - 1) newLeague = leagueKeys[currentLeagueIndex + 1];
                } else if (rank > totalPlayers - DEMOTION_COUNT && totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
                    const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                    if (currentLeagueIndex > 0) newLeague = leagueKeys[currentLeagueIndex - 1];
                }
                batch.update(playerRef, { points: 0, league: newLeague });
            });
        }
        
        allPlayers.forEach(player => {
            batch.update(doc(db, 'users', player.id), { lastSeasonReset: serverTimestamp() });
        });

        await batch.commit();
    } catch (error) {
        console.error("Fehler beim Saison-Reset:", error);
    }
}

function updateSeasonCountdown() {
    const seasonCountdownEl = document.getElementById('season-countdown');
    const now = new Date();
    let endOfSeason;

    if (now.getDate() < 15) {
        endOfSeason = new Date(now.getFullYear(), now.getMonth(), 15, 0, 0, 0);
    } else {
        endOfSeason = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const diff = endOfSeason - now;
    if (diff <= 0) { 
        if(seasonCountdownEl) seasonCountdownEl.textContent = "Saison beendet!"; 
        setTimeout(() => window.location.reload(), 5000);
        return; 
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    if(seasonCountdownEl) seasonCountdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
}

// --- Data Loading Functions ---
function loadOverviewData(userData) {
    document.getElementById('player-points').textContent = userData.points || 0;
    loadRivalData(userData);
    loadPointsHistory(userData);
    loadChallenges(userData);
}

async function loadRivalData(userData) {
    const rivalInfoEl = document.getElementById('rival-info');
    const q = query(collection(db, "users"), where("clubId", "==", userData.clubId), where("role", "==", "player"), where("league", "==", userData.league || 'Bronze'));
    const querySnapshot = await getDocs(q);
    const players = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const sortedPlayers = players.sort((a, b) => (b.points || 0) - (a.points || 0));
    const myRankIndex = sortedPlayers.findIndex(p => p.id === userData.id);

    if (myRankIndex === 0) {
        if (sortedPlayers.length > 1) {
            const rival = sortedPlayers[1];
            const pointsDiff = (userData.points || 0) - (rival.points || 0);
            rivalInfoEl.innerHTML = `
                <p class="font-semibold text-lg">${rival.firstName} ${rival.lastName}</p>
                <p class="text-sm">Punkte: ${rival.points || 0}</p>
                <p class="text-sm text-green-600 font-medium">Du hast einen Vorsprung von ${pointsDiff} Punkten!</p>
            `;
        } else {
            rivalInfoEl.innerHTML = `<p class="text-green-600 font-semibold">🎉 Du bist alleiniger Herrscher dieser Liga!</p>`;
        }
    } else if (myRankIndex > 0) {
        const rival = sortedPlayers[myRankIndex - 1];
        const pointsDiff = (rival.points || 0) - (userData.points || 0);
        rivalInfoEl.innerHTML = `
            <p class="font-semibold text-lg">${rival.firstName} ${rival.lastName}</p>
            <p class="text-sm">Punkte: ${rival.points || 0}</p>
            <p class="text-sm text-red-500 font-medium">Du benötigst ${pointsDiff} Punkte, um aufzuholen!</p>
        `;
    } else {
        rivalInfoEl.innerHTML = `<p>Keine Ranglistendaten gefunden.</p>`;
    }
}

function loadPointsHistory(userData) {
    const pointsHistoryEl = document.getElementById('points-history');
    const q = query(collection(db, `users/${userData.id}/pointsHistory`), orderBy("timestamp", "desc"));
    const historyListener = onSnapshot(q, (snapshot) => {
        pointsHistoryEl.innerHTML = snapshot.empty ? `<li><p class="text-gray-400">Noch keine Punkte erhalten.</p></li>` : '';
        snapshot.forEach(doc => { const entry = doc.data(); const pointsClass = entry.points >= 0 ? 'text-green-600' : 'text-red-600'; const sign = entry.points >= 0 ? '+' : ''; const date = entry.timestamp ? entry.timestamp.toDate().toLocaleDateString('de-DE') : '...'; const li = document.createElement('li'); li.className = 'flex justify-between items-center text-sm'; li.innerHTML = `<div><p class="font-medium">${entry.reason}</p><p class="text-xs text-gray-500">${date}</p></div><span class="font-bold ${pointsClass}">${sign}${entry.points}</span>`; pointsHistoryEl.appendChild(li); });
    });
    unsubscribes.push(historyListener);
}

function calculateExpiry(createdAt, type) {
    if (!createdAt || !createdAt.toDate) return new Date();
    const startDate = createdAt.toDate();
    const expiryDate = new Date(startDate);
    switch (type) {
        case 'daily': expiryDate.setDate(startDate.getDate() + 1); break;
        case 'weekly': expiryDate.setDate(startDate.getDate() + 7); break;
        case 'monthly': expiryDate.setMonth(startDate.getMonth() + 1); break;
    }
    return expiryDate;
}

async function loadChallenges(userData) {
    const challengesListEl = document.getElementById('challenges-list');
    const completedChallengesSnap = await getDocs(collection(db, `users/${userData.id}/completedChallenges`));
    const completedChallengeIds = completedChallengesSnap.docs.map(doc => doc.id);
    const q = query(collection(db, "challenges"), where("clubId", "==", userData.clubId), where("isActive", "==", true));
    
    const challengesListener = onSnapshot(q, (snapshot) => {
        const now = new Date();
        const activeChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const isCompleted = completedChallengeIds.includes(challenge.id);
                const isExpired = calculateExpiry(challenge.createdAt, challenge.type) < now;
                return !isCompleted && !isExpired;
            });

        if (activeChallenges.length === 0) {
            challengesListEl.innerHTML = snapshot.empty ? `<p class="text-gray-400">Derzeit keine aktiven Challenges.</p>` : `<p class="text-green-500">Super! Du hast alle aktiven Challenges abgeschlossen.</p>`;
            return;
        }

        challengesListEl.innerHTML = '';
        activeChallenges.forEach(challenge => {
            const card = document.createElement('div');
            card.className = 'challenge-card bg-gray-50 p-4 rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-shadow';
            card.dataset.id = challenge.id;
            card.dataset.title = challenge.title;
            card.dataset.description = challenge.description || '';
            card.dataset.points = challenge.points;
            card.dataset.type = challenge.type;

            card.innerHTML = `
                <div class="flex justify-between items-center pointer-events-none">
                    <h3 class="font-bold">${challenge.title}</h3>
                    <span class="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                </div>
                <p class="text-sm text-gray-600 my-2 pointer-events-none">${challenge.description || ''}</p>
                <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t pointer-events-none">
                    <span class="font-bold text-indigo-600">+${challenge.points} Punkte</span>
                </div>
            `;
            challengesListEl.appendChild(card);
        });
    });
    unsubscribes.push(challengesListener);
}

function openChallengeModal(dataset) {
    const { title, description, points } = dataset;
    document.getElementById('modal-challenge-title').textContent = title;
    document.getElementById('modal-challenge-description').textContent = description;
    document.getElementById('modal-challenge-points').textContent = `+${points} Punkte`;
    document.getElementById('challenge-modal').classList.remove('hidden');
}

function loadProfileData(userData) {
    document.getElementById('stats-current-streak').innerHTML = `${userData.streak || 0} 🔥`;
    renderCalendar(currentDisplayDate);
}

// ================================================================
// ===== NEUE UND VERBESSERTE FUNKTIONEN FÜR DEN KALENDER =====
// ================================================================

async function getClubAttendanceForPeriod(clubId, daysToLookBack = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToLookBack);
    const startString = cutoffDate.toISOString().split('T')[0];

    const q = query(
        collection(db, 'attendance'),
        where('clubId', '==', clubId),
        where('date', '>=', startString),
        orderBy('date', 'desc')
    );
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Fehler beim Abrufen der Club-Anwesenheitsdaten: ", error);
        return [];
    }
}

async function renderCalendar(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const statsMonthName = document.getElementById('stats-month-name');
    const statsTrainingDays = document.getElementById('stats-training-days');

    calendarGrid.innerHTML = '<div class="col-span-7 text-center p-8">Lade Anwesenheitsdaten...</div>';
    
    const month = date.getMonth();
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString('de-DE', { month: 'long' });
    calendarMonthYear.textContent = `${monthName} ${year}`;
    statsMonthName.textContent = monthName;

    const allClubTrainings = await getClubAttendanceForPeriod(currentUserData.clubId);

    const presentDatesSet = new Set();
    allClubTrainings.forEach(training => {
        if (training.presentPlayerIds.includes(currentUserData.id)) {
            presentDatesSet.add(training.date);
        }
    });

    const trainingDaysThisMonth = Array.from(presentDatesSet).filter(d => {
        const trainingDate = new Date(d + 'T12:00:00'); // Use a fixed time to avoid timezone issues
        return trainingDate.getMonth() === month && trainingDate.getFullYear() === year;
    }).length;
    statsTrainingDays.textContent = trainingDaysThisMonth;

    const streakDates = new Set();
    for (const training of allClubTrainings) { // Already sorted descending
        if (presentDatesSet.has(training.date)) {
            streakDates.add(training.date);
        } else {
            break; // Streak is broken
        }
    }
    
    const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calendarGrid.innerHTML = '';
    
    for (let i = 0; i < firstDayOfWeek; i++) {
        calendarGrid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'h-10 w-10 flex items-center justify-center rounded-full border-2 border-transparent';
        dayDiv.textContent = day;

        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (streakDates.has(dateString)) {
            dayDiv.classList.add('calendar-day-streak');
        } else if (presentDatesSet.has(dateString)) {
            dayDiv.classList.add('calendar-day-present');
        }
        
        if (new Date(year, month, day).toDateString() === new Date().toDateString()) {
             dayDiv.classList.add('ring-2', 'ring-indigo-500');
        }
        calendarGrid.appendChild(dayDiv);
    }
}

function loadTodaysMatches(userData) {
    const container = document.getElementById('todays-matches-container');
    const listEl = document.getElementById('matches-list');
    const today = new Date().toISOString().split('T')[0];

    const matchDocRef = doc(db, "trainingMatches", `${userData.clubId}_${today}`);

    const matchListener = onSnapshot(matchDocRef, (docSnap) => {
        if (docSnap.exists()) {
            container.classList.remove('hidden');
            const data = docSnap.data();
            const groups = data.groups;
            listEl.innerHTML = '';

            if (Object.keys(groups).length === 0 && !data.leftoverPlayer) {
                listEl.innerHTML = '<p class="text-center text-gray-500 py-4">Für heute wurden noch keine Matches erstellt.</p>';
                return;
            }

            for (const groupName in groups) {
                const groupDiv = document.createElement('div');
                groupDiv.innerHTML = `<h4 class="font-semibold text-gray-700 mb-2">${groupName}</h4>`;
                const ul = document.createElement('ul');
                ul.className = 'space-y-2';

                groups[groupName].forEach(match => {
                    const isMyMatch = match.playerA.id === userData.id || match.playerB.id === userData.id;
                    const highlightClass = isMyMatch ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200' : 'bg-gray-50';
                    
                    let handicapHTML = '';
                    if (match.handicap) {
                        handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold">
                                            Vorgabe: ${match.handicap.player.name.split(' ')[0]} +${match.handicap.points}
                                        </p>`;
                    }

                    const li = document.createElement('li');
                    li.className = `p-3 rounded-lg border ${highlightClass}`;
                    li.innerHTML = `
                        <div class="flex justify-between items-center">
                            <div>
                                <span class="font-bold">${match.playerA.name}</span>
                                <span class="text-gray-400 mx-1">vs</span>
                                <span class="font-bold">${match.playerB.name}</span>
                            </div>
                            ${isMyMatch ? '<span class="text-xs bg-indigo-500 text-white font-bold py-1 px-2 rounded-full">DEIN MATCH</span>' : ''}
                        </div>
                        ${handicapHTML}
                    `;
                    ul.appendChild(li);
                });
                groupDiv.appendChild(ul);
                listEl.appendChild(groupDiv);
            }
            if(data.leftoverPlayer) {
                 const isLeftover = data.leftoverPlayer.id === userData.id;
                 const leftoverEl = document.createElement('p');
                 leftoverEl.className = `mt-4 text-sm p-2 rounded-md ${isLeftover ? 'bg-orange-100 text-orange-700 font-bold' : 'text-gray-500'}`;
                 leftoverEl.textContent = `${data.leftoverPlayer.name} sitzt diese Runde aus.`;
                 listEl.appendChild(leftoverEl);
            }

        } else {
            container.classList.add('hidden');
        }
    });

    unsubscribes.push(matchListener);
}


// --- Übungs-Tab Funktionen ---

function loadExercises() {
    const exercisesListEl = document.getElementById('exercises-list');
    const q = query(collection(db, "exercises"), orderBy("createdAt", "desc"));

    const exerciseListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            exercisesListEl.innerHTML = `<p class="text-gray-400 col-span-full">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        exercisesListEl.innerHTML = '';
        const allTags = new Set();
        const exercises = [];

        snapshot.forEach(doc => {
            const exercise = doc.data();
            const card = document.createElement('div');
            card.className = 'exercise-card bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-xl transition-shadow duration-300';
            card.dataset.title = exercise.title;
            card.dataset.description = exercise.description || '';
            card.dataset.imageUrl = exercise.imageUrl;
            card.dataset.points = exercise.points;
            card.dataset.tags = JSON.stringify(exercise.tags || []);
            
            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            const tagsHtml = exerciseTags.map(tag => `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`).join('');
            
            card.innerHTML = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover">
                              <div class="p-4 flex flex-col flex-grow">
                                  <h3 class="font-bold text-md mb-2">${exercise.title}</h3>
                                  <div class="mb-2">${tagsHtml}</div>
                                  <p class="text-sm text-gray-600 flex-grow truncate">${exercise.description || ''}</p>
                                  <div class="mt-4 text-right">
                                      <span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">+${exercise.points} P.</span>
                                  </div>
                              </div>`;
            exercises.push({ card, tags: exerciseTags });
            exercisesListEl.appendChild(card);
        });

        renderTagFilters(allTags, exercises);
    });

    unsubscribes.push(exerciseListener);
}

function renderTagFilters(tags, exercises) {
    const filterContainer = document.getElementById('tags-filter-container');
    if (!filterContainer) return;
    
    filterContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = 'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    filterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-filter-btn')) {
            const selectedTag = e.target.dataset.tag;

            document.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'text-gray-700');

            exercises.forEach(({ card, tags }) => {
                if (selectedTag === 'all' || tags.includes(selectedTag)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        }
    });
}


// --- Modal-Funktionen ---

function handleExerciseClick(event) {
    const card = event.target.closest('[data-title]');
    if (card) {
        const { title, description, imageUrl, points, tags } = card.dataset;
        openExerciseModal(title, description, imageUrl, points, tags);
    }
}

function openExerciseModal(title, description, imageUrl, points, tags) {
    document.getElementById('modal-exercise-title').textContent = title;
    document.getElementById('modal-exercise-image').src = imageUrl;
    document.getElementById('modal-exercise-image').alt = title;
    document.getElementById('modal-exercise-description').textContent = description;
    document.getElementById('modal-exercise-points').textContent = `+${points} P.`;
    
    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray.map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }
    
    document.getElementById('exercise-modal').classList.remove('hidden');
}

function closeExerciseModal() {
    document.getElementById('exercise-modal').classList.add('hidden');
}