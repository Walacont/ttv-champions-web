import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

/**
 * Player Management Module
 * Handles offline player creation, player list management, and player dropdowns for coaches
 */

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
    const playerId = target.dataset.id;
    if (!playerId) return;

    // Handle match-ready toggle
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
 * Updates the Grundlagen progress display for a selected player (coach view)
 * @param {string} playerId - The selected player ID
 */
export function updateCoachGrundlagenDisplay(playerId) {
    const grundlagenInfo = document.getElementById('coach-grundlagen-info');
    const grundlagenText = document.getElementById('coach-grundlagen-text');
    const grundlagenBar = document.getElementById('coach-grundlagen-bar');

    if (!grundlagenInfo || !playerId) {
        if (grundlagenInfo) grundlagenInfo.classList.add('hidden');
        return;
    }

    // Get data from selected option
    const select = document.getElementById('player-select');
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
        grundlagenInfo.classList.add('hidden');
        return;
    }

    const grundlagenCount = parseInt(selectedOption.dataset.grundlagen) || 0;
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
}
