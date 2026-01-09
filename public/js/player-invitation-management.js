

import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    updateDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    generateInvitationCode,
    getExpirationDate,
    createWhatsAppShareUrl,
    copyToClipboard,
    CODE_CONFIG,
} from './invitation-code-utils.js';

let db;
let currentClubId;
let currentCoachId;
let currentSubgroups = [];
let lastGeneratedCode = null;
let lastGeneratedFirstName = '';
let currentPlayerId = null;


export function initPlayerInvitationManagement(
    firestore,
    authInstance,
    functionsInstance,
    clubId,
    coachId
) {
    db = firestore;
    currentClubId = clubId;
    currentCoachId = coachId;

    setupEventListeners();
}


function setupEventListeners() {
    const invitationTypeRadios = document.querySelectorAll('input[name="invitation-type"]');
    invitationTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleInvitationTypeChange);
    });

    document
        .getElementById('close-after-code-button')
        ?.addEventListener('click', closeOfflinePlayerModal);

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

    document
        .getElementById('copy-code-button')
        ?.addEventListener('click', () => copyInvitationCode('offline'));
    document
        .getElementById('whatsapp-share-button')
        ?.addEventListener('click', () => shareInvitationWhatsApp('offline'));
}


function handleInvitationTypeChange(e) {
}


function handleSendInvitationTypeChange(e) {
}


export async function handlePostPlayerCreationInvitation(playerId, playerData) {
    const invitationType = document.querySelector('input[name="invitation-type"]:checked').value;

    if (invitationType === 'none') {
        closeOfflinePlayerModal();
        return { success: true, type: 'none' };
    }

    if (invitationType === 'code') {
        try {
            const code = await generateCodeForPlayer(playerData, playerId);
            lastGeneratedCode = code;
            lastGeneratedFirstName = playerData.firstName;

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


async function generateCodeForPlayer(playerData, playerId = null) {
    await invalidateOldCodesForPlayer(playerId, playerData);

    let code = generateInvitationCode();
    let isUnique = false;
    let attempts = 0;

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
        role: playerData.role || 'player',
    };

    if (playerId) {
        codeData.playerId = playerId;
    }

    await addDoc(collection(db, 'invitationCodes'), codeData);
    return code;
}


async function invalidateOldCodesForPlayer(playerId, playerData) {
    const {
        query,
        where,
        getDocs,
        updateDoc,
        serverTimestamp: firestoreTimestamp,
        collection: firestoreCollection,
    } = await import('https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js');

    let q;

    if (playerId) {
        q = query(
            firestoreCollection(db, 'invitationCodes'),
            where('playerId', '==', playerId),
            where('used', '==', false)
        );
    } else {
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
            console.log(
                `🔍 Gefunden: ${snapshot.size} Code(s) für ${playerData.firstName} ${playerData.lastName}`
            );

            const codesToInvalidate = snapshot.docs.filter(doc => !doc.data().superseded);

            if (codesToInvalidate.length === 0) {
                console.log(`ℹ️ Alle gefundenen Codes sind bereits als superseded markiert`);
                return;
            }

            console.log(`♻️ Invalidiere ${codesToInvalidate.length} alte Code(s)...`);

            const updatePromises = codesToInvalidate.map(docSnapshot =>
                updateDoc(docSnapshot.ref, {
                    superseded: true,
                    supersededAt: firestoreTimestamp(),
                })
            );

            await Promise.all(updatePromises);
            console.log(`✅ ${codesToInvalidate.length} alte Code(s) erfolgreich invalidiert`);
        } else {
            console.log(
                `ℹ️ Keine alten Codes gefunden für ${playerData.firstName} ${playerData.lastName}`
            );
        }
    } catch (error) {
        console.error('❌ Fehler beim Invalidieren alter Codes:', error);
        console.error('Query-Details:', {
            playerId,
            firstName: playerData.firstName,
            lastName: playerData.lastName,
        });

        if (error.message && error.message.includes('index')) {
            console.error(
                '⚠️ Firestore Index fehlt! Bitte erstelle den Index über die Firebase Console.'
            );
            console.error('Index-Link könnte in der Fehlermeldung sein:', error.message);
        }

    }
}


async function checkCodeExists(code) {
    const { query, where, getDocs, collection } = await import(
        'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
    );
    const q = query(collection(db, 'invitationCodes'), where('code', '==', code));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}


function closeOfflinePlayerModal() {
    const modal = document.getElementById('add-offline-player-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    document.getElementById('add-offline-player-form').reset();
    document.getElementById('add-offline-player-form').classList.remove('hidden');
    document.getElementById('generated-code-display').classList.add('hidden');

    lastGeneratedCode = null;
    lastGeneratedFirstName = '';
}


export function openSendInvitationModal(playerId, playerName, playerEmail = '') {
    currentPlayerId = playerId;
    const modal = document.getElementById('send-invitation-modal');
    const nameElement = document.getElementById('invitation-player-name');

    nameElement.textContent = playerName;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    document.getElementById('send-invitation-form').reset();
    document.getElementById('send-invitation-form').classList.remove('hidden');
    document.getElementById('send-invitation-code-display').classList.add('hidden');
}


function closeSendInvitationModal() {
    const modal = document.getElementById('send-invitation-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    currentPlayerId = null;
    lastGeneratedCode = null;
    lastGeneratedFirstName = '';
}


async function handleSendInvitation(e) {
    e.preventDefault();

    if (!currentPlayerId) {
        alert('Kein Spieler ausgewählt');
        return;
    }

    try {
        const playerDoc = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        ).then(mod => mod.getDoc(mod.doc(db, 'users', currentPlayerId)));

        if (!playerDoc.exists()) {
            throw new Error('Spieler nicht gefunden');
        }

        const playerData = playerDoc.data();

        const code = await generateCodeForPlayer(playerData, currentPlayerId);

        lastGeneratedCode = code;
        lastGeneratedFirstName = playerData.firstName;

        document.getElementById('send-invitation-form').classList.add('hidden');
        document.getElementById('send-invitation-code-display').classList.remove('hidden');
        document.getElementById('send-invitation-code-text').textContent = code;
    } catch (error) {
        console.error('Error generating code:', error);
        alert('Fehler beim Generieren des Codes: ' + error.message);
    }
}


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


function shareInvitationWhatsApp(type) {
    if (!lastGeneratedCode) return;

    const url = createWhatsAppShareUrl(lastGeneratedCode, lastGeneratedFirstName);
    window.open(url, '_blank');
}


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
