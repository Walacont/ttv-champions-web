/**
 * Invitation Code Management für Coach Dashboard
 * Verwaltet Code-Generierung, Anzeige und WhatsApp-Sharing
 */

import { collection, addDoc, query, where, getDocs, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
    generateInvitationCode,
    getExpirationDate,
    getRemainingDays,
    isCodeExpired,
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

/**
 * Initialisiert das Code-Management-System
 */
export function initInvitationCodeManagement(firestore, clubId, coachId) {
    db = firestore;
    currentClubId = clubId;
    currentCoachId = coachId;

    setupEventListeners();
}

/**
 * Setzt alle Event Listeners auf
 */
function setupEventListeners() {
    // Tab-Switching
    const emailTab = document.getElementById('email-invite-tab');
    const codeTab = document.getElementById('code-invite-tab');
    const emailForm = document.getElementById('add-offline-player-form');
    const codeForm = document.getElementById('generate-code-form');

    emailTab?.addEventListener('click', () => switchTab('email'));
    codeTab?.addEventListener('click', () => switchTab('code'));

    // Code-Generierung
    codeForm?.addEventListener('submit', handleCodeGeneration);

    // Code-Aktionen
    document.getElementById('copy-code-button')?.addEventListener('click', handleCopyCode);
    document.getElementById('whatsapp-share-button')?.addEventListener('click', handleWhatsAppShare);
    document.getElementById('create-another-code-button')?.addEventListener('click', resetCodeForm);

    // Code-Verwaltung Modal
    document.getElementById('manage-invitation-codes-button')?.addEventListener('click', openCodesManagementModal);
    document.getElementById('close-invitation-codes-modal-button')?.addEventListener('click', closeCodesManagementModal);
}

/**
 * Wechselt zwischen Email und Code Tabs
 */
function switchTab(tab) {
    const emailTab = document.getElementById('email-invite-tab');
    const codeTab = document.getElementById('code-invite-tab');
    const emailForm = document.getElementById('add-offline-player-form');
    const codeForm = document.getElementById('generate-code-form');
    const codeDisplay = document.getElementById('generated-code-display');

    if (tab === 'email') {
        emailTab.classList.add('tab-active');
        codeTab.classList.remove('tab-active');
        emailForm.classList.remove('hidden');
        codeForm.classList.add('hidden');
        codeDisplay.classList.add('hidden');
    } else {
        codeTab.classList.add('tab-active');
        emailTab.classList.remove('tab-active');
        codeForm.classList.remove('hidden');
        emailForm.classList.add('hidden');
        codeDisplay.classList.add('hidden');
    }
}

/**
 * Lädt die Subgroups-Checkboxen für Code-Form
 */
export function loadSubgroupsForCodeForm(subgroups) {
    currentSubgroups = subgroups;
    const container = document.getElementById('code-player-subgroups-checkboxes');

    if (!container) return;

    if (subgroups.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500">Keine Untergruppen vorhanden</p>';
        return;
    }

    container.innerHTML = subgroups.map(subgroup => `
        <label class="flex items-center space-x-2 text-sm cursor-pointer">
            <input type="checkbox" value="${subgroup.id}" class="code-subgroup-checkbox rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            <span>${subgroup.name}</span>
        </label>
    `).join('');
}

/**
 * Generiert einen neuen Einladungscode
 */
async function handleCodeGeneration(e) {
    e.preventDefault();

    const firstName = document.getElementById('code-firstName').value.trim();
    const lastName = document.getElementById('code-lastName').value.trim();

    // Ausgewählte Subgroups
    const selectedCheckboxes = document.querySelectorAll('.code-subgroup-checkbox:checked');
    const subgroupIds = Array.from(selectedCheckboxes).map(cb => cb.value);

    try {
        // Generiere eindeutigen Code
        let code = generateInvitationCode();
        let isUnique = false;
        let attempts = 0;

        // Stelle sicher, dass Code eindeutig ist
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
            throw new Error('Konnte keinen eindeutigen Code generieren. Bitte versuche es erneut.');
        }

        // Speichere Code in Firestore
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
            firstName,
            lastName,
            subgroupIds
        };

        await addDoc(collection(db, 'invitationCodes'), codeData);

        // Zeige Code an
        lastGeneratedCode = code;
        lastGeneratedFirstName = firstName;
        displayGeneratedCode(code);

    } catch (error) {
        console.error('Fehler beim Generieren des Codes:', error);
        alert('Fehler beim Generieren des Codes: ' + error.message);
    }
}

/**
 * Prüft ob ein Code bereits existiert
 */
async function checkCodeExists(code) {
    const q = query(
        collection(db, 'invitationCodes'),
        where('code', '==', code)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}

/**
 * Zeigt den generierten Code an
 */
function displayGeneratedCode(code) {
    const codeForm = document.getElementById('generate-code-form');
    const codeDisplay = document.getElementById('generated-code-display');
    const codeText = document.getElementById('generated-code-text');
    const validityDays = document.getElementById('code-validity-days');

    codeForm.classList.add('hidden');
    codeDisplay.classList.remove('hidden');
    codeText.textContent = code;
    validityDays.textContent = `${CODE_CONFIG.VALIDITY_DAYS} Tage`;
}

/**
 * Kopiert den Code in die Zwischenablage
 */
async function handleCopyCode() {
    if (!lastGeneratedCode) return;

    const success = await copyToClipboard(lastGeneratedCode);
    const button = document.getElementById('copy-code-button');

    if (success) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
        button.classList.add('bg-green-100', 'text-green-800');

        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('bg-green-100', 'text-green-800');
        }, 2000);
    } else {
        alert('Fehler beim Kopieren. Code: ' + lastGeneratedCode);
    }
}

/**
 * Öffnet WhatsApp zum Teilen des Codes
 */
function handleWhatsAppShare() {
    if (!lastGeneratedCode) return;

    const url = createWhatsAppShareUrl(lastGeneratedCode, lastGeneratedFirstName);
    window.open(url, '_blank');
}

/**
 * Setzt das Code-Formular zurück für neuen Code
 */
function resetCodeForm() {
    const codeForm = document.getElementById('generate-code-form');
    const codeDisplay = document.getElementById('generated-code-display');

    codeForm.reset();
    codeForm.classList.remove('hidden');
    codeDisplay.classList.add('hidden');

    lastGeneratedCode = null;
    lastGeneratedFirstName = '';
}

/**
 * Öffnet das Code-Verwaltung Modal
 */
async function openCodesManagementModal() {
    const modal = document.getElementById('invitation-codes-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    await loadInvitationCodes();
}

/**
 * Schließt das Code-Verwaltung Modal
 */
function closeCodesManagementModal() {
    const modal = document.getElementById('invitation-codes-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

/**
 * Lädt alle Einladungscodes für den Club
 */
async function loadInvitationCodes() {
    const container = document.getElementById('invitation-codes-list');
    container.innerHTML = '<p class="text-center text-gray-500">Lade Codes...</p>';

    try {
        const q = query(
            collection(db, 'invitationCodes'),
            where('clubId', '==', currentClubId)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-inbox text-gray-400 text-4xl mb-2"></i>
                    <p class="text-gray-600">Keine Einladungscodes vorhanden</p>
                    <p class="text-sm text-gray-500 mt-1">Erstelle einen Code über "Spieler einladen"</p>
                </div>
            `;
            return;
        }

        const codes = [];
        snapshot.forEach(doc => {
            codes.push({ id: doc.id, ...doc.data() });
        });

        // Sortiere: Aktive zuerst, dann nach Erstellungsdatum
        codes.sort((a, b) => {
            if (a.used !== b.used) return a.used ? 1 : -1;
            return b.createdAt?.seconds - a.createdAt?.seconds;
        });

        container.innerHTML = codes.map(code => renderCodeItem(code)).join('');

        // Event Listeners für Delete-Buttons
        codes.forEach(code => {
            document.getElementById(`delete-code-${code.id}`)?.addEventListener('click', () => deleteInvitationCode(code.id));
        });

    } catch (error) {
        console.error('Fehler beim Laden der Codes:', error);
        container.innerHTML = '<p class="text-center text-red-600">Fehler beim Laden der Codes</p>';
    }
}

/**
 * Rendert ein Code-Item
 */
function renderCodeItem(codeData) {
    const expired = isCodeExpired(codeData.expiresAt);
    const remainingDays = getRemainingDays(codeData.expiresAt);
    const statusClass = codeData.used ? 'bg-gray-100 border-gray-300' : expired ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300';
    const statusIcon = codeData.used ? '✅' : expired ? '⏰' : '🟢';
    const statusText = codeData.used ? 'Verwendet' : expired ? 'Abgelaufen' : `${remainingDays} Tage gültig`;

    return `
        <div class="border-2 ${statusClass} rounded-lg p-4">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-3 mb-2">
                        <span class="text-2xl font-bold text-gray-900 font-mono">${codeData.code}</span>
                        <span class="text-sm px-2 py-1 rounded-full ${codeData.used ? 'bg-gray-200 text-gray-700' : expired ? 'bg-red-200 text-red-800' : 'bg-green-200 text-green-800'}">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                    <p class="text-sm text-gray-700">
                        <strong>${codeData.firstName} ${codeData.lastName}</strong>
                    </p>
                    <p class="text-xs text-gray-500 mt-1">
                        Erstellt: ${formatDate(codeData.createdAt)}
                    </p>
                    ${codeData.used ? `
                        <p class="text-xs text-gray-500">
                            Verwendet: ${formatDate(codeData.usedAt)}
                        </p>
                    ` : ''}
                </div>
                <button id="delete-code-${codeData.id}" class="text-red-600 hover:text-red-800 transition">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Löscht einen Einladungscode
 */
async function deleteInvitationCode(codeId) {
    if (!confirm('Möchtest du diesen Code wirklich löschen?')) return;

    try {
        await deleteDoc(doc(db, 'invitationCodes', codeId));
        await loadInvitationCodes(); // Reload list
    } catch (error) {
        console.error('Fehler beim Löschen des Codes:', error);
        alert('Fehler beim Löschen des Codes');
    }
}

/**
 * Formatiert ein Firestore Timestamp zu lesbarem Datum
 */
function formatDate(timestamp) {
    if (!timestamp) return 'Unbekannt';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
