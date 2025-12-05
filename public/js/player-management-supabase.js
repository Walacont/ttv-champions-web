/**
 * Player Management Module (Supabase Version)
 * Handles offline player creation, player list management, and player dropdowns for coaches
 */

import {
    handlePostPlayerCreationInvitation,
    openSendInvitationModal,
} from './player-invitation-management.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

// Keep track of the current Grundlagen listener to avoid duplicates
let currentGrundlagenListener = null;

/**
 * Validates if a string is a valid UUID format
 * @param {string} str - String to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(str) {
    if (!str || typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

/**
 * Filters an array to only include valid UUIDs
 * @param {Array} arr - Array of strings to filter
 * @returns {Array} Array with only valid UUIDs
 */
function filterValidUUIDs(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter(isValidUUID);
}

/**
 * Maps player data from Supabase (snake_case) to app format (camelCase)
 */
function mapPlayerFromSupabase(player) {
    return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        email: player.email,
        clubId: player.club_id,
        role: player.role,
        isOffline: player.is_offline,
        isMatchReady: player.is_match_ready,
        onboardingComplete: player.onboarding_complete,
        points: player.points,
        eloRating: player.elo_rating,
        highestElo: player.highest_elo,
        xp: player.xp,
        grundlagenCompleted: player.grundlagen_completed,
        subgroupIDs: player.subgroup_ids || [],
        qttrPoints: player.qttr_points,
        photoURL: player.photo_url,
        rank: player.rank,
        createdAt: player.created_at
    };
}

/**
 * Maps player data from app format (camelCase) to Supabase (snake_case)
 */
function mapPlayerToSupabase(playerData) {
    const mapped = {};

    if (playerData.firstName !== undefined) mapped.first_name = playerData.firstName;
    if (playerData.lastName !== undefined) mapped.last_name = playerData.lastName;
    if (playerData.email !== undefined) mapped.email = playerData.email;
    if (playerData.clubId !== undefined) mapped.club_id = playerData.clubId;
    if (playerData.role !== undefined) mapped.role = playerData.role;
    if (playerData.isOffline !== undefined) mapped.is_offline = playerData.isOffline;
    if (playerData.isMatchReady !== undefined) mapped.is_match_ready = playerData.isMatchReady;
    if (playerData.onboardingComplete !== undefined) mapped.onboarding_complete = playerData.onboardingComplete;
    if (playerData.points !== undefined) mapped.points = playerData.points;
    if (playerData.eloRating !== undefined) mapped.elo_rating = playerData.eloRating;
    if (playerData.highestElo !== undefined) mapped.highest_elo = playerData.highestElo;
    if (playerData.xp !== undefined) mapped.xp = playerData.xp;
    if (playerData.grundlagenCompleted !== undefined) mapped.grundlagen_completed = playerData.grundlagenCompleted;
    if (playerData.subgroupIDs !== undefined) mapped.subgroup_ids = playerData.subgroupIDs;
    if (playerData.qttrPoints !== undefined) mapped.qttr_points = playerData.qttrPoints;
    if (playerData.photoURL !== undefined) mapped.photo_url = playerData.photoURL;

    return mapped;
}

/**
 * Handles offline player creation
 * @param {Event} e - Form submit event
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user data with clubId
 */
export async function handleAddOfflinePlayer(e, supabase, currentUserData) {
    e.preventDefault();
    const form = e.target;

    // Get submit button and disable it immediately to prevent double-clicks
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        if (submitButton.disabled) {
            console.log('Form submission already in progress, ignoring...');
            return; // Already processing
        }
        submitButton.disabled = true;
        submitButton.textContent = 'Erstelle Spieler...';
    }

    const firstName = form.querySelector('#firstName').value.trim();
    const lastName = form.querySelector('#lastName').value.trim();
    const emailField = form.querySelector('#email');
    const email = emailField ? emailField.value.trim() : '';

    // === NEU: Logik zum Auslesen der Subgroup-Checkboxen ===
    // Include both checked and disabled checkboxes (disabled = Hauptgruppe, always included)
    const subgroupCheckboxes = form.querySelectorAll(
        '#player-subgroups-checkboxes input[type="checkbox"]'
    );
    const subgroupIDs = Array.from(subgroupCheckboxes)
        .filter(cb => cb.checked || cb.disabled) // Include checked OR disabled (Hauptgruppe)
        .map(cb => cb.value);

    // === Wettkampfsbereit-Checkbox auslesen ===
    const isMatchReadyCheckbox = form.querySelector('#is-match-ready-checkbox');
    const isMatchReady = isMatchReadyCheckbox ? isMatchReadyCheckbox.checked : false;

    if (!firstName || !lastName) {
        alert('Vorname und Nachname sind Pflichtfelder.');
        // Re-enable button
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Spieler erstellen';
        }
        return;
    }

    // Check for duplicate: same first name, last name, and club
    try {
        const { data: duplicates, error: dupError } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', currentUserData.clubId)
            .eq('first_name', firstName)
            .eq('last_name', lastName);

        if (dupError) throw dupError;

        if (duplicates && duplicates.length > 0) {
            alert(
                `Ein Spieler mit dem Namen "${firstName} ${lastName}" existiert bereits in deinem Verein.`
            );
            // Re-enable button
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
            return;
        }
    } catch (error) {
        console.error('Error checking for duplicates:', error);
        // Continue anyway, better to create than to block
    }

    // Alle Spieler starten mit 800 ELO
    const initialElo = 800;
    const initialHighestElo = 800;

    try {
        const playerData = {
            first_name: firstName,
            last_name: lastName,
            club_id: currentUserData.clubId,
            role: 'player',
            is_offline: true,
            is_match_ready: isMatchReady,
            onboarding_complete: false,
            points: 0,
            elo_rating: initialElo,
            highest_elo: initialHighestElo,
            xp: 0,
            // Wenn bereits wettkampfsbereit, setze grundlagenCompleted auf 5 (erfüllt Anforderung)
            grundlagen_completed: isMatchReady ? 5 : 0,
            subgroup_ids: subgroupIDs,
        };

        if (email) {
            playerData.email = email;
        }

        const { data: newPlayer, error } = await supabase
            .from('profiles')
            .insert([playerData])
            .select()
            .single();

        if (error) throw error;

        // NEU: Handle optional invitation after player creation
        const result = await handlePostPlayerCreationInvitation(newPlayer.id, mapPlayerFromSupabase(newPlayer));

        if (result.type !== 'code') {
            // For 'none' or 'email' types, close modal immediately
            alert('Offline Spieler erfolgreich erstellt!');
            form.reset();
            document.getElementById('add-offline-player-modal').classList.add('hidden');
            // Re-enable button for next use
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
        } else {
            // For 'code' type, modal stays open showing the generated code
            // Re-enable button so modal can be closed and form reused
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Spieler erstellen';
            }
        }
    } catch (error) {
        console.error('Fehler beim Erstellen des Spielers:', error);
        alert('Fehler: Der Spieler konnte nicht erstellt werden.');
        // Re-enable button on error
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Spieler erstellen';
        }
    }
}

/**
 * Handles player list actions (toggle match-ready, send invite, delete, promote)
 * @param {Event} e - Click event
 * @param {Object} supabase - Supabase client instance
 */
export async function handlePlayerListActions(e, supabase) {
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
                const { error } = await supabase
                    .from('profiles')
                    .delete()
                    .eq('id', playerId);

                if (error) throw error;

                alert('Spieler gelöscht.');

                // Close desktop detail panel
                const detailPanelDesktop = document.getElementById('player-detail-panel-desktop');
                const detailPlaceholderDesktop = document.getElementById(
                    'player-detail-placeholder-desktop'
                );
                if (detailPanelDesktop) detailPanelDesktop.classList.add('hidden');
                if (detailPlaceholderDesktop) detailPlaceholderDesktop.classList.remove('hidden');

                // Close mobile modal
                const mobileModal = document.getElementById('player-detail-mobile-modal');
                if (mobileModal) mobileModal.classList.add('hidden');

                // Remove active highlight
                document
                    .querySelectorAll('.player-list-item-active')
                    .forEach(item => item.classList.remove('player-list-item-active'));
            } catch (error) {
                console.error('Fehler beim Löschen des Spielers:', error);
                alert('Fehler: Der Spieler konnte nicht gelöscht werden.');
            }
        }
    }

    // Handle promote to coach button
    if (button.classList.contains('promote-coach-btn')) {
        if (confirm('Möchten Sie diesen Spieler zum Coach ernennen?')) {
            try {
                const { error } = await supabase
                    .from('profiles')
                    .update({ role: 'coach' })
                    .eq('id', playerId);

                if (error) throw error;

                alert('Spieler wurde zum Coach befördert.');
            } catch (error) {
                console.error('Fehler beim Befördern:', error);
                alert('Fehler: Der Spieler konnte nicht befördert werden.');
            }
        }
    }
}

/**
 * Loads player list for the player management modal (NEW MASTER-DETAIL LAYOUT)
 * @param {string} clubId - Club ID
 * @param {Object} supabase - Supabase client instance
 * @param {Function} setUnsubscribe - Callback to set unsubscribe function
 */
export function loadPlayerList(clubId, supabase, setUnsubscribe) {
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

    // Initial load
    async function loadPlayers() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('club_id', clubId)
                .order('last_name');

            if (error) throw error;

            renderPlayerList(data || []);
        } catch (error) {
            console.error('Spielerliste Ladefehler:', error);
            modalPlayerList.innerHTML = `<p class="p-4 text-center text-red-500">Fehler: ${error.message}</p>`;
            if (loader) loader.classList.add('hidden');
            if (tableContainer) tableContainer.classList.remove('hidden');
        }
    }

    function renderPlayerList(playersData) {
        modalPlayerList.innerHTML = '';

        if (playersData.length === 0) {
            modalPlayerList.innerHTML =
                '<p class="p-4 text-center text-gray-500">Keine Spieler in diesem Verein gefunden.</p>';
        } else {
            const players = playersData.map(p => mapPlayerFromSupabase(p));

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

                        // Click handler für Desktop und Mobile
                        card.addEventListener('click', () => {
                            // Highlight aktiven Spieler
                            document
                                .querySelectorAll('.player-list-item')
                                .forEach(item =>
                                    item.classList.remove('player-list-item-active')
                                );
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
                                showPlayerDetails(player, detailContentDesktop, supabase);
                                actionsContainerDesktop.innerHTML = actionsHtml;
                                detailPanelDesktop.classList.remove('hidden');
                                detailPlaceholderDesktop.classList.add('hidden');
                            }

                            // Mobile: Öffne Modal
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
                                showPlayerDetails(player, detailContentMobile, supabase);
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
    }

    // Initial load
    loadPlayers();

    // Set up real-time subscription
    const subscription = supabase
        .channel('player-list-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                loadPlayers();
            }
        )
        .subscribe();

    // Return unsubscribe function
    setUnsubscribe(() => {
        subscription.unsubscribe();
    });
}

/**
 * Loads players for dropdown selection (for points awarding)
 * @param {string} clubId - Club ID
 * @param {Object} supabase - Supabase client instance
 */
export function loadPlayersForDropdown(clubId, supabase) {
    const select = document.getElementById('player-select');
    if (!select) return;

    async function loadPlayers() {
        try {
            // Include both players and coaches (coaches can also receive points as players)
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('club_id', clubId)
                .in('role', ['player', 'coach']);

            if (error) throw error;

            const players = (data || []).map(p => mapPlayerFromSupabase(p));
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
        } catch (error) {
            console.error('Fehler beim Laden der Spieler für das Dropdown:', error);
            select.innerHTML = '<option value="">Fehler beim Laden der Spieler</option>';
        }
    }

    // Initial load
    loadPlayers();

    // Set up real-time subscription
    const subscription = supabase
        .channel('player-dropdown-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                loadPlayers();
            }
        )
        .subscribe();

    // Return unsubscribe function for cleanup
    return () => {
        subscription.unsubscribe();
    };
}

/**
 * Updates the points player dropdown based on subgroup or age group filter
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} subgroupFilter - Current subgroup filter ('all', age group ID, or subgroup ID)
 */
export function updatePointsPlayerDropdown(clubPlayers, subgroupFilter) {
    const select = document.getElementById('player-select');
    if (!select) return;

    // Filter players based on subgroup, age group, or gender
    let filteredPlayers;
    if (subgroupFilter === 'all') {
        filteredPlayers = clubPlayers;
    } else if (isAgeGroupFilter(subgroupFilter)) {
        filteredPlayers = filterPlayersByAgeGroup(clubPlayers, subgroupFilter);
    } else if (isGenderFilter(subgroupFilter)) {
        filteredPlayers = filterPlayersByGender(clubPlayers, subgroupFilter);
    } else {
        filteredPlayers = clubPlayers.filter(p => {
            const subgroupIDs = p.subgroupIDs || [];
            return subgroupIDs.includes(subgroupFilter);
        });
    }

    // Populate dropdown with filtered players
    const currentValue = select.value; // Preserve selection if possible
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

    // Restore selection if player still in filtered list
    if (currentValue && filteredPlayers.some(p => p.id === currentValue)) {
        select.value = currentValue;
    }
}

/**
 * Shows detailed player information in the player management modal
 * @param {Object} player - Player data object
 * @param {HTMLElement} detailContent - Target element for content
 * @param {Object} supabase - Supabase client instance
 */
export async function showPlayerDetails(player, detailContent, supabase) {
    if (!detailContent) return;

    // Import ranks module functions
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

    // Lade Gruppen-Namen statt nur IDs
    const subgroups = player.subgroupIDs || [];
    // Filter out old Firebase IDs (non-UUIDs) before querying
    const validSubgroups = filterValidUUIDs(subgroups);
    let subgroupHtml = '<p class="text-sm text-gray-500">Keinen Gruppen zugewiesen</p>';

    if (validSubgroups.length > 0 && supabase) {
        try {
            const { data: subgroupData, error } = await supabase
                .from('subgroups')
                .select('id, name')
                .in('id', validSubgroups);

            if (error) throw error;

            if (subgroupData && subgroupData.length > 0) {
                const subgroupNames = validSubgroups.map(subgroupId => {
                    const found = subgroupData.find(s => s.id === subgroupId);
                    return found ? found.name : subgroupId;
                });
                subgroupHtml = subgroupNames
                    .map(
                        name =>
                            `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-xs font-semibold mr-2 mb-2">${name}</span>`
                    )
                    .join('');
            }
        } catch (error) {
            console.error('Error loading subgroup names:', error);
            subgroupHtml = validSubgroups
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

/**
 * Updates the Grundlagen progress display for a selected player (coach view)
 * @param {string} playerId - The selected player ID
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
 * @param {Object} supabase - Supabase-Instanz
 * @param {string} containerId - Die ID des HTML-Elements (z.B. 'player-subgroups-checkboxes')
 * @param {Array} [existingSubgroups=[]] - (Optional) Array mit IDs von Gruppen, die vorab angehakt sein sollen.
 */
export async function loadSubgroupsForPlayerForm(clubId, supabase, containerId, existingSubgroups = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-gray-500">Lade Gruppen...</p>';

    try {
        const { data: subgroups, error } = await supabase
            .from('subgroups')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!subgroups || subgroups.length === 0) {
            container.innerHTML =
                '<p class="text-xs text-gray-500">Keine Untergruppen erstellt. Erstelle zuerst eine im "Gruppen"-Tab.</p>';
            return;
        }

        container.innerHTML = '';
        subgroups.forEach(subgroup => {
            const subgroupId = subgroup.id;
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
    } catch (error) {
        console.error('Error loading subgroups for form:', error);
        container.innerHTML =
            '<p class="text-xs text-red-500">Fehler beim Laden der Gruppen.</p>';
    }
}

/**
 * Öffnet das "Spieler bearbeiten"-Modal und befüllt es mit den Gruppen-Checkboxen.
 * @param {Object} player - Das Spieler-Objekt
 * @param {Object} supabase - Supabase-Instanz
 * @param {string} clubId - Die ID des Vereins
 */
export function openEditPlayerModal(player, supabase, clubId) {
    const modal = document.getElementById('edit-player-modal');
    if (!modal) return;

    // Spielername und Button-Daten setzen
    document.getElementById('edit-player-name').textContent =
        `${player.firstName} ${player.lastName}`;
    const saveButton = document.getElementById('save-player-subgroups-button');
    saveButton.dataset.playerId = player.id;
    saveButton.disabled = false;

    // Feedback-Text zurücksetzen
    document.getElementById('edit-player-feedback').textContent = '';

    // Checkboxen laden und vorab ankreuzen
    const existingSubgroups = player.subgroupIDs || [];
    loadSubgroupsForPlayerForm(clubId, supabase, 'edit-player-subgroups-checkboxes', existingSubgroups);

    // Modal anzeigen
    modal.classList.remove('hidden');
}

/**
 * Speichert die geänderten Untergruppen-Zuweisungen für einen Spieler.
 * @param {Object} supabase - Supabase-Instanz
 */
export async function handleSavePlayerSubgroups(supabase) {
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
        const { error } = await supabase
            .from('profiles')
            .update({ subgroup_ids: newSubgroupIDs })
            .eq('id', playerId);

        if (error) throw error;

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
