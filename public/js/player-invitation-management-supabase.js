/**
 * Player Invitation Management (Supabase Version)
 * Handles offline player creation with code-based invitations
 * and sending invitations to existing offline players
 */

import {
    generateInvitationCode,
    getExpirationDate,
    createWhatsAppShareUrl,
    copyToClipboard,
    CODE_CONFIG,
} from './invitation-code-utils.js';

let supabaseClient;
let currentClubId;
let currentCoachId;
let currentSportId;
let currentSubgroups = [];
let lastGeneratedCode = null;
let lastGeneratedFirstName = '';
let currentPlayerId = null; // Für Einladungs-Modal

/**
 * Initialisiert das Player Invitation Management
 */
export function initPlayerInvitationManagement(
    supabase,
    authInstance,
    functionsInstance,
    clubId,
    coachId,
    sportId = null
) {
    supabaseClient = supabase;
    // auth and functions no longer needed (email invitations removed)
    currentClubId = clubId;
    currentCoachId = coachId;
    currentSportId = sportId;

    setupEventListeners();
}

/**
 * Setzt alle Event Listeners auf
 */
function setupEventListeners() {
    // Offline Player Modal: Invitation Type Radio Buttons
    const invitationTypeRadios = document.querySelectorAll('input[name="invitation-type"]');
    invitationTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleInvitationTypeChange);
    });

    // Nach Code-Generierung schließen
    document
        .getElementById('close-after-code-button')
        ?.addEventListener('click', closeOfflinePlayerModal);

    // Send Invitation Modal
    const sendInvitationTypeRadios = document.querySelectorAll(
        'input[name="send-invitation-type"]'
    );
    sendInvitationTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleSendInvitationTypeChange);
    });

    document
        .getElementById('close-send-invitation-modal-button')
        ?.addEventListener('click', closeSendInvitationModal);
    document
        .getElementById('send-invitation-form')
        ?.addEventListener('submit', handleSendInvitation);
    document
        .getElementById('copy-invitation-code-button')
        ?.addEventListener('click', () => copyInvitationCode('send'));
    document
        .getElementById('whatsapp-invitation-share-button')
        ?.addEventListener('click', () => shareInvitationWhatsApp('send'));
    document
        .getElementById('close-send-invitation-after-code-button')
        ?.addEventListener('click', closeSendInvitationModal);

    // Code-Buttons für Offline-Spieler-Modal
    document
        .getElementById('copy-code-button')
        ?.addEventListener('click', () => copyInvitationCode('offline'));
    document
        .getElementById('whatsapp-share-button')
        ?.addEventListener('click', () => shareInvitationWhatsApp('offline'));
}

/**
 * Handle radio button change for invitation type in offline player modal
 * (Email option removed - only 'none' and 'code' are available)
 */
function handleInvitationTypeChange(e) {
    // Kein E-Mail-Container mehr - Funktion für Kompatibilität beibehalten
    // Only 'none' and 'code' options exist
}

/**
 * Handle radio button change for send invitation modal
 * (Email option removed - only 'code' is available)
 */
function handleSendInvitationTypeChange(e) {
    // Kein E-Mail-Container mehr - Funktion für Kompatibilität beibehalten
    // Only 'code' option exists
}

/**
 * Handle invitation sending after offline player creation
 * (Email option removed - only 'none' and 'code' are available)
 */
export async function handlePostPlayerCreationInvitation(playerId, playerData) {
    const invitationType = document.querySelector('input[name="invitation-type"]:checked').value;

    if (invitationType === 'none') {
        // Keine Einladung nötig, Modal einfach schließen
        closeOfflinePlayerModal();
        return { success: true, type: 'none' };
    }

    if (invitationType === 'code') {
        try {
            // Generate code WITH playerId to enable migration
            const code = await generateCodeForPlayer(playerData, playerId);
            lastGeneratedCode = code;
            lastGeneratedFirstName = playerData.firstName;

            // Show code display, hide form
            document.getElementById('add-offline-player-form').classList.add('hidden');
            document.getElementById('generated-code-display').classList.remove('hidden');
            document.getElementById('generated-code-text').textContent = code;

            return { success: true, type: 'code', code };
        } catch (error) {
            console.error('Error generating code:', error);
            alert('Fehler beim Generieren des Codes: ' + error.message);
            return { success: false, error: error.message };
        }
    }
}

/**
 * Generate invitation code for a player
 * @param {Object} playerData - Spielerdaten (firstName, lastName, subgroupIDs, etc.)
 * @param {string} [playerId] - Optional: ID of existing offline player to link
 */
async function generateCodeForPlayer(playerData, playerId = null) {
    // First, invalidate any old unused codes for the same player
    await invalidateOldCodesForPlayer(playerId, playerData);

    let code = generateInvitationCode();
    let isUnique = false;
    let attempts = 0;

    // Sicherstellen dass Code eindeutig ist
    while (!isUnique && attempts < 10) {
        const existingCode = await checkCodeExists(code);
        if (!existingCode) {
            isUnique = true;
        } else {
            code = generateInvitationCode();
            attempts++;
        }
    }

    if (!isUnique) {
        throw new Error('Konnte keinen eindeutigen Code generieren.');
    }

    // Save code to Supabase
    const expiresAt = getExpirationDate();
    const codeData = {
        code,
        club_id: currentClubId,
        sport_id: currentSportId,
        created_by: currentCoachId,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        use_count: 0,
        is_active: true,
        first_name: playerData.firstName,
        last_name: playerData.lastName,
        subgroup_ids: playerData.subgroupIDs || [],
        role: playerData.role || 'player',
    };

    // Add birthdate if provided
    if (playerData.birthdate) {
        codeData.birthdate = playerData.birthdate;
    }

    // Add gender if provided
    if (playerData.gender) {
        codeData.gender = playerData.gender;
    }

    // IMPORTANT: Store playerId if this is for an existing offline player
    if (playerId) {
        codeData.player_id = playerId;
    }

    const { error } = await supabaseClient
        .from('invitation_codes')
        .insert(codeData);

    if (error) throw error;

    return code;
}

/**
 * Invalidate old unused codes for the same player
 * @param {string} [playerId] - ID of the player (if existing offline player)
 * @param {Object} playerData - Spielerdaten mit firstName, lastName
 */
async function invalidateOldCodesForPlayer(playerId, playerData) {
    try {
        let query;

        if (playerId) {
            // Find codes by playerId (for existing offline players)
            query = supabaseClient
                .from('invitation_codes')
                .select('id, superseded, is_active')
                .eq('player_id', playerId)
                .eq('is_active', true);
        } else {
            // Find codes by firstName + lastName + clubId (for new players)
            query = supabaseClient
                .from('invitation_codes')
                .select('id, superseded, is_active')
                .eq('first_name', playerData.firstName)
                .eq('last_name', playerData.lastName)
                .eq('club_id', currentClubId)
                .eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
            console.log(
                `Gefunden: ${data.length} aktive Code(s) für ${playerData.firstName} ${playerData.lastName}`
            );

            // Filter out already superseded codes
            const codesToInvalidate = data.filter(code => !code.superseded);

            if (codesToInvalidate.length === 0) {
                console.log(`Alle gefundenen Codes sind bereits als superseded markiert`);
                return;
            }

            console.log(`Invalidiere ${codesToInvalidate.length} alte Code(s)...`);

            const codeIds = codesToInvalidate.map(c => c.id);

            const { error: updateError } = await supabaseClient
                .from('invitation_codes')
                .update({
                    is_active: false,
                    superseded: true,
                    superseded_at: new Date().toISOString()
                })
                .in('id', codeIds);

            if (updateError) throw updateError;

            console.log(`${codesToInvalidate.length} alte Code(s) erfolgreich invalidiert`);
        } else {
            console.log(
                `Keine aktiven Codes gefunden für ${playerData.firstName} ${playerData.lastName}`
            );
        }
    } catch (error) {
        console.error('Fehler beim Invalidieren alter Codes:', error);
        console.error('Query-Details:', {
            playerId,
            firstName: playerData.firstName,
            lastName: playerData.lastName,
        });

        // Nicht werfen - neuen Code trotzdem erstellen falls Invalidierung fehlschlägt
    }
}

/**
 * Check if code already exists
 */
async function checkCodeExists(code) {
    const { data, error } = await supabaseClient
        .from('invitation_codes')
        .select('id')
        .eq('code', code)
        .limit(1);

    if (error) {
        console.error('Error checking code existence:', error);
        return false;
    }

    return data && data.length > 0;
}

/**
 * Close offline player modal
 */
function closeOfflinePlayerModal() {
    const modal = document.getElementById('add-offline-player-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    // Reset form
    document.getElementById('add-offline-player-form').reset();
    document.getElementById('add-offline-player-form').classList.remove('hidden');
    document.getElementById('generated-code-display').classList.add('hidden');

    lastGeneratedCode = null;
    lastGeneratedFirstName = '';
}

/**
 * Open send invitation modal for existing player
 */
export function openSendInvitationModal(playerId, playerName, playerEmail = '') {
    currentPlayerId = playerId;
    const modal = document.getElementById('send-invitation-modal');
    const nameElement = document.getElementById('invitation-player-name');

    nameElement.textContent = playerName;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Reset form
    document.getElementById('send-invitation-form').reset();
    document.getElementById('send-invitation-form').classList.remove('hidden');
    document.getElementById('send-invitation-code-display').classList.add('hidden');
}

/**
 * Close send invitation modal
 */
function closeSendInvitationModal() {
    const modal = document.getElementById('send-invitation-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    currentPlayerId = null;
    lastGeneratedCode = null;
    lastGeneratedFirstName = '';
}

/**
 * Handle send invitation form submission
 * (Email option removed - only 'code' is available)
 */
async function handleSendInvitation(e) {
    e.preventDefault();

    if (!currentPlayerId) {
        alert('Kein Spieler ausgewählt');
        return;
    }

    // Only code option available now
    try {
        // Get player data from Supabase
        const { data: playerData, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentPlayerId)
            .single();

        if (error) throw error;

        if (!playerData) {
            throw new Error('Spieler nicht gefunden');
        }

        // Von snake_case zu camelCase für generateCodeForPlayer mappen
        const mappedPlayerData = {
            firstName: playerData.first_name,
            lastName: playerData.last_name,
            subgroupIDs: playerData.subgroup_ids || [],
            role: playerData.role || 'player',
            birthdate: playerData.birthdate || null,
            gender: playerData.gender || null
        };

        // IMPORTANT: Pass playerId to link code with existing offline player
        const code = await generateCodeForPlayer(mappedPlayerData, currentPlayerId);

        lastGeneratedCode = code;
        lastGeneratedFirstName = mappedPlayerData.firstName;

        // Show code display
        document.getElementById('send-invitation-form').classList.add('hidden');
        document.getElementById('send-invitation-code-display').classList.remove('hidden');
        document.getElementById('send-invitation-code-text').textContent = code;
    } catch (error) {
        console.error('Error generating code:', error);
        alert('Fehler beim Generieren des Codes: ' + error.message);
    }
}

/**
 * Copy invitation code to clipboard
 */
async function copyInvitationCode(type) {
    if (!lastGeneratedCode) return;

    const success = await copyToClipboard(lastGeneratedCode);
    const buttonId = type === 'offline' ? 'copy-code-button' : 'copy-invitation-code-button';
    const button = document.getElementById(buttonId);

    if (success && button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
        button.classList.add('bg-green-100', 'text-green-800');

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('bg-green-100', 'text-green-800');
        }, 2000);
    }
}

/**
 * Share invitation code via WhatsApp
 */
function shareInvitationWhatsApp(type) {
    if (!lastGeneratedCode) return;

    const url = createWhatsAppShareUrl(lastGeneratedCode, lastGeneratedFirstName);
    window.open(url, '_blank');
}

/**
 * Load subgroups for offline player form
 */
export function loadSubgroupsForOfflinePlayerForm(subgroups) {
    currentSubgroups = subgroups;
    const container = document.getElementById('player-subgroups-checkboxes');

    if (!container) return;

    if (subgroups.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500">Keine Untergruppen vorhanden</p>';
        return;
    }

    container.innerHTML = subgroups
        .map(subgroup => {
            const isDefault = subgroup.isDefault === true;
            const checkedAttr = isDefault ? 'checked' : '';
            const disabledAttr = isDefault ? 'disabled' : '';
            const cursorClass = isDefault ? 'cursor-not-allowed' : 'cursor-pointer';
            const opacityClass = isDefault ? 'opacity-75' : '';
            const badgeHtml = isDefault
                ? '<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-2">Standard</span>'
                : '';

            return `
            <label class="flex items-center space-x-2 text-sm ${cursorClass} ${opacityClass}">
                <input type="checkbox" value="${subgroup.id}" class="subgroup-checkbox rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" ${checkedAttr} ${disabledAttr}>
                <span>${subgroup.name}${badgeHtml}</span>
            </label>
        `;
        })
        .join('');
}
