/**
 * Club Page Module - Vereinsseite für Coaches/Head-Coaches
 * Pro Sportart: Beschreibung, Trainingszeiten
 * Club-Level: Name, Logo, Kontakt, Adresse
 */

import { getSupabase } from './supabase-init.js';
import { uploadToR2, deleteFromR2 } from './r2-storage.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

let currentUser = null;
let currentClub = null;
let clubSports = [];        // [{sport_id, sport_name, display_name}]
let activeSportId = null;    // aktuell gewählte Sportart
let sportData = {};          // { [sport_id]: { description, training_times } }
let trainingTimes = [];      // aktuelle Trainingszeiten der gewählten Sportart

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
            .select('id, role, club_id, active_sport_id')
            .eq('id', user.id)
            .single();

        if (!profile || !profile.club_id) {
            showAccessDenied();
            return;
        }

        if (profile.role !== 'coach' && profile.role !== 'head_coach' && profile.role !== 'admin') {
            showAccessDenied();
            return;
        }

        currentUser = { ...user, ...profile };

        // Club-Daten + Sportarten parallel laden
        const [clubRes, sportsRes] = await Promise.all([
            supabase.from('clubs')
                .select('id, name, description, logo_url, settings, created_at')
                .eq('id', profile.club_id)
                .single(),
            supabase.from('club_sports')
                .select('sport_id, sports(id, name, display_name, icon)')
                .eq('club_id', profile.club_id)
                .eq('is_active', true)
        ]);

        if (!clubRes.data) {
            showAccessDenied();
            return;
        }

        currentClub = clubRes.data;

        // Sportarten aufbereiten
        clubSports = (sportsRes.data || []).map(cs => ({
            sport_id: cs.sport_id,
            name: cs.sports?.name || '',
            display_name: cs.sports?.display_name || 'Unbekannt',
            icon: cs.sports?.icon || 'fa-trophy'
        }));

        // Sport-spezifische Daten aus settings laden
        const settings = currentClub.settings || {};
        sportData = settings.sport_data || {};

        // Aktive Sportart bestimmen (User-Präferenz oder erste)
        activeSportId = profile.active_sport_id;
        if (!activeSportId || !clubSports.find(s => s.sport_id === activeSportId)) {
            activeSportId = clubSports[0]?.sport_id || null;
        }

        renderSportTabs();
        populateClubFields(currentClub);
        loadSportFields(activeSportId);
        setupEventListeners();
        await loadClubStats(currentClub.id, activeSportId);

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

// ─── Sport-Tabs ──────────────────────────────────────────────

function renderSportTabs() {
    const container = document.getElementById('sport-tabs');
    if (clubSports.length <= 1) {
        container.style.display = 'none';
        // Hints trotzdem setzen
        updateSportHints();
        return;
    }

    container.innerHTML = clubSports.map(s => `
        <button class="sport-tab flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap ${s.sport_id === activeSportId ? 'active' : ''}"
                data-sport-id="${s.sport_id}">
            <i class="fas ${escapeHtml(s.icon)}"></i>
            ${escapeHtml(s.display_name)}
        </button>
    `).join('');

    container.querySelectorAll('.sport-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Aktuelle Sport-Daten speichern bevor gewechselt wird
            saveSportFieldsToMemory(activeSportId);

            activeSportId = tab.dataset.sportId;

            // Tabs aktualisieren
            container.querySelectorAll('.sport-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Felder für neue Sportart laden
            loadSportFields(activeSportId);
            loadClubStats(currentClub.id, activeSportId);
        });
    });

    updateSportHints();
}

function updateSportHints() {
    const sport = clubSports.find(s => s.sport_id === activeSportId);
    const sportName = sport?.display_name || '';

    const sportHint = document.getElementById('sport-section-hint');
    const trainingHint = document.getElementById('training-section-hint');

    if (sportHint) sportHint.textContent = sportName ? `Gilt für: ${sportName}` : '';
    if (trainingHint) trainingHint.textContent = sportName ? `Gilt für: ${sportName}` : '';
}

// ─── Club-Level Felder (gemeinsam) ───────────────────────────

function populateClubFields(club) {
    document.getElementById('club-name-input').value = club.name || '';

    if (club.logo_url) {
        document.getElementById('club-logo-preview').src = club.logo_url;
        document.getElementById('remove-logo-btn').classList.remove('hidden');
    }

    const settings = club.settings || {};
    document.getElementById('club-email-input').value = settings.email || '';
    document.getElementById('club-phone-input').value = settings.phone || '';
    document.getElementById('club-website-input').value = settings.website || '';
    document.getElementById('club-address-input').value = settings.address || '';
    document.getElementById('club-zip-input').value = settings.zip || '';
    document.getElementById('club-city-input').value = settings.city || '';
}

// ─── Sport-spezifische Felder ────────────────────────────────

function loadSportFields(sportId) {
    if (!sportId) return;

    const data = sportData[sportId] || {};

    // Beschreibung
    const descInput = document.getElementById('club-description-input');
    descInput.value = data.description || '';
    document.getElementById('desc-char-count').textContent = (data.description || '').length;

    // Trainingszeiten
    trainingTimes = data.training_times ? [...data.training_times] : [];
    renderTrainingTimes();

    updateSportHints();
}

function saveSportFieldsToMemory(sportId) {
    if (!sportId) return;

    syncTrainingTimesFromDOM();

    sportData[sportId] = {
        description: document.getElementById('club-description-input').value.trim(),
        training_times: trainingTimes
    };
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

    container.querySelectorAll('.remove-training-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            trainingTimes.splice(idx, 1);
            renderTrainingTimes();
        });
    });

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
    const descInput = document.getElementById('club-description-input');
    descInput.addEventListener('input', () => {
        document.getElementById('desc-char-count').textContent = descInput.value.length;
    });

    document.getElementById('add-training-time-btn').addEventListener('click', () => {
        trainingTimes.push({ day: 'Montag', start: '18:00', end: '20:00' });
        renderTrainingTimes();
    });

    document.getElementById('logo-upload-input').addEventListener('change', handleLogoUpload);
    document.getElementById('remove-logo-btn').addEventListener('click', handleLogoRemove);
    document.getElementById('save-club-btn').addEventListener('click', handleSave);
}

// ─── Logo Upload ─────────────────────────────────────────────

async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showStatus('Logo darf maximal 2 MB groß sein.', 'error');
        return;
    }

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

        const result = await uploadToR2('profile-pictures', file, {
            subfolder: `club-${currentClub.id}`,
            filename: filename
        });

        progressBar.style.width = '100%';

        const preview = document.getElementById('club-logo-preview');
        preview.src = result.url;
        document.getElementById('remove-logo-btn').classList.remove('hidden');
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

    e.target.value = '';
}

async function handleLogoRemove() {
    if (!currentClub.logo_url) return;

    try {
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

        if (!name) {
            showStatus('Vereinsname darf nicht leer sein.', 'error');
            return;
        }

        // Aktuelle Sportart-Daten aus DOM lesen
        saveSportFieldsToMemory(activeSportId);

        const settings = {
            ...(currentClub.settings || {}),
            email: document.getElementById('club-email-input').value.trim(),
            phone: document.getElementById('club-phone-input').value.trim(),
            website: document.getElementById('club-website-input').value.trim(),
            address: document.getElementById('club-address-input').value.trim(),
            zip: document.getElementById('club-zip-input').value.trim(),
            city: document.getElementById('club-city-input').value.trim(),
            sport_data: sportData
        };

        const { error } = await supabase
            .from('clubs')
            .update({
                name: name,
                logo_url: currentClub.logo_url,
                settings: settings
            })
            .eq('id', currentClub.id);

        if (error) throw error;

        currentClub.name = name;
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

async function loadClubStats(clubId, sportId) {
    try {
        const sport = clubSports.find(s => s.sport_id === sportId);
        const titleEl = document.getElementById('stat-title');
        if (titleEl) {
            titleEl.textContent = sport ? `${sport.display_name} – Statistik` : 'Statistik';
        }

        // Queries basierend auf Sportart filtern
        const queries = [
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId).in('role', ['coach', 'head_coach']),
        ];

        // Matches nach Sportart filtern wenn vorhanden
        let matchQuery = supabase.from('matches').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
        if (sportId) {
            matchQuery = matchQuery.eq('sport_id', sportId);
        }
        queries.push(matchQuery);

        const [membersRes, coachesRes, matchesRes] = await Promise.all(queries);

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
