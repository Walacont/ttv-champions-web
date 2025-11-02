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
        showToggle: true,
        showLeagueSelect: true,
        showLeagueIcons: true,
        showSeasonCountdown: true
    });

    setupTabs();
    setupLeaderboardToggle();
    loadPlayersForDropdown(userData.clubId);
    loadChallengesForDropdown(userData.clubId, db);
    loadExercisesForDropdown();
    loadActiveChallenges(userData.clubId, db);
    loadAllExercises();
    loadLeaguesForSelector(userData.clubId);
    loadPlayersForAttendance(userData.clubId, db, (players) => {
        clubPlayers = players;
        populateMatchDropdowns();
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
    document.getElementById('create-exercise-form').addEventListener('submit', handleCreateExercise);
    document.getElementById('match-form').addEventListener('submit', handleMatchSave);
    document.getElementById('generate-pairings-button').addEventListener('click', handleGeneratePairings);
    document.getElementById('close-pairings-modal-button').addEventListener('click', () => { document.getElementById('pairings-modal').classList.add('hidden'); });
    document.getElementById('exercises-list-coach').addEventListener('click', (e) => { const card = e.target.closest('[data-id]'); if(card) { openExerciseModal(card.dataset); } });
    document.getElementById('close-exercise-modal-button').addEventListener('click', () => document.getElementById('exercise-modal').classList.add('hidden'));
    document.getElementById('modal-player-list').addEventListener('click', handlePlayerListActions);
    document.getElementById('prev-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('next-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('calendar-grid').addEventListener('click', (e) => handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, updatePairingsButtonState));
    document.getElementById('player-a-select').addEventListener('change', updateMatchUI);
    document.getElementById('player-b-select').addEventListener('change', updateMatchUI);

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
// ===== FUNKTIONEN FÜR PAARUNGEN & HANDICAP LOGIK (Final) =====
// =============================================================

function calculateHandicap(playerA, playerB) {
    const eloA = playerA.eloRating || 1200;
    const eloB = playerB.eloRating || 1200;
    const eloDiff = Math.abs(eloA - eloB);

    if (eloDiff < 25) {
        return null;
    }

    let handicapPoints = Math.round(eloDiff / 50);

    if (handicapPoints > 10) {
        handicapPoints = 10;
    }
    
    if (handicapPoints < 1) {
        return null;
    }

    const weakerPlayer = eloA < eloB ? playerA : playerB;
    return {
        player: weakerPlayer,
        points: handicapPoints
    };
}

function handleGeneratePairings() {
    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    const matchReadyAndPresentPlayers = clubPlayers.filter(player => presentPlayerIds.includes(player.id) && player.isMatchReady);

    matchReadyAndPresentPlayers.sort((a, b) => (a.eloRating || 1200) - (b.eloRating || 1200));

    const pairingsByGroup = {};
    const groupSize = 4;
    
    for (let i = 0; i < matchReadyAndPresentPlayers.length; i += groupSize) {
        const groupNumber = Math.floor(i / groupSize) + 1;
        pairingsByGroup[`Gruppe ${groupNumber}`] = matchReadyAndPresentPlayers.slice(i, i + groupSize);
    }

    const finalPairings = {};
    let leftoverPlayer = null;

    for (const groupName in pairingsByGroup) {
        let playersInGroup = pairingsByGroup[groupName];
        for (let i = playersInGroup.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playersInGroup[i], playersInGroup[j]] = [playersInGroup[j], playersInGroup[i]];
        }
        finalPairings[groupName] = [];
        for (let i = 0; i < playersInGroup.length - 1; i += 2) {
            finalPairings[groupName].push([playersInGroup[i], playersInGroup[i + 1]]);
        }
        if (playersInGroup.length % 2 !== 0) {
            leftoverPlayer = playersInGroup[playersInGroup.length - 1];
        }
    }
    renderPairingsInModal(finalPairings, leftoverPlayer);
}

function renderPairingsInModal(pairings, leftoverPlayer) {
    const modal = document.getElementById('pairings-modal');
    const container = document.getElementById('modal-pairings-content');
    container.innerHTML = '';

    const hasPairings = Object.values(pairings).some(group => group.length > 0);
    if (!hasPairings && !leftoverPlayer) {
        container.innerHTML = '<p class="text-center text-gray-500">Keine möglichen Paarungen gefunden.</p>';
        modal.classList.remove('hidden');
        return;
    }

    for (const groupName in pairings) {
        if (pairings[groupName].length === 0) continue;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-3';
        groupDiv.innerHTML = `<h5 class="font-bold text-gray-800 bg-gray-100 p-2 rounded-t-md">${groupName}</h5>`;
        const list = document.createElement('ul');
        list.className = 'space-y-2 p-2 border-l border-r border-b rounded-b-md';

        pairings[groupName].forEach(pair => {
            const [playerA, playerB] = pair;
            const handicap = calculateHandicap(playerA, playerB);
            let handicapHTML = '<p class="text-xs text-gray-400 mt-1">Kein Handicap</p>';
            if (handicap) {
                handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold"><i class="fas fa-balance-scale-right"></i> ${handicap.player.firstName} startet mit <strong>${handicap.points}</strong> Pkt. Vorsprung.</p>`;
            }
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-3 bg-white rounded shadow-sm border';
            listItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold text-indigo-700">${playerA.firstName} ${playerA.lastName}</span>
                        <span class="text-gray-500 mx-2">vs.</span>
                        <span class="font-bold text-indigo-700">${playerB.firstName} ${playerB.lastName}</span>
                    </div>
                    <div class="text-xs text-gray-400">(${Math.round(playerA.eloRating || 1200)} vs ${Math.round(playerB.eloRating || 1200)})</div>
                </div>
                ${handicapHTML}
            `;
            list.appendChild(listItem);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    }

    if (leftoverPlayer) {
        const leftoverEl = document.createElement('p');
        leftoverEl.className = 'text-sm text-center text-orange-600 bg-orange-100 p-2 rounded-md mt-4';
        leftoverEl.innerHTML = `<strong>${leftoverPlayer.firstName} ${leftoverPlayer.lastName}</strong> (sitzt diese Runde aus)`;
        container.appendChild(leftoverEl);
    }
    modal.classList.remove('hidden');
}

function updatePairingsButtonState() {
    const pairingsButton = document.getElementById('generate-pairings-button');
    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    const eligiblePlayerCount = clubPlayers.filter(player => presentPlayerIds.includes(player.id) && player.isMatchReady).length;

    if (eligiblePlayerCount >= 2) {
        pairingsButton.disabled = false;
        pairingsButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.add('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = '<i class="fas fa-random mr-2"></i> Paarungen erstellen';
    } else {
        pairingsButton.disabled = true;
        pairingsButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = `(${eligiblePlayerCount}/2 Spieler bereit)`;
    }
}

// =============================================================
// ===== ANWESENHEITS-FUNKTIONEN (Angepasst & Neu) =====
// =============================================================

// ERSETZTE Funktion
async function handleMatchSave(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('match-feedback');
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const winnerId = document.getElementById('winner-select').value;
    const handicapUsed = document.getElementById('handicap-toggle').checked;

    if (!playerAId || !playerBId || !winnerId || playerAId === playerBId) {
        feedbackEl.textContent = 'Bitte zwei unterschiedliche Spieler und einen Gewinner auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const loserId = winnerId === playerAId ? playerBId : playerAId;
    feedbackEl.textContent = 'Speichere Match-Ergebnis...';
    
    try {
        await addDoc(collection(db, 'matches'), {
            playerAId,
            playerBId,
            winnerId,
            loserId,
            handicapUsed: handicapUsed,
            reportedBy: currentUserData.id,
            clubId: currentUserData.clubId,
            createdAt: serverTimestamp(),
            processed: false
        });
        feedbackEl.textContent = 'Match gemeldet! Punkte werden in Kürze aktualisiert.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
        updateMatchUI();
    } catch (error) {
        console.error("Fehler beim Melden des Matches:", error);
        feedbackEl.textContent = 'Fehler: Das Match konnte nicht gemeldet werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

function updateMatchUI() {
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const winnerSelect = document.getElementById('winner-select');
    const handicapContainer = document.getElementById('handicap-suggestion');
    const handicapToggleContainer = document.getElementById('handicap-toggle-container');

    winnerSelect.innerHTML = '<option value="">Bitte Gewinner wählen...</option>';
    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (playerA) winnerSelect.innerHTML += `<option value="${playerA.id}">${playerA.firstName} ${playerA.lastName}</option>`;
    if (playerB) winnerSelect.innerHTML += `<option value="${playerB.id}">${playerB.firstName} ${playerB.lastName}</option>`;
    
    if (playerA && playerB && playerAId !== playerBId) {
        const handicap = calculateHandicap(playerA, playerB);

        if (handicap && handicap.points > 0) {
            document.getElementById('handicap-text').textContent = `${handicap.player.firstName} startet mit ${handicap.points} Punkten Vorsprung pro Satz.`;
            handicapContainer.classList.remove('hidden');
            handicapToggleContainer.classList.remove('hidden');
            handicapToggleContainer.classList.add('flex');
        } else {
            handicapContainer.classList.add('hidden');
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    } else {
        if(handicapContainer) handicapContainer.classList.add('hidden');
        if(handicapToggleContainer) {
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    }
}

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

function openExerciseModal(dataset) {
    const { title, description, imageUrl, points, tags } = dataset;
    const modal = document.getElementById('exercise-modal');
    if(!modal) return;
    document.getElementById('modal-exercise-title').textContent = title;
    document.getElementById('modal-exercise-image').src = imageUrl;
    document.getElementById('modal-exercise-description').textContent = description;
    document.getElementById('modal-exercise-points').textContent = `+${points} P.`;
    
    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray.map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }
    
    modal.classList.remove('hidden');
}

async function handleCreateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title-form').value;
    const description = document.getElementById('exercise-description-form').value;
    const points = parseInt(document.getElementById('exercise-points-form').value);
    const file = document.getElementById('exercise-image-form').files[0];
    const tagsInput = document.getElementById('exercise-tags-form').value;
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    feedbackEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';
    
    if (!title || !file || isNaN(points) || points <= 0) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        return;
    }
    try {
        const storageRef = ref(storage, `exercises/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(snapshot.ref);
        await addDoc(collection(db, "exercises"), {
            title, description, points, imageUrl, createdAt: serverTimestamp(), tags
        });
        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
    } catch (error) {
        console.error("Fehler beim Erstellen der Übung:", error);
        feedbackEl.textContent = 'Fehler: Übung konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
    }
}



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


function loadExercisesForDropdown() { 
    const select = document.getElementById('exercise-select'); 
    if(!select) return;
    const q = query(collection(db, 'exercises'), orderBy('title')); 
    onSnapshot(q, snapshot => { 
        if(snapshot.empty) { 
            select.innerHTML = '<option value="">Keine Übungen in DB</option>'; 
            return; 
        } 
        select.innerHTML = '<option value="">Übung wählen...</option>'; 
        snapshot.forEach(doc => { 
            const e = doc.data(); 
            const option = document.createElement('option'); 
            option.value = doc.id; 
            option.textContent = `${e.title} (+${e.points} P.)`; 
            option.dataset.points = e.points; 
            option.dataset.title = e.title; 
            select.appendChild(option); 
        }); 
    }); 
}
    
    
function loadAllExercises() {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if(!exercisesListCoachEl) return;
    onSnapshot(query(collection(db, "exercises"), orderBy("createdAt", "desc")), (snapshot) => {
        exercisesListCoachEl.innerHTML = snapshot.empty ? '<p class="text-gray-500 col-span-full">Keine Übungen gefunden.</p>' : '';
        snapshot.forEach(doc => {
            const exercise = { id: doc.id, ...doc.data() };
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
            card.dataset.id = exercise.id;
            card.dataset.title = exercise.title;
            card.dataset.description = exercise.description || '';
            card.dataset.imageUrl = exercise.imageUrl;
            card.dataset.points = exercise.points;
            card.dataset.tags = JSON.stringify(exercise.tags || []);
            const tagsHtml = (exercise.tags || []).map(tag => `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`).join('');
            card.innerHTML = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover pointer-events-none">
                              <div class="p-4 flex flex-col flex-grow pointer-events-none">
                                  <h3 class="font-bold text-md mb-2 flex-grow">${exercise.title}</h3>
                                  <div class="pt-2">${tagsHtml}</div>
                              </div>`;
            exercisesListCoachEl.appendChild(card);
        });
    });
}

function populateMatchDropdowns() {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');
    
    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

    const matchReadyPlayers = clubPlayers.filter(p => p.isMatchReady === true);

    if (matchReadyPlayers.length < 2) {
         const handicapSuggestion = document.getElementById('handicap-suggestion');
         if(handicapSuggestion) {
            handicapSuggestion.innerHTML = '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler müssen Match-bereit sein.</p>';
            handicapSuggestion.classList.remove('hidden');
         }
    }

    matchReadyPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName} (Elo: ${Math.round(player.eloRating || 1200)})`;
        playerASelect.appendChild(option.cloneNode(true));
        playerBSelect.appendChild(option);
    });
}