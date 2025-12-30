/** Untergruppen-Verwaltung (Supabase-Version) - Multi-Sport-Unterstützung: Filterung nach aktiver Sportart */

import { formatDate } from './ui-utils-supabase.js';
import { getSportContext } from './sport-context-supabase.js';

let currentSportContext = null;
let storedSupabase = null;
let storedClubId = null;
let storedUserId = null;

/** Aktualisiert die Untergruppen-Liste durch Tab-Klick-Simulation */
export async function refreshSubgroupsList() {
    const subgroupsTabButton = document.querySelector('.tab-button[data-tab="subgroups"]');
    if (subgroupsTabButton) {
        subgroupsTabButton.click();
    } else {
        if (storedSupabase && storedClubId) {
            await reloadSubgroupsListDirectly();
        }
    }
}

async function reloadSubgroupsListDirectly() {
    const subgroupsListContainer = document.getElementById('subgroups-list');
    if (!subgroupsListContainer || !storedSupabase || !storedClubId) {
        console.log('[Subgroups] Cannot reload: missing container or context');
        return;
    }

    console.log('[Subgroups] Reloading list directly...');

    try {
        let activeSportId = null;
        if (storedUserId) {
            const sportContext = await getSportContext(storedUserId);
            activeSportId = sportContext?.sportId;
        }

        let query = storedSupabase
            .from('subgroups')
            .select('*')
            .eq('club_id', storedClubId)
            .order('created_at', { ascending: true });

        if (activeSportId) {
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data, error } = await query;

        if (error) throw error;

        console.log('[Subgroups] Query returned', data?.length, 'subgroups:', data?.map(s => s.name));
        console.log('[Subgroups] Clearing container innerHTML...');
        console.log('[Subgroups] Container element:', subgroupsListContainer);
        console.log('[Subgroups] Container children before clear:', subgroupsListContainer.children.length);
        subgroupsListContainer.innerHTML = '';
        console.log('[Subgroups] Container children after clear:', subgroupsListContainer.children.length);

        subgroupsListContainer.style.opacity = '0.5';
        setTimeout(() => { subgroupsListContainer.style.opacity = '1'; }, 200);

        if (!data || data.length === 0) {
            subgroupsListContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>Noch keine Untergruppen vorhanden.</p>
                    <p class="text-sm mt-2">Erstelle eine neue Untergruppe, um loszulegen.</p>
                </div>
            `;
            console.log('[Subgroups] No subgroups, showing empty state');
            return;
        }

        data.forEach(subgroupData => {
            const subgroup = mapSubgroupFromSupabase(subgroupData);
            const isDefault = subgroup.isDefault || false;

            const card = document.createElement('div');
            card.className =
                'bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow';
            card.innerHTML = `
                <div class="p-4">
                    <div class="flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                <div class="w-4 h-4 flex-shrink-0 rounded-full border-2 border-gray-300" style="background-color: ${subgroup.color || '#6366f1'};"></div>
                                <button
                                    data-subgroup-id="${subgroup.id}"
                                    class="toggle-player-list-btn flex items-center gap-2 hover:text-indigo-600 transition-colors min-w-0 overflow-hidden"
                                >
                                    <svg class="h-5 w-5 flex-shrink-0 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span class="text-lg font-semibold text-gray-900 truncate block">${subgroup.name}</span>
                                </button>
                                ${isDefault ? '<span class="text-xs flex-shrink-0 bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">Standard</span>' : ''}
                            </div>
                            <div class="flex gap-2 flex-shrink-0">
                                <button
                                    data-id="${subgroup.id}"
                                    data-name="${subgroup.name}"
                                    data-color="${subgroup.color || '#6366f1'}"
                                    data-is-default="${isDefault}"
                                    class="edit-subgroup-btn text-indigo-600 hover:text-indigo-900 px-2 py-1 text-sm font-medium border border-indigo-600 rounded-md hover:bg-indigo-50 transition-colors whitespace-nowrap"
                                >
                                    <span class="hidden sm:inline">Bearbeiten</span>
                                    <svg class="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                ${
                                    !isDefault
                                        ? `
                                    <button
                                        data-id="${subgroup.id}"
                                        data-name="${subgroup.name}"
                                        class="delete-subgroup-btn text-red-600 hover:text-red-900 px-2 py-1 text-sm font-medium border border-red-600 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
                                    >
                                        <span class="hidden sm:inline">Löschen</span>
                                        <svg class="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                `
                                        : ''
                                }
                            </div>
                        </div>
                        <div class="ml-7">
                            <p class="text-sm text-gray-500 truncate">ID: ${subgroup.id}</p>
                            <p class="text-xs text-gray-400 mt-1">Erstellt: ${formatDate(subgroup.createdAt) || 'Unbekannt'}</p>
                        </div>
                    </div>
                </div>

                <!-- Expandable Player List -->
                <div id="player-list-${subgroup.id}" class="hidden bg-gray-50 border-t border-gray-200 p-4">
                    <div class="mb-3 flex justify-between items-center">
                        <h4 class="text-sm font-semibold text-gray-700">Spieler zuweisen</h4>
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

        console.log('[Subgroups] List reloaded with', data.length, 'subgroups');
    } catch (error) {
        console.error('[Subgroups] Error reloading list:', error);
    }
}

/** Mappt Untergruppen-Daten von Supabase (snake_case) zu App-Format (camelCase) */
function mapSubgroupFromSupabase(subgroup) {
    return {
        id: subgroup.id,
        clubId: subgroup.club_id,
        sportId: subgroup.sport_id,
        name: subgroup.name,
        color: subgroup.color,
        isDefault: subgroup.is_default,
        createdAt: subgroup.created_at,
        updatedAt: subgroup.updated_at
    };
}

/** Lädt alle Untergruppen für einen Verein (gefiltert nach Sportart) */
export function loadSubgroupsList(clubId, supabase, setUnsubscribe, userId = null) {
    const subgroupsListContainer = document.getElementById('subgroups-list');
    if (!subgroupsListContainer) return;

    async function loadSubgroups() {
        try {
            let activeSportId = null;
            let effectiveClubId = clubId;

            if (userId) {
                currentSportContext = await getSportContext(userId);
                activeSportId = currentSportContext?.sportId;
                effectiveClubId = currentSportContext?.clubId || clubId;
            }

            let query = supabase
                .from('subgroups')
                .select('*')
                .eq('club_id', effectiveClubId)
                .order('created_at', { ascending: true });

            if (activeSportId) {
                query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
            }

            const { data, error } = await query;

            if (error) throw error;

            subgroupsListContainer.innerHTML = '';

            if (!data || data.length === 0) {
                subgroupsListContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p>Noch keine Untergruppen vorhanden.</p>
                    <p class="text-sm mt-2">Erstelle eine neue Untergruppe, um loszulegen.</p>
                </div>
            `;
                return;
            }

            data.forEach(subgroupData => {
                const subgroup = mapSubgroupFromSupabase(subgroupData);
                const isDefault = subgroup.isDefault || false;

                const card = document.createElement('div');
                card.className =
                    'bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow';
                card.innerHTML = `
                <div class="p-4">
                    <div class="flex flex-col gap-3">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                <div class="w-4 h-4 flex-shrink-0 rounded-full border-2 border-gray-300" style="background-color: ${subgroup.color || '#6366f1'};"></div>
                                <button
                                    data-subgroup-id="${subgroup.id}"
                                    class="toggle-player-list-btn flex items-center gap-2 hover:text-indigo-600 transition-colors min-w-0 overflow-hidden"
                                >
                                    <svg class="h-5 w-5 flex-shrink-0 transform transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                    </svg>
                                    <span class="text-lg font-semibold text-gray-900 truncate block">${subgroup.name}</span>
                                </button>
                                ${isDefault ? '<span class="text-xs flex-shrink-0 bg-blue-100 text-blue-800 px-2 py-1 rounded-full whitespace-nowrap">Standard</span>' : ''}
                            </div>
                            <div class="flex gap-2 flex-shrink-0">
                                <button
                                    data-id="${subgroup.id}"
                                    data-name="${subgroup.name}"
                                    data-color="${subgroup.color || '#6366f1'}"
                                    data-is-default="${isDefault}"
                                    class="edit-subgroup-btn text-indigo-600 hover:text-indigo-900 px-2 py-1 text-sm font-medium border border-indigo-600 rounded-md hover:bg-indigo-50 transition-colors whitespace-nowrap"
                                >
                                    <span class="hidden sm:inline">Bearbeiten</span>
                                    <svg class="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                ${
                                    !isDefault
                                        ? `
                                    <button
                                        data-id="${subgroup.id}"
                                        data-name="${subgroup.name}"
                                        class="delete-subgroup-btn text-red-600 hover:text-red-900 px-2 py-1 text-sm font-medium border border-red-600 rounded-md hover:bg-red-50 transition-colors whitespace-nowrap"
                                    >
                                        <span class="hidden sm:inline">Löschen</span>
                                        <svg class="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                `
                                        : ''
                                }
                            </div>
                        </div>
                        <div class="ml-7">
                            <p class="text-sm text-gray-500 truncate">ID: ${subgroup.id}</p>
                            <p class="text-xs text-gray-400 mt-1">Erstellt: ${formatDate(subgroup.createdAt) || 'Unbekannt'}</p>
                        </div>
                    </div>
                </div>

                <!-- Expandable Player List -->
                <div id="player-list-${subgroup.id}" class="hidden bg-gray-50 border-t border-gray-200 p-4">
                    <div class="mb-3 flex justify-between items-center">
                        <h4 class="text-sm font-semibold text-gray-700">Spieler zuweisen</h4>
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
        } catch (error) {
            console.error('Error loading subgroups:', error);
            subgroupsListContainer.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <p>Fehler beim Laden der Untergruppen</p>
                <p class="text-sm mt-2">${error.message}</p>
            </div>
        `;
        }
    }

    storedSupabase = supabase;
    storedClubId = clubId;
    storedUserId = userId;
    console.log('[Subgroups] Context stored - supabase:', !!supabase, 'clubId:', clubId, 'userId:', userId);

    loadSubgroups();

    // Echtzeit-Subscription für Änderungen
    const subscription = supabase
        .channel('subgroups-list-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'subgroups',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                loadSubgroups();
            }
        )
        .subscribe();

    setUnsubscribe(() => {
        subscription.unsubscribe();
    });
}

/** Erstellt eine neue Untergruppe */
export async function handleCreateSubgroup(e, supabase, clubId) {
    e.preventDefault();

    storedSupabase = supabase;
    storedClubId = clubId;

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

        const { data: { user } } = await supabase.auth.getUser();
        let sportId = null;
        if (user) {
            const sportContext = await getSportContext(user.id);
            sportId = sportContext?.sportId || null;
            console.log('[Subgroups] Using sport_id from context:', sportId);
        }

        const { error } = await supabase
            .from('subgroups')
            .insert([{
                club_id: clubId,
                sport_id: sportId,
                name: name,
                color: color,
                is_default: false,
            }]);

        if (error) throw error;

        if (feedbackEl) {
            feedbackEl.textContent = 'Untergruppe erfolgreich erstellt!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        }

        form.reset();

        // Kurze Verzögerung für DB-Konsistenz
        console.log('[Subgroups] Insert successful, waiting 200ms for DB sync...');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('[Subgroups] Now refreshing list...');
        await refreshSubgroupsList();
        console.log('[Subgroups] List refreshed');

        console.log('[Subgroups] Dispatching subgroupsChanged event');
        window.dispatchEvent(new CustomEvent('subgroupsChanged'));

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

/** Öffnet das Bearbeiten-Modal für eine Untergruppe */
export function openEditSubgroupModal(subgroupId, currentName, currentColor) {
    const modal = document.getElementById('edit-subgroup-modal');
    const idInput = document.getElementById('edit-subgroup-id');
    const nameInput = document.getElementById('edit-subgroup-name');
    const feedbackEl = document.getElementById('edit-subgroup-feedback');

    if (!modal || !idInput || !nameInput) return;

    idInput.value = subgroupId;
    nameInput.value = currentName;

    const colorRadios = document.querySelectorAll('input[name="edit-subgroup-color"]');
    colorRadios.forEach(radio => {
        radio.checked = radio.value === currentColor;
    });

    if (feedbackEl) feedbackEl.textContent = '';

    modal.classList.remove('hidden');
}

/** Schließt das Bearbeiten-Modal */
export function closeEditSubgroupModal() {
    const modal = document.getElementById('edit-subgroup-modal');
    if (modal) modal.classList.add('hidden');
}

/** Verarbeitet das Formular zum Bearbeiten einer Untergruppe */
export async function handleEditSubgroupSubmit(e, supabase) {
    e.preventDefault();

    storedSupabase = supabase;

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

        const { error } = await supabase
            .from('subgroups')
            .update({
                name: newName,
                color: newColor,
                updated_at: new Date().toISOString()
            })
            .eq('id', subgroupId);

        if (error) throw error;

        if (feedbackEl) {
            feedbackEl.textContent = 'Änderungen erfolgreich gespeichert!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        }

        console.log('[Subgroups] Update successful, refreshing list...');
        await refreshSubgroupsList();
        console.log('[Subgroups] List refreshed after edit');

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

/** Löscht eine Untergruppe */
export async function handleDeleteSubgroup(subgroupId, subgroupName, supabase, clubId) {
    storedSupabase = supabase;
    storedClubId = clubId;

    try {
        const { data: playersInSubgroup, error: queryError } = await supabase
            .from('profiles')
            .select('id, subgroup_ids')
            .eq('club_id', clubId)
            .contains('subgroup_ids', [subgroupId]);

        if (queryError) throw queryError;

        const playerCount = playersInSubgroup ? playersInSubgroup.length : 0;

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

        // .select() um zu sehen was tatsächlich gelöscht wurde (RLS-Prüfung)
        const { data: deletedData, error: deleteError } = await supabase
            .from('subgroups')
            .delete()
            .eq('id', subgroupId)
            .select();

        if (deleteError) throw deleteError;

        if (!deletedData || deletedData.length === 0) {
            console.error('[Subgroups] DELETE returned no data - RLS might have blocked it. SubgroupId:', subgroupId);
            alert('Fehler: Die Untergruppe konnte nicht gelöscht werden. Möglicherweise fehlen die Berechtigungen. Bitte stelle sicher, dass die RLS-Policies in Supabase korrekt sind.');
            return;
        }

        console.log('[Subgroups] Successfully deleted:', deletedData);

        // Untergruppe von allen Spielern entfernen
        if (playerCount > 0) {
            for (const player of playersInSubgroup) {
                const currentSubgroups = player.subgroup_ids || [];
                const updatedSubgroups = currentSubgroups.filter(id => id !== subgroupId);

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ subgroup_ids: updatedSubgroups })
                    .eq('id', player.id);

                if (updateError) {
                    console.error(`Error updating player ${player.id}:`, updateError);
                }
            }
        }

        // Kurze Verzögerung für DB-Konsistenz
        console.log('[Subgroups] Delete successful, waiting 200ms for DB sync...');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('[Subgroups] Now refreshing list...');
        await refreshSubgroupsList();
        console.log('[Subgroups] List refreshed after delete');

        console.log('[Subgroups] Dispatching subgroupsChanged event');
        window.dispatchEvent(new CustomEvent('subgroupsChanged'));

        alert('Untergruppe erfolgreich gelöscht!');
    } catch (error) {
        console.error('Error deleting subgroup:', error);
        alert(`Fehler beim Löschen: ${error.message}`);
    }
}

/** Lädt Untergruppen in ein Dropdown-Element */
export function loadSubgroupsForDropdown(clubId, supabase, selectId, includeAll = false) {
    const select = document.getElementById(selectId);
    if (!select) return;

    async function loadSubgroups() {
        try {
            const { data, error } = await supabase
                .from('subgroups')
                .select('*')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            select.innerHTML = '';

            if (includeAll) {
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'Alle (Gesamtverein)';
                select.appendChild(allOption);
            }

            (data || []).forEach(subgroup => {
                const option = document.createElement('option');
                option.value = subgroup.id;
                option.textContent = subgroup.name;
                select.appendChild(option);
            });

            select.dispatchEvent(new Event('change'));
        } catch (error) {
            console.error('Error loading subgroups for dropdown:', error);
            select.innerHTML = '<option value="">Fehler beim Laden</option>';
        }
    }

    loadSubgroups();

    // Echtzeit-Subscription
    const subscription = supabase
        .channel(`subgroups-dropdown-${selectId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'subgroups',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                loadSubgroups();
            }
        )
        .subscribe();

    return () => {
        subscription.unsubscribe();
    };
}

/** Holt alle Untergruppen für einen Verein */
export async function getSubgroups(clubId, supabase) {
    const { data, error } = await supabase
        .from('subgroups')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map(s => mapSubgroupFromSupabase(s));
}

/** Lädt Spieler-Checkboxen für die Untergruppen-Zuweisung */
export async function loadPlayerCheckboxes(subgroupId, clubId, supabase) {
    const container = document.getElementById(`player-checkboxes-${subgroupId}`);
    if (!container) return;

    try {
        const { data: players, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', clubId)
            .order('first_name', { ascending: true });

        if (error) throw error;

        console.log(`[Subgroups] Loaded ${players?.length || 0} players for checkboxes:`,
            players?.map(p => ({
                id: p.id,
                name: `${p.first_name} ${p.last_name}`,
                is_offline: p.is_offline,
                club_id: p.club_id
            }))
        );

        if (!players || players.length === 0) {
            container.innerHTML =
                '<p class="text-sm text-gray-500">Keine Spieler im Verein gefunden.</p>';
            return;
        }

        container.innerHTML = '';

        players.forEach(player => {
            const isInSubgroup = (player.subgroup_ids || []).includes(subgroupId);

            const checkboxItem = document.createElement('label');
            checkboxItem.className =
                'flex items-center gap-3 p-2 hover:bg-white rounded-md cursor-pointer transition-colors';
            const offlineMarker = player.is_offline
                ? '<span class="text-xs text-yellow-600 font-medium">(Offline)</span>'
                : '';

            checkboxItem.innerHTML = `
                <input
                    type="checkbox"
                    data-player-id="${player.id}"
                    ${isInSubgroup ? 'checked' : ''}
                    class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                >
                <span class="text-sm text-gray-700">
                    ${player.first_name || ''} ${player.last_name || ''}
                    ${offlineMarker}
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

/** Speichert Spieler-Zuweisungen für eine Untergruppe */
export async function savePlayerAssignments(subgroupId, clubId, supabase) {
    const container = document.getElementById(`player-checkboxes-${subgroupId}`);
    if (!container) return;

    try {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        let changesCount = 0;

        const { data: players, error: queryError } = await supabase
            .from('profiles')
            .select('id, subgroup_ids')
            .eq('club_id', clubId);

        if (queryError) throw queryError;

        const playersMap = new Map();
        (players || []).forEach(player => {
            playersMap.set(player.id, player);
        });

        for (const checkbox of checkboxes) {
            const playerId = checkbox.dataset.playerId;
            const isChecked = checkbox.checked;
            const player = playersMap.get(playerId);

            if (!player) continue;

            const currentSubgroups = player.subgroup_ids || [];
            const isCurrentlyInSubgroup = currentSubgroups.includes(subgroupId);

            if (isChecked && !isCurrentlyInSubgroup) {
                const updatedSubgroups = [...currentSubgroups, subgroupId];
                const { error } = await supabase
                    .from('profiles')
                    .update({ subgroup_ids: updatedSubgroups })
                    .eq('id', playerId);

                if (error) {
                    console.error(`Error adding player ${playerId} to subgroup:`, error);
                } else {
                    changesCount++;
                }
            }

            if (!isChecked && isCurrentlyInSubgroup) {
                const updatedSubgroups = currentSubgroups.filter(id => id !== subgroupId);
                const { error } = await supabase
                    .from('profiles')
                    .update({ subgroup_ids: updatedSubgroups })
                    .eq('id', playerId);

                if (error) {
                    console.error(`Error removing player ${playerId} from subgroup:`, error);
                } else {
                    changesCount++;
                }
            }
        }

        if (changesCount === 0) {
            alert('Keine Änderungen vorgenommen.');
            return;
        }

        alert(`${changesCount} Spieler erfolgreich zugewiesen/entfernt!`);
    } catch (error) {
        console.error('Error saving player assignments:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
    }
}

/** Verarbeitet Klick-Events auf Untergruppen-Aktionsbuttons */
export async function handleSubgroupActions(e, supabase, clubId) {
    const target = e.target;
    const button = target.closest('button');
    if (!button) return;

    if (button.classList.contains('toggle-player-list-btn')) {
        const subgroupId = button.dataset.subgroupId;
        const playerListDiv = document.getElementById(`player-list-${subgroupId}`);
        const arrow = button.querySelector('svg');

        if (playerListDiv && arrow) {
            const isHidden = playerListDiv.classList.contains('hidden');

            if (isHidden) {
                playerListDiv.classList.remove('hidden');
                arrow.style.transform = 'rotate(90deg)';

                const container = document.getElementById(`player-checkboxes-${subgroupId}`);
                if (container && container.querySelector('p')) {
                    await loadPlayerCheckboxes(subgroupId, clubId, supabase);
                }
            } else {
                playerListDiv.classList.add('hidden');
                arrow.style.transform = 'rotate(0deg)';
            }
        }
        return;
    }

    if (button.classList.contains('save-player-assignments-btn')) {
        const subgroupId = button.dataset.subgroupId;
        await savePlayerAssignments(subgroupId, clubId, supabase);
        return;
    }

    if (button.classList.contains('edit-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const currentName = button.dataset.name;
        const currentColor = button.dataset.color || '#6366f1';
        openEditSubgroupModal(subgroupId, currentName, currentColor);
        return;
    }

    if (button.classList.contains('delete-subgroup-btn')) {
        const subgroupId = button.dataset.id;
        const subgroupName = button.dataset.name;
        await handleDeleteSubgroup(subgroupId, subgroupName, supabase, clubId);
    }
}
