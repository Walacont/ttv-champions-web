/**
 * Player Invitation Management
 * Handles offline player creation with code-based invitations
 * and sending invitations to existing offline players
 */

import { collection, addDoc, serverTimestamp, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
    generateInvitationCode,
    getExpirationDate,
    createWhatsAppShareUrl,
    copyToClipboard,
    CODE_CONFIG
} from './invitation-code-utils.js';

let db;
let currentClubId;
let currentCoachId;
let currentSubgroups = [];
let lastGeneratedCode = null;
let lastGeneratedFirstName = '';
let currentPlayerId = null; // For send invitation modal

/**
 * Initialisiert das Player Invitation Management
 */
export function initPlayerInvitationManagement(firestore, authInstance, functionsInstance, clubId, coachId) {
    db = firestore;
    // auth and functions no longer needed (email invitations removed)
    currentClubId = clubId;
    currentCoachId = coachId;

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

    // Close after code generated
    document.getElementById('close-after-code-button')?.addEventListener('click', closeOfflinePlayerModal);

    // Send Invitation Modal
    const sendInvitationTypeRadios = document.querySelectorAll('input[name="send-invitation-type"]');
    sendInvitationTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleSendInvitationTypeChange);
    });

    document.getElementById('close-send-invitation-modal-button')?.addEventListener('click', closeSendInvitationModal);
    document.getElementById('send-invitation-form')?.addEventListener('submit', handleSendInvitation);
    document.getElementById('copy-invitation-code-button')?.addEventListener('click', () => copyInvitationCode('send'));
    document.getElementById('whatsapp-invitation-share-button')?.addEventListener('click', () => shareInvitationWhatsApp('send'));
    document.getElementById('close-send-invitation-after-code-button')?.addEventListener('click', closeSendInvitationModal);

    // Code buttons for offline player modal
    document.getElementById('copy-code-button')?.addEventListener('click', () => copyInvitationCode('offline'));
    document.getElementById('whatsapp-share-button')?.addEventListener('click', () => shareInvitationWhatsApp('offline'));
}

/**
 * Handle radio button change for invitation type in offline player modal
 * (Email option removed - only 'none' and 'code' are available)
 */
function handleInvitationTypeChange(e) {
    // No email container anymore - function kept for compatibility
    // Only 'none' and 'code' options exist
}

/**
 * Handle radio button change for send invitation modal
 * (Email option removed - only 'code' is available)
 */
function handleSendInvitationTypeChange(e) {
    // No email container anymore - function kept for compatibility
    // Only 'code' option exists
}

/**
 * Handle invitation sending after offline player creation
 * (Email option removed - only 'none' and 'code' are available)
 */
export async function handlePostPlayerCreationInvitation(playerId, playerData) {
    const invitationType = document.querySelector('input[name="invitation-type"]:checked').value;

    if (invitationType === 'none') {
        // No invitation needed, just close modal
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
 * @param {Object} playerData - Player data (firstName, lastName, subgroupIDs, etc.)
 * @param {string} [playerId] - Optional: ID of existing offline player to link
 */
async function generateCodeForPlayer(playerData, playerId = null) {
    // First, invalidate any old unused codes for the same player
    await invalidateOldCodesForPlayer(playerId, playerData);

    let code = generateInvitationCode();
    let isUnique = false;
    let attempts = 0;

    // Ensure code is unique
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

    // Save code to Firestore
    const expiresAt = getExpirationDate();
    const codeData = {
        code,
        clubId: currentClubId,
        createdBy: currentCoachId,
        createdAt: serverTimestamp(),
        expiresAt,
        maxUses: 1,
        used: false,
        usedBy: null,
        usedAt: null,
        firstName: playerData.firstName,
        lastName: playerData.lastName,
        subgroupIds: playerData.subgroupIDs || [],
        role: playerData.role || 'player'
    };

    // IMPORTANT: Store playerId if this is for an existing offline player
    if (playerId) {
        codeData.playerId = playerId;
    }

    await addDoc(collection(db, 'invitationCodes'), codeData);
    return code;
}

/**
 * Invalidate old unused codes for the same player
 * @param {string} [playerId] - ID of the player (if existing offline player)
 * @param {Object} playerData - Player data with firstName, lastName
 */
async function invalidateOldCodesForPlayer(playerId, playerData) {
    const {query, where, getDocs, updateDoc, serverTimestamp: firestoreTimestamp, collection: firestoreCollection} = await import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js");

    let q;

    if (playerId) {
        // Find codes by playerId (for existing offline players)
        q = query(
            firestoreCollection(db, 'invitationCodes'),
            where('playerId', '==', playerId),
            where('used', '==', false)
        );
    } else {
        // Find codes by firstName + lastName + clubId (for new players)
        q = query(
            firestoreCollection(db, 'invitationCodes'),
            where('firstName', '==', playerData.firstName),
            where('lastName', '==', playerData.lastName),
            where('clubId', '==', currentClubId),
            where('used', '==', false)
        );
    }

    try {
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            console.log(`🔍 Gefunden: ${snapshot.size} Code(s) für ${playerData.firstName} ${playerData.lastName}`);

            // Filter out already superseded codes
            const codesToInvalidate = snapshot.docs.filter(doc => !doc.data().superseded);

            if (codesToInvalidate.length === 0) {
                console.log(`ℹ️ Alle gefundenen Codes sind bereits als superseded markiert`);
                return;
            }

            console.log(`♻️ Invalidiere ${codesToInvalidate.length} alte Code(s)...`);

            const updatePromises = codesToInvalidate.map(docSnapshot =>
                updateDoc(docSnapshot.ref, {
                    superseded: true,
                    supersededAt: firestoreTimestamp()
                })
            );

            await Promise.all(updatePromises);
            console.log(`✅ ${codesToInvalidate.length} alte Code(s) erfolgreich invalidiert`);
        } else {
            console.log(`ℹ️ Keine alten Codes gefunden für ${playerData.firstName} ${playerData.lastName}`);
        }
    } catch (error) {
        console.error('❌ Fehler beim Invalidieren alter Codes:', error);
        console.error('Query-Details:', { playerId, firstName: playerData.firstName, lastName: playerData.lastName });

        // Check if it's a missing index error
        if (error.message && error.message.includes('index')) {
            console.error('⚠️ Firestore Index fehlt! Bitte erstelle den Index über die Firebase Console.');
            console.error('Index-Link könnte in der Fehlermeldung sein:', error.message);
        }

        // Don't throw - we still want to create the new code even if invalidation fails
    }
}

/**
 * Check if code already exists
 */
async function checkCodeExists(code) {
    const {query, where, getDocs, collection} = await import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js");
    const q = query(
        collection(db, 'invitationCodes'),
        where('code', '==', code)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
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
        // Get player data
        const playerDoc = await import("https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js")
            .then(mod => mod.getDoc(mod.doc(db, 'users', currentPlayerId)));

        if (!playerDoc.exists()) {
            throw new Error('Spieler nicht gefunden');
        }

        const playerData = playerDoc.data();

        // IMPORTANT: Pass playerId to link code with existing offline player
        const code = await generateCodeForPlayer(playerData, currentPlayerId);

        lastGeneratedCode = code;
        lastGeneratedFirstName = playerData.firstName;

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

    container.innerHTML = subgroups.map(subgroup => {
        const isDefault = subgroup.isDefault === true;
        const checkedAttr = isDefault ? 'checked' : '';
        const disabledAttr = isDefault ? 'disabled' : '';
        const cursorClass = isDefault ? 'cursor-not-allowed' : 'cursor-pointer';
        const opacityClass = isDefault ? 'opacity-75' : '';
        const badgeHtml = isDefault ? '<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded ml-2">Standard</span>' : '';

        return `
            <label class="flex items-center space-x-2 text-sm ${cursorClass} ${opacityClass}">
                <input type="checkbox" value="${subgroup.id}" class="subgroup-checkbox rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" ${checkedAttr} ${disabledAttr}>
                <span>${subgroup.name}${badgeHtml}</span>
            </label>
        `;
    }).join('');
}
