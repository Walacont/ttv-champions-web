import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { handlePostPlayerCreationInvitation, openSendInvitationModal } from './player-invitation-management.js';

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
            subgroupIDs: subgroupIDs,
            createdAt: serverTimestamp()
        };
        if (email) {
            playerData.email = email;
        }

        const docRef = await addDoc(collection(db, "users"), playerData);

        // NEU: Handle optional invitation after player creation
        const result = await handlePostPlayerCreationInvitation(docRef.id, playerData);

        if (result.type !== 'code') {
            // For 'none' or 'email' types, close modal immediately
            alert('Offline Spieler erfolgreich erstellt!');
            form.reset();
            document.getElementById('add-offline-player-modal').classList.add('hidden');
        }
        // For 'code' type, modal stays open showing the generated code

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

    // Handle new invitation button (opens modal with email/code choice)
    if (button.classList.contains('send-new-invitation-btn')) {
        const playerName = button.dataset.name;
        const playerEmail = button.dataset.email || '';
        openSendInvitationModal(playerId, playerName, playerEmail);
        return;
    }

    // Handle manage invitation button (email/code bearbeiten)
    if (button.classList.contains('manage-invitation-btn')) {
        const playerName = button.dataset.name;
        const playerEmail = button.dataset.email || '';
        openSendInvitationModal(playerId, playerName, playerEmail);
        return;
    }

    // Old email invite button removed - now using code-based invitations only

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
    const detailPanelDesktop = document.getElementById('player-detail-panel-desktop');
    const detailPlaceholderDesktop = document.getElementById('player-detail-placeholder-desktop');

    if (loader) loader.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (detailPanelDesktop) detailPanelDesktop.classList.add('hidden');
    if (detailPlaceholderDesktop) detailPlaceholderDesktop.classList.remove('hidden');

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

                    // Click handler für Desktop und Mobile
                    card.addEventListener('click', () => {
                        // Highlight aktiven Spieler
                        document.querySelectorAll('.player-list-item').forEach(item => item.classList.remove('player-list-item-active'));
                        card.classList.add('player-list-item-active');

                        // Erstelle Aktions-Buttons HTML
                        let actionsHtml = '';
                        if (player.isOffline) {
                            actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" data-email="${player.email || ''}" class="send-new-invitation-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:bg-indigo-100 hover:text-indigo-900"><i class="fas fa-paper-plane w-5 mr-2"></i> Einladung versenden</button>`;
                        }
                        // Email/Code-Verwaltung für ALLE Spieler (auch online)
                        actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" data-email="${player.email || ''}" class="manage-invitation-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-900"><i class="fas fa-envelope-open-text w-5 mr-2"></i> Email/Code bearbeiten</button>`;

                        if (player.role === 'player') {
                            actionsHtml += `<button data-id="${player.id}" class="promote-coach-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-purple-600 hover:bg-purple-100 hover:text-purple-900"><i class="fas fa-user-shield w-5 mr-2"></i> Zum Coach ernennen</button>`;
                        }
                        actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" class="edit-subgroups-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900"><i class="fas fa-users-cog w-5 mr-2"></i> Gruppen bearbeiten</button>`;
                        actionsHtml += `<button data-id="${player.id}" class="delete-player-btn block w-full text-left mt-4 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-900"><i class="fas fa-trash-alt w-5 mr-2"></i> Spieler löschen</button>`;

                        // Desktop: Zeige Details im rechten Panel
                        const detailPanelDesktop = document.getElementById('player-detail-panel-desktop');
                        const detailPlaceholderDesktop = document.getElementById('player-detail-placeholder-desktop');
                        const detailContentDesktop = document.getElementById('player-detail-content-desktop');
                        const actionsContainerDesktop = document.getElementById('player-detail-actions-desktop');

                        if (detailPanelDesktop && detailPlaceholderDesktop && detailContentDesktop && actionsContainerDesktop) {
                            showPlayerDetails(player, detailContentDesktop, db);
                            actionsContainerDesktop.innerHTML = actionsHtml;
                            detailPanelDesktop.classList.remove('hidden');
                            detailPlaceholderDesktop.classList.add('hidden');
                        }

                        // Mobile: Öffne Modal
                        const mobileModal = document.getElementById('player-detail-mobile-modal');
                        const detailContentMobile = document.getElementById('player-detail-content-mobile');
                        const actionsContainerMobile = document.getElementById('player-detail-actions-mobile');

                        if (mobileModal && detailContentMobile && actionsContainerMobile) {
                            showPlayerDetails(player, detailContentMobile, db);
                            actionsContainerMobile.innerHTML = actionsHtml;
                            mobileModal.classList.remove('hidden');
                        }
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
 * @param {HTMLElement} detailContent - Target element for content
 * @param {Object} db - Firestore database instance
 */
export async function showPlayerDetails(player, detailContent, db) {
    if (!detailContent) return;

    // Import ranks module functions
    const { getRankProgress } = await import('./ranks.js');
    const grundlagenCount = player.grundlagenCompleted || 0;
    const progress = getRankProgress(player.eloRating, player.xp, grundlagenCount);
    const { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded, grundlagenNeeded, grundlagenProgress, isMaxRank } = progress;

    // Lade Gruppen-Namen statt nur IDs
    const subgroups = player.subgroupIDs || [];
    let subgroupHtml = '<p class="text-sm text-gray-500">Keinen Gruppen zugewiesen</p>';

    if (subgroups.length > 0 && db) {
        try {
            const subgroupNames = await Promise.all(
                subgroups.map(async (subgroupId) => {
                    try {
                        const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
                        return subgroupDoc.exists() ? subgroupDoc.data().name : subgroupId;
                    } catch (error) {
                        console.error(`Error loading subgroup ${subgroupId}:`, error);
                        return subgroupId;
                    }
                })
            );
            subgroupHtml = subgroupNames
                .map(name => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-xs font-semibold mr-2 mb-2">${name}</span>`)
                .join('');
        } catch (error) {
            console.error('Error loading subgroup names:', error);
            subgroupHtml = subgroups
                .map(id => `<span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${id}</span>`)
                .join('');
        }
    }

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
}

/**
 * Updates the Grundlagen progress display for a selected player (coach view)
 * @param {string} playerId - The selected player ID
 * @param {Object} db - Firestore database instance
 */
export function updateCoachGrundlagenDisplay(playerId) {
    const grundlagenInfo = document.getElementById('coach-grundlagen-info');
    const grundlagenText = document.getElementById('coach-grundlagen-text');
    const grundlagenBar = document.getElementById('coach-grundlagen-bar');

    if (currentGrundlagenListener) {
        currentGrundlagenListener(); // Stop previous listener
    }

    if (!grundlagenInfo || !playerId) {
        if (grundlagenInfo) grundlagenInfo.classList.add('hidden');
        return;
    }

    // Get data from selected option (for fallback)
    const select = document.getElementById('player-select');
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
        grundlagenInfo.classList.add('hidden');
        return;
    }

    // === KORRIGIERTE LOGIK ===
    // Wir verwenden die Original-Logik, die den Wert aus dem Dataset liest.
    // Das ist effizienter, da die Daten bereits in `loadPlayersForDropdown` geladen wurden.
    
    const grundlagenCount = parseInt(selectedOption.dataset.grundlagen) || 0;
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