// Admin-Dashboard (Supabase-Version)

import { getSupabase, onAuthStateChange, signOut as supabaseSignOut, getCurrentUser } from './supabase-init.js';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from './db-supabase.js';
import { generateInvitationCode, getExpirationDate } from './invitation-code-utils.js';
import { setupDescriptionEditor, renderTableForDisplay } from './tableEditor.js';
import {
    initializeExerciseMilestones,
    getExerciseMilestones,
    isExerciseTieredPointsEnabled,
    initializeExercisePartnerSystem,
} from './milestone-management.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

// DOM-Elemente
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const authErrorContainer = document.getElementById('auth-error-container');
const authErrorMessage = document.getElementById('auth-error-message');
const errorLogoutButton = document.getElementById('error-logout-button');
const welcomeMessage = document.getElementById('welcome-message');
const logoutButton = document.getElementById('logout-button');
const inviteCoachForm = document.getElementById('invite-coach-form');
const inviteLinkContainer = document.getElementById('invite-link-container');
const inviteLinkInput = document.getElementById('invite-link-input');
const copyLinkButton = document.getElementById('copy-link-button');
const clubsListEl = document.getElementById('clubs-list');
const createExerciseForm = document.getElementById('create-exercise-form');
const exercisesListAdminEl = document.getElementById('exercises-list-admin');

const playerModal = document.getElementById('player-modal');
const closePlayerModalButton = document.getElementById('close-player-modal-button');
const modalClubIdEl = document.getElementById('modal-club-id');
const modalPlayerListEl = document.getElementById('modal-player-list');

const exerciseModal = document.getElementById('exercise-modal');
const closeExerciseModalButton = document.getElementById('close-exercise-modal-button');
const modalExerciseTitle = document.getElementById('modal-exercise-title');
const modalExerciseImage = document.getElementById('modal-exercise-image');
const modalExerciseDescription = document.getElementById('modal-exercise-description');
const modalExercisePoints = document.getElementById('modal-exercise-points');
const modalDeleteExerciseButton = document.getElementById('modal-delete-exercise-button');
const modalEditExerciseButton = document.getElementById('modal-edit-exercise-button');

const editExerciseModal = document.getElementById('edit-exercise-modal');
const editExerciseForm = document.getElementById('edit-exercise-form');
const closeEditExerciseModalButton = document.getElementById('close-edit-exercise-modal-button');

let genderChartInstance = null;
let attendanceChartInstance = null;
let competitionChartInstance = null;

let competitionMatchData = [];
let competitionPeriod = 'month';
let competitionTypeFilter = 'all';
let descriptionEditor = null;
let editDescriptionEditor = null;

let usersSubscription = null;
let exercisesSubscription = null;

let allSports = [];
let allClubs = [];
let selectedClub = null;
let clubExistingSports = [];

let currentSportFilter = 'all';
let isAdminPageInitialized = false;

function showAuthError(message) {
    pageLoader.style.display = 'none';
    mainContent.style.display = 'none';
    authErrorMessage.textContent = message;
    authErrorContainer.style.display = 'flex';
    console.error('Auth-Fehler auf Admin-Seite:', message);
}

onAuthStateChange(async (event, session) => {
    if (session?.user) {
        try {
            const { data: userData, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error) throw error;

            if (userData) {
                if (userData.role === 'admin') {
                    initializeAdminPage(userData, session.user);
                } else {
                    showAuthError(`Ihre Rolle ('${userData.role}') hat keine Admin-Berechtigung.`);
                }
            } else {
                showAuthError('Ihr Benutzerprofil wurde nicht in der Datenbank gefunden.');
            }
        } catch (error) {
            showAuthError(`Datenbankfehler: ${error.message}`);
        }
    } else {
        window.location.replace('/index.html');
    }
});

function initializeAdminPage(userData, user) {
    if (isAdminPageInitialized) {
        console.log('[Admin] Page already initialized, skipping');
        return;
    }
    isAdminPageInitialized = true;

    try {
        welcomeMessage.textContent = `Willkommen, ${userData.first_name || userData.display_name || user.email}!`;

        console.log('[Admin] Page view - Admin Dashboard');

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

        logoutButton.addEventListener('click', async () => {
            try {
                await supabaseSignOut();
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });

        errorLogoutButton.addEventListener('click', async () => {
            try {
                await supabaseSignOut();
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });

        inviteCoachForm.addEventListener('submit', handleInviteCoach);
        copyLinkButton.addEventListener('click', copyInviteLink);
        createExerciseForm.addEventListener('submit', handleCreateExercise);

        // Beschreibungs-Editoren initialisieren
        descriptionEditor = setupDescriptionEditor({
            textAreaId: 'exercise-description',
            toggleContainerId: 'description-toggle-container',
            tableEditorContainerId: 'description-table-editor',
        });

        editDescriptionEditor = setupDescriptionEditor({
            textAreaId: 'edit-exercise-description',
            toggleContainerId: 'edit-description-toggle-container',
            tableEditorContainerId: 'edit-description-table-editor',
        });

        // Meilenstein-Verwaltung initialisieren
        initializeExerciseMilestones();

        // Partner-System initialisieren
        initializeExercisePartnerSystem();

        // Animation-Toggle für Übungserstellung
        initializeAnimationToggle();

        // Modal-Listener
        closePlayerModalButton.addEventListener('click', () => playerModal.classList.add('hidden'));
        closeExerciseModalButton.addEventListener('click', () =>
            exerciseModal.classList.add('hidden')
        );
        closeEditExerciseModalButton.addEventListener('click', () =>
            editExerciseModal.classList.add('hidden')
        );

        // Abkürzungen im Übungs-Modal umschalten
        const toggleAbbreviationsAdmin = document.getElementById('toggle-abbreviations-admin');
        const abbreviationsContentAdmin = document.getElementById('abbreviations-content-admin');
        const abbreviationsIconAdmin = document.getElementById('abbreviations-icon-admin');
        if (toggleAbbreviationsAdmin && abbreviationsContentAdmin && abbreviationsIconAdmin) {
            toggleAbbreviationsAdmin.addEventListener('click', () => {
                const isHidden = abbreviationsContentAdmin.classList.contains('hidden');
                if (isHidden) {
                    abbreviationsContentAdmin.classList.remove('hidden');
                    abbreviationsIconAdmin.style.transform = 'rotate(180deg)';
                    toggleAbbreviationsAdmin.innerHTML =
                        '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
                } else {
                    abbreviationsContentAdmin.classList.add('hidden');
                    abbreviationsIconAdmin.style.transform = 'rotate(0deg)';
                    toggleAbbreviationsAdmin.innerHTML =
                        '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
                }
            });
        }

        modalPlayerListEl.addEventListener('click', e => {
            if (e.target.classList.contains('delete-player-btn')) {
                handleDeletePlayer(e.target.dataset.id);
            }
        });

        exercisesListAdminEl.addEventListener('click', e => {
            const card = e.target.closest('[data-id]');
            if (card) {
                openExerciseModal(card.dataset);
            }
        });

        modalEditExerciseButton.addEventListener('click', e => {
            openEditExerciseModal(e.target.dataset);
        });

        modalDeleteExerciseButton.addEventListener('click', e => {
            handleDeleteExercise(e.target.dataset.id, e.target.dataset.imageUrl);
        });

        editExerciseForm.addEventListener('submit', handleUpdateExercise);

        // Sportarten und Vereine für Einladungsformular laden
        loadSportsAndClubs();
        setupClubSearchListeners();

        // Audit-Bereich initialisieren
        initializeAuditSection();

        loadClubsAndPlayers();
        loadAllExercises();
        loadStatistics();
    } catch (error) {
        showAuthError(`Initialisierungsfehler: ${error.message}`);
    }
}

// ============================================
// SPORTARTEN- UND VEREINSVERWALTUNG
// ============================================

async function loadSportsAndClubs() {
    try {
        // Alle Sportarten laden
        const { data: sports, error: sportsError } = await supabase
            .from('sports')
            .select('*')
            .eq('is_active', true)
            .order('display_name');

        if (sportsError) throw sportsError;
        allSports = sports || [];

        // Sportarten-Dropdowns befüllen
        const sportSelect = document.getElementById('sportSelect');

        if (sportSelect) {
            sportSelect.innerHTML = '<option value="">-- Sportart wählen --</option>';
            allSports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = `${getSportIcon(sport.name)} ${sport.display_name}`;
                sportSelect.appendChild(option);
            });
        }

        // Übungs-Sportarten-Dropdown befüllen
        const exerciseSportSelect = document.getElementById('exercise-sport');
        if (exerciseSportSelect) {
            exerciseSportSelect.innerHTML = '<option value="">📊 Alle Sportarten</option>';
            allSports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = `${getSportIcon(sport.name)} ${sport.display_name}`;
                exerciseSportSelect.appendChild(option);
            });
        }

        // Sport-Wechsel-Buttons initialisieren
        initializeSportSwitch();

        // Alle Vereine laden
        const { data: clubs, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name, is_test_club')
            .order('name');

        if (clubsError) throw clubsError;
        allClubs = clubs || [];

        // Übungs-Vereins-Dropdown befüllen
        const exerciseClubSelect = document.getElementById('exercise-club');
        if (exerciseClubSelect) {
            exerciseClubSelect.innerHTML = '<option value="">🌍 Global (alle Vereine)</option>';
            allClubs.forEach(club => {
                const option = document.createElement('option');
                option.value = club.id;
                option.textContent = club.name;
                exerciseClubSelect.appendChild(option);
            });
        }

    } catch (error) {
        console.error('Fehler beim Laden der Sportarten/Vereine:', error);
    }
}

function initializeSportSwitch() {
    const container = document.getElementById('sport-switch-container');
    if (!container) return;

    // Leeren und neu aufbauen
    container.innerHTML = `
        <button class="sport-switch-btn px-4 py-2 rounded-lg font-medium transition-colors ${currentSportFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}" data-sport="all">
            📊 Alle
        </button>
    `;

    // Button für jede Sportart hinzufügen
    allSports.forEach(sport => {
        const btn = document.createElement('button');
        btn.className = `sport-switch-btn px-4 py-2 rounded-lg font-medium transition-colors ${currentSportFilter === sport.id ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`;
        btn.dataset.sport = sport.id;
        btn.innerHTML = `${getSportIcon(sport.name)} ${sport.display_name}`;
        container.appendChild(btn);
    });

    // Klick-Listener hinzufügen
    container.querySelectorAll('.sport-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sportId = btn.dataset.sport;
            switchSportFilter(sportId);
        });
    });
}

function switchSportFilter(sportId) {
    currentSportFilter = sportId;

    // Button-Stile aktualisieren
    document.querySelectorAll('.sport-switch-btn').forEach(btn => {
        if (btn.dataset.sport === sportId) {
            btn.className = 'sport-switch-btn px-4 py-2 rounded-lg font-medium transition-colors bg-indigo-600 text-white';
        } else {
            btn.className = 'sport-switch-btn px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300';
        }
    });

    // Info-Text aktualisieren
    const infoEl = document.getElementById('current-sport-info');
    const exerciseSportLabel = document.getElementById('exercise-sport-label');
    const sport = sportId !== 'all' ? allSports.find(s => s.id === sportId) : null;

    if (infoEl) {
        if (sportId === 'all') {
            infoEl.textContent = 'Zeige: Alle Sportarten';
        } else {
            infoEl.textContent = `Zeige: ${sport ? sport.display_name : 'Unbekannt'}`;
        }
    }

    // Übungserstellungs-Label aktualisieren
    if (exerciseSportLabel) {
        if (sportId === 'all') {
            exerciseSportLabel.textContent = 'Alle Sportarten';
            exerciseSportLabel.className = 'font-medium text-gray-700';
        } else {
            exerciseSportLabel.textContent = `${getSportIcon(sport?.name)} ${sport?.display_name || 'Unbekannt'}`;
            exerciseSportLabel.className = 'font-medium text-indigo-600';
        }
    }

    // Übungs-Sportart-Dropdown automatisch vorauswählen
    const exerciseSportSelect = document.getElementById('exercise-sport');
    if (exerciseSportSelect) {
        exerciseSportSelect.value = sportId !== 'all' ? sportId : '';
    }

    // Daten mit neuem Filter neu laden
    loadStatistics();
    loadAllExercises();
    loadClubsAndPlayers(); // Vereinsübersicht mit neuem Filter neu laden
}

function getSportIcon(sportName) {
    const icons = {
        'table_tennis': '🏓',
        'badminton': '🏸',
        'tennis': '🎾',
        'padel': '🎾'
    };
    return icons[sportName] || '⚽';
}

function setupClubSearchListeners() {
    const clubNameInput = document.getElementById('clubName');
    const searchResults = document.getElementById('club-search-results');
    const selectedClubContainer = document.getElementById('selected-club-container');
    const clearSelectedClubBtn = document.getElementById('clear-selected-club');
    const sportSelect = document.getElementById('sportSelect');
    const newClubInfo = document.getElementById('new-club-info');
    const existingSportWarning = document.getElementById('existing-sport-warning');

    if (!clubNameInput) return;

    let searchTimeout;

    // Live-Suche während der Eingabe
    clubNameInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();

        clearTimeout(searchTimeout);

        if (query.length < 2) {
            searchResults.classList.add('hidden');
            newClubInfo.classList.add('hidden');
            return;
        }

        searchTimeout = setTimeout(() => {
            performClubSearch(query);
        }, 300);
    });

    // Ergebnisse ausblenden bei Klick außerhalb
    document.addEventListener('click', (e) => {
        if (!clubNameInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Ausgewählten Verein löschen
    if (clearSelectedClubBtn) {
        clearSelectedClubBtn.addEventListener('click', () => {
            clearSelectedClub();
        });
    }

    // Sportart-Auswahl geändert - prüfen ob Sportart bereits existiert
    if (sportSelect) {
        sportSelect.addEventListener('change', () => {
            checkExistingSport();
        });
    }
}

async function performClubSearch(query) {
    const searchResults = document.getElementById('club-search-results');
    const newClubInfo = document.getElementById('new-club-info');

    // Vereine filtern die der Suche entsprechen
    const matchingClubs = allClubs.filter(club =>
        club.name.toLowerCase().includes(query.toLowerCase())
    );

    searchResults.innerHTML = '';

    if (matchingClubs.length > 0) {
        // Passende Vereine anzeigen
        for (const club of matchingClubs) {
            const clubSports = await getClubSports(club.id);
            const sportsText = clubSports.length > 0
                ? clubSports.map(s => `${getSportIcon(s.name)} ${s.display_name}`).join(', ')
                : 'Keine Sparten';

            const div = document.createElement('div');
            div.className = 'px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0';
            div.innerHTML = `
                <div class="font-medium text-gray-900">${club.name}</div>
                <div class="text-xs text-gray-500">${sportsText}</div>
            `;
            div.addEventListener('click', () => selectClub(club, clubSports));
            searchResults.appendChild(div);
        }

        // Option neuen Verein mit diesem Namen zu erstellen
        const createNewDiv = document.createElement('div');
        createNewDiv.className = 'px-4 py-3 hover:bg-green-50 cursor-pointer bg-green-25 border-t border-green-200';
        createNewDiv.innerHTML = `
            <div class="font-medium text-green-700"><i class="fas fa-plus-circle mr-2"></i>Neuen Verein erstellen: "${query}"</div>
        `;
        createNewDiv.addEventListener('click', () => {
            clearSelectedClub();
            document.getElementById('clubName').value = query;
            searchResults.classList.add('hidden');
            newClubInfo.classList.remove('hidden');
        });
        searchResults.appendChild(createNewDiv);

        searchResults.classList.remove('hidden');
        newClubInfo.classList.add('hidden');
    } else {
        // Keine passenden Vereine - Neu erstellen anbieten
        searchResults.classList.add('hidden');
        newClubInfo.classList.remove('hidden');
    }
}

async function getClubSports(clubId) {
    try {
        const { data, error } = await supabase
            .from('club_sports')
            .select('sport_id, sports(id, name, display_name)')
            .eq('club_id', clubId)
            .eq('is_active', true);

        if (error) throw error;
        return (data || []).map(cs => cs.sports);
    } catch (error) {
        console.error('Fehler beim Laden der Club-Sportarten:', error);
        return [];
    }
}

function selectClub(club, clubSports) {
    selectedClub = club;
    clubExistingSports = clubSports;

    const clubNameInput = document.getElementById('clubName');
    const searchResults = document.getElementById('club-search-results');
    const selectedClubContainer = document.getElementById('selected-club-container');
    const selectedClubName = document.getElementById('selected-club-name');
    const selectedClubIdInput = document.getElementById('selected-club-id');
    const existingSportsContainer = document.getElementById('existing-sports-container');
    const existingSportsList = document.getElementById('existing-sports-list');
    const newClubInfo = document.getElementById('new-club-info');

    // Suchergebnisse und Eingabe ausblenden
    searchResults.classList.add('hidden');
    clubNameInput.value = '';
    clubNameInput.classList.add('hidden');
    clubNameInput.removeAttribute('required'); // required-Attribut entfernen wenn versteckt
    newClubInfo.classList.add('hidden');

    // Ausgewählten Verein anzeigen
    selectedClubName.textContent = club.name;
    selectedClubIdInput.value = club.id;
    selectedClubContainer.classList.remove('hidden');

    // Existierende Sportarten anzeigen
    if (clubSports.length > 0) {
        existingSportsList.innerHTML = clubSports.map(sport =>
            `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                ${getSportIcon(sport.name)} ${sport.display_name}
            </span>`
        ).join('');
        existingSportsContainer.classList.remove('hidden');
    } else {
        existingSportsContainer.classList.add('hidden');
    }

    // Prüfen ob ausgewählte Sportart bereits existiert
    checkExistingSport();
}

function clearSelectedClub() {
    selectedClub = null;
    clubExistingSports = [];

    const clubNameInput = document.getElementById('clubName');
    const selectedClubContainer = document.getElementById('selected-club-container');
    const selectedClubIdInput = document.getElementById('selected-club-id');
    const existingSportWarning = document.getElementById('existing-sport-warning');
    const newClubInfo = document.getElementById('new-club-info');

    clubNameInput.classList.remove('hidden');
    clubNameInput.setAttribute('required', ''); // required-Attribut wieder hinzufügen wenn sichtbar
    clubNameInput.value = '';
    selectedClubContainer.classList.add('hidden');
    selectedClubIdInput.value = '';
    existingSportWarning.classList.add('hidden');
    newClubInfo.classList.add('hidden');
}

function checkExistingSport() {
    const sportSelect = document.getElementById('sportSelect');
    const existingSportWarning = document.getElementById('existing-sport-warning');

    if (!sportSelect || !existingSportWarning) return;

    const selectedSportId = sportSelect.value;

    if (selectedClub && selectedSportId) {
        const sportExists = clubExistingSports.some(s => s.id === selectedSportId);
        if (sportExists) {
            existingSportWarning.classList.remove('hidden');
        } else {
            existingSportWarning.classList.add('hidden');
        }
    } else {
        existingSportWarning.classList.add('hidden');
    }
}

async function handleInviteCoach(e) {
    e.preventDefault();

    const clubNameInput = document.getElementById('clubName');
    const clubName = clubNameInput?.value?.trim();
    const selectedClubId = document.getElementById('selected-club-id')?.value;
    const sportId = document.getElementById('sportSelect')?.value;

    // Validation
    if (!selectedClubId && !clubName) {
        return alert('Bitte einen Verein auswählen oder einen neuen Vereinsnamen eingeben.');
    }

    if (!sportId) {
        return alert('Bitte eine Sportart auswählen.');
    }

    try {
        let clubId;
        let isNewClub = false;

        if (selectedClubId) {
            // Ausgewählten existierenden Verein verwenden
            clubId = selectedClubId;
        } else {
            // Prüfen ob Verein mit diesem Namen bereits existiert (Sicherheitsprüfung)
            const { data: existingClub } = await supabase
                .from('clubs')
                .select('id')
                .eq('name', clubName)
                .maybeSingle();

            if (existingClub) {
                clubId = existingClub.id;
            } else {
                // Neuen Verein erstellen
                const { data: newClub, error: clubError } = await supabase
                    .from('clubs')
                    .insert({ name: clubName })
                    .select()
                    .single();

                if (clubError) throw clubError;
                clubId = newClub.id;
                isNewClub = true;
            }
        }

        // Sportart zu club_sports hinzufügen falls noch nicht vorhanden
        const { data: existingClubSport } = await supabase
            .from('club_sports')
            .select('club_id')
            .eq('club_id', clubId)
            .eq('sport_id', sportId)
            .maybeSingle();

        if (!existingClubSport) {
            const { error: clubSportError } = await supabase
                .from('club_sports')
                .insert({
                    club_id: clubId,
                    sport_id: sportId,
                    is_active: true
                });

            if (clubSportError) {
                console.warn('Could not add sport to club_sports:', clubSportError);
                // Trotzdem fortfahren - Sportart-Zuordnung ist optional
            }
        }

        // Eindeutigen Code generieren
        let code = generateInvitationCode();
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const { data } = await supabase
                .from('invitation_codes')
                .select('id')
                .eq('code', code)
                .maybeSingle();

            if (!data) {
                isUnique = true;
            } else {
                code = generateInvitationCode();
                attempts++;
            }
        }

        if (!isUnique) {
            throw new Error('Konnte keinen eindeutigen Code generieren.');
        }

        // Aktuellen Benutzer abrufen
        const user = await getCurrentUser();

        // Sportart-Info für Anzeige abrufen
        const selectedSport = allSports.find(s => s.id === sportId);

        // Code-Dokument mit sport_id und Cheftrainer-Rolle erstellen
        const expiresAt = getExpirationDate();
        const { error } = await supabase
            .from('invitation_codes')
            .insert({
                code,
                club_id: clubId,
                sport_id: sportId,
                created_by: user.id,
                expires_at: expiresAt,
                max_uses: 1,
                used: false,
                used_by: null,
                used_at: null,
                first_name: '',
                last_name: '',
                subgroup_ids: [],
                role: 'head_coach', // Neue Rolle: Spartenleiter
            });

        if (error) throw error;

        // Code mit Info anzeigen
        inviteLinkInput.value = code;
        inviteLinkContainer.classList.remove('hidden');

        // Erfolgsmeldung anzeigen
        const clubDisplayName = selectedClub ? selectedClub.name : clubName;
        const sportDisplayName = selectedSport ? selectedSport.display_name : 'Unbekannt';

        // Audit-Ereignis protokollieren
        await logAuditEvent(
            'invitation_created',
            null,
            'invitation',
            clubId,
            sportId,
            { code, role: 'head_coach', club_name: clubDisplayName, sport_name: sportDisplayName }
        );

        alert(`Einladungscode erstellt!\n\nVerein: ${clubDisplayName}\nSparte: ${sportDisplayName}\nRolle: Spartenleiter\n\nCode: ${code}`);

        // Formular zurücksetzen
        clearSelectedClub();
        document.getElementById('sportSelect').value = '';
        document.getElementById('new-club-info').classList.add('hidden');
        document.getElementById('existing-sport-warning').classList.add('hidden');

        // Vereinsliste neu laden um Updates zu zeigen
        await loadSportsAndClubs();
        loadClubsAndPlayers();

    } catch (error) {
        console.error('Fehler beim Erstellen des Codes:', error);
        alert('Fehler: Der Einladungscode konnte nicht erstellt werden.\n' + error.message);
    }
}

function copyInviteLink() {
    inviteLinkInput.select();
    document.execCommand('copy');
    alert('Link in die Zwischenablage kopiert!');
}

function openExerciseModal(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints, animationSteps } = dataset;
    modalExerciseTitle.textContent = title;
    modalExerciseImage.src = imageUrl || '';

    // Animation-Container handling
    const animationContainer = document.getElementById('modal-exercise-animation');
    const animationCanvas = document.getElementById('modal-animation-canvas');
    if (animationContainer && animationCanvas) {
        let animationData = null;

        if (animationSteps) {
            try {
                animationData = typeof animationSteps === 'string'
                    ? JSON.parse(animationSteps)
                    : animationSteps;
            } catch (e) {
                console.log('Could not parse animation steps:', e);
            }
        }

        if (animationData && animationData.steps && animationData.steps.length > 0) {
            animationContainer.classList.remove('hidden');

            if (typeof window.TableTennisExerciseBuilder !== 'undefined') {
                if (window.modalExerciseBuilder) {
                    window.modalExerciseBuilder.stopAnimation();
                }

                window.modalExerciseBuilder = new window.TableTennisExerciseBuilder('modal-animation-canvas');

                animationData.steps.forEach(step => {
                    window.modalExerciseBuilder.addStep(
                        step.player,
                        step.strokeType,
                        step.side,
                        step.fromPosition,
                        step.toPosition,
                        step.isShort,
                        step.variants,
                        step.repetitions,
                        step.playerDecides
                    );
                });

                window.modalExerciseBuilder.loopAnimation = true;
                window.modalExerciseBuilder.play();

                const playPauseBtn = document.getElementById('modal-animation-play-pause');
                if (playPauseBtn) {
                    playPauseBtn.onclick = () => {
                        if (window.modalExerciseBuilder.isPlaying) {
                            window.modalExerciseBuilder.pause();
                            playPauseBtn.innerHTML = '<i class="fas fa-play mr-1"></i>Play';
                        } else {
                            window.modalExerciseBuilder.play();
                            playPauseBtn.innerHTML = '<i class="fas fa-pause mr-1"></i>Pause';
                        }
                    };
                    playPauseBtn.innerHTML = '<i class="fas fa-pause mr-1"></i>Pause';
                }
            }
        } else {
            animationContainer.classList.add('hidden');
            if (window.modalExerciseBuilder) {
                window.modalExerciseBuilder.stopAnimation();
            }
        }
    }

    // Beschreibungsinhalt rendern
    let descriptionData;
    try {
        descriptionData = JSON.parse(descriptionContent);
    } catch (e) {
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }

    if (descriptionData.type === 'table') {
        const tableHtml = renderTableForDisplay(descriptionData.tableData);
        const additionalText = descriptionData.additionalText || '';
        modalExerciseDescription.innerHTML =
            tableHtml +
            (additionalText
                ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>`
                : '');
    } else {
        modalExerciseDescription.textContent = descriptionData.text || '';
        modalExerciseDescription.style.whiteSpace = 'pre-wrap';
    }

    // Punkteanzeige mit Meilensteinen verarbeiten
    let tieredPointsData = null;
    try {
        if (tieredPoints) {
            tieredPointsData = JSON.parse(tieredPoints);
        }
    } catch (e) {
        // Invalid JSON, ignore
    }

    const milestonesContainer = document.getElementById('modal-exercise-milestones-admin');
    const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;

    if (hasTieredPoints) {
        modalExercisePoints.textContent = `🎯 Bis zu ${points} P.`;

        if (milestonesContainer) {
            // Support both 'count' and 'completions' for backward compatibility
            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => (a.count || a.completions) - (b.count || b.completions))
                .map((milestone, index) => {
                    const milestoneCount = milestone.count || milestone.completions;
                    const isFirst = index === 0;
                    const displayPoints = isFirst
                        ? milestone.points
                        : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
                    return `<div class="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg mb-2 border border-indigo-100">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">🎯</span>
                            <span class="text-base font-semibold text-gray-800">${milestoneCount}× abgeschlossen</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold text-indigo-600">${displayPoints} P.</div>
                            <div class="text-xs text-gray-500 font-medium">Gesamt: ${milestone.points} P.</div>
                        </div>
                    </div>`;
                })
                .join('');

            milestonesContainer.innerHTML = `
                <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                    <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="text-2xl">📊</span>
                        <span>Meilensteine</span>
                    </h4>
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        modalExercisePoints.textContent = `+${points} P.`;
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            milestonesContainer.classList.add('hidden');
        }
    }

    // Daten für beide Buttons setzen
    modalDeleteExerciseButton.dataset.id = id;
    modalDeleteExerciseButton.dataset.imageUrl = imageUrl;
    modalEditExerciseButton.dataset.id = id;
    modalEditExerciseButton.dataset.title = title;
    modalEditExerciseButton.dataset.descriptionContent = descriptionContent;
    modalEditExerciseButton.dataset.points = points;
    modalEditExerciseButton.dataset.tags = tags;

    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray
            .map(
                tag =>
                    `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`
            )
            .join('');
    } else {
        tagsContainer.innerHTML = '';
    }

    exerciseModal.classList.remove('hidden');
}

function openEditExerciseModal(dataset) {
    const { id, title, descriptionContent, points, tags } = dataset;

    document.getElementById('edit-exercise-id').value = id;
    document.getElementById('edit-exercise-title').value = title;
    document.getElementById('edit-exercise-points').value = points;
    const tagsArray = JSON.parse(tags || '[]');
    document.getElementById('edit-exercise-tags').value = tagsArray.join(', ');

    let descriptionData;
    try {
        descriptionData = JSON.parse(descriptionContent);
    } catch (e) {
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }
    editDescriptionEditor.setContent(descriptionData);

    exerciseModal.classList.add('hidden');
    editExerciseModal.classList.remove('hidden');
}

async function handleUpdateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('edit-exercise-feedback');
    const exerciseId = document.getElementById('edit-exercise-id').value;

    const descriptionContent = editDescriptionEditor.getContent();

    const updatedData = {
        title: document.getElementById('edit-exercise-title').value,
        description_content: JSON.stringify(descriptionContent),
        points: parseInt(document.getElementById('edit-exercise-points').value),
        tags: document
            .getElementById('edit-exercise-tags')
            .value.split(',')
            .map(tag => tag.trim())
            .filter(tag => tag),
    };

    if (!updatedData.title || isNaN(updatedData.points)) {
        feedbackEl.textContent = 'Titel und Punkte sind Pflichtfelder.';
        feedbackEl.className = 'mt-2 text-sm text-center text-red-600';
        return;
    }

    try {
        const { error } = await supabase
            .from('exercises')
            .update(updatedData)
            .eq('id', exerciseId);

        if (error) throw error;

        feedbackEl.textContent = 'Erfolgreich gespeichert!';
        feedbackEl.className = 'mt-2 text-sm text-center text-green-600';

        setTimeout(() => {
            editExerciseModal.classList.add('hidden');
            feedbackEl.textContent = '';
        }, 1500);
    } catch (error) {
        console.error('Fehler beim Speichern der Übung:', error);
        feedbackEl.textContent = 'Ein Fehler ist aufgetreten.';
        feedbackEl.className = 'mt-2 text-sm text-center text-red-600';
    }
}

async function loadStatistics() {
    try {
        // Vereine laden um Test-Vereine zu identifizieren
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        const testClubIds = new Set(
            (clubs || []).filter(c => c.is_test_club === true).map(c => c.id)
        );

        // Benutzer laden (Test-Vereine ausgeschlossen, gefiltert nach Sportart)
        let usersQuery = supabase.from('profiles').select('*');

        // Sport-Filter direkt auf Profile anwenden (Single-Sport-Modell)
        if (currentSportFilter !== 'all') {
            usersQuery = usersQuery.eq('active_sport_id', currentSportFilter);
        }

        const { data: allUsers } = await usersQuery;

        let users = (allUsers || []).filter(u => !u.club_id || !testClubIds.has(u.club_id));

        // Anwesenheiten laden (Test-Vereine ausgeschlossen)
        const { data: allAttendance } = await supabase
            .from('attendance')
            .select('*');

        const attendances = (allAttendance || []).filter(a => !a.club_id || !testClubIds.has(a.club_id));

        // Nicht-Test-Vereine zählen
        const realClubIds = new Set(
            users.map(u => u.club_id).filter(id => id && !testClubIds.has(id))
        );

        document.getElementById('stats-total-users').textContent = users.length;
        document.getElementById('stats-total-clubs').textContent = realClubIds.size;
        document.getElementById('stats-total-points').textContent = users.reduce(
            (sum, u) => sum + (u.points || 0),
            0
        );
        document.getElementById('stats-total-attendance').textContent = attendances.reduce(
            (sum, a) => sum + (a.present_player_ids?.length || 0),
            0
        );

        const genderCounts = users.reduce((acc, user) => {
            const gender = user.gender || 'unknown';
            acc[gender] = (acc[gender] || 0) + 1;
            return acc;
        }, {});

        const attendanceByMonth = attendances.reduce((acc, record) => {
            if (record.date) {
                const month = new Date(record.date).toLocaleString('de-DE', {
                    month: 'short',
                    year: '2-digit',
                });
                acc[month] = (acc[month] || 0) + (record.present_player_ids?.length || 0);
            }
            return acc;
        }, {});

        const sortedMonths = Object.keys(attendanceByMonth).sort((a, b) => {
            const [m1, y1] = a.split(' ');
            const [m2, y2] = b.split(' ');
            return new Date(`01 ${m1} 20${y1}`) - new Date(`01 ${m2} 20${y2}`);
        });

        renderGenderChart(genderCounts);
        renderAttendanceChart(sortedMonths, attendanceByMonth);

        // Globale Wettkampf-Statistiken laden
        await loadGlobalCompetitionStatistics(testClubIds);
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
        document.getElementById('statistics-section').innerHTML =
            '<p class="text-red-500">Statistiken konnten nicht geladen werden.</p>';
    }
}

function renderGenderChart(data) {
    const ctx = document.getElementById('gender-chart').getContext('2d');
    if (genderChartInstance) genderChartInstance.destroy();
    genderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Männlich', 'Weiblich', 'Divers', 'Unbekannt'],
            datasets: [
                {
                    data: [data.male || 0, data.female || 0, data.diverse || 0, data.unknown || 0],
                    backgroundColor: ['#3b82f6', '#ec4899', '#8b5cf6', '#a1a1aa'],
                },
            ],
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });
}

function renderAttendanceChart(labels, data) {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    const chartData = labels.map(label => data[label]);
    if (attendanceChartInstance) attendanceChartInstance.destroy();
    attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Anwesenheiten',
                    data: chartData,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            plugins: { legend: { display: false } },
        },
    });
}

async function loadGlobalCompetitionStatistics(testClubIds = new Set()) {
    try {
        // Abfrage für Einzel-Matches erstellen
        let singlesQuery = supabase
            .from('matches')
            .select('created_at, club_id, sport_id');

        // Nach Sportart filtern falls ausgewählt
        if (currentSportFilter !== 'all') {
            singlesQuery = singlesQuery.eq('sport_id', currentSportFilter);
        }

        const { data: singlesMatches } = await singlesQuery;

        // Abfrage für Doppel-Matches erstellen
        let doublesQuery = supabase
            .from('doubles_matches')
            .select('created_at, club_id, sport_id');

        if (currentSportFilter !== 'all') {
            doublesQuery = doublesQuery.eq('sport_id', currentSportFilter);
        }

        const { data: doublesMatches } = await doublesQuery;

        // Alle Matches verarbeiten (Test-Vereine ausgeschlossen)
        competitionMatchData = [];

        (singlesMatches || []).forEach(match => {
            if (match.club_id && testClubIds.has(match.club_id)) return;
            competitionMatchData.push({
                date: match.created_at ? new Date(match.created_at) : new Date(),
                type: 'singles',
            });
        });

        (doublesMatches || []).forEach(match => {
            if (match.club_id && testClubIds.has(match.club_id)) return;
            competitionMatchData.push({
                date: match.created_at ? new Date(match.created_at) : new Date(),
                type: 'doubles',
            });
        });

        renderCompetitionStatistics();
        setupCompetitionFilterListeners();
    } catch (error) {
        console.error('Error loading global competition statistics:', error);
    }
}

function setupCompetitionFilterListeners() {
    const periodWeek = document.getElementById('admin-competition-period-week');
    const periodMonth = document.getElementById('admin-competition-period-month');
    const periodYear = document.getElementById('admin-competition-period-year');

    if (periodWeek) {
        periodWeek.addEventListener('click', () => {
            competitionPeriod = 'week';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodMonth) {
        periodMonth.addEventListener('click', () => {
            competitionPeriod = 'month';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodYear) {
        periodYear.addEventListener('click', () => {
            competitionPeriod = 'year';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }

    const filterAll = document.getElementById('admin-competition-filter-all');
    const filterSingles = document.getElementById('admin-competition-filter-singles');
    const filterDoubles = document.getElementById('admin-competition-filter-doubles');

    if (filterAll) {
        filterAll.addEventListener('click', () => {
            competitionTypeFilter = 'all';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterSingles) {
        filterSingles.addEventListener('click', () => {
            competitionTypeFilter = 'singles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterDoubles) {
        filterDoubles.addEventListener('click', () => {
            competitionTypeFilter = 'doubles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
}

function updatePeriodButtonStyles() {
    const buttons = {
        week: document.getElementById('admin-competition-period-week'),
        month: document.getElementById('admin-competition-period-month'),
        year: document.getElementById('admin-competition-period-year'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionPeriod) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

function updateTypeButtonStyles() {
    const buttons = {
        all: document.getElementById('admin-competition-filter-all'),
        singles: document.getElementById('admin-competition-filter-singles'),
        doubles: document.getElementById('admin-competition-filter-doubles'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionTypeFilter) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-indigo-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

function renderCompetitionStatistics() {
    let filteredMatches = competitionMatchData;
    if (competitionTypeFilter === 'singles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'singles');
    } else if (competitionTypeFilter === 'doubles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'doubles');
    }

    const now = new Date();
    const periodData = {};
    let periodCount, periodLabel;

    if (competitionPeriod === 'week') {
        periodCount = 12;
        periodLabel = 'Wochen';
        for (let i = periodCount - 1; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - (i * 7));
            const weekKey = `KW ${getWeekNumber(weekStart)}`;
            periodData[weekKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const weeksSince = Math.floor((now - matchDate) / (7 * 24 * 60 * 60 * 1000));
                if (weeksSince >= 0 && weeksSince < periodCount) {
                    const weekKey = `KW ${getWeekNumber(matchDate)}`;
                    if (periodData[weekKey] !== undefined) {
                        periodData[weekKey]++;
                    }
                }
            }
        });
    } else if (competitionPeriod === 'month') {
        periodCount = 12;
        periodLabel = 'Monate';
        for (let i = periodCount - 1; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = monthDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
            periodData[monthKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const monthKey = matchDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
                if (periodData[monthKey] !== undefined) {
                    periodData[monthKey]++;
                }
            }
        });
    } else {
        periodCount = 3;
        periodLabel = 'Jahre';
        for (let i = periodCount - 1; i >= 0; i--) {
            const year = now.getFullYear() - i;
            periodData[year.toString()] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const yearKey = matchDate.getFullYear().toString();
                if (periodData[yearKey] !== undefined) {
                    periodData[yearKey]++;
                }
            }
        });
    }

    const values = Object.values(periodData);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? (total / values.length).toFixed(1) : 0;

    let maxPeriod = '-';
    let maxCount = 0;
    Object.entries(periodData).forEach(([period, count]) => {
        if (count > maxCount) {
            maxCount = count;
            maxPeriod = period;
        }
    });

    const periodsArray = Object.values(periodData);
    let trend = '-';
    if (periodsArray.length >= 2) {
        const current = periodsArray[periodsArray.length - 1];
        const previous = periodsArray[periodsArray.length - 2];
        if (previous > 0) {
            const change = ((current - previous) / previous * 100).toFixed(0);
            trend = change >= 0 ? `+${change}%` : `${change}%`;
        } else if (current > 0) {
            trend = '+∞';
        }
    }

    const totalLabel = document.getElementById('admin-stats-competition-total-label');
    const totalEl = document.getElementById('admin-stats-competition-total');
    const avgLabel = document.getElementById('admin-stats-competition-avg-label');
    const avgEl = document.getElementById('admin-stats-competition-avg');
    const activePeriodLabel = document.getElementById('admin-stats-competition-active-period-label');
    const activePeriodEl = document.getElementById('admin-stats-competition-active-period');
    const trendEl = document.getElementById('admin-stats-competition-trend');

    if (totalLabel) totalLabel.textContent = `Gesamt (${periodCount} ${periodLabel})`;
    if (totalEl) totalEl.textContent = total;
    if (avgLabel) avgLabel.textContent = `Ø pro ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (avgEl) avgEl.textContent = avg;
    if (activePeriodLabel) activePeriodLabel.textContent = `Aktivster ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (activePeriodEl) activePeriodEl.textContent = maxCount > 0 ? `${maxPeriod} (${maxCount})` : '-';
    if (trendEl) trendEl.textContent = trend;

    renderCompetitionChart(Object.keys(periodData), Object.values(periodData));
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function calculateSmartStepSize(maxValue) {
    if (maxValue <= 10) return 1;
    if (maxValue <= 25) return 5;
    if (maxValue <= 50) return 10;
    if (maxValue <= 100) return 20;
    if (maxValue <= 250) return 50;
    if (maxValue <= 500) return 100;
    if (maxValue <= 1000) return 200;
    return Math.ceil(maxValue / 10 / 50) * 50;
}

function renderCompetitionChart(labels, data) {
    const canvas = document.getElementById('admin-competition-activity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (competitionChartInstance) competitionChartInstance.destroy();

    const maxValue = Math.max(...data, 0);
    const stepSize = calculateSmartStepSize(maxValue);

    competitionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Wettkämpfe',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: stepSize,
                        callback: function(value) {
                            if (Math.floor(value) === value) {
                                return value;
                            }
                        }
                    },
                },
            },
            plugins: {
                legend: { display: false },
            },
        },
    });
}

async function loadClubsAndPlayers() {
    try {
        // Vereine mit ihren Sportarten laden
        const { data: clubs, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name, is_test_club')
            .order('name');

        if (clubsError) throw clubsError;

        console.log(`[ADMIN] Loaded ${clubs?.length || 0} clubs from database`);

        // club_sports-Beziehungen laden
        const { data: clubSportsData, error: clubSportsError } = await supabase
            .from('club_sports')
            .select('club_id, sport_id, sports(id, name, display_name)')
            .eq('is_active', true);

        if (clubSportsError) throw clubSportsError;

        console.log(`[ADMIN] Loaded ${clubSportsData?.length || 0} club_sports relationships`);

        // Alle Benutzer laden (Rolle ist direkt in profiles)
        const { data: users, error: usersError } = await supabase
            .from('profiles')
            .select('*');

        if (usersError) throw usersError;

        // Datenstrukturen erstellen
        const clubsMap = new Map();
        (clubs || []).forEach(club => clubsMap.set(club.id, club));

        const clubSportsMap = new Map();
        (clubSportsData || []).forEach(cs => {
            if (!clubSportsMap.has(cs.club_id)) {
                clubSportsMap.set(cs.club_id, []);
            }
            clubSportsMap.get(cs.club_id).push(cs.sports);
        });

        // Single-Sport-Modell: Profile-Sports-Map aus active_sport_id und role erstellen
        const profileSportsMap = new Map();
        (users || []).forEach(u => {
            if (u.club_id && u.active_sport_id) {
                const key = `${u.id}_${u.club_id}`;
                profileSportsMap.set(key, [{
                    sport_id: u.active_sport_id,
                    role: u.role
                }]);
            }
        });

        renderClubsWithSports(users || [], clubsMap, clubSportsMap, profileSportsMap, currentSportFilter);

        // Echtzeit-Subscription für profiles und club_sports einrichten
        if (usersSubscription) {
            supabase.removeChannel(usersSubscription);
        }

        usersSubscription = supabase
            .channel('club_overview_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
                console.log('[ADMIN] Profile change detected, reloading club overview');
                loadClubsAndPlayers();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_sports' }, async () => {
                console.log('[ADMIN] Club sports change detected, reloading club overview');
                loadClubsAndPlayers();
            })
            .subscribe();

    } catch (error) {
        console.error('Fehler beim Laden der Vereinsübersicht:', error);
        clubsListEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Vereine.</p>';
    }
}

function renderClubsWithSports(users, clubsMap, clubSportsMap, profileSportsMap, sportFilter = 'all') {
    // Benutzer nach Verein gruppieren
    const usersByClub = users.reduce((acc, user) => {
        if (user.club_id) {
            if (!acc[user.club_id]) {
                acc[user.club_id] = [];
            }
            acc[user.club_id].push(user);
        }
        return acc;
    }, {});

    clubsListEl.innerHTML = '';

    if (clubsMap.size === 0) {
        clubsListEl.innerHTML = '<p class="text-gray-500">Keine Vereine gefunden.</p>';
        return;
    }

    console.log(`[ADMIN] Rendering ${clubsMap.size} clubs, sport filter: ${sportFilter}`);
    let renderedCount = 0;

    // Jeden Verein mit seinen Sportarten rendern
    for (const [clubId, clubData] of clubsMap) {
        const clubUsers = usersByClub[clubId] || [];
        const clubSports = clubSportsMap.get(clubId) || [];
        const isTestClub = clubData.is_test_club === true;

        // Vereine nach Sportart filtern falls ausgewählt
        if (sportFilter !== 'all') {
            const hasSport = clubSports.some(sport => sport.id === sportFilter);
            if (!hasSport) continue; // Vereine überspringen die ausgewählte Sportart nicht anbieten
        }

        // Alle Vereine anzeigen - nicht überspringen außer nach Sportart gefiltert
        // (Removed the condition that skipped clubs without sports and users)

        const clubDiv = document.createElement('div');
        clubDiv.className = 'bg-gray-50 rounded-lg overflow-hidden border border-gray-200';

        // Mitgliederzahl basierend auf Sport-Filter berechnen
        let memberCountText = '';
        if (sportFilter !== 'all') {
            // Benutzer zählen die gefilterte Sportart haben
            const filteredUserCount = clubUsers.filter(user => {
                const profileKey = `${user.id}_${clubId}`;
                const sportRoles = profileSportsMap.get(profileKey) || [];
                const hasSport = sportRoles.some(sr => sr.sport_id === sportFilter);
                if (profileSportsMap.size === 0) return true; // Legacy mode
                return hasSport;
            }).length;
            memberCountText = `${filteredUserCount} Mitglieder in dieser Sportart`;
        } else {
            memberCountText = `${clubUsers.length} Mitglieder gesamt`;
        }

        // Club header
        const headerHtml = `
            <div class="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="font-bold text-lg text-gray-900">${clubData.name}</h3>
                        <p class="text-sm text-gray-600">${memberCountText}</p>
                        ${isTestClub ? '<span class="inline-block mt-1 text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">Test-Club</span>' : ''}
                    </div>
                    <button data-club-id="${clubId}" data-club-name="${clubData.name}" class="toggle-club-btn text-indigo-600 hover:text-indigo-800">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
            </div>
        `;

        // Sportarten-Sektionen (standardmäßig eingeklappt)
        let sportsHtml = `<div class="club-sports-container hidden p-4 space-y-3" data-club-id="${clubId}">`;

        if (clubSports.length > 0) {
            // Sportarten nach ausgewähltem Filter filtern
            const filteredSports = sportFilter !== 'all'
                ? clubSports.filter(sport => sport.id === sportFilter)
                : clubSports;

            for (const sport of filteredSports) {
                // Benutzer für diese Sportart über active_sport_id filtern
                const sportUsers = clubUsers.filter(user => {
                    const profileKey = `${user.id}_${clubId}`;
                    const sportRoles = profileSportsMap.get(profileKey) || [];
                    // Prüfen ob Benutzer diese Sportart aktiv hat
                    const hasSport = sportRoles.some(sr => sr.sport_id === sport.id);
                    // Wenn keine Sport-Daten, alle Benutzer anzeigen
                    if (profileSportsMap.size === 0) return true;
                    return hasSport;
                });

                sportsHtml += `
                    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div class="px-4 py-3 bg-gray-100 flex justify-between items-center cursor-pointer toggle-sport-btn" data-club-id="${clubId}" data-sport-id="${sport.id}">
                            <div class="flex items-center gap-2">
                                <span class="text-xl">${getSportIcon(sport.name)}</span>
                                <span class="font-medium text-gray-800">${sport.display_name}</span>
                                <span class="text-sm text-gray-500">(${sportUsers.length} Mitglieder)</span>
                            </div>
                            <i class="fas fa-chevron-right text-gray-400 sport-chevron"></i>
                        </div>
                        <div class="sport-members-container hidden p-3 space-y-2 max-h-64 overflow-y-auto" data-sport-id="${sport.id}">
                            ${renderSportMembers(sportUsers, profileSportsMap, clubId, sport.id)}
                        </div>
                    </div>
                `;
            }
        } else {
            // Noch keine Sportarten definiert
            if (clubUsers.length > 0) {
                // Alle Benutzer im Legacy-Modus anzeigen
                sportsHtml += `
                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p class="text-sm text-amber-800">
                            <i class="fas fa-info-circle mr-1"></i>
                            Keine Sparten definiert. Alle Mitglieder:
                        </p>
                    </div>
                    <div class="bg-white rounded-lg border border-gray-200 p-3 space-y-2 max-h-64 overflow-y-auto">
                        ${renderLegacyMembers(clubUsers)}
                    </div>
                `;
            } else {
                // Keine Sportarten und keine Benutzer
                sportsHtml += `
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p class="text-sm text-gray-500 text-center">
                            <i class="fas fa-info-circle mr-1"></i>
                            Keine Sparten und keine Mitglieder definiert
                        </p>
                    </div>
                `;
            }
        }

        sportsHtml += '</div>';

        clubDiv.innerHTML = headerHtml + sportsHtml;
        clubsListEl.appendChild(clubDiv);
        renderedCount++;
    }

    console.log(`[ADMIN] Rendered ${renderedCount} clubs (filtered from ${clubsMap.size} total)`);

    // Event-Listener für Toggle-Buttons hinzufügen
    document.querySelectorAll('.toggle-club-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const clubId = btn.dataset.clubId;
            const container = document.querySelector(`.club-sports-container[data-club-id="${clubId}"]`);
            const icon = btn.querySelector('i');

            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                container.classList.add('hidden');
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
    });

    document.querySelectorAll('.toggle-sport-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sportId = btn.dataset.sportId;
            const container = btn.parentElement.querySelector('.sport-members-container');
            const icon = btn.querySelector('.sport-chevron');

            if (container.classList.contains('hidden')) {
                container.classList.remove('hidden');
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-down');
            } else {
                container.classList.add('hidden');
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-right');
            }
        });
    });

    // Event-Listener für Löschen-Buttons hinzufügen
    document.querySelectorAll('.delete-member-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeletePlayer(btn.dataset.id);
        });
    });
}

function renderSportMembers(users, profileSportsMap, clubId, sportId) {
    if (users.length === 0) {
        return '<p class="text-sm text-gray-500 text-center py-2">Keine Mitglieder</p>';
    }

    return users
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''))
        .map(user => {
            const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
            const avatarSrc = user.avatar_url || `https://placehold.co/32x32/e2e8f0/64748b?text=${initials}`;

            // Rolle für diese Sportart aus profileSportsMap abrufen
            const profileKey = `${user.id}_${clubId}`;
            const sportRoles = profileSportsMap.get(profileKey) || [];
            const sportRole = sportRoles.find(sr => sr.sport_id === sportId);
            const role = sportRole?.role || user.role || 'player';

            const roleDisplay = getRoleDisplay(role);

            return `
                <div class="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded">
                    <div class="flex items-center gap-3">
                        <img src="${avatarSrc}" alt="" class="h-8 w-8 rounded-full object-cover">
                        <div>
                            <p class="font-medium text-sm text-gray-900">${user.first_name || ''} ${user.last_name || ''}</p>
                            <div class="flex items-center gap-2">
                                <span class="${roleDisplay.class} text-xs px-1.5 py-0.5 rounded">${roleDisplay.label}</span>
                                <span class="text-xs text-gray-400">${user.email || ''}</span>
                            </div>
                        </div>
                    </div>
                    <button data-id="${user.id}" class="delete-member-btn text-red-400 hover:text-red-600 p-1">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            `;
        })
        .join('');
}

function renderLegacyMembers(users) {
    if (users.length === 0) {
        return '<p class="text-sm text-gray-500 text-center py-2">Keine Mitglieder</p>';
    }

    return users
        .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''))
        .map(user => {
            const initials = (user.first_name?.[0] || '') + (user.last_name?.[0] || '');
            const avatarSrc = user.avatar_url || `https://placehold.co/32x32/e2e8f0/64748b?text=${initials}`;
            const roleDisplay = getRoleDisplay(user.role);

            return `
                <div class="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded">
                    <div class="flex items-center gap-3">
                        <img src="${avatarSrc}" alt="" class="h-8 w-8 rounded-full object-cover">
                        <div>
                            <p class="font-medium text-sm text-gray-900">${user.first_name || ''} ${user.last_name || ''}</p>
                            <div class="flex items-center gap-2">
                                <span class="${roleDisplay.class} text-xs px-1.5 py-0.5 rounded">${roleDisplay.label}</span>
                                <span class="text-xs text-gray-400">${user.email || ''}</span>
                            </div>
                        </div>
                    </div>
                    <button data-id="${user.id}" class="delete-member-btn text-red-400 hover:text-red-600 p-1">
                        <i class="fas fa-trash-alt text-xs"></i>
                    </button>
                </div>
            `;
        })
        .join('');
}

function getRoleDisplay(role) {
    const roles = {
        'admin': { label: 'Admin', class: 'bg-red-100 text-red-800' },
        'head_coach': { label: 'Spartenleiter', class: 'bg-purple-100 text-purple-800' },
        'coach': { label: 'Coach', class: 'bg-blue-100 text-blue-800' },
        'player': { label: 'Spieler', class: 'bg-green-100 text-green-800' }
    };
    return roles[role] || { label: role || 'Unbekannt', class: 'bg-gray-100 text-gray-800' };
}

async function handleDeletePlayer(playerId) {
    if (confirm('Sind Sie sicher, dass Sie diesen Benutzer endgültig löschen möchten?')) {
        try {
            // Benutzerdetails vor Löschung für Audit-Log abrufen
            const { data: userData } = await supabase
                .from('profiles')
                .select('first_name, last_name, email, club_id')
                .eq('id', playerId)
                .single();

            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', playerId);

            if (error) throw error;

            // Audit-Ereignis protokollieren
            await logAuditEvent(
                'user_removed',
                playerId,
                'user',
                userData?.club_id,
                null,
                { name: `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim(), email: userData?.email }
            );

            alert('Benutzer erfolgreich gelöscht.');
        } catch (error) {
            console.error('Fehler beim Löschen des Benutzers:', error);
            alert('Fehler: Der Benutzer konnte nicht gelöscht werden.');
        }
    }
}

async function handleCreateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title').value;
    const descriptionContent = descriptionEditor.getContent();
    const file = document.getElementById('exercise-image').files[0];
    const tagsInput = document.getElementById('exercise-tags').value;
    let tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

    // Händigkeits-Tags hinzufügen wenn Animation aktiv
    const animationToggleForTags = document.getElementById('exercise-animation-toggle');
    if (animationToggleForTags?.checked) {
        const handednessTags = getSelectedHandednessTags();
        // Händigkeits-Tags hinzufügen (ohne Duplikate)
        handednessTags.forEach(ht => {
            if (!tags.includes(ht)) {
                tags.push(ht);
            }
        });
    }

    const tieredPoints = isExerciseTieredPointsEnabled();
    const milestones = tieredPoints ? getExerciseMilestones() : [];

    let points = 0;
    if (tieredPoints) {
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufügen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Übung speichern';
            return;
        }
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('exercise-points').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gültige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Übung speichern';
            return;
        }
    }

    feedbackEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    if (!title) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        return;
    }

    try {
        let imageUrl = null;

        // Bild in Supabase Storage hochladen falls angegeben
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `exercises/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('exercises')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('exercises')
                .getPublicUrl(filePath);

            imageUrl = urlData.publicUrl;
        }

        // Admin-spezifische Auswahlen abrufen
        const exerciseClub = document.getElementById('exercise-club')?.value || null;
        const exerciseSport = document.getElementById('exercise-sport')?.value || null;

        const exerciseData = {
            name: title,
            title,
            description_content: JSON.stringify(descriptionContent),
            points,
            tags,
            image_url: imageUrl,
            tiered_points: tieredPoints ? {
                enabled: true,
                milestones: milestones,
            } : {
                enabled: false,
                milestones: [],
            },
            // Admin kann spezifischen Verein oder null für global setzen
            club_id: exerciseClub || null,
            // Admin kann spezifische Sportart oder null für alle setzen
            sport_id: exerciseSport || null,
        };

        // Animation-Steps hinzufügen falls vorhanden
        const animationToggle = document.getElementById('exercise-animation-toggle');
        const animationStepsInput = document.getElementById('exercise-animation-steps');
        if (animationToggle?.checked && animationStepsInput?.value) {
            try {
                const animationData = JSON.parse(animationStepsInput.value);
                if (animationData && animationData.steps && animationData.steps.length > 0) {
                    // Händigkeits-Optionen hinzufügen
                    const handednessTags = getSelectedHandednessTags();
                    const autoMirror = document.getElementById('handedness-auto-mirror')?.checked || false;

                    animationData.handedness = handednessTags;
                    animationData.autoMirrorLL = autoMirror;

                    exerciseData.animation_steps = animationData;
                }
            } catch (e) {
                console.warn('Fehler beim Parsen der Animation-Steps:', e);
            }
        }

        const { data: insertedExercise, error } = await supabase
            .from('exercises')
            .insert(exerciseData)
            .select()
            .single();

        if (error) throw error;

        // Audit-Ereignis protokollieren
        await logAuditEvent(
            'exercise_created',
            insertedExercise?.id,
            'exercise',
            null,
            currentSportFilter !== 'all' ? currentSportFilter : null,
            { title, points }
        );

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        createExerciseForm.reset();

        // Formularfelder zurücksetzen
        document.getElementById('exercise-points').value = '';
        document.getElementById('exercise-milestones-list').innerHTML = '';
        document.getElementById('exercise-tiered-points-toggle').checked = false;
        document.getElementById('exercise-points-container-admin').classList.remove('hidden');
        document.getElementById('exercise-milestones-container').classList.add('hidden');

        const partnerToggle = document.getElementById('exercise-partner-system-toggle');
        const partnerContainer = document.getElementById('exercise-partner-container');
        const partnerPercentageInput = document.getElementById('exercise-partner-percentage');
        if (partnerToggle) partnerToggle.checked = false;
        if (partnerContainer) partnerContainer.classList.add('hidden');
        if (partnerPercentageInput) partnerPercentageInput.value = 50;

        // Animation-Felder zurücksetzen
        const animationContainerReset = document.getElementById('exercise-animation-container');
        const animationPreview = document.getElementById('exercise-animation-steps-preview');
        if (animationToggle) animationToggle.checked = false;
        if (animationContainerReset) animationContainerReset.classList.add('hidden');
        if (animationStepsInput) animationStepsInput.value = '';
        if (animationPreview) animationPreview.innerHTML = '<span class="italic">Keine Animation-Schritte vorhanden</span>';

        // Händigkeits-Felder zurücksetzen
        const handednessContainer = document.getElementById('exercise-handedness-container');
        const autoDescContainer = document.getElementById('exercise-auto-description-container');
        if (handednessContainer) handednessContainer.classList.add('hidden');
        if (autoDescContainer) autoDescContainer.classList.add('hidden');
        document.getElementById('handedness-rr').checked = true;
        document.getElementById('handedness-ll').checked = false;
        document.getElementById('handedness-rl').checked = false;
        document.getElementById('handedness-lr').checked = false;
        const autoMirror = document.getElementById('handedness-auto-mirror');
        if (autoMirror) autoMirror.checked = false;

        descriptionEditor.clear();
    } catch (error) {
        console.error('Fehler beim Erstellen der Übung:', error);
        feedbackEl.textContent = 'Fehler: Übung konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        setTimeout(() => {
            feedbackEl.textContent = '';
        }, 4000);
    }
}

async function loadAllExercises() {
    try {
        // Abfrage mit optionalem Sport-Filter erstellen
        let query = supabase
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        // Nach Sportart filtern falls ausgewählt
        if (currentSportFilter !== 'all') {
            query = query.eq('sport_id', currentSportFilter);
        }

        const { data: exercises, error } = await query;

        if (error) throw error;

        renderExercises(exercises || []);

        // Echtzeit-Subscription einrichten
        if (exercisesSubscription) {
            supabase.removeChannel(exercisesSubscription);
        }

        exercisesSubscription = supabase
            .channel('exercises_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises' }, async () => {
                // Mit aktuellem Filter neu laden
                let reloadQuery = supabase
                    .from('exercises')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (currentSportFilter !== 'all') {
                    reloadQuery = reloadQuery.eq('sport_id', currentSportFilter);
                }

                const { data: updatedExercises } = await reloadQuery;
                renderExercises(updatedExercises || []);
            })
            .subscribe();

    } catch (error) {
        console.error('Fehler beim Laden des Übungskatalogs:', error);
        exercisesListAdminEl.innerHTML =
            '<p class="text-red-500 col-span-full">Fehler beim Laden der Übungen.</p>';
    }
}

function renderExercises(exercises) {
    exercisesListAdminEl.innerHTML = exercises.length === 0
        ? '<p class="text-gray-500 col-span-full">Keine Übungen gefunden.</p>'
        : '';

    exercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className =
            'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
        card.dataset.id = exercise.id;
        card.dataset.title = exercise.title;

        // Sowohl altes als auch neues Format unterstützen
        if (exercise.description_content) {
            card.dataset.descriptionContent = exercise.description_content;
        } else {
            card.dataset.descriptionContent = JSON.stringify({
                type: 'text',
                text: exercise.description || '',
            });
        }

        if (exercise.image_url) {
            card.dataset.imageUrl = exercise.image_url;
        }
        card.dataset.points = exercise.points;
        card.dataset.tags = JSON.stringify(exercise.tags || []);

        if (exercise.tiered_points) {
            card.dataset.tieredPoints = JSON.stringify(exercise.tiered_points);
        }

        if (exercise.animation_steps) {
            card.dataset.animationSteps = typeof exercise.animation_steps === 'string'
                ? exercise.animation_steps
                : JSON.stringify(exercise.animation_steps);
        }

        const tagsHtml = (exercise.tags || [])
            .map(
                tag =>
                    `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
            )
            .join('');

        // Meilensteine für die Karte vorbereiten
        let milestonesHtml = '';
        let pointsHtml = `<span class="text-sm font-semibold text-indigo-600">+${exercise.points} P.</span>`;

        if (exercise.tiered_points?.enabled && exercise.tiered_points?.milestones?.length > 0) {
            const sortedMilestones = [...exercise.tiered_points.milestones].sort((a, b) => a.count - b.count);
            milestonesHtml = `
                <div class="mt-2 space-y-1">
                    ${sortedMilestones.map((m, idx) => {
                        const prevPoints = idx === 0 ? 0 : sortedMilestones[idx - 1].points;
                        const diff = m.points - prevPoints;
                        return `<div class="text-xs text-gray-600">${m.count}x = ${m.points} P. (+${diff})</div>`;
                    }).join('')}
                </div>`;
            pointsHtml = `<span class="text-sm font-semibold text-indigo-600">bis ${exercise.points} P.</span>`;
        }

        const imageHtml = exercise.image_url
            ? `<img src="${exercise.image_url}" alt="${exercise.title}" class="w-full h-56 object-cover pointer-events-none">`
            : `<div class="w-full h-56 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200 pointer-events-none">
               <div class="text-center">
                   <svg class="w-16 h-16 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                   <p class="text-xs text-gray-400">Kein Bild</p>
               </div>
           </div>`;

        card.innerHTML = `${imageHtml}
                      <div class="p-4 flex flex-col flex-grow pointer-events-none">
                          <h3 class="font-bold text-lg mb-2 text-gray-900">${exercise.title}</h3>
                          <div class="flex items-center justify-between mb-2">
                              ${pointsHtml}
                          </div>
                          ${milestonesHtml}
                          <div class="pt-2 mt-auto">${tagsHtml}</div>
                      </div>`;
        exercisesListAdminEl.appendChild(card);
    });
}

async function handleDeleteExercise(exerciseId, imageUrl) {
    if (confirm('Sind Sie sicher, dass Sie diese Übung endgültig löschen möchten?')) {
        try {
            // Übungsdetails vor Löschung für Audit-Log abrufen
            const { data: exerciseData } = await supabase
                .from('exercises')
                .select('title, sport_id')
                .eq('id', exerciseId)
                .single();

            const { error } = await supabase
                .from('exercises')
                .delete()
                .eq('id', exerciseId);

            if (error) throw error;

            // Audit-Ereignis protokollieren
            await logAuditEvent(
                'exercise_deleted',
                exerciseId,
                'exercise',
                null,
                exerciseData?.sport_id,
                { title: exerciseData?.title }
            );

            // Bild aus Storage löschen falls vorhanden
            if (imageUrl && imageUrl !== 'undefined' && imageUrl.trim() !== '') {
                try {
                    // Dateipfad aus URL extrahieren
                    const url = new URL(imageUrl);
                    const pathParts = url.pathname.split('/');
                    const filePath = pathParts.slice(pathParts.indexOf('exercises')).join('/');

                    await supabase.storage
                        .from('exercises')
                        .remove([filePath]);
                } catch (storageError) {
                    console.warn('Image could not be deleted, but exercise was removed:', storageError);
                }
            }

            alert('Übung erfolgreich gelöscht.');
            exerciseModal.classList.add('hidden');
        } catch (error) {
            console.error('Fehler beim Löschen der Übung:', error);
            alert('Fehler: Die Übung konnte nicht vollständig gelöscht werden.');
        }
    }
}

// ============================================
// AUDIT LOGGING
// ============================================

let auditCurrentPage = 0;
const AUDIT_PAGE_SIZE = 20;

async function logAuditEvent(action, targetId = null, targetType = null, clubId = null, sportId = null, details = null) {
    try {
        const user = await getCurrentUser();
        if (!user) return;

        const { error } = await supabase.rpc('log_audit_event', {
            p_action: action,
            p_actor_id: user.id,
            p_target_id: targetId,
            p_target_type: targetType,
            p_club_id: clubId,
            p_sport_id: sportId,
            p_details: details
        });

        if (error) {
            console.error('Fehler beim Loggen des Audit-Events:', error);
        }
    } catch (error) {
        console.error('Audit-Log Fehler:', error);
    }
}

async function loadAuditLogs() {
    const container = document.getElementById('audit-logs-container');
    const pagination = document.getElementById('audit-pagination');
    if (!container) return;

    try {
        // Filterwerte abrufen
        const actionFilter = document.getElementById('audit-filter-action')?.value || null;
        const clubFilter = document.getElementById('audit-filter-club')?.value || null;
        const sportFilter = document.getElementById('audit-filter-sport')?.value || null;

        // get_audit_logs RPC-Funktion aufrufen
        const { data: logs, error } = await supabase.rpc('get_audit_logs', {
            p_limit: AUDIT_PAGE_SIZE,
            p_offset: auditCurrentPage * AUDIT_PAGE_SIZE,
            p_action_filter: actionFilter,
            p_club_filter: clubFilter,
            p_sport_filter: sportFilter,
            p_date_from: null,
            p_date_to: null
        });

        if (error) throw error;

        // Gesamtanzahl für Paginierung abrufen
        const { data: countResult, error: countError } = await supabase.rpc('count_audit_logs', {
            p_action_filter: actionFilter,
            p_club_filter: clubFilter,
            p_sport_filter: sportFilter,
            p_date_from: null,
            p_date_to: null
        });

        if (countError) throw countError;

        const totalCount = countResult || 0;
        const totalPages = Math.ceil(totalCount / AUDIT_PAGE_SIZE);

        if (!logs || logs.length === 0) {
            container.innerHTML = `
                <div class="bg-gray-50 rounded-lg p-6 text-center">
                    <i class="fas fa-clipboard-list text-gray-300 text-4xl mb-3"></i>
                    <p class="text-gray-500">Keine Aktivitäten gefunden.</p>
                </div>
            `;
            pagination.classList.add('hidden');
            return;
        }

        // Logs rendern
        container.innerHTML = logs.map(log => renderAuditLogEntry(log)).join('');

        // Paginierung aktualisieren
        if (totalPages > 1) {
            pagination.classList.remove('hidden');
            document.getElementById('audit-page-info').textContent = `Seite ${auditCurrentPage + 1} von ${totalPages}`;
            document.getElementById('audit-prev-btn').disabled = auditCurrentPage === 0;
            document.getElementById('audit-next-btn').disabled = auditCurrentPage >= totalPages - 1;
        } else {
            pagination.classList.add('hidden');
        }

    } catch (error) {
        console.error('Fehler beim Laden der Audit-Logs:', error);
        container.innerHTML = `
            <div class="bg-red-50 rounded-lg p-4 text-center">
                <p class="text-red-600">Fehler beim Laden der Logs: ${error.message}</p>
                <p class="text-sm text-gray-500 mt-2">Die Audit-Tabelle muss zuerst in der Datenbank erstellt werden.</p>
            </div>
        `;
    }
}

function renderAuditLogEntry(log) {
    const actionInfo = getActionDisplayInfo(log.action);
    const timeAgo = getTimeAgo(new Date(log.created_at));

    // Details-String erstellen
    let detailsHtml = '';
    if (log.details) {
        const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
        if (details.code) {
            detailsHtml += `<span class="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">${details.code}</span>`;
        }
        if (details.role) {
            detailsHtml += `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded ml-1">${details.role}</span>`;
        }
        if (details.season_name) {
            detailsHtml += `<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded ml-1">${details.season_name}</span>`;
        }
    }

    return `
        <div class="flex items-start gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div class="flex-shrink-0 w-10 h-10 rounded-full ${actionInfo.bgClass} flex items-center justify-center">
                <i class="${actionInfo.icon} ${actionInfo.textClass}"></i>
            </div>
            <div class="flex-grow min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-gray-900">${actionInfo.label}</span>
                    ${detailsHtml}
                </div>
                <div class="text-sm text-gray-600 mt-1">
                    ${log.actor_name ? `<span class="font-medium">${log.actor_name}</span>` : '<span class="text-gray-400">System</span>'}
                    ${log.target_name ? ` → <span class="text-indigo-600">${log.target_name}</span>` : ''}
                </div>
                <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    ${log.club_name ? `<span><i class="fas fa-building mr-1"></i>${log.club_name}</span>` : ''}
                    ${log.sport_name ? `<span><i class="fas fa-running mr-1"></i>${log.sport_name}</span>` : ''}
                    <span><i class="fas fa-clock mr-1"></i>${timeAgo}</span>
                </div>
            </div>
        </div>
    `;
}

function getActionDisplayInfo(action) {
    const actions = {
        'invitation_created': {
            label: 'Einladung erstellt',
            icon: 'fas fa-envelope',
            bgClass: 'bg-blue-100',
            textClass: 'text-blue-600'
        },
        'invitation_used': {
            label: 'Einladung verwendet',
            icon: 'fas fa-user-plus',
            bgClass: 'bg-green-100',
            textClass: 'text-green-600'
        },
        'season_started': {
            label: 'Neue Saison gestartet',
            icon: 'fas fa-play-circle',
            bgClass: 'bg-emerald-100',
            textClass: 'text-emerald-600'
        },
        'season_ended': {
            label: 'Saison beendet',
            icon: 'fas fa-stop-circle',
            bgClass: 'bg-orange-100',
            textClass: 'text-orange-600'
        },
        'role_changed': {
            label: 'Rolle geändert',
            icon: 'fas fa-user-shield',
            bgClass: 'bg-purple-100',
            textClass: 'text-purple-600'
        },
        'user_promoted': {
            label: 'Benutzer befördert',
            icon: 'fas fa-arrow-up',
            bgClass: 'bg-indigo-100',
            textClass: 'text-indigo-600'
        },
        'user_removed': {
            label: 'Benutzer entfernt',
            icon: 'fas fa-user-minus',
            bgClass: 'bg-red-100',
            textClass: 'text-red-600'
        },
        'exercise_created': {
            label: 'Übung erstellt',
            icon: 'fas fa-plus-circle',
            bgClass: 'bg-teal-100',
            textClass: 'text-teal-600'
        },
        'exercise_deleted': {
            label: 'Übung gelöscht',
            icon: 'fas fa-trash-alt',
            bgClass: 'bg-orange-100',
            textClass: 'text-orange-600'
        },
        'admin_login': {
            label: 'Admin Login',
            icon: 'fas fa-sign-in-alt',
            bgClass: 'bg-gray-100',
            textClass: 'text-gray-600'
        }
    };

    return actions[action] || {
        label: action,
        icon: 'fas fa-question-circle',
        bgClass: 'bg-gray-100',
        textClass: 'text-gray-600'
    };
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;

    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function populateAuditFilters() {
    // Vereins-Filter befüllen
    const clubFilter = document.getElementById('audit-filter-club');
    if (clubFilter && allClubs.length > 0) {
        clubFilter.innerHTML = '<option value="">Alle Vereine</option>';
        allClubs.forEach(club => {
            const option = document.createElement('option');
            option.value = club.id;
            option.textContent = club.name;
            clubFilter.appendChild(option);
        });
    }

    // Sport-Filter befüllen
    const sportFilter = document.getElementById('audit-filter-sport');
    if (sportFilter && allSports.length > 0) {
        sportFilter.innerHTML = '<option value="">Alle Sportarten</option>';
        allSports.forEach(sport => {
            const option = document.createElement('option');
            option.value = sport.id;
            option.textContent = `${getSportIcon(sport.name)} ${sport.display_name}`;
            sportFilter.appendChild(option);
        });
    }
}

function setupAuditListeners() {
    // Aktualisieren-Button
    const refreshBtn = document.getElementById('audit-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            auditCurrentPage = 0;
            loadAuditLogs();
        });
    }

    // Filter-Änderungs-Listener
    ['audit-filter-action', 'audit-filter-club', 'audit-filter-sport'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                auditCurrentPage = 0;
                loadAuditLogs();
            });
        }
    });

    // Paginierungs-Buttons
    const prevBtn = document.getElementById('audit-prev-btn');
    const nextBtn = document.getElementById('audit-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (auditCurrentPage > 0) {
                auditCurrentPage--;
                loadAuditLogs();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            auditCurrentPage++;
            loadAuditLogs();
        });
    }
}

async function initializeAuditSection() {
    await populateAuditFilters();
    setupAuditListeners();
    await loadAuditLogs();
}

// ============================================
// ANIMATION INTEGRATION FÜR ÜBUNGSERSTELLUNG
// ============================================

function initializeAnimationToggle() {
    const animationToggle = document.getElementById('exercise-animation-toggle');
    const animationContainer = document.getElementById('exercise-animation-container');
    const handednessContainer = document.getElementById('exercise-handedness-container');
    const autoDescContainer = document.getElementById('exercise-auto-description-container');
    const importBtn = document.getElementById('exercise-import-animation-btn');
    const animationStepsInput = document.getElementById('exercise-animation-steps');
    const animationPreview = document.getElementById('exercise-animation-steps-preview');
    const generateDescBtn = document.getElementById('generate-description-btn');

    if (!animationToggle || !animationContainer) return;

    // Toggle-Listener
    animationToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            animationContainer.classList.remove('hidden');
            if (handednessContainer) handednessContainer.classList.remove('hidden');
            if (autoDescContainer) autoDescContainer.classList.remove('hidden');
        } else {
            animationContainer.classList.add('hidden');
            if (handednessContainer) handednessContainer.classList.add('hidden');
            if (autoDescContainer) autoDescContainer.classList.add('hidden');
        }
    });

    // Auto-Beschreibung generieren
    if (generateDescBtn) {
        generateDescBtn.addEventListener('click', () => {
            const stepsJson = animationStepsInput?.value;
            if (!stepsJson) {
                showAdminNotification('Bitte zuerst Animation vom Animator übernehmen.', 'warning');
                return;
            }
            try {
                const animationData = JSON.parse(stepsJson);
                if (animationData && animationData.steps && animationData.steps.length > 0) {
                    const description = generateDescriptionFromSteps(animationData.steps);
                    // In Beschreibungsfeld einfügen
                    const descTextarea = document.getElementById('exercise-description');
                    if (descTextarea) {
                        descTextarea.value = description;
                    }
                    // Falls Table-Editor aktiv ist, auch dort aktualisieren
                    if (descriptionEditor && typeof descriptionEditor.setContent === 'function') {
                        descriptionEditor.setContent(description);
                    }
                    showAdminNotification('Beschreibung generiert!', 'success');
                }
            } catch (e) {
                showAdminNotification('Fehler beim Parsen der Animation-Schritte.', 'error');
            }
        });
    }

    // Import-Button Listener
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            // Funktion aus table-tennis-exercise-ui.js verwenden
            if (typeof window.ttGetCurrentSteps === 'function') {
                const animationData = window.ttGetCurrentSteps();

                if (animationData && animationData.steps && animationData.steps.length > 0) {
                    // Animation-Steps speichern
                    animationStepsInput.value = JSON.stringify(animationData);

                    // Preview aktualisieren
                    const strokeTypes = window.TT_STROKE_TYPES || {};
                    const stepsPreviewHtml = animationData.steps.map((step, index) => {
                        const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType };
                        const playerClass = step.player === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700';
                        const shortBadge = step.isShort ? '<span class="bg-amber-100 text-amber-700 px-1 rounded text-xs ml-1">kurz</span>' : '';

                        return `
                            <div class="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                                <span class="w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold ${playerClass}">
                                    ${step.player}
                                </span>
                                <span class="text-slate-600">
                                    ${step.side} ${strokeData.name} ${step.fromPosition}→${step.toPosition}${shortBadge}
                                </span>
                            </div>
                        `;
                    }).join('');

                    animationPreview.innerHTML = `
                        <div class="text-slate-600 not-italic">
                            <div class="flex items-center justify-between mb-1">
                                <span class="font-medium">${animationData.steps.length} Schritte</span>
                                <button type="button" id="exercise-clear-animation-btn" class="text-red-500 hover:text-red-700 text-[10px]">
                                    <i class="fas fa-trash mr-1"></i>Entfernen
                                </button>
                            </div>
                            ${stepsPreviewHtml}
                        </div>
                    `;

                    // Clear-Button Listener
                    const clearBtn = document.getElementById('exercise-clear-animation-btn');
                    if (clearBtn) {
                        clearBtn.addEventListener('click', () => {
                            animationStepsInput.value = '';
                            animationPreview.innerHTML = '<span class="italic">Keine Animation-Schritte vorhanden</span>';
                        });
                    }

                    showAdminNotification('Animation übernommen!', 'success');
                } else {
                    showAdminNotification('Keine Schritte im Animator vorhanden. Erstelle zuerst Schritte im Übungs-Animator oben.', 'warning');
                }
            } else {
                showAdminNotification('Animator nicht verfügbar. Bitte Seite neu laden.', 'error');
            }
        });
    }
}

// Beschreibung aus Animation-Steps generieren
function generateDescriptionFromSteps(steps) {
    if (!steps || steps.length === 0) return '';

    const strokeAbbr = {
        'A': 'A',      // Aufschlag
        'T': 'T',      // Topspin
        'K': 'K',      // Konter
        'B': 'B',      // Block
        'F': 'F',      // Flip
        'S': 'S',      // Smash
        'SCH': 'SCH',  // Schupf
        'U': 'U',      // Unterschnitt-Abwehr
        'OS': 'OS',    // Oberschnitt
        'US': 'US',    // Unterschnitt
        'SS': 'SS'     // Seitenschnitt
    };

    // Gruppiere Schritte nach Spieler A und B
    const playerASteps = [];
    const playerBSteps = [];

    steps.forEach(step => {
        const stroke = strokeAbbr[step.strokeType] || step.strokeType;
        const formatted = `${step.side}${stroke} aus ${step.fromPosition} in ${step.toPosition}${step.isShort ? ' (kurz)' : ''}`;

        if (step.player === 'A') {
            playerASteps.push(formatted);
        } else {
            playerBSteps.push(formatted);
        }
    });

    // Erstelle Tabellen-Format
    let description = '| Spieler A | Spieler B |\n';
    description += '|-----------|----------|\n';

    const maxRows = Math.max(playerASteps.length, playerBSteps.length);
    for (let i = 0; i < maxRows; i++) {
        const aStep = playerASteps[i] || '';
        const bStep = playerBSteps[i] || '';
        description += `| ${aStep} | ${bStep} |\n`;
    }

    return description;
}

// Händigkeits-Tags aus Checkboxen sammeln
function getSelectedHandednessTags() {
    const tags = [];
    const checkboxes = [
        { id: 'handedness-rr', tag: 'R-R' },
        { id: 'handedness-ll', tag: 'L-L' },
        { id: 'handedness-rl', tag: 'R-L' },
        { id: 'handedness-lr', tag: 'L-R' }
    ];

    checkboxes.forEach(({ id, tag }) => {
        const checkbox = document.getElementById(id);
        if (checkbox?.checked) {
            tags.push(tag);
        }
    });

    return tags;
}

// Hilfsfunktion für Benachrichtigungen
function showAdminNotification(message, type = 'info') {
    // Versuche globale Funktion zu nutzen
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
    }

    // Fallback: Einfache Toast-Nachricht
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300 ${
        type === 'success' ? 'bg-green-600' :
        type === 'warning' ? 'bg-yellow-600' :
        type === 'error' ? 'bg-red-600' :
        'bg-blue-600'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Aufräumen beim Seiten-Entladen
window.addEventListener('beforeunload', () => {
    if (usersSubscription) {
        supabase.removeChannel(usersSubscription);
    }
    if (exercisesSubscription) {
        supabase.removeChannel(exercisesSubscription);
    }
});
