import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

/**
 * Player Management Module
 * Handles offline player creation, player list management, and player dropdowns for coaches
 */

// Keep track of the current Grundlagen listener to avoid duplicates
let currentGrundlagenListener = null;

/**
 * Handles offline player creation
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data with clubId
 */
export async function handleAddOfflinePlayer(e, db, currentUserData) {
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
            eloRating: 0,
            highestElo: 0,
            xp: 0,
            grundlagenCompleted: 0,
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

/**
 * Handles player list actions (toggle match-ready, send invite, delete, promote)
 * @param {Event} e - Click event
 * @param {Object} db - Firestore database instance
 * @param {Object} auth - Firebase auth instance
 * @param {Object} functions - Firebase functions instance
 */
export async function handlePlayerListActions(e, db, auth, functions) {
    const target = e.target;
    const button = target.closest('button');
    if (!button) return;

    const playerId = button.dataset.id;
    if (!playerId) return;

    // Handle invite button
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
                console.log('Creating auth user for player:', playerId, playerEmail);
                const result = await createAuthUser({ playerId, playerEmail });
                console.log('Auth user created:', result);

                console.log('Sending password reset email to:', playerEmail);
                await sendPasswordResetEmail(auth, playerEmail);
                console.log('Password reset email sent successfully');

                alert(`Einrichtungs-E-Mail an ${playerEmail} wurde erfolgreich gesendet!`);
            } catch (error) {
                console.error('Error sending invitation:', error);
                let errorMessage = error.message || 'Unbekannter Fehler';

                // Provide more helpful error messages
                if (error.code === 'auth/invalid-email') {
                    errorMessage = 'Ungültige E-Mail-Adresse';
                } else if (error.code === 'auth/user-not-found') {
                    errorMessage = 'Benutzer nicht gefunden. Versuche es erneut.';
                } else if (error.code === 'functions/not-found') {
                    errorMessage = 'Cloud Function nicht gefunden. Bitte deploye die Functions.';
                } else if (error.code === 'functions/unauthenticated') {
                    errorMessage = 'Keine Berechtigung. Bitte melde dich erneut an.';
                }

                alert(`Fehler beim Senden der Einladung:\n${errorMessage}\n\nDetails: ${error.code || 'N/A'}`);
            } finally {
                button.disabled = false;
                button.textContent = 'Einladung senden';
            }
        } else {
            button.disabled = false;
            button.textContent = 'Einladung senden';
        }
    }

    // Handle delete button
    if (button.classList.contains('delete-player-btn')) {
        if (confirm('Möchten Sie diesen Spieler wirklich löschen?')) {
            await deleteDoc(doc(db, "users", playerId));
            alert('Spieler gelöscht.');
        }
    }

    // Handle promote to coach button
    if (button.classList.contains('promote-coach-btn')) {
        if (confirm('Möchten Sie diesen Spieler zum Coach ernennen?')) {
            await updateDoc(doc(db, "users", playerId), { role: 'coach' });
            alert('Spieler wurde zum Coach befördert.');
        }
    }
}

/**
 * Loads player list for the player management modal
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Function} setUnsubscribe - Callback to set unsubscribe function
 */
export function loadPlayerList(clubId, db, setUnsubscribe) {
    const modalPlayerList = document.getElementById('modal-player-list');
    const tableContainer = document.getElementById('modal-player-list-container');
    const loader = document.getElementById('modal-loader');

    if (loader) loader.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'none';

    const q = query(collection(db, "users"), where("clubId", "==", clubId), orderBy("lastName"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        modalPlayerList.innerHTML = '';
        if (snapshot.empty) {
            modalPlayerList.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-500">Keine Spieler in diesem Verein gefunden.</td></tr>';
        } else {
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Import ranks module to calculate ranks
            import('./ranks.js').then(({ calculateRank }) => {
                players.forEach(player => {
                    const row = document.createElement('tr');
                    row.classList.add('cursor-pointer', 'hover:bg-gray-50', 'player-row');
                    row.dataset.playerId = player.id;

                    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                    const statusHtml = player.isOffline
                        ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Offline</span>'
                        : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Online</span>';

                    // Calculate rank
                    const rank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);
                    const rankHtml = `
                        <div class="flex items-center">
                            <span class="text-xl mr-1">${rank.emoji}</span>
                            <span class="text-sm font-medium" style="color: ${rank.color};">${rank.name}</span>
                        </div>
                    `;

                    let actionsHtml = '';
                    if (player.isOffline) {
                        actionsHtml += `<button data-id="${player.id}" data-email="${player.email || ''}" class="send-invite-btn text-indigo-600 hover:text-indigo-900 text-sm font-medium">Einladung senden</button>`;
                    }
                    if (player.role === 'player') {
                        actionsHtml += `<button data-id="${player.id}" class="promote-coach-btn text-purple-600 hover:text-purple-900 text-sm font-medium ml-4">Zum Coach</button>`;
                    }
                    actionsHtml += `<button data-id="${player.id}" class="delete-player-btn text-red-600 hover:text-red-900 text-sm font-medium ml-4">Löschen</button>`;

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
                        <td class="px-6 py-4 whitespace-nowrap">${rankHtml}</td>
                        <td class="px-6 py-4 whitespace-nowrap">${statusHtml}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-left actions-cell">${actionsHtml}</td>
                    `;

                    // Add click handler to show details (but not on action buttons)
                    row.addEventListener('click', (e) => {
                        // Don't show details if clicking on action buttons
                        if (!e.target.closest('.actions-cell')) {
                            showPlayerDetails(player);
                        }
                    });

                    modalPlayerList.appendChild(row);
                });
            }).catch(error => {
                console.error('Error loading ranks:', error);
            });
        }
        if (loader) loader.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
    }, (error) => {
        console.error("Spielerliste Ladefehler:", error);
        modalPlayerList.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-red-500">Fehler: ${error.message}</td></tr>`;
        if (loader) loader.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
    });

    setUnsubscribe(unsubscribe);
}

/**
 * Loads players for dropdown selection (for points awarding)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export function loadPlayersForDropdown(clubId, db) {
    const select = document.getElementById('player-select');
    if (!select) return;
    const q = query(collection(db, 'users'), where('clubId', '==', clubId), where('role', '==', 'player'));

    onSnapshot(q, (snapshot) => {
        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        select.innerHTML = '<option value="">Spieler wählen...</option>';
        players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
            .forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${p.firstName} ${p.lastName}`;
                // Store player data in data attributes for Grundlagen display
                option.dataset.grundlagen = p.grundlagenCompleted || 0;
                option.dataset.rank = p.rank || 'Rekrut';
                select.appendChild(option);
            });
    }, (error) => {
        console.error("Fehler beim Laden der Spieler für das Dropdown:", error);
        select.innerHTML = '<option value="">Fehler beim Laden der Spieler</option>';
    });
}

/**
 * Shows detailed player information in the player management modal
 * @param {Object} player - Player data object
 */
export function showPlayerDetails(player) {
    const detailPanel = document.getElementById('player-detail-panel');
    const detailPlaceholder = document.getElementById('player-detail-placeholder');
    const detailContent = document.getElementById('player-detail-content');

    if (!detailPanel || !detailContent) return;

    // Import ranks module functions (we'll use dynamic import)
    import('./ranks.js').then(({ getRankProgress, formatRank }) => {
        const grundlagenCount = player.grundlagenCompleted || 0;
        const progress = getRankProgress(player.eloRating, player.xp, grundlagenCount);
        const { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded, grundlagenNeeded, grundlagenProgress, isMaxRank } = progress;

        detailContent.innerHTML = `
            <div class="space-y-4">
                <!-- Player Name & Rank -->
                <div class="text-center pb-3 border-b">
                    <h5 class="text-lg font-bold text-gray-900">${player.firstName} ${player.lastName}</h5>
                    <div class="flex items-center justify-center mt-2">
                        <span class="text-3xl">${currentRank.emoji}</span>
                        <span class="ml-2 text-md font-semibold" style="color: ${currentRank.color};">${currentRank.name}</span>
                    </div>
                </div>

                <!-- Stats Overview -->
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-blue-50 p-2 rounded">
                        <p class="text-xs text-gray-600">Elo</p>
                        <p class="text-lg font-bold text-blue-600">${player.eloRating || 0}</p>
                    </div>
                    <div class="bg-purple-50 p-2 rounded">
                        <p class="text-xs text-gray-600">XP</p>
                        <p class="text-lg font-bold text-purple-600">${player.xp || 0}</p>
                    </div>
                    <div class="bg-yellow-50 p-2 rounded">
                        <p class="text-xs text-gray-600">Saison-P.</p>
                        <p class="text-lg font-bold text-yellow-600">${player.points || 0}</p>
                    </div>
                </div>

                ${!isMaxRank ? `
                    <!-- Progress to Next Rank -->
                    <div>
                        <p class="text-sm font-semibold text-gray-700 mb-2">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                        <!-- Elo Progress -->
                        <div class="mb-3">
                            <div class="flex justify-between text-xs text-gray-600 mb-1">
                                <span>Elo: ${player.eloRating || 0}/${nextRank.minElo}</span>
                                <span>${eloProgress}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                            </div>
                            ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                        </div>

                        <!-- XP Progress -->
                        <div class="mb-3">
                            <div class="flex justify-between text-xs text-gray-600 mb-1">
                                <span>XP: ${player.xp || 0}/${nextRank.minXP}</span>
                                <span>${xpProgress}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                            </div>
                            ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                        </div>

                        ${nextRank.requiresGrundlagen ? `
                            <!-- Grundlagen Requirement -->
                            <div>
                                <div class="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>Grundlagen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                                    <span>${grundlagenProgress}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2">
                                    <div class="bg-green-600 h-2 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                                </div>
                                ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''}</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                            </div>
                        ` : ''}
                    </div>
                ` : '<p class="text-sm text-green-600 font-semibold text-center">🏆 Höchster Rang erreicht!</p>'}
            </div>
        `;

        // Show panel, hide placeholder
        detailPanel.classList.remove('hidden');
        if (detailPlaceholder) detailPlaceholder.classList.add('hidden');
    }).catch(error => {
        console.error('Error loading ranks module:', error);
        detailContent.innerHTML = '<p class="text-sm text-red-500">Fehler beim Laden der Rang-Information</p>';
    });
}

/**
 * Updates the Grundlagen progress display for a selected player (coach view)
 * @param {string} playerId - The selected player ID
 * @param {Object} db - Firestore database instance
 */
export function updateCoachGrundlagenDisplay(playerId, db) {
    const grundlagenInfo = document.getElementById('coach-grundlagen-info');
    const grundlagenText = document.getElementById('coach-grundlagen-text');
    const grundlagenBar = document.getElementById('coach-grundlagen-bar');

    // Cleanup old listener if exists
    if (currentGrundlagenListener) {
        currentGrundlagenListener();
        currentGrundlagenListener = null;
    }

    if (!grundlagenInfo || !playerId || !db) {
        if (grundlagenInfo) grundlagenInfo.classList.add('hidden');
        return;
    }

    // Set up real-time listener on selected player
    const playerRef = doc(db, 'users', playerId);
    currentGrundlagenListener = onSnapshot(playerRef, (docSnap) => {
        if (!docSnap.exists()) {
            grundlagenInfo.classList.add('hidden');
            return;
        }

        const playerData = docSnap.data();
        const grundlagenCount = playerData.grundlagenCompleted || 0;
        const grundlagenRequired = 5;
        const progress = (grundlagenCount / grundlagenRequired) * 100;

        // Show the info box
        grundlagenInfo.classList.remove('hidden');

        // Update text
        if (grundlagenCount >= grundlagenRequired) {
            grundlagenText.innerHTML = `✅ <strong>${grundlagenCount}/${grundlagenRequired}</strong> - Grundlagen abgeschlossen! Wettkämpfe freigeschaltet.`;
            grundlagenText.className = 'mt-1 text-sm text-green-700 font-semibold';
        } else {
            const remaining = grundlagenRequired - grundlagenCount;
            grundlagenText.innerHTML = `<strong>${grundlagenCount}/${grundlagenRequired}</strong> - Noch <strong>${remaining}</strong> Grundlagen-Übung${remaining > 1 ? 'en' : ''} bis Wettkämpfe freigeschaltet werden.`;
            grundlagenText.className = 'mt-1 text-sm text-blue-700';
        }

        // Update progress bar
        if (grundlagenBar) {
            grundlagenBar.style.width = `${progress}%`;
            if (grundlagenCount >= grundlagenRequired) {
                grundlagenBar.classList.remove('bg-blue-600');
                grundlagenBar.classList.add('bg-green-600');
            } else {
                grundlagenBar.classList.remove('bg-green-600');
                grundlagenBar.classList.add('bg-blue-600');
            }
        }
    }, (error) => {
        console.error('Error loading player grundlagen:', error);
        grundlagenInfo.classList.add('hidden');
    });
}
