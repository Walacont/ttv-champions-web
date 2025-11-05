import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, orderBy, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

    const unsubscribe = onSnapshot(q, (snapshot) => {
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
            card.className = 'bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow';
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <h3 class="text-lg font-semibold text-gray-900">${subgroup.name}</h3>
                            ${isDefault ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Standard</span>' : ''}
                        </div>
                        <p class="text-sm text-gray-500">ID: ${subgroup.id}</p>
                        <p class="text-xs text-gray-400 mt-1">Erstellt: ${subgroup.createdAt ? new Date(subgroup.createdAt.toDate()).toLocaleDateString('de-DE') : 'Unbekannt'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            data-id="${subgroup.id}"
                            data-name="${subgroup.name}"
                            data-is-default="${isDefault}"
                            class="edit-subgroup-btn text-indigo-600 hover:text-indigo-900 px-3 py-1 text-sm font-medium border border-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
                        >
                            Bearbeiten
                        </button>
                        ${!isDefault ? `
                            <button
                                data-id="${subgroup.id}"
                                data-name="${subgroup.name}"
                                class="delete-subgroup-btn text-red-600 hover:text-red-900 px-3 py-1 text-sm font-medium border border-red-600 rounded-md hover:bg-red-50 transition-colors"
                            >
                                Löschen
                            </button>
                        ` : '<span class="text-xs text-gray-400 px-3 py-1">Standard kann nicht gelöscht werden</span>'}
                    </div>
                </div>
            `;

            subgroupsListContainer.appendChild(card);
        });
    }, (error) => {
        console.error("Error loading subgroups:", error);
        subgroupsListContainer.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <p>Fehler beim Laden der Untergruppen</p>
                <p class="text-sm mt-2">${error.message}</p>
            </div>
        `;
    });

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
    const feedbackEl = document.getElementById('subgroup-form-feedback');

    const name = nameInput.value.trim();

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
            createdAt: serverTimestamp(),
            isDefault: false
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
        console.error("Error creating subgroup:", error);
        if (feedbackEl) {
            feedbackEl.textContent = `Fehler: ${error.message}`;
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        }
    }
}

/**
 * Handles subgroup editing
 * @param {string} subgroupId - Subgroup ID
 * @param {string} currentName - Current subgroup name
 * @param {Object} db - Firestore database instance
 */
export async function handleEditSubgroup(subgroupId, currentName, db) {
    const newName = prompt(`Neuer Name für die Untergruppe:`, currentName);

    if (!newName || newName.trim() === '') {
        return;
    }

    if (newName.trim() === currentName) {
        return;
    }

    try {
        const subgroupRef = doc(db, 'subgroups', subgroupId);
        await updateDoc(subgroupRef, {
            name: newName.trim(),
            updatedAt: serverTimestamp()
        });

        alert('Untergruppe erfolgreich umbenannt!');
    } catch (error) {
        console.error("Error updating subgroup:", error);
        alert(`Fehler beim Umbenennen: ${error.message}`);
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
        console.error("Error deleting subgroup:", error);
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

    onSnapshot(q, (snapshot) => {
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
    }, (error) => {
        console.error("Error loading subgroups for dropdown:", error);
        select.innerHTML = '<option value="">Fehler beim Laden</option>';
    });
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
 * Handles click events on subgroup action buttons
 * @param {Event} e - Click event
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function handleSubgroupActions(e, db, clubId) {
    const target = e.target;
    const button = target.closest('button');
    if (!button) return;

    // Handle edit button
    if (button.classList.contains('edit-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const currentName = button.dataset.name;
        await handleEditSubgroup(subgroupId, currentName, db);
    }

    // Handle delete button
    if (button.classList.contains('delete-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const subgroupName = button.dataset.name;
        await handleDeleteSubgroup(subgroupId, subgroupName, db, clubId);
    }
}
