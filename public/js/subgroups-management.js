import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    getDocs,
    orderBy,
    serverTimestamp,
    writeBatch,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Subgroups Management Module
 * Handles creation, editing, and deletion of training subgroups within a club
 */

/**
 * Loads all subgroups for a club
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Function} setUnsubscribe - Callback to set unsubscribe function
 */
export function loadSubgroupsList(clubId, db, setUnsubscribe) {
    const subgroupsListContainer = document.getElementById('subgroups-list');
    if (!subgroupsListContainer) return;

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
        q,
        snapshot => {
            subgroupsListContainer.innerHTML = '';

            if (snapshot.empty) {
                subgroupsListContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>Noch keine Untergruppen vorhanden.</p>
                    <p class="text-sm mt-2">Erstelle eine neue Untergruppe, um loszulegen.</p>
                </div>
            `;
                return;
            }

            snapshot.forEach(doc => {
                const subgroup = { id: doc.id, ...doc.data() };
                const isDefault = subgroup.isDefault || false;

                const card = document.createElement('div');
                card.className =
                    'bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow';
                card.innerHTML = `
                <div class="p-4">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <div class="w-4 h-4 rounded-full border-2 border-gray-300" style="background-color: ${subgroup.color || '#6366f1'};"></div>
                                <button
                                    data-subgroup-id="${subgroup.id}"
                                    class="toggle-player-list-btn flex items-center gap-2 hover:text-indigo-600 transition-colors"
                                >
                                    <svg class="h-5 w-5 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <h3 class="text-lg font-semibold text-gray-900">${subgroup.name}</h3>
                                </button>
                                ${isDefault ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Standard</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-500 ml-7">ID: ${subgroup.id}</p>
                            <p class="text-xs text-gray-400 ml-7 mt-1">Erstellt: ${subgroup.createdAt ? new Date(subgroup.createdAt.toDate()).toLocaleDateString('de-DE') : 'Unbekannt'}</p>
                        </div>
                        <div class="flex gap-2">
                            <button
                                data-id="${subgroup.id}"
                                data-name="${subgroup.name}"
                                data-color="${subgroup.color || '#6366f1'}"
                                data-is-default="${isDefault}"
                                class="edit-subgroup-btn text-indigo-600 hover:text-indigo-900 px-3 py-1 text-sm font-medium border border-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
                            >
                                Bearbeiten
                            </button>
                            ${
                                !isDefault
                                    ? `
                                <button
                                    data-id="${subgroup.id}"
                                    data-name="${subgroup.name}"
                                    class="delete-subgroup-btn text-red-600 hover:text-red-900 px-3 py-1 text-sm font-medium border border-red-600 rounded-md hover:bg-red-50 transition-colors"
                                >
                                    Löschen
                                </button>
                            `
                                    : '<span class="text-xs text-gray-400 px-3 py-1">Standard kann nicht gelöscht werden</span>'
                            }
                        </div>
                    </div>
                </div>

                <!-- Expandable Player List -->
                <div id="player-list-${subgroup.id}" class="hidden bg-gray-50 border-t border-gray-200 p-4">
                    <div class="mb-3 flex justify-between items-center">
                        <h4 class="text-sm font-semibold text-gray-700">👥 Spieler zuweisen</h4>
                        <button
                            data-subgroup-id="${subgroup.id}"
                            class="save-player-assignments-btn bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-1 px-3 rounded-md transition-colors"
                        >
                            Änderungen speichern
                        </button>
                    </div>
                    <div id="player-checkboxes-${subgroup.id}" class="max-h-80 overflow-y-auto space-y-2">
                        <p class="text-sm text-gray-500">Spieler werden geladen...</p>
                    </div>
                </div>
            `;

                subgroupsListContainer.appendChild(card);
            });
        },
        error => {
            console.error('Error loading subgroups:', error);
            subgroupsListContainer.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <p>Fehler beim Laden der Untergruppen</p>
                <p class="text-sm mt-2">${error.message}</p>
            </div>
        `;
        }
    );

    setUnsubscribe(unsubscribe);
}

/**
 * Handles subgroup creation
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function handleCreateSubgroup(e, db, clubId) {
    e.preventDefault();
    const form = e.target;
    const nameInput = form.querySelector('#subgroup-name');
    const colorInput = form.querySelector('input[name="subgroup-color"]:checked');
    const feedbackEl = document.getElementById('subgroup-form-feedback');

    const name = nameInput.value.trim();
    const color = colorInput ? colorInput.value : '#6366f1'; // Default to indigo

    if (!name) {
        if (feedbackEl) {
            feedbackEl.textContent = 'Bitte gib einen Namen ein.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        }
        return;
    }

    try {
        if (feedbackEl) {
            feedbackEl.textContent = 'Erstelle Untergruppe...';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-gray-600';
        }

        await addDoc(collection(db, 'subgroups'), {
            clubId: clubId,
            name: name,
            color: color,
            createdAt: serverTimestamp(),
            isDefault: false,
        });

        if (feedbackEl) {
            feedbackEl.textContent = 'Untergruppe erfolgreich erstellt!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        }

        form.reset();

        setTimeout(() => {
            if (feedbackEl) feedbackEl.textContent = '';
        }, 2000);
    } catch (error) {
        console.error('Error creating subgroup:', error);
        if (feedbackEl) {
            feedbackEl.textContent = `Fehler: ${error.message}`;
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        }
    }
}

/**
 * Opens the edit subgroup modal
 * @param {string} subgroupId - Subgroup ID
 * @param {string} currentName - Current subgroup name
 * @param {string} currentColor - Current subgroup color
 */
export function openEditSubgroupModal(subgroupId, currentName, currentColor) {
    const modal = document.getElementById('edit-subgroup-modal');
    const idInput = document.getElementById('edit-subgroup-id');
    const nameInput = document.getElementById('edit-subgroup-name');
    const feedbackEl = document.getElementById('edit-subgroup-feedback');

    if (!modal || !idInput || !nameInput) return;

    // Set values
    idInput.value = subgroupId;
    nameInput.value = currentName;

    // Set color
    const colorRadios = document.querySelectorAll('input[name="edit-subgroup-color"]');
    colorRadios.forEach(radio => {
        radio.checked = radio.value === currentColor;
    });

    // Clear feedback
    if (feedbackEl) feedbackEl.textContent = '';

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Closes the edit subgroup modal
 */
export function closeEditSubgroupModal() {
    const modal = document.getElementById('edit-subgroup-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Handles subgroup editing form submission
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 */
export async function handleEditSubgroupSubmit(e, db) {
    e.preventDefault();

    const idInput = document.getElementById('edit-subgroup-id');
    const nameInput = document.getElementById('edit-subgroup-name');
    const colorInput = document.querySelector('input[name="edit-subgroup-color"]:checked');
    const feedbackEl = document.getElementById('edit-subgroup-feedback');

    const subgroupId = idInput.value;
    const newName = nameInput.value.trim();
    const newColor = colorInput ? colorInput.value : '#6366f1';

    if (!newName) {
        if (feedbackEl) {
            feedbackEl.textContent = 'Bitte gib einen Namen ein.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        }
        return;
    }

    try {
        if (feedbackEl) {
            feedbackEl.textContent = 'Speichere Änderungen...';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-gray-600';
        }

        const subgroupRef = doc(db, 'subgroups', subgroupId);
        await updateDoc(subgroupRef, {
            name: newName,
            color: newColor,
            updatedAt: serverTimestamp(),
        });

        if (feedbackEl) {
            feedbackEl.textContent = 'Änderungen erfolgreich gespeichert!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        }

        setTimeout(() => {
            closeEditSubgroupModal();
        }, 1000);
    } catch (error) {
        console.error('Error updating subgroup:', error);
        if (feedbackEl) {
            feedbackEl.textContent = `Fehler: ${error.message}`;
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        }
    }
}

/**
 * Handles subgroup deletion
 * @param {string} subgroupId - Subgroup ID
 * @param {string} subgroupName - Subgroup name
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function handleDeleteSubgroup(subgroupId, subgroupName, db, clubId) {
    // Check if any players are assigned to this subgroup
    const usersQuery = query(
        collection(db, 'users'),
        where('clubId', '==', clubId),
        where('subgroupIDs', 'array-contains', subgroupId)
    );

    try {
        const usersSnapshot = await getDocs(usersQuery);
        const playerCount = usersSnapshot.size;

        if (playerCount > 0) {
            const confirmMsg = `Warnung: Diese Untergruppe enthält noch ${playerCount} Spieler.\n\nWenn du die Gruppe löschst, werden diese Spieler aus der Gruppe entfernt.\n\nMöchtest du fortfahren?`;
            if (!confirm(confirmMsg)) {
                return;
            }
        } else {
            if (!confirm(`Möchtest du die Untergruppe "${subgroupName}" wirklich löschen?`)) {
                return;
            }
        }

        // Delete the subgroup
        await deleteDoc(doc(db, 'subgroups', subgroupId));

        // Remove subgroup from all players
        if (playerCount > 0) {
            const batch = writeBatch(db);
            usersSnapshot.forEach(userDoc => {
                const userRef = doc(db, 'users', userDoc.id);
                const currentSubgroups = userDoc.data().subgroupIDs || [];
                const updatedSubgroups = currentSubgroups.filter(id => id !== subgroupId);
                batch.update(userRef, { subgroupIDs: updatedSubgroups });
            });
            await batch.commit();
        }

        alert('Untergruppe erfolgreich gelöscht!');
    } catch (error) {
        console.error('Error deleting subgroup:', error);
        alert(`Fehler beim Löschen: ${error.message}`);
    }
}

/**
 * Loads subgroups into a dropdown/select element
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {string} selectId - ID of the select element
 * @param {boolean} includeAll - Whether to include an "Alle" option
 */
export function loadSubgroupsForDropdown(clubId, db, selectId, includeAll = false) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    onSnapshot(
        q,
        snapshot => {
            select.innerHTML = '';

            if (includeAll) {
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'Alle (Gesamtverein)';
                select.appendChild(allOption);
            }

            snapshot.forEach(doc => {
                const subgroup = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = subgroup.name;
                select.appendChild(option);
            });

            // Trigger change event to update dependent UI
            select.dispatchEvent(new Event('change'));
        },
        error => {
            console.error('Error loading subgroups for dropdown:', error);
            select.innerHTML = '<option value="">Fehler beim Laden</option>';
        }
    );
}

/**
 * Gets all subgroups for a club (as a promise)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Array>} - Array of subgroups
 */
export async function getSubgroups(clubId, db) {
    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Loads club players and displays them as checkboxes for a subgroup
 * @param {string} subgroupId - Subgroup ID
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export async function loadPlayerCheckboxes(subgroupId, clubId, db) {
    const container = document.getElementById(`player-checkboxes-${subgroupId}`);
    if (!container) return;

    try {
        // Query all players in the club
        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            orderBy('firstName', 'asc')
        );

        const playersSnapshot = await getDocs(playersQuery);

        if (playersSnapshot.empty) {
            container.innerHTML =
                '<p class="text-sm text-gray-500">Keine Spieler im Verein gefunden.</p>';
            return;
        }

        container.innerHTML = '';

        playersSnapshot.forEach(playerDoc => {
            const player = { id: playerDoc.id, ...playerDoc.data() };
            const isInSubgroup = (player.subgroupIDs || []).includes(subgroupId);

            const checkboxItem = document.createElement('label');
            checkboxItem.className =
                'flex items-center gap-3 p-2 hover:bg-white rounded-md cursor-pointer transition-colors';
            checkboxItem.innerHTML = `
                <input
                    type="checkbox"
                    data-player-id="${player.id}"
                    ${isInSubgroup ? 'checked' : ''}
                    class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                >
                <span class="text-sm text-gray-700">
                    ${player.firstName || ''} ${player.lastName || ''}
                    ${player.email ? `<span class="text-xs text-gray-400">(${player.email})</span>` : ''}
                </span>
            `;

            container.appendChild(checkboxItem);
        });
    } catch (error) {
        console.error('Error loading player checkboxes:', error);
        container.innerHTML = `<p class="text-sm text-red-500">Fehler beim Laden: ${error.message}</p>`;
    }
}

/**
 * Saves player assignments for a subgroup
 * @param {string} subgroupId - Subgroup ID
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export async function savePlayerAssignments(subgroupId, clubId, db) {
    const container = document.getElementById(`player-checkboxes-${subgroupId}`);
    if (!container) return;

    try {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        const batch = writeBatch(db);
        let changesCount = 0;

        // Get all players to check current assignments
        const playersQuery = query(collection(db, 'users'), where('clubId', '==', clubId));
        const playersSnapshot = await getDocs(playersQuery);
        const playersMap = new Map();
        playersSnapshot.forEach(doc => {
            playersMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        checkboxes.forEach(checkbox => {
            const playerId = checkbox.dataset.playerId;
            const isChecked = checkbox.checked;
            const player = playersMap.get(playerId);

            if (!player) return;

            const currentSubgroups = player.subgroupIDs || [];
            const isCurrentlyInSubgroup = currentSubgroups.includes(subgroupId);

            // Add player to subgroup
            if (isChecked && !isCurrentlyInSubgroup) {
                const updatedSubgroups = [...currentSubgroups, subgroupId];
                const playerRef = doc(db, 'users', playerId);
                batch.update(playerRef, { subgroupIDs: updatedSubgroups });
                changesCount++;
            }

            // Remove player from subgroup
            if (!isChecked && isCurrentlyInSubgroup) {
                const updatedSubgroups = currentSubgroups.filter(id => id !== subgroupId);
                const playerRef = doc(db, 'users', playerId);
                batch.update(playerRef, { subgroupIDs: updatedSubgroups });
                changesCount++;
            }
        });

        if (changesCount === 0) {
            alert('Keine Änderungen vorgenommen.');
            return;
        }

        await batch.commit();
        alert(`${changesCount} Spieler erfolgreich zugewiesen/entfernt!`);
    } catch (error) {
        console.error('Error saving player assignments:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
    }
}

/**
 * Handles click events on subgroup action buttons
 * @param {Event} e - Click event
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function handleSubgroupActions(e, db, clubId) {
    const target = e.target;
    const button = target.closest('button');
    if (!button) return;

    // Handle toggle player list
    if (button.classList.contains('toggle-player-list-btn')) {
        const subgroupId = button.dataset.subgroupId;
        const playerListDiv = document.getElementById(`player-list-${subgroupId}`);
        const arrow = button.querySelector('svg');

        if (playerListDiv && arrow) {
            const isHidden = playerListDiv.classList.contains('hidden');

            if (isHidden) {
                // Show player list
                playerListDiv.classList.remove('hidden');
                arrow.style.transform = 'rotate(90deg)';

                // Load players if not already loaded
                const container = document.getElementById(`player-checkboxes-${subgroupId}`);
                if (container && container.querySelector('p')) {
                    await loadPlayerCheckboxes(subgroupId, clubId, db);
                }
            } else {
                // Hide player list
                playerListDiv.classList.add('hidden');
                arrow.style.transform = 'rotate(0deg)';
            }
        }
        return;
    }

    // Handle save player assignments
    if (button.classList.contains('save-player-assignments-btn')) {
        const subgroupId = button.dataset.subgroupId;
        await savePlayerAssignments(subgroupId, clubId, db);
        return;
    }

    // Handle edit button
    if (button.classList.contains('edit-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const currentName = button.dataset.name;
        const currentColor = button.dataset.color || '#6366f1';
        openEditSubgroupModal(subgroupId, currentName, currentColor);
        return;
    }

    // Handle delete button
    if (button.classList.contains('delete-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const subgroupName = button.dataset.name;
        await handleDeleteSubgroup(subgroupId, subgroupName, db, clubId);
    }
}
