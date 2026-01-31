/**
 * Club Page Module - Vereinsseite für Coaches/Head-Coaches
 * Ermöglicht das Bearbeiten von Vereinsinfo, Logo, Trainingszeiten etc.
 */

import { getSupabase } from './supabase-init.js';
import { uploadToR2, deleteFromR2 } from './r2-storage.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

let currentUser = null;
let currentClub = null;
let trainingTimes = [];

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// ─── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/index.html';
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, role, club_id')
            .eq('id', user.id)
            .single();

        if (!profile || !profile.club_id) {
            showAccessDenied();
            return;
        }

        // Nur Coaches und Head-Coaches dürfen zugreifen
        if (profile.role !== 'coach' && profile.role !== 'head_coach' && profile.role !== 'admin') {
            showAccessDenied();
            return;
        }

        currentUser = { ...user, ...profile };

        // Club-Daten laden
        const { data: club } = await supabase
            .from('clubs')
            .select('id, name, description, logo_url, settings, created_at')
            .eq('id', profile.club_id)
            .single();

        if (!club) {
            showAccessDenied();
            return;
        }

        currentClub = club;
        populateForm(club);
        await loadClubStats(club.id);
        setupEventListeners();

        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

    } catch (err) {
        console.error('[ClubPage] Init error:', err);
        showAccessDenied();
    }
});

function showAccessDenied() {
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('access-denied').classList.remove('hidden');
}

// ─── Form befüllen ───────────────────────────────────────────

function populateForm(club) {
    const nameInput = document.getElementById('club-name-input');
    const descInput = document.getElementById('club-description-input');
    const charCount = document.getElementById('desc-char-count');

    nameInput.value = club.name || '';
    descInput.value = club.description || '';
    charCount.textContent = (club.description || '').length;

    // Logo
    if (club.logo_url) {
        document.getElementById('club-logo-preview').src = club.logo_url;
        document.getElementById('remove-logo-btn').classList.remove('hidden');
    }

    // Settings aus JSONB
    const settings = club.settings || {};

    document.getElementById('club-email-input').value = settings.email || '';
    document.getElementById('club-phone-input').value = settings.phone || '';
    document.getElementById('club-website-input').value = settings.website || '';
    document.getElementById('club-address-input').value = settings.address || '';
    document.getElementById('club-zip-input').value = settings.zip || '';
    document.getElementById('club-city-input').value = settings.city || '';

    // Trainingszeiten
    trainingTimes = settings.training_times || [];
    renderTrainingTimes();
}

// ─── Trainingszeiten ─────────────────────────────────────────

function renderTrainingTimes() {
    const container = document.getElementById('training-times-container');
    if (trainingTimes.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">Noch keine Trainingszeiten eingetragen</p>';
        return;
    }

    container.innerHTML = trainingTimes.map((t, index) => `
        <div class="flex items-center gap-3 bg-gray-50 p-3 rounded-lg" data-index="${index}">
            <div class="flex-1">
                <select class="training-day w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    ${DAYS.map(d => `<option value="${escapeHtml(d)}" ${t.day === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
                </select>
            </div>
            <input type="time" class="training-start px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(t.start || '18:00')}" />
            <span class="text-gray-400">-</span>
            <input type="time" class="training-end px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(t.end || '20:00')}" />
            <button class="remove-training-btn text-red-400 hover:text-red-600 transition p-1" data-index="${index}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');

    // Remove-Listener
    container.querySelectorAll('.remove-training-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            trainingTimes.splice(idx, 1);
            renderTrainingTimes();
        });
    });

    // Change-Listener für automatisches Speichern in Array
    container.querySelectorAll('[data-index]').forEach(row => {
        const idx = parseInt(row.dataset.index);
        const daySelect = row.querySelector('.training-day');
        const startInput = row.querySelector('.training-start');
        const endInput = row.querySelector('.training-end');

        [daySelect, startInput, endInput].forEach(el => {
            el.addEventListener('change', () => {
                trainingTimes[idx] = {
                    day: daySelect.value,
                    start: startInput.value,
                    end: endInput.value
                };
            });
        });
    });
}

// ─── Event Listeners ─────────────────────────────────────────

function setupEventListeners() {
    // Zeichenzähler
    const descInput = document.getElementById('club-description-input');
    descInput.addEventListener('input', () => {
        document.getElementById('desc-char-count').textContent = descInput.value.length;
    });

    // Trainingszeit hinzufügen
    document.getElementById('add-training-time-btn').addEventListener('click', () => {
        trainingTimes.push({ day: 'Montag', start: '18:00', end: '20:00' });
        renderTrainingTimes();
    });

    // Logo Upload
    document.getElementById('logo-upload-input').addEventListener('change', handleLogoUpload);

    // Logo entfernen
    document.getElementById('remove-logo-btn').addEventListener('click', handleLogoRemove);

    // Speichern
    document.getElementById('save-club-btn').addEventListener('click', handleSave);
}

// ─── Logo Upload ─────────────────────────────────────────────

async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Max 2MB
    if (file.size > 2 * 1024 * 1024) {
        showStatus('Logo darf maximal 2 MB groß sein.', 'error');
        return;
    }

    // Typ prüfen
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showStatus('Nur PNG, JPEG, SVG und WebP sind erlaubt.', 'error');
        return;
    }

    const progressContainer = document.getElementById('logo-upload-progress');
    const progressBar = document.getElementById('logo-progress-bar');
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '30%';

    try {
        const ext = file.name.split('.').pop();
        const filename = `club-logo-${currentClub.id}.${ext}`;

        progressBar.style.width = '60%';

        const result = await uploadToR2('club-logos', file, {
            subfolder: currentClub.id,
            filename: filename
        });

        progressBar.style.width = '100%';

        // Preview aktualisieren
        const preview = document.getElementById('club-logo-preview');
        preview.src = result.url;
        document.getElementById('remove-logo-btn').classList.remove('hidden');

        // URL im Club speichern
        currentClub.logo_url = result.url;

        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
        }, 500);

        showStatus('Logo hochgeladen!', 'success');

    } catch (err) {
        console.error('[ClubPage] Logo upload error:', err);
        progressContainer.classList.add('hidden');
        showStatus('Fehler beim Hochladen des Logos.', 'error');
    }

    // Input zurücksetzen
    e.target.value = '';
}

async function handleLogoRemove() {
    if (!currentClub.logo_url) return;

    try {
        // Versuche altes Logo aus R2 zu löschen
        const urlParts = currentClub.logo_url.split('/file/');
        if (urlParts.length > 1) {
            await deleteFromR2(urlParts[1]).catch(() => {});
        }

        currentClub.logo_url = null;
        document.getElementById('club-logo-preview').src = '/icons/icon-192x192-2.png';
        document.getElementById('remove-logo-btn').classList.add('hidden');
        showStatus('Logo entfernt.', 'success');

    } catch (err) {
        console.error('[ClubPage] Logo remove error:', err);
    }
}

// ─── Speichern ───────────────────────────────────────────────

async function handleSave() {
    const saveBtn = document.getElementById('save-club-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird gespeichert...';

    try {
        const name = document.getElementById('club-name-input').value.trim();
        const description = document.getElementById('club-description-input').value.trim();

        if (!name) {
            showStatus('Vereinsname darf nicht leer sein.', 'error');
            return;
        }

        // Trainingszeiten aus DOM lesen (falls gerade editiert)
        syncTrainingTimesFromDOM();

        const settings = {
            ...(currentClub.settings || {}),
            email: document.getElementById('club-email-input').value.trim(),
            phone: document.getElementById('club-phone-input').value.trim(),
            website: document.getElementById('club-website-input').value.trim(),
            address: document.getElementById('club-address-input').value.trim(),
            zip: document.getElementById('club-zip-input').value.trim(),
            city: document.getElementById('club-city-input').value.trim(),
            training_times: trainingTimes
        };

        const { error } = await supabase
            .from('clubs')
            .update({
                name: name,
                description: description,
                logo_url: currentClub.logo_url,
                settings: settings
            })
            .eq('id', currentClub.id);

        if (error) throw error;

        currentClub.name = name;
        currentClub.description = description;
        currentClub.settings = settings;

        showStatus('Vereinsseite gespeichert!', 'success');

    } catch (err) {
        console.error('[ClubPage] Save error:', err);
        showStatus('Fehler beim Speichern: ' + (err.message || 'Unbekannter Fehler'), 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Speichern';
    }
}

function syncTrainingTimesFromDOM() {
    const rows = document.querySelectorAll('#training-times-container [data-index]');
    trainingTimes = Array.from(rows).map(row => ({
        day: row.querySelector('.training-day').value,
        start: row.querySelector('.training-start').value,
        end: row.querySelector('.training-end').value
    }));
}

// ─── Statistik laden ─────────────────────────────────────────

async function loadClubStats(clubId) {
    try {
        const [membersRes, coachesRes, matchesRes] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId).in('role', ['coach', 'head_coach']),
            supabase.from('matches').select('id', { count: 'exact', head: true }).eq('club_id', clubId)
        ]);

        document.getElementById('stat-members').textContent = membersRes.count || 0;
        document.getElementById('stat-coaches').textContent = coachesRes.count || 0;
        document.getElementById('stat-matches').textContent = matchesRes.count || 0;

    } catch (err) {
        console.error('[ClubPage] Stats error:', err);
    }
}

// ─── Status-Nachricht ────────────────────────────────────────

function showStatus(message, type = 'success') {
    const statusEl = document.getElementById('save-status');
    statusEl.classList.remove('hidden');
    statusEl.textContent = message;

    if (type === 'success') {
        statusEl.className = 'text-center py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800';
    } else {
        statusEl.className = 'text-center py-2 rounded-lg text-sm font-medium bg-red-100 text-red-800';
    }

    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 4000);
}
