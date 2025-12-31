/**
 * Invitation Code Management für Coach Dashboard (Supabase Version)
 * Verwaltet Code-Generierung, Anzeige und WhatsApp-Sharing
 */

import {
    generateInvitationCode,
    getExpirationDate,
    getRemainingDays,
    isCodeExpired,
    createWhatsAppShareUrl,
    copyToClipboard,
    CODE_CONFIG,
} from './invitation-code-utils.js';
import { formatDate } from './ui-utils-supabase.js';

let supabaseClient;
let currentClubId;
let currentCoachId;
let currentSubgroups = [];
let lastGeneratedCode = null;
let lastGeneratedFirstName = '';

/**
 * Initialisiert das Code-Management-System
 */
export function initInvitationCodeManagement(supabase, clubId, coachId) {
    supabaseClient = supabase;
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
    document
        .getElementById('whatsapp-share-button')
        ?.addEventListener('click', handleWhatsAppShare);
    document.getElementById('create-another-code-button')?.addEventListener('click', resetCodeForm);

    // Code-Verwaltung Modal
    document
        .getElementById('manage-invitation-codes-button')
        ?.addEventListener('click', openCodesManagementModal);
    document
        .getElementById('close-invitation-codes-modal-button')
        ?.addEventListener('click', closeCodesManagementModal);
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

    container.innerHTML = subgroups
        .map(
            subgroup => `
        <label class="flex items-center space-x-2 text-sm cursor-pointer">
            <input type="checkbox" value="${subgroup.id}" class="code-subgroup-checkbox rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
            <span>${subgroup.name}</span>
        </label>
    `
        )
        .join('');
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

        // Speichere Code in Supabase
        const expiresAt = getExpirationDate();
        const codeData = {
            code,
            club_id: currentClubId,
            created_by: currentCoachId,
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
            max_uses: 1,
            used: false,
            used_by: null,
            used_at: null,
            first_name: firstName,
            last_name: lastName,
            subgroup_ids: subgroupIds,
        };

        const { error } = await supabaseClient
            .from('invitation_codes')
            .insert(codeData);

        if (error) throw error;

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
 * Maps invitation code from Supabase (snake_case) to app format (camelCase)
 */
function mapCodeFromSupabase(code) {
    return {
        id: code.id,
        code: code.code,
        clubId: code.club_id,
        createdBy: code.created_by,
        createdAt: code.created_at,
        expiresAt: code.expires_at,
        maxUses: code.max_uses,
        used: code.used,
        usedBy: code.used_by,
        usedAt: code.used_at,
        firstName: code.first_name,
        lastName: code.last_name,
        subgroupIds: code.subgroup_ids || [],
        superseded: code.superseded,
        supersededAt: code.superseded_at
    };
}

/**
 * Lädt alle Einladungscodes für den Club
 */
async function loadInvitationCodes() {
    const container = document.getElementById('invitation-codes-list');
    container.innerHTML = '<p class="text-center text-gray-500">Lade Codes...</p>';

    try {
        const { data, error } = await supabaseClient
            .from('invitation_codes')
            .select('*')
            .eq('club_id', currentClubId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-inbox text-gray-400 text-4xl mb-2"></i>
                    <p class="text-gray-600">Keine Einladungscodes vorhanden</p>
                    <p class="text-sm text-gray-500 mt-1">Erstelle einen Code über "Spieler einladen"</p>
                </div>
            `;
            return;
        }

        // In App-Format konvertieren
        const codes = data.map(code => mapCodeFromSupabase(code));

        // Sortiere: Aktive zuerst, dann supersedierte/verwendete, dann nach Erstellungsdatum
        codes.sort((a, b) => {
            // Active codes first (not used and not superseded)
            const aActive = !a.used && !a.superseded;
            const bActive = !b.used && !b.superseded;

            if (aActive !== bActive) return aActive ? -1 : 1;

            // Then by creation date (newest first)
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return bTime - aTime;
        });

        container.innerHTML = codes.map(code => renderCodeItem(code)).join('');

        // Event Listeners für Delete-Buttons
        codes.forEach(code => {
            document
                .getElementById(`delete-code-${code.id}`)
                ?.addEventListener('click', () => deleteInvitationCode(code.id));
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

    // Determine status (superseded takes priority)
    let statusClass, statusIcon, statusText, badgeClass;

    if (codeData.superseded) {
        statusClass = 'bg-orange-50 border-orange-300';
        statusIcon = '🔄';
        statusText = 'Ersetzt';
        badgeClass = 'bg-orange-200 text-orange-800';
    } else if (codeData.used) {
        statusClass = 'bg-gray-100 border-gray-300';
        statusIcon = '✅';
        statusText = 'Verwendet';
        badgeClass = 'bg-gray-200 text-gray-700';
    } else if (expired) {
        statusClass = 'bg-red-50 border-red-300';
        statusIcon = '⏰';
        statusText = 'Abgelaufen';
        badgeClass = 'bg-red-200 text-red-800';
    } else {
        statusClass = 'bg-green-50 border-green-300';
        statusIcon = '🟢';
        statusText = `${remainingDays} Tage gültig`;
        badgeClass = 'bg-green-200 text-green-800';
    }

    return `
        <div class="border-2 ${statusClass} rounded-lg p-4">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center space-x-3 mb-2">
                        <span class="text-2xl font-bold text-gray-900 font-mono">${codeData.code}</span>
                        <span class="text-sm px-2 py-1 rounded-full ${badgeClass}">
                            ${statusIcon} ${statusText}
                        </span>
                    </div>
                    <p class="text-sm text-gray-700">
                        <strong>${codeData.firstName} ${codeData.lastName}</strong>
                    </p>
                    <p class="text-xs text-gray-500 mt-1">
                        Erstellt: ${formatDate(codeData.createdAt, { includeTime: true })}
                    </p>
                    ${
                        codeData.used
                            ? `
                        <p class="text-xs text-gray-500">
                            Verwendet: ${formatDate(codeData.usedAt, { includeTime: true })}
                        </p>
                    `
                            : ''
                    }
                    ${
                        codeData.superseded
                            ? `
                        <p class="text-xs text-orange-600 mt-1">
                            <i class="fas fa-info-circle mr-1"></i>Durch neueren Code ersetzt am ${formatDate(codeData.supersededAt, { includeTime: true })}
                        </p>
                    `
                            : ''
                    }
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
        const { error } = await supabaseClient
            .from('invitation_codes')
            .delete()
            .eq('id', codeId);

        if (error) throw error;

        await loadInvitationCodes(); // Reload list
    } catch (error) {
        console.error('Fehler beim Löschen des Codes:', error);
        alert('Fehler beim Löschen des Codes');
    }
}
