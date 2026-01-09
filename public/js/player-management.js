import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy,
    serverTimestamp,
    getDoc,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    handlePostPlayerCreationInvitation,
    openSendInvitationModal,
} from './player-invitation-management.js';



let currentGrundlagenListener = null;


export async function handleAddOfflinePlayer(e, db, currentUserData) {
    e.preventDefault();
    const form = e.target;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        if (submitButton.disabled) {
            console.log('Form submission already in progress, ignoring...');
            return;
        }
        submitButton.disabled = true;
        submitButton.textContent = 'Erstelle Spieler...';
    }

    const firstName = form.querySelector('#firstName').value.trim();
    const lastName = form.querySelector('#lastName').value.trim();
    const emailField = form.querySelector('#email');
    const email = emailField ? emailField.value.trim() : '';

    const subgroupCheckboxes = form.querySelectorAll(
        '#player-subgroups-checkboxes input[type="checkbox"]'
    );
    const subgroupIDs = Array.from(subgroupCheckboxes)
        .filter(cb => cb.checked || cb.disabled)
        .map(cb => cb.value);

    const isMatchReadyCheckbox = form.querySelector('#is-match-ready-checkbox');
    const isMatchReady = isMatchReadyCheckbox ? isMatchReadyCheckbox.checked : false;

    const qttrPointsField = form.querySelector('#qttr-points');
    const qttrPoints =
        qttrPointsField && qttrPointsField.value ? parseInt(qttrPointsField.value) : null;

    if (!firstName || !lastName) {
        alert('Vorname und Nachname sind Pflichtfelder.');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Spieler erstellen';
        }
        return;
    }

    try {
        const duplicateQuery = query(
            collection(db, 'users'),
            where('clubId', '==', currentUserData.clubId),
            where('firstName', '==', firstName),
            where('lastName', '==', lastName)
        );
        const duplicateSnapshot = await getDocs(duplicateQuery);

        if (!duplicateSnapshot.empty) {
            alert(
                `Ein Spieler mit dem Namen "${firstName} ${lastName}" existiert bereits in deinem Verein.`
            );
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
            return;
        }
    } catch (error) {
        console.error('Error checking for duplicates:', error);
    }

    let initialElo = 800;
    let initialHighestElo = 800;

    if (isMatchReady && qttrPoints) {
        if (qttrPoints < 800 || qttrPoints > 2500) {
            alert('QTTR-Punkte müssen zwischen 800 und 2500 liegen.');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
            return;
        }
        initialElo = Math.max(800, Math.round(qttrPoints * 0.9));
        initialHighestElo = initialElo;
    }

    try {
        const playerData = {
            firstName,
            lastName,
            clubId: currentUserData.clubId,
            role: 'player',
            isOffline: true,
            isMatchReady: isMatchReady,
            onboardingComplete: false,
            points: 0,
            eloRating: initialElo,
            highestElo: initialHighestElo,
            xp: 0,
            grundlagenCompleted: isMatchReady ? 5 : 0,
            subgroupIDs: subgroupIDs,
            createdAt: serverTimestamp(),
        };

        if (qttrPoints) {
            playerData.qttrPoints = qttrPoints;
        }
        if (email) {
            playerData.email = email;
        }

        const docRef = await addDoc(collection(db, 'users'), playerData);

        const result = await handlePostPlayerCreationInvitation(docRef.id, playerData);

        if (result.type !== 'code') {
            alert('Offline Spieler erfolgreich erstellt!');
            form.reset();
            document.getElementById('add-offline-player-modal').classList.add('hidden');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
        } else {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
        }
    } catch (error) {
        console.error('Fehler beim Erstellen des Spielers:', error);
        alert('Fehler: Der Spieler konnte nicht erstellt werden.');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Spieler erstellen';
        }
    }
}


export async function handlePlayerListActions(e, db, auth, functions) {
    const target = e.target;
    const button = target.closest('button');
    if (!button) return;

    const playerId = button.dataset.id;
    if (!playerId) return;

    if (button.classList.contains('send-new-invitation-btn')) {
        const playerName = button.dataset.name;
        const playerEmail = button.dataset.email || '';
        openSendInvitationModal(playerId, playerName, playerEmail);
        return;
    }

    if (button.classList.contains('manage-invitation-btn')) {
        const playerName = button.dataset.name;
        const playerEmail = button.dataset.email || '';
        openSendInvitationModal(playerId, playerName, playerEmail);
        return;
    }


    if (button.classList.contains('delete-player-btn')) {
        if (confirm('Möchten Sie diesen Spieler wirklich löschen?')) {
            try {
                await deleteDoc(doc(db, 'users', playerId));
                alert('Spieler gelöscht.');

                const detailPanelDesktop = document.getElementById('player-detail-panel-desktop');
                const detailPlaceholderDesktop = document.getElementById(
                    'player-detail-placeholder-desktop'
                );
                if (detailPanelDesktop) detailPanelDesktop.classList.add('hidden');
                if (detailPlaceholderDesktop) detailPlaceholderDesktop.classList.remove('hidden');

                const mobileModal = document.getElementById('player-detail-mobile-modal');
                if (mobileModal) mobileModal.classList.add('hidden');

                document
                    .querySelectorAll('.player-list-item-active')
                    .forEach(item => item.classList.remove('player-list-item-active'));
            } catch (error) {
                console.error('Fehler beim Löschen des Spielers:', error);
                alert('Fehler: Der Spieler konnte nicht gelöscht werden.');
            }
        }
    }

    if (button.classList.contains('promote-coach-btn')) {
        if (confirm('Möchten Sie diesen Spieler zum Coach ernennen?')) {
            try {
                await updateDoc(doc(db, 'users', playerId), { role: 'coach' });
                alert('Spieler wurde zum Coach befördert.');
            } catch (error) {
                console.error('Fehler beim Befördern:', error);
                alert('Fehler: Der Spieler konnte nicht befördert werden.');
            }
        }
    }
}


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

    document
        .querySelectorAll('.player-list-item-active')
        .forEach(item => item.classList.remove('player-list-item-active'));

    const q = query(collection(db, 'users'), where('clubId', '==', clubId), orderBy('lastName'));

    const unsubscribe = onSnapshot(
        q,
        snapshot => {
            modalPlayerList.innerHTML = '';
            if (snapshot.empty) {
                modalPlayerList.innerHTML =
                    '<p class="p-4 text-center text-gray-500">Keine Spieler in diesem Verein gefunden.</p>';
            } else {
                const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                import('./ranks.js')
                    .then(({ calculateRank }) => {
                        players.forEach(player => {
                            const card = document.createElement('div');
                            card.className =
                                'player-list-item p-4 hover:bg-indigo-50 cursor-pointer';
                            card.dataset.playerId = player.id;
                            card.dataset.playerName =
                                `${player.firstName} ${player.lastName}`.toLowerCase();

                            const initials =
                                (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                            const avatarSrc =
                                player.photoURL ||
                                `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                            const statusHtml = player.isOffline
                                ? '<span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Offline</span>'
                                : '<span class="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Online</span>';

                            const rank = calculateRank(
                                player.eloRating,
                                player.xp,
                                player.grundlagenCompleted || 0
                            );

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

                            card.addEventListener('click', () => {
                                document
                                    .querySelectorAll('.player-list-item')
                                    .forEach(item =>
                                        item.classList.remove('player-list-item-active')
                                    );
                                card.classList.add('player-list-item-active');

                                let actionsHtml = '';
                                if (player.isOffline) {
                                    actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" data-email="${player.email || ''}" class="send-new-invitation-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:bg-indigo-100 hover:text-indigo-900"><i class="fas fa-paper-plane w-5 mr-2"></i> Einladung versenden</button>`;
                                }
                                actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" data-email="${player.email || ''}" class="manage-invitation-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-900"><i class="fas fa-envelope-open-text w-5 mr-2"></i> Email/Code bearbeiten</button>`;

                                if (player.role === 'player') {
                                    actionsHtml += `<button data-id="${player.id}" class="promote-coach-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-purple-600 hover:bg-purple-100 hover:text-purple-900"><i class="fas fa-user-shield w-5 mr-2"></i> Zum Coach ernennen</button>`;
                                }
                                actionsHtml += `<button data-id="${player.id}" data-name="${player.firstName} ${player.lastName}" class="edit-subgroups-btn block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900"><i class="fas fa-users-cog w-5 mr-2"></i> Gruppen bearbeiten</button>`;
                                actionsHtml += `<button data-id="${player.id}" class="delete-player-btn block w-full text-left mt-4 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-100 hover:text-red-900"><i class="fas fa-trash-alt w-5 mr-2"></i> Spieler löschen</button>`;

                                const detailPanelDesktop = document.getElementById(
                                    'player-detail-panel-desktop'
                                );
                                const detailPlaceholderDesktop = document.getElementById(
                                    'player-detail-placeholder-desktop'
                                );
                                const detailContentDesktop = document.getElementById(
                                    'player-detail-content-desktop'
                                );
                                const actionsContainerDesktop = document.getElementById(
                                    'player-detail-actions-desktop'
                                );

                                if (
                                    detailPanelDesktop &&
                                    detailPlaceholderDesktop &&
                                    detailContentDesktop &&
                                    actionsContainerDesktop
                                ) {
                                    showPlayerDetails(player, detailContentDesktop, db);
                                    actionsContainerDesktop.innerHTML = actionsHtml;
                                    detailPanelDesktop.classList.remove('hidden');
                                    detailPlaceholderDesktop.classList.add('hidden');
                                }

                                const mobileModal = document.getElementById(
                                    'player-detail-mobile-modal'
                                );
                                const detailContentMobile = document.getElementById(
                                    'player-detail-content-mobile'
                                );
                                const actionsContainerMobile = document.getElementById(
                                    'player-detail-actions-mobile'
                                );

                                if (mobileModal && detailContentMobile && actionsContainerMobile) {
                                    showPlayerDetails(player, detailContentMobile, db);
                                    actionsContainerMobile.innerHTML = actionsHtml;
                                    mobileModal.classList.remove('hidden');
                                }
                            });

                            modalPlayerList.appendChild(card);
                        });
                    })
                    .catch(error => {
                        console.error('Error loading ranks:', error);
                    });
            }
            if (loader) loader.classList.add('hidden');
            if (tableContainer) tableContainer.classList.remove('hidden');
        },
        error => {
            console.error('Spielerliste Ladefehler:', error);
            modalPlayerList.innerHTML = `<p class="p-4 text-center text-red-500">Fehler: ${error.message}</p>`;
            if (loader) loader.classList.add('hidden');
            if (tableContainer) tableContainer.classList.remove('hidden');
        }
    );

    setUnsubscribe(unsubscribe);
}


export function loadPlayersForDropdown(clubId, db) {
    const select = document.getElementById('player-select');
    if (!select) return;
    const q = query(
        collection(db, 'users'),
        where('clubId', '==', clubId),
        where('role', '==', 'player')
    );

    onSnapshot(
        q,
        snapshot => {
            const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            select.innerHTML = '<option value="">Spieler wählen...</option>';
            players
                .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
                .forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = `${p.firstName} ${p.lastName}`;
                    option.dataset.grundlagen = p.grundlagenCompleted || 0;
                    option.dataset.rank = p.rank || 'Rekrut';
                    select.appendChild(option);
                });
        },
        error => {
            console.error('Fehler beim Laden der Spieler für das Dropdown:', error);
            select.innerHTML = '<option value="">Fehler beim Laden der Spieler</option>';
        }
    );
}


export function updatePointsPlayerDropdown(clubPlayers, subgroupFilter) {
    const select = document.getElementById('player-select');
    if (!select) return;

    const filteredPlayers =
        subgroupFilter === 'all'
            ? clubPlayers
            : clubPlayers.filter(p => {
                  const subgroupIDs = p.subgroupIDs || [];
                  return subgroupIDs.includes(subgroupFilter);
              });

    const currentValue = select.value;
    select.innerHTML = '<option value="">Spieler wählen...</option>';

    filteredPlayers
        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
        .forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.firstName} ${p.lastName}`;
            option.dataset.grundlagen = p.grundlagenCompleted || 0;
            option.dataset.rank = p.rank || 'Rekrut';
            select.appendChild(option);
        });

    if (currentValue && filteredPlayers.some(p => p.id === currentValue)) {
        select.value = currentValue;
    }
}


export async function showPlayerDetails(player, detailContent, db) {
    if (!detailContent) return;

    const { getRankProgress } = await import('./ranks.js');
    const grundlagenCount = player.grundlagenCompleted || 0;
    const progress = getRankProgress(player.eloRating, player.xp, grundlagenCount);
    const {
        currentRank,
        nextRank,
        eloProgress,
        xpProgress,
        eloNeeded,
        xpNeeded,
        grundlagenNeeded,
        grundlagenProgress,
        isMaxRank,
    } = progress;

    const subgroups = player.subgroupIDs || [];
    let subgroupHtml = '<p class="text-sm text-gray-500">Keinen Gruppen zugewiesen</p>';

    if (subgroups.length > 0 && db) {
        try {
            const subgroupNames = await Promise.all(
                subgroups.map(async subgroupId => {
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
                .map(
                    name =>
                        `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-xs font-semibold mr-2 mb-2">${name}</span>`
                )
                .join('');
        } catch (error) {
            console.error('Error loading subgroup names:', error);
            subgroupHtml = subgroups
                .map(
                    id =>
                        `<span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${id}</span>`
                )
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

                ${
                    !isMaxRank
                        ? `
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

                        ${
                            nextRank.requiresGrundlagen
                                ? `
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
                        `
                                : ''
                        }
                    </div>
                `
                        : '<p class="text-sm text-green-600 font-semibold text-center">🏆 Höchster Rang erreicht!</p>'
                }
            </div>
        `;
}


export function updateCoachGrundlagenDisplay(playerId) {
    const grundlagenInfo = document.getElementById('coach-grundlagen-info');
    const grundlagenText = document.getElementById('coach-grundlagen-text');
    const grundlagenBar = document.getElementById('coach-grundlagen-bar');

    if (currentGrundlagenListener) {
        currentGrundlagenListener();
    }

    if (!grundlagenInfo || !playerId) {
        if (grundlagenInfo) grundlagenInfo.classList.add('hidden');
        return;
    }

    const select = document.getElementById('player-select');
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
        grundlagenInfo.classList.add('hidden');
        return;
    }


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




export function loadSubgroupsForPlayerForm(clubId, db, containerId, existingSubgroups = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-gray-500">Lade Gruppen...</p>';

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    getDocs(q)
        .then(snapshot => {
            if (snapshot.empty) {
                container.innerHTML =
                    '<p class="text-xs text-gray-500">Keine Untergruppen erstellt. Erstelle zuerst eine im "Gruppen"-Tab.</p>';
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
        })
        .catch(error => {
            console.error('Error loading subgroups for form:', error);
            container.innerHTML =
                '<p class="text-xs text-red-500">Fehler beim Laden der Gruppen.</p>';
        });
}


export function openEditPlayerModal(player, db, clubId) {
    const modal = document.getElementById('edit-player-modal');
    if (!modal) return;

    document.getElementById('edit-player-name').textContent =
        `${player.firstName} ${player.lastName}`;
    const saveButton = document.getElementById('save-player-subgroups-button');
    saveButton.dataset.playerId = player.id;
    saveButton.disabled = false;

    document.getElementById('edit-player-feedback').textContent = '';

    const existingSubgroups = player.subgroupIDs || [];
    loadSubgroupsForPlayerForm(clubId, db, 'edit-player-subgroups-checkboxes', existingSubgroups);

    modal.classList.remove('hidden');
}


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
        const container = document.getElementById('edit-player-subgroups-checkboxes');
        const checkedBoxes = container.querySelectorAll('input[type="checkbox"]:checked');

        const newSubgroupIDs = Array.from(checkedBoxes).map(cb => cb.value);

        const playerRef = doc(db, 'users', playerId);
        await updateDoc(playerRef, {
            subgroupIDs: newSubgroupIDs,
        });

        feedbackEl.textContent = 'Erfolgreich gespeichert!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';

        setTimeout(() => {
            document.getElementById('edit-player-modal').classList.add('hidden');
            saveButton.disabled = false;
            saveButton.textContent = 'Änderungen speichern';

            document.getElementById('player-detail-panel').classList.add('hidden');
            document.getElementById('player-detail-placeholder').classList.remove('hidden');
            document
                .querySelectorAll('.player-list-item-active')
                .forEach(item => item.classList.remove('player-list-item-active'));
        }, 1000);
    } catch (error) {
        console.error('Fehler beim Speichern der Untergruppen:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        saveButton.disabled = false;
        saveButton.textContent = 'Änderungen speichern';
    }
}
