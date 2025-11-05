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

    // === NEU: Logik zum Auslesen der Subgroup-Checkboxen ===
    const subgroupCheckboxes = form.querySelectorAll('#player-subgroups-checkboxes input[type="checkbox"]:checked');
    const subgroupIDs = Array.from(subgroupCheckboxes).map(cb => cb.value);
    
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
            subgroupIDs: subgroupIDs, // <-- Hinzugefügt
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
        button.innerHTML = '<i class="fas fa-spinner fa-spin w-5 mr-2"></i> Sende...'; // Lade-Spinner
        let playerEmail = button.dataset.email;
        if (!playerEmail) {
            playerEmail = prompt("Für diesen Spieler ist keine E-Mail hinterlegt. Bitte gib eine E-Mail-Adresse ein:");
            if (!playerEmail) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-paper-plane w-5 mr-2"></i> Einladung senden';
                return;
            }
            await updateDoc(doc(db, "users", playerId), { email: playerEmail });
            button.dataset.email = playerEmail; 
        }
        if (confirm(`Soll eine Einrichtungs-E-Mail an ${playerEmail} gesendet werden?`)) {
            try {
                const createAuthUser = httpsCallable(functions, 'createAuthUserForPlayer');
                await createAuthUser({ playerId, playerEmail });
                await sendPasswordResetEmail(auth, playerEmail);
                alert(`Einrichtungs-E-Mail an ${playerEmail} wurde erfolgreich gesendet!`);
            } catch (error) {
                console.error('Error sending invitation:', error);
                let errorMessage = error.message || 'Unbekannter Fehler';
                if (error.code === 'auth/invalid-email') errorMessage = 'Ungültige E-Mail-Adresse';
                else if (error.code === 'auth/user-not-found') errorMessage = 'Benutzer nicht gefunden.';
                else if (error.code === 'functions/unauthenticated') errorMessage = 'Keine Berechtigung.';
                alert(`Fehler beim Senden der Einladung:\n${errorMessage}`);
            } finally {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-paper-plane w-5 mr-2"></i> Einladung senden';
            }
        } else {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-paper-plane w-5 mr-2"></i> Einladung senden';
        }
    }

    // Handle delete button
    if (button.classList.contains('delete-player-btn')) {
        if (confirm('Möchten Sie diesen Spieler wirklich löschen?')) {
            try {
                await deleteDoc(doc(db, "users", playerId));
                alert('Spieler gelöscht.');
                document.getElementById('player-detail-panel').classList.add('hidden');
                document.getElementById('player-detail-placeholder').classList.remove('hidden');
            } catch (error) {
                console.error("Fehler beim Löschen des Spielers:", error);
                alert("Fehler: Der Spieler konnte nicht gelöscht werden.");
            }
        }
    }

    // Handle promote to coach button
    if (button.classList.contains('promote-coach-btn')) {
        if (confirm('Möchten Sie diesen Spieler zum Coach ernennen?')) {
             try {
                await updateDoc(doc(db, "users", playerId), { role: 'coach' });
                alert('Spieler wurde zum Coach befördert.');
            } catch (error) {
                console.error("Fehler beim Befördern:", error);
                alert("Fehler: Der Spieler konnte nicht befördert werden.");
            }
        }
    }
}

/**
 * Loads player list for the player management modal (NEW MASTER-DETAIL LAYOUT)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Function} setUnsubscribe - Callback to set unsubscribe function
 */
export function loadPlayerList(clubId, db, setUnsubscribe) {
    const modalPlayerList = document.getElementById('modal-player-list');
    const tableContainer = document.getElementById('modal-player-list-container');
    const loader = document.getElementById('modal-loader');
    const detailPanel = document.getElementById('player-detail-panel');
    const detailPlaceholder = document.getElementById('player-detail-placeholder');

    if (loader) loader.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (detailPanel) detailPanel.classList.add('hidden');
    if (detailPlaceholder) detailPlaceholder.classList.remove('hidden');

    document.querySelectorAll('.player-list-item-active').forEach(item => item.classList.remove('player-list-item-active'));
    
    const q = query(collection(db, "users"), where("clubId", "==", clubId), orderBy("lastName"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
        modalPlayerList.innerHTML = '';
        if (snapshot.empty) {
            modalPlayerList.innerHTML = '<p class="p-4 text-center text-gray-500">Keine Spieler in diesem Verein gefunden.</p>';
        } else {
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            import('./ranks.js').then(({ calculateRank }) => {
                players.forEach(player => {
                    const card = document.createElement('div');
                    card.className = 'player-list-item p-4 hover:bg-indigo-50 cursor-pointer';
                    card.dataset.playerId = player.id;
                    card.dataset.playerName = `${player.firstName} ${player.lastName}`.toLowerCase(); 

                    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                    const statusHtml = player.isOffline
                        ? '<span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Offline</span>'
                        : '<span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Online</span>';

                    const rank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

                    card.innerHTML = `
                        <div class="flex items-center">
                            <img class="h-10 w-10 rounded-full object-cover flex-shrink-0" src="${avatarSrc}" alt="">
                            <div class="ml-3 flex-grow min-w-0">
                                <p class="text-sm font-medium text-gray-900 truncate">${player.firstName} ${player.lastName}</p>
                                <p class="text-sm text-gray-500">${rank.emoji} ${rank.name}</p>
                            </div>
                            <div class="ml-2 flex-shrink-0">${statusHtml}</div>
                        </div>
                    `;

                    // === HIER IST DIE MAGIE ===
                    // Füge den Klick-Listener hinzu, der die Details + Buttons anzeigt
                    card.addEventListener('click', () => {
                        // 1. Zeige Spieler-Details
                        showPlayerDetails(player);
                        if (detailPanel) detailPanel.classList.remove('hidden');
                        if (detailPlaceholder) detailPlaceholder.classList.add('hidden');

                        // 2. Erstelle die Aktions-Buttons für diesen Spieler
                        const actionsContainer = document.getElementById('player-detail-actions');
                        if (actionsContainer) {
                            let actionsHtml = '';
                            if (player.isOffline) {
                                actionsHtml += `<button data-id="${player.id}" data-email="${player.email || ''}" class="send-invite-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:bg-indigo-100 hover:text-indigo-900"><i class="fas fa-paper-plane w-5 mr-2"></i> Einladung senden</button>`;
                            }
                            if (player.role === 'player') {
                                actionsHtml += `<button data-id="${player.id}" class="promote-coach-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-purple-600 hover:bg-purple-100 hover:text-purple-900"><i class="fas fa-user-shield w-5 mr-2"></i> Zum Coach ernennen</button>`;
                            }
                            actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" class="edit-subgroups-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900"><i class="fas fa-users-cog w-5 mr-2"></i> Gruppen bearbeiten</button>`;
                            actionsHtml += `<button data-id="${player.id}" class="delete-player-btn block w-full text-left mt-4 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-900"><i class="fas fa-trash-alt w-5 mr-2"></i> Spieler löschen</button>`;
                            
                            actionsContainer.innerHTML = actionsHtml;
                        }

                        // 3. Highlight-Styling
                        document.querySelectorAll('.player-list-item').forEach(item => item.classList.remove('player-list-item-active'));
                        card.classList.add('player-list-item-active');
                    });

                    modalPlayerList.appendChild(card);
                });
            }).catch(error => {
                console.error('Error loading ranks:', error);
            });
        }
        if (loader) loader.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');
    }, (error) => {
        console.error("Spielerliste Ladefehler:", error);
        modalPlayerList.innerHTML = `<p class="p-4 text-center text-red-500">Fehler: ${error.message}</p>`;
        if (loader) loader.classList.add('hidden');
        if (tableContainer) tableContainer.classList.remove('hidden');
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

    import('./ranks.js').then(({ getRankProgress, formatRank }) => {
        const grundlagenCount = player.grundlagenCompleted || 0;
        const progress = getRankProgress(player.eloRating, player.xp, grundlagenCount);
        const { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded, grundlagenNeeded, grundlagenProgress, isMaxRank } = progress;

        // Gruppen-Tags anzeigen
        const subgroups = player.subgroupIDs || [];
        // Lade die *Namen* der Gruppen, nicht nur die IDs
        // Diese Logik ist vereinfacht - idealerweise würdest du die Namen aus einer globalen Variable holen
        const subgroupHtml = subgroups.length > 0
            ? subgroups.map(tagId => `<span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tagId}</span>`).join('') // Zeigt vorerst IDs
            : '<p class="text-sm text-gray-500">Keinen Gruppen zugewiesen</p>';

        detailContent.innerHTML = `
            <div class="space-y-4">
                <div class="text-center pb-4 border-b">
                    <h5 class="text-2xl font-bold text-gray-900">${player.firstName} ${player.lastName}</h5>
                    <div class="flex items-center justify-center mt-2">
                        <span class="text-3xl">${currentRank.emoji}</span>
                        <span class="ml-2 text-xl font-semibold" style="color: ${currentRank.color};">${currentRank.name}</span>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-4 text-center">
                    <div class="bg-blue-50 p-3 rounded-lg">
                        <p class="text-sm text-gray-600">Elo</p>
                        <p class="text-2xl font-bold text-blue-600">${player.eloRating || 0}</p>
                    </div>
                    <div class="bg-purple-50 p-3 rounded-lg">
                        <p class="text-sm text-gray-600">XP</p>
                        <p class="text-2xl font-bold text-purple-600">${player.xp || 0}</p>
                    </div>
                    <div class="bg-yellow-50 p-3 rounded-lg">
                        <p class="text-sm text-gray-600">Saison-P.</p>
                        <p class="text-2xl font-bold text-yellow-600">${player.points || 0}</p>
                    </div>
                </div>

                <div>
                    <h5 class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Gruppen</h5>
                    <div class="flex flex-wrap">
                        ${subgroupHtml} 
                    </div>
                </div>

                ${!isMaxRank ? `
                    <div>
                        <h5 class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Fortschritt (zu ${nextRank.emoji} ${nextRank.name})</h5>
                        
                        <div class="mb-3">
                            <div class="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Elo: ${player.eloRating || 0}/${nextRank.minElo}</span>
                                <span>${eloProgress}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="bg-blue-600 h-2.5 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                            </div>
                            ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                        </div>

                        <div class="mb-3">
                            <div class="flex justify-between text-sm text-gray-600 mb-1">
                                <span>XP: ${player.xp || 0}/${nextRank.minXP}</span>
                                <span>${xpProgress}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="bg-purple-600 h-2.5 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                            </div>
                            ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                        </div>

                        ${nextRank.requiresGrundlagen ? `
                            <div>
                                <div class="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Grundlagen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                                    <span>${grundlagenProgress}%</span>
                                </div>
                                <div class="w-full bg-gray-200 rounded-full h-2.5">
                                    <div class="bg-green-600 h-2.5 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                                </div>
                                ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''}</p>` : `<p class="text-xs text-green-600 mt-1">✓ Erfüllt</p>`}
                            </div>
                        ` : ''}
                    </div>
                ` : '<p class="text-sm text-green-600 font-semibold text-center">🏆 Höchster Rang erreicht!</p>'}
            </div>
        `;

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
export function updateCoachGrundlagenDisplay(playerId, db = null) {
    const grundlagenInfo = document.getElementById('coach-grundlagen-info');
    const grundlagenText = document.getElementById('coach-grundlagen-text');
    const grundlagenBar = document.getElementById('coach-grundlagen-bar');

    if (currentGrundlagenListener) {
        currentGrundlagenListener();
        currentGrundlagenListener = null;
    }

    if (!grundlagenInfo || !playerId || !db) {
        if (grundlagenInfo) grundlagenInfo.classList.add('hidden');
        return;
    }

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

        grundlagenInfo.classList.remove('hidden');

        if (grundlagenCount >= grundlagenRequired) {
            grundlagenText.innerHTML = `✅ <strong>${grundlagenCount}/${grundlagenRequired}</strong> - Grundlagen abgeschlossen! Wettkämpfe freigeschaltet.`;
            grundlagenText.className = 'mt-1 text-sm text-green-700 font-semibold';
        } else {
            const remaining = grundlagenRequired - grundlagenCount;
            grundlagenText.innerHTML = `<strong>${grundlagenCount}/${grundlagenRequired}</strong> - Noch <strong>${remaining}</strong> Grundlagen-Übung${remaining > 1 ? 'en' : ''} bis Wettkämpfe freigeschaltet werden.`;
            grundlagenText.className = 'mt-1 text-sm text-blue-700';
        }

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


/**
 * ========================================================================
 * NEUE FUNKTIONEN FÜR SUBGROUP-MANAGEMENT (Hinzufügen)
 * ========================================================================
 */

/**
 * Lädt alle verfügbaren Untergruppen als Checkboxen in ein Container-Element.
 * Wird für "Spieler erstellen" UND "Spieler bearbeiten" verwendet.
 * @param {string} clubId - Die ID des Vereins
 * @param {Object} db - Firestore-Instanz
 * @param {string} containerId - Die ID des HTML-Elements (z.B. 'player-subgroups-checkboxes')
 * @param {Array} [existingSubgroups=[]] - (Optional) Array mit IDs von Gruppen, die vorab angehakt sein sollen.
 */
export function loadSubgroupsForPlayerForm(clubId, db, containerId, existingSubgroups = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-gray-500">Lade Gruppen...</p>';

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    // WICHTIG: onSnapshot hier ist vielleicht zu viel. 
    // Wir verwenden getDocs für eine einmalige Abfrage, da sich die Gruppen nicht
    // ändern, während das Modal geöffnet ist.
    getDocs(q).then(snapshot => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-xs text-gray-500">Keine Untergruppen erstellt. Erstelle zuerst eine im "Gruppen"-Tab.</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const subgroup = doc.data();
            const subgroupId = doc.id;
            const isChecked = existingSubgroups.includes(subgroupId);

            const div = document.createElement('div');
            div.className = 'flex items-center';
            div.innerHTML = `
                <input id="subgroup-${containerId}-${subgroupId}" 
                       name="subgroup" 
                       value="${subgroupId}" 
                       type="checkbox" 
                       ${isChecked ? 'checked' : ''}
                       class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <label for="subgroup-${containerId}-${subgroupId}" class="ml-3 block text-sm font-medium text-gray-700">
                    ${subgroup.name}
                </label>
            `;
            container.appendChild(div);
        });
    }).catch(error => {
        console.error("Error loading subgroups for form:", error);
        container.innerHTML = '<p class="text-xs text-red-500">Fehler beim Laden der Gruppen.</p>';
    });
}

/**
 * Öffnet das "Spieler bearbeiten"-Modal und befüllt es mit den Gruppen-Checkboxen.
 * @param {Object} player - Das Spieler-Objekt
 * @param {Object} db - Firestore-Instanz
 * @param {string} clubId - Die ID des Vereins
 */
export function openEditPlayerModal(player, db, clubId) {
    const modal = document.getElementById('edit-player-modal');
    if (!modal) return;

    // Spielername und Button-Daten setzen
    document.getElementById('edit-player-name').textContent = `${player.firstName} ${player.lastName}`;
    const saveButton = document.getElementById('save-player-subgroups-button');
    saveButton.dataset.playerId = player.id;
    saveButton.disabled = false;

    // Feedback-Text zurücksetzen
    document.getElementById('edit-player-feedback').textContent = '';

    // Checkboxen laden und vorab ankreuzen
    const existingSubgroups = player.subgroupIDs || [];
    loadSubgroupsForPlayerForm(clubId, db, 'edit-player-subgroups-checkboxes', existingSubgroups);

    // Modal anzeigen
    modal.classList.remove('hidden');
}

/**
 * Speichert die geänderten Untergruppen-Zuweisungen für einen Spieler.
 * @param {Object} db - Firestore-Instanz
 */
export async function handleSavePlayerSubgroups(db) {
    const saveButton = document.getElementById('save-player-subgroups-button');
    const playerId = saveButton.dataset.playerId;
    const feedbackEl = document.getElementById('edit-player-feedback');

    if (!playerId) {
        feedbackEl.textContent = 'Fehler: Keine Spieler-ID gefunden.';
        return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Speichere...';
    feedbackEl.textContent = '';

    try {
        // 1. Finde alle angehakten Checkboxen
        const container = document.getElementById('edit-player-subgroups-checkboxes');
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');
        
        // 2. Erstelle ein Array aus den Werten (den subgroupIDs)
        const newSubgroupIDs = Array.from(checkedBoxes).map(cb => cb.value);

        // 3. Aktualisiere das Spieler-Dokument
        const playerRef = doc(db, 'users', playerId);
        await updateDoc(playerRef, {
            subgroupIDs: newSubgroupIDs
        });

        feedbackEl.textContent = 'Erfolgreich gespeichert!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';

        // 4. Modal nach kurzer Verzögerung schließen
        setTimeout(() => {
            document.getElementById('edit-player-modal').classList.add('hidden');
            saveButton.disabled = false;
            saveButton.textContent = 'Änderungen speichern';

            // 5. Detailansicht aktualisieren (Placeholder anzeigen, damit Klick neu lädt)
            document.getElementById('player-detail-panel').classList.add('hidden');
            document.getElementById('player-detail-placeholder').classList.remove('hidden');
            // Aktives Highlight entfernen
            document.querySelectorAll('.player-list-item-active').forEach(item => item.classList.remove('player-list-item-active'));


        }, 1000);

    } catch (error) {
        console.error("Fehler beim Speichern der Untergruppen:", error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        saveButton.disabled = false;
        saveButton.textContent = 'Änderungen speichern';
    }
}