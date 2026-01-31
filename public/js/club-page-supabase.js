/**
 * Club Page Module
 * - Edit-Modus: Coach/Head-Coach bearbeitet die Seite seiner Sparte
 * - View-Modus: Jeder kann Vereinsinfos ansehen (read-only)
 *
 * URL-Parameter:
 *   /club-page.html          → eigener Verein (Edit wenn Coach)
 *   /club-page.html?id=xxx   → Verein ansehen (View, Edit wenn eigener + Coach)
 */

import { getSupabase } from './supabase-init.js';
import { uploadToR2, deleteFromR2 } from './r2-storage.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

let currentUser = null;
let currentClub = null;
let userSportId = null;       // Sportart des Coaches (aus profile_club_sports)
let userSportName = '';
let sportData = {};           // { [sport_id]: { description, training_times } }
let trainingTimes = [];
let isEditMode = false;

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// ─── Init ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const urlParams = new URLSearchParams(window.location.search);
        const viewClubId = urlParams.get('id');

        // Profil laden wenn eingeloggt
        let profile = null;
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('id, role, club_id, active_sport_id')
                .eq('id', user.id)
                .single();
            profile = data;
        }

        // Welchen Club anzeigen?
        let clubId = viewClubId || profile?.club_id;

        if (!clubId) {
            if (!user) {
                window.location.href = '/index.html';
            } else {
                showAccessDenied('Kein Verein gefunden.');
            }
            return;
        }

        // Club-Daten laden
        const { data: club } = await supabase
            .from('clubs')
            .select('id, name, description, logo_url, settings, created_at')
            .eq('id', clubId)
            .single();

        if (!club) {
            showAccessDenied('Verein nicht gefunden.');
            return;
        }

        currentClub = club;
        currentUser = user ? { ...user, ...profile } : null;

        // Edit-Modus bestimmen: Coach/Head-Coach im eigenen Verein
        const isOwnClub = profile?.club_id === club.id;
        const isCoachRole = profile?.role === 'coach' || profile?.role === 'head_coach';
        isEditMode = isOwnClub && isCoachRole;

        // Sport-Daten aus settings laden
        const settings = club.settings || {};
        sportData = settings.sport_data || {};

        // Back-Link anpassen: View-Modus → Dashboard, Edit → Settings
        const backLink = document.getElementById('back-link');
        if (backLink && !isEditMode) {
            backLink.href = '/dashboard.html';
        }

        if (isEditMode) {
            // Sportart des Coaches ermitteln aus profile_club_sports
            const { data: pcs } = await supabase
                .from('profile_club_sports')
                .select('sport_id, role, sports(id, display_name)')
                .eq('user_id', user.id)
                .eq('club_id', club.id)
                .in('role', ['coach', 'head_coach'])
                .limit(1);

            if (pcs && pcs.length > 0) {
                userSportId = pcs[0].sport_id;
                userSportName = pcs[0].sports?.display_name || '';
            } else {
                // Fallback: active_sport_id
                userSportId = profile.active_sport_id;
                if (userSportId) {
                    const { data: sportRow } = await supabase
                        .from('sports')
                        .select('display_name')
                        .eq('id', userSportId)
                        .single();
                    userSportName = sportRow?.display_name || '';
                }
            }

            setupEditMode();
        } else {
            setupViewMode(club);
        }

        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

    } catch (err) {
        console.error('[ClubPage] Init error:', err);
        showAccessDenied('Fehler beim Laden.');
    }
});

function showAccessDenied(message) {
    document.getElementById('page-loader').style.display = 'none';
    const el = document.getElementById('access-denied');
    el.classList.remove('hidden');
    const msgEl = el.querySelector('p');
    if (msgEl && message) msgEl.textContent = message;
}

// ─── View-Modus (read-only) ─────────────────────────────────

function setupViewMode(club) {
    // Edit-Elemente verstecken
    document.getElementById('edit-controls').classList.add('hidden');
    document.getElementById('logo-upload-area').classList.add('hidden');
    document.getElementById('remove-logo-btn').classList.add('hidden');
    document.getElementById('club-name-input').classList.add('hidden');
    document.getElementById('contact-edit').classList.add('hidden');

    // Vereinsname als Text anzeigen
    document.getElementById('club-name-display').textContent = club.name || '';

    // Logo
    if (club.logo_url) {
        document.getElementById('club-logo-preview').src = club.logo_url;
    }

    // Kontakt & Adresse als View
    const settings = club.settings || {};
    renderContactView(settings);

    // Alle Sparten anzeigen
    renderViewSportSections(club);

    // Statistik
    loadClubStats(club.id, null);
}

function renderContactView(settings) {
    const items = [];

    if (settings.email) {
        items.push(`
            <a href="mailto:${escapeHtml(settings.email)}" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <i class="fas fa-envelope text-indigo-400"></i>
                <span class="text-sm text-gray-700">${escapeHtml(settings.email)}</span>
            </a>
        `);
    }
    if (settings.phone) {
        items.push(`
            <a href="tel:${escapeHtml(settings.phone)}" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <i class="fas fa-phone text-indigo-400"></i>
                <span class="text-sm text-gray-700">${escapeHtml(settings.phone)}</span>
            </a>
        `);
    }
    if (settings.website) {
        items.push(`
            <a href="${escapeHtml(settings.website)}" target="_blank" rel="noopener" class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <i class="fas fa-globe text-indigo-400"></i>
                <span class="text-sm text-gray-700 truncate">${escapeHtml(settings.website)}</span>
            </a>
        `);
    }

    const addressParts = [settings.address, [settings.zip, settings.city].filter(Boolean).join(' ')].filter(Boolean);
    if (addressParts.length > 0) {
        items.push(`
            <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <i class="fas fa-map-marker-alt text-indigo-400"></i>
                <span class="text-sm text-gray-700">${escapeHtml(addressParts.join(', '))}</span>
            </div>
        `);
    }

    const contactView = document.getElementById('contact-view');
    const contactContent = document.getElementById('contact-view-content');

    if (items.length > 0) {
        contactView.classList.remove('hidden');
        contactContent.innerHTML = items.join('');
    }
}

function renderViewSportSections(club) {
    const container = document.getElementById('sport-sections-view');
    const settings = club.settings || {};
    const sd = settings.sport_data || {};

    const sportIds = Object.keys(sd);
    if (sportIds.length === 0) {
        container.innerHTML = '<div class="bg-white rounded-xl shadow-md p-6 text-center"><p class="text-gray-400 text-sm py-2">Noch keine Sparteninformationen hinterlegt.</p></div>';
        return;
    }

    // Sportnamen laden
    supabase.from('sports')
        .select('id, display_name')
        .in('id', sportIds)
        .then(({ data: sports }) => {
            const sportMap = {};
            (sports || []).forEach(s => sportMap[s.id] = s.display_name);

            container.innerHTML = sportIds.map(sid => {
                const data = sd[sid];
                const name = sportMap[sid] || 'Sparte';
                const desc = data.description || '';
                const times = data.training_times || [];

                return `
                    <div class="bg-white rounded-xl shadow-md p-6">
                        <h2 class="text-lg font-bold text-gray-800 mb-3">
                            <i class="fas fa-trophy text-indigo-600 mr-2"></i>${escapeHtml(name)}
                        </h2>
                        ${desc ? `<p class="text-sm text-gray-600 mb-4 leading-relaxed">${escapeHtml(desc)}</p>` : ''}
                        ${times.length > 0 ? `
                            <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">Trainingszeiten</h3>
                            <div class="space-y-2">
                                ${times.map(t => `
                                    <div class="flex items-center gap-3 bg-gray-50 px-3 py-2.5 rounded-lg">
                                        <i class="fas fa-calendar-day text-indigo-400 text-sm"></i>
                                        <span class="font-medium text-gray-800 text-sm">${escapeHtml(t.day)}</span>
                                        <span class="text-gray-500 text-sm ml-auto">${escapeHtml(t.start || '')} – ${escapeHtml(t.end || '')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="text-sm text-gray-400">Keine Trainingszeiten hinterlegt</p>'}
                    </div>
                `;
            }).join('');
        });
}

// ─── Edit-Modus (Coach) ─────────────────────────────────────

function setupEditMode() {
    // Sparten-Hinweis setzen
    const sportHint = document.getElementById('sport-section-hint');
    const trainingHint = document.getElementById('training-section-hint');
    if (sportHint && userSportName) sportHint.textContent = `Gilt für: ${userSportName}`;
    if (trainingHint && userSportName) trainingHint.textContent = `Gilt für: ${userSportName}`;

    // View-Container verstecken, Edit-Sections zeigen
    document.getElementById('sport-sections-view').classList.add('hidden');
    document.getElementById('edit-sport-section').classList.remove('hidden');
    document.getElementById('contact-edit').classList.remove('hidden');
    document.getElementById('contact-view').classList.add('hidden');

    // Name: Input zeigen, Display verstecken
    document.getElementById('club-name-display').classList.add('hidden');
    document.getElementById('club-name-input').classList.remove('hidden');

    // Club-Level Felder befüllen
    populateClubFields(currentClub);

    // Sport-Felder laden
    if (userSportId) {
        loadSportFields(userSportId);
    }

    setupEventListeners();
    loadClubStats(currentClub.id, userSportId);
}

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

function loadSportFields(sportId) {
    if (!sportId) return;
    const data = sportData[sportId] || {};

    const descInput = document.getElementById('club-description-input');
    descInput.value = data.description || '';
    document.getElementById('desc-char-count').textContent = (data.description || '').length;

    trainingTimes = data.training_times ? [...data.training_times] : [];
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
                <select class="training-day w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    ${DAYS.map(d => `<option value="${escapeHtml(d)}" ${t.day === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
                </select>
            </div>
            <input type="time" class="training-start px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(t.start || '18:00')}" />
            <span class="text-gray-400">–</span>
            <input type="time" class="training-end px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(t.end || '20:00')}" />
            <button class="remove-training-btn text-red-400 hover:text-red-600 transition p-1" data-index="${index}">
                <i class="fas fa-trash-alt text-sm"></i>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.remove-training-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            trainingTimes.splice(parseInt(btn.dataset.index), 1);
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
                trainingTimes[idx] = { day: daySelect.value, start: startInput.value, end: endInput.value };
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
        document.getElementById('club-logo-preview').src = result.url;
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
        if (urlParts.length > 1) await deleteFromR2(urlParts[1]).catch(() => {});

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

        // Sport-Daten speichern
        syncTrainingTimesFromDOM();
        if (userSportId) {
            sportData[userSportId] = {
                description: document.getElementById('club-description-input').value.trim(),
                training_times: trainingTimes
            };
        }

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
            .update({ name, logo_url: currentClub.logo_url, settings })
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

// ─── Statistik ───────────────────────────────────────────────

async function loadClubStats(clubId, sportId) {
    try {
        let matchQuery = supabase.from('matches').select('id', { count: 'exact', head: true }).eq('club_id', clubId);
        if (sportId) matchQuery = matchQuery.eq('sport_id', sportId);

        const [membersRes, coachesRes, matchesRes] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
            supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('club_id', clubId).in('role', ['coach', 'head_coach']),
            matchQuery
        ]);

        document.getElementById('stat-members').textContent = membersRes.count || 0;
        document.getElementById('stat-coaches').textContent = coachesRes.count || 0;
        document.getElementById('stat-matches').textContent = matchesRes.count || 0;
    } catch (err) {
        console.error('[ClubPage] Stats error:', err);
    }
}

// ─── Status ──────────────────────────────────────────────────

function showStatus(message, type = 'success') {
    const statusEl = document.getElementById('save-status');
    if (!statusEl) return;
    statusEl.classList.remove('hidden');
    statusEl.textContent = message;
    statusEl.className = type === 'success'
        ? 'text-center py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800'
        : 'text-center py-2 rounded-lg text-sm font-medium bg-red-100 text-red-800';
    setTimeout(() => statusEl.classList.add('hidden'), 4000);
}
