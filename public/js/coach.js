// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, onSnapshot, query, where, writeBatch, serverTimestamp, increment, deleteDoc, updateDoc, runTransaction, orderBy, limit, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, loadLeaderboardForCoach, loadGlobalLeaderboard, renderLeaderboardHTML, setupLeaderboardToggle } from './leaderboard.js';
import { renderCalendar, fetchMonthlyAttendance, handleCalendarDayClick, handleAttendanceSave, loadPlayersForAttendance, updateAttendanceCount } from './attendance.js';
import { handleCreateChallenge, loadActiveChallenges, loadChallengesForDropdown, calculateExpiry, updateAllCountdowns } from './challenges.js';
import { loadAllExercises, loadExercisesForDropdown, openExerciseModalFromDataset, handleCreateExercise, closeExerciseModal } from './exercises.js';
import { calculateHandicap, handleGeneratePairings, renderPairingsInModal, updatePairingsButtonState, handleMatchSave, updateMatchUI, populateMatchDropdowns } from './matches.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west3');

// NEU: Der Emulator-Block
// Verbindet sich nur mit den lokalen Emulatoren, wenn die Seite über localhost läuft.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Coach.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);
    
    // Functions Emulator
    connectFunctionsEmulator(functions, "localhost", 5001);

    // Storage Emulator
    connectStorageEmulator(storage, "localhost", 9199);
}


// --- State ---
let currentUserData = null;
let unsubscribePlayerList = null;
let unsubscribeLeaderboard = null;
// NEU HINZUGEFÜGT
let unsubscribePointsHistory = null;
let currentCalendarDate = new Date();
let clubPlayers = [];

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        const pageLoader = document.getElementById('page-loader');
        const mainContent = document.getElementById('main-content');
        const authErrorContainer = document.getElementById('auth-error-container');
        const authErrorMessage = document.getElementById('auth-error-message');

        if (user) {
            try {
                await user.getIdToken(true);
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    if (userData.role === 'coach' || userData.role === 'admin') {
                        currentUserData = {id: user.uid, ...userData};
                        initializeCoachPage(currentUserData);
                    } else {
                        showAuthError(`Ihre Rolle ('${userData.role}') ist nicht berechtigt.`);
                    }
                } else {
                    showAuthError("Ihr Benutzerprofil wurde nicht gefunden.");
                }
            } catch (error) {
                showAuthError(`DB-Fehler: ${error.message}`);
            }
        } else {
            window.location.href = '/index.html';
        }

        function showAuthError(message) {
            if (pageLoader) pageLoader.style.display = 'none';
            if (mainContent) mainContent.style.display = 'none';
            if (authErrorMessage) authErrorMessage.textContent = message;
            if (authErrorContainer) authErrorContainer.style.display = 'flex';
            console.error("Auth-Fehler:", message);
        }
    });
});

function initializeCoachPage(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    document.getElementById('welcome-message').textContent = `Willkommen, ${userData.firstName || userData.email}! (Verein: ${userData.clubId})`;

    // Render leaderboard HTML for coach
    renderLeaderboardHTML('tab-content-dashboard', {
        showToggle: true,  // Club/Global Toggle
        showLeagueSelect: true,  // Liga-Auswahl für Club-Ansicht
        showLeagueIcons: true,
        showSeasonCountdown: true
    });

    setupTabs();
    setupLeaderboardToggle();  // Setup für Club/Global Toggle
    loadPlayersForDropdown(userData.clubId);
    loadChallengesForDropdown(userData.clubId, db);
    loadExercisesForDropdown(db);
    loadActiveChallenges(userData.clubId, db);
    loadAllExercises(db);
    loadLeaguesForSelector(userData.clubId);  // Setup für Liga-Buttons
    loadPlayersForAttendance(userData.clubId, db, (players) => {
        clubPlayers = players;
        populateMatchDropdowns(clubPlayers);
        populateHistoryFilterDropdown();
    });
    loadGlobalLeaderboard(userData, db, []); // Global leaderboard für Coach
    updateSeasonCountdown();
    renderCalendar(currentCalendarDate, db, userData);

    // --- Event Listeners ---
    document.getElementById('logout-button').addEventListener('click', () => signOut(auth));
    document.getElementById('error-logout-button').addEventListener('click', () => signOut(auth));
    document.getElementById('open-player-modal-button').addEventListener('click', () => { document.getElementById('player-list-modal').classList.remove('hidden'); loadPlayerList(userData.clubId); });
    document.getElementById('close-player-modal-button').addEventListener('click', () => { document.getElementById('player-list-modal').classList.add('hidden'); if (unsubscribePlayerList) unsubscribePlayerList(); });
    document.getElementById('add-offline-player-button').addEventListener('click', () => document.getElementById('add-offline-player-modal').classList.remove('hidden'));
    document.getElementById('close-add-player-modal-button').addEventListener('click', () => document.getElementById('add-offline-player-modal').classList.add('hidden'));
    document.getElementById('close-attendance-modal-button').addEventListener('click', () => document.getElementById('attendance-modal').classList.add('hidden'));
    document.getElementById('add-offline-player-form').addEventListener('submit', handleAddOfflinePlayer);
    document.getElementById('reason-select').addEventListener('change', handleReasonChange);
    document.getElementById('points-form').addEventListener('submit', handlePointsFormSubmit);
    document.getElementById('create-challenge-form').addEventListener('submit', (e) => handleCreateChallenge(e, db, userData));
    document.getElementById('attendance-form').addEventListener('submit', (e) => handleAttendanceSave(e, db, userData, clubPlayers, currentCalendarDate, (date) => renderCalendar(date, db, userData)));
    document.getElementById('create-exercise-form').addEventListener('submit', (e) => handleCreateExercise(e, db, storage));
    document.getElementById('match-form').addEventListener('submit', (e) => handleMatchSave(e, db, userData, clubPlayers));
    document.getElementById('generate-pairings-button').addEventListener('click', () => handleGeneratePairings(clubPlayers));
    document.getElementById('close-pairings-modal-button').addEventListener('click', () => { document.getElementById('pairings-modal').classList.add('hidden'); });
    document.getElementById('exercises-list-coach').addEventListener('click', (e) => { const card = e.target.closest('[data-id]'); if(card) { openExerciseModalFromDataset(card.dataset); } });
    document.getElementById('close-exercise-modal-button').addEventListener('click', closeExerciseModal);
    document.getElementById('modal-player-list').addEventListener('click', handlePlayerListActions);
    document.getElementById('prev-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('next-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('calendar-grid').addEventListener('click', (e) => handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, () => updatePairingsButtonState(clubPlayers)));
    document.getElementById('player-a-select').addEventListener('change', () => updateMatchUI(clubPlayers));
    document.getElementById('player-b-select').addEventListener('change', () => updateMatchUI(clubPlayers));

    // NEU: Event listener für den Punkte-Historie-Filter HINZUGEFÜGT
    document.getElementById('history-player-filter').addEventListener('change', (e) => {
        loadPointsHistoryForCoach(e.target.value);
    });

    // Intervals
    setInterval(updateSeasonCountdown, 1000);
    setInterval(updateAllCountdowns, 1000);
}

// =============================================================
// ===== FUNKTIONEN FÜR PUNKTE-HISTORIE (NEU) =====
// =============================================================

function populateHistoryFilterDropdown() {
    const select = document.getElementById('history-player-filter');
    if (!select) return;

    select.innerHTML = '<option value="">Bitte Spieler wählen...</option>';
    clubPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName}`;
        select.appendChild(option);
    });
}

function loadPointsHistoryForCoach(playerId) {
    const historyListEl = document.getElementById('coach-points-history-list');
    if (unsubscribePointsHistory) unsubscribePointsHistory(); // Alten Listener beenden

    if (!playerId) {
        historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Bitte einen Spieler auswählen, um die Historie anzuzeigen.</li>';
        return;
    }

    historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Lade Historie...</li>';
    const q = query(collection(db, `users/${playerId}/pointsHistory`), orderBy("timestamp", "desc"));
    
    unsubscribePointsHistory = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            historyListEl.innerHTML = `<li><p class="text-center text-gray-400 py-4">Für diesen Spieler gibt es noch keine Einträge.</p></li>`;
            return;
        }

        historyListEl.innerHTML = '';
        snapshot.forEach(doc => {
            const entry = doc.data();
            const pointsClass = entry.points >= 0 ? 'text-green-600' : 'text-red-600';
            const sign = entry.points >= 0 ? '+' : '';
            const date = entry.timestamp ? entry.timestamp.toDate().toLocaleDateString('de-DE') : '...';
            
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center text-sm bg-gray-50 p-2 rounded-md';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}</p>
                    <p class="text-xs text-gray-500">${date} - ${entry.awardedBy || 'Unbekannt'}</p>
                </div>
                <span class="font-bold ${pointsClass}">${sign}${entry.points}</span>
            `;
            historyListEl.appendChild(li);
        });
    });
}


// =============================================================
// ===== MATCH & PAIRING FUNCTIONS - NOW IN matches.js =====
// =============================================================

// ===============================================
// ===== ALLE ANDEREN FUNKTIONEN (VOLLSTÄNDIG) =====
// ===============================================

async function handleAddOfflinePlayer(e) {
    e.preventDefault();
    const form = e.target;
    const firstName = form.querySelector('#firstName').value;
    const lastName = form.querySelector('#lastName').value;
    const email = form.querySelector('#email').value;

    if (!firstName || !lastName) {
        alert('Vorname und Nachname sind Pflichtfelder.');
        return;
    }

    try {
        const playerData = {
            firstName,
            lastName,
            clubId: currentUserData.clubId,
            role: 'player',
            isOffline: true,
            isMatchReady: false, 
            onboardingComplete: false,
            points: 0,
            createdAt: serverTimestamp()
        };
        if (email) {
            playerData.email = email;
        }
        await addDoc(collection(db, "users"), playerData);
        alert('Offline Spieler erfolgreich erstellt!');
        form.reset();
        document.getElementById('add-offline-player-modal').classList.add('hidden');
    } catch (error) {
        console.error("Fehler beim Erstellen des Spielers:", error);
        alert('Fehler: Der Spieler konnte nicht erstellt werden.');
    }
}

async function handlePlayerListActions(e) {
    const target = e.target;
    const playerId = target.dataset.id;
    if (!playerId) return;

    if (target.classList.contains('match-ready-toggle')) {
        const newStatus = target.checked;
        const playerRef = doc(db, 'users', playerId);
        target.disabled = true;

        try {
            await updateDoc(playerRef, { isMatchReady: newStatus });
        } catch (error) {
            console.error("Fehler beim Aktualisieren des Match-Status:", error);
            alert("Der Status konnte nicht geändert werden.");
            target.checked = !newStatus;
        } finally {
            target.disabled = false;
        }
        return;
    }

    const button = target.closest('button');
    if (!button) return;

    if (button.classList.contains('send-invite-btn')) {
        button.disabled = true;
        button.textContent = 'Sende...';
        let playerEmail = button.dataset.email;
        if (!playerEmail) {
            playerEmail = prompt("Für diesen Spieler ist keine E-Mail hinterlegt. Bitte gib eine E-Mail-Adresse ein:");
            if (!playerEmail) {
                button.disabled = false;
                button.textContent = 'Einladung senden';
                return;
            }
            await updateDoc(doc(db, "users", playerId), { email: playerEmail });
        }
        if (confirm(`Soll eine Einrichtungs-E-Mail an ${playerEmail} gesendet werden?`)) {
            try {
                const createAuthUser = httpsCallable(functions, 'createAuthUserForPlayer');
                await createAuthUser({ playerId, playerEmail });
                await sendPasswordResetEmail(auth, playerEmail);
                alert(`Einrichtungs-E-Mail an ${playerEmail} wurde erfolgreich gesendet!`);
            } catch (error) {
                alert(`Fehler: ${error.message}`);
            } finally {
                button.disabled = false;
                button.textContent = 'Einladung senden';
            }
        } else {
            button.disabled = false;
            button.textContent = 'Einladung senden';
        }
    }

    if (button.classList.contains('delete-player-btn')) {
        if (confirm('Möchten Sie diesen Spieler wirklich löschen?')) {
            await deleteDoc(doc(db, "users", playerId));
            alert('Spieler gelöscht.');
        }
    }
    
    if (button.classList.contains('promote-coach-btn')) {
        if (confirm('Möchten Sie diesen Spieler zum Coach ernennen?')) {
            await updateDoc(doc(db, "users", playerId), { role: 'coach' });
            alert('Spieler wurde zum Coach befördert.');
        }
    }
}

function loadPlayerList(clubId) {
    const modalPlayerList = document.getElementById('modal-player-list');
    const tableContainer = document.getElementById('modal-player-list-container');
    const loader = document.getElementById('modal-loader');
    
    loader.style.display = 'block';
    tableContainer.style.display = 'none';

    const q = query(collection(db, "users"), where("clubId", "==", clubId), orderBy("lastName"));
    
    if (unsubscribePlayerList) unsubscribePlayerList();

    unsubscribePlayerList = onSnapshot(q, (snapshot) => {
        modalPlayerList.innerHTML = '';
        if (snapshot.empty) {
            modalPlayerList.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Keine Spieler in diesem Verein gefunden.</td></tr>';
        } else {
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            players.forEach(player => {
                const row = document.createElement('tr');
                const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                const statusHtml = player.isOffline 
                    ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Offline</span>'
                    : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Online</span>';
                
                let actionsHtml = '';
                if (player.isOffline) {
                    actionsHtml += `<button data-id="${player.id}" data-email="${player.email || ''}" class="send-invite-btn text-indigo-600 hover:text-indigo-900 text-sm font-medium">Einladung senden</button>`;
                }
                if (player.role === 'player') {
                     actionsHtml += `<button data-id="${player.id}" class="promote-coach-btn text-purple-600 hover:text-purple-900 text-sm font-medium ml-4">Zum Coach ernennen</button>`;
                }
                actionsHtml += `<button data-id="${player.id}" class="delete-player-btn text-red-600 hover:text-red-900 text-sm font-medium ml-4">Löschen</button>`;

                const isChecked = player.isMatchReady ? 'checked' : '';
                const matchReadyToggleHtml = `
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" data-id="${player.id}" class="sr-only peer match-ready-toggle" ${isChecked}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-indigo-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                `;
                
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                            <div class="flex-shrink-0 h-10 w-10"><img class="h-10 w-10 rounded-full object-cover" src="${avatarSrc}" alt=""></div>
                            <div class="ml-4">
                                <div class="text-sm font-medium text-gray-900">${player.firstName} ${player.lastName}</div>
                                <div class="text-sm text-gray-500">${player.email || 'Keine E-Mail'}</div>
                            </div>
                        </div>
                    </td> 
                    <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${matchReadyToggleHtml}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-left">${actionsHtml}</td>
                `;
                modalPlayerList.appendChild(row);
            });
        }
        loader.style.display = 'none';
        tableContainer.style.display = 'block';
    }, (error) => {
        console.error("Spielerliste Ladefehler:", error);
        modalPlayerList.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Fehler: ${error.message}</td></tr>`;
        loader.style.display = 'none';
        tableContainer.style.display = 'block';
    });
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const dashboardButton = document.querySelector('.tab-button[data-tab="dashboard"]');

    if (dashboardButton) {
        dashboardButton.classList.add('tab-active');
        document.getElementById('tab-content-dashboard').classList.remove('hidden');
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

async function loadLeaguesForSelector(clubId) {
    const coachLeagueSelect = document.getElementById('coach-league-select');
    if(!coachLeagueSelect) return;
    const q = query(collection(db, "users"), where("clubId", "==", clubId), where("role", "==", "player"));
    
    try {
        const querySnapshot = await getDocs(q);
        const players = querySnapshot.docs.map(doc => doc.data());
        const leagues = [...new Set(players.map(p => p.league || 'Bronze'))].sort();
        
        coachLeagueSelect.innerHTML = '';
        leagues.forEach(league => {
            const button = document.createElement('button');
            button.className = 'league-select-btn border-2 border-gray-300 rounded-full px-4 py-1 text-sm font-medium hover:bg-gray-200';
            button.textContent = league;
            button.dataset.league = league;
            button.addEventListener('click', () => {
                document.querySelectorAll('.league-select-btn').forEach(btn => btn.classList.remove('league-select-btn-active'));
                button.classList.add('league-select-btn-active');
                loadLeaderboardForCoach(clubId, league, db, (unsub) => {
                    if (unsubscribeLeaderboard) unsubscribeLeaderboard();
                    unsubscribeLeaderboard = unsub;
                });
            });
            coachLeagueSelect.appendChild(button);
        });

        if (leagues.length > 0) {
            coachLeagueSelect.querySelector('button').click();
        } else {
            loadLeaderboardForCoach(clubId, 'Bronze', db, (unsub) => {
                if (unsubscribeLeaderboard) unsubscribeLeaderboard();
                unsubscribeLeaderboard = unsub;
            });
        }
    } catch (error) {
        console.error("Fehler beim Laden der Ligen:", error);
    }
}


function updateSeasonCountdown() {
    const seasonCountdownEl = document.getElementById('season-countdown');
    if (!seasonCountdownEl) return;
    const now = new Date();
    let endOfSeason;

    if (now.getDate() < 15) {
        endOfSeason = new Date(now.getFullYear(), now.getMonth(), 15, 0, 0, 0);
    } else {
        endOfSeason = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const diff = endOfSeason - now;
    if (diff <= 0) {
        seasonCountdownEl.textContent = "Saison beendet!";
        return;
    }
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    seasonCountdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
}

// =============================================================
// ===== EXERCISE FUNCTIONS - NOW IN exercises.js =====
// =============================================================



async function handlePointsFormSubmit(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('points-feedback');
    const playerId = document.getElementById('player-select').value;
    const reasonType = document.getElementById('reason-select').value;
    feedbackEl.textContent = '';
    if (!playerId || !reasonType) {
        feedbackEl.textContent = 'Bitte Spieler und Grund auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }
    let points = 0; let reason = ''; let challengeId = null;
    try {
        switch (reasonType) {
            case 'challenge': const cSelect = document.getElementById('challenge-select'); const cOption = cSelect.options[cSelect.selectedIndex]; if (!cOption || !cOption.value) throw new Error('Bitte eine Challenge auswählen.'); points = parseInt(cOption.dataset.points); reason = `Challenge: ${cOption.dataset.title}`; challengeId = cOption.value; break;
            case 'exercise': const eSelect = document.getElementById('exercise-select'); const eOption = eSelect.options[eSelect.selectedIndex]; if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.'); points = parseInt(eOption.dataset.points); reason = `Übung: ${eOption.dataset.title}`; break;
            case 'manual': points = parseInt(document.getElementById('manual-points').value); reason = document.getElementById('manual-reason').value; if (!reason || isNaN(points)) throw new Error('Grund und gültige Punkte müssen angegeben werden.'); break;
        }
        await runTransaction(db, async (transaction) => {
            const playerDocRef = doc(db, 'users', playerId);
            const playerDoc = await transaction.get(playerDocRef);
            if (!playerDoc.exists()) throw new Error("Spieler nicht gefunden.");
            
            transaction.update(playerDocRef, { points: increment(points) });
            
            const historyColRef = collection(db, `users/${playerId}/pointsHistory`);
            transaction.set(doc(historyColRef), { points, reason, timestamp: serverTimestamp(), awardedBy: `${currentUserData.firstName} ${currentUserData.lastName}` });
            
            if (challengeId) {
                const completedChallengeRef = doc(db, `users/${playerId}/completedChallenges`, challengeId);
                transaction.set(completedChallengeRef, { completedAt: serverTimestamp() });
            }
        });
        feedbackEl.textContent = `Erfolgreich ${points} Punkte vergeben!`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
        handleReasonChange();
    } catch (error) {
        console.error("Fehler bei der Punktevergabe:", error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
    setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
}

function handleReasonChange() {
    const value = document.getElementById('reason-select').value;
    document.getElementById('challenge-select-container').classList.toggle('hidden', value !== 'challenge');
    document.getElementById('exercise-select-container').classList.toggle('hidden', value !== 'exercise');
    document.getElementById('manual-points-container').classList.toggle('hidden', value !== 'manual');
}

function loadPlayersForDropdown(clubId) {
    const select = document.getElementById('player-select');
    if(!select) return;
    const q = query(collection(db, 'users'), where('clubId', '==', clubId), where('role','==','player'));
    
    onSnapshot(q, (snapshot) => {
        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        select.innerHTML = '<option value="">Spieler wählen...</option>';
        players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
               .forEach(p => {
                   const option = document.createElement('option');
                   option.value = p.id;
                   option.textContent = `${p.firstName} ${p.lastName}`;
                   select.appendChild(option);
               });
    }, (error) => {
        console.error("Fehler beim Laden der Spieler für das Dropdown:", error);
        select.innerHTML = '<option value="">Fehler beim Laden der Spieler</option>';
    });
}


// Exercise and match dropdown functions now in exercises.js and matches.js