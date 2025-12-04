// Admin Dashboard - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

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
    getExercisePartnerSettings,
} from './milestone-management.js';

// Supabase client
const supabase = getSupabase();

// DOM Elements
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

// Modals
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

// Competition statistics state
let competitionMatchData = [];
let competitionPeriod = 'month';
let competitionTypeFilter = 'all';
let descriptionEditor = null;
let editDescriptionEditor = null;

// Realtime subscriptions
let usersSubscription = null;
let exercisesSubscription = null;

function showAuthError(message) {
    pageLoader.style.display = 'none';
    mainContent.style.display = 'none';
    authErrorMessage.textContent = message;
    authErrorContainer.style.display = 'flex';
    console.error('Auth-Fehler auf Admin-Seite:', message);
}

// Initialize auth listener
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
        // User logged out - use replace() to prevent back-button access
        window.location.replace('/index.html');
    }
});

function initializeAdminPage(userData, user) {
    try {
        welcomeMessage.textContent = `Willkommen, ${userData.first_name || userData.display_name || user.email}!`;

        // Analytics removed - can be replaced with custom analytics if needed
        console.log('[Admin] Page view - Admin Dashboard');

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

        logoutButton.addEventListener('click', async () => {
            try {
                await supabaseSignOut();
                // Clear SPA cache to prevent back-button access to authenticated pages
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

        // Initialize description editors
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

        // Initialize milestone management
        initializeExerciseMilestones();

        // Initialize partner system
        initializeExercisePartnerSystem();

        // Modal Listeners
        closePlayerModalButton.addEventListener('click', () => playerModal.classList.add('hidden'));
        closeExerciseModalButton.addEventListener('click', () =>
            exerciseModal.classList.add('hidden')
        );
        closeEditExerciseModalButton.addEventListener('click', () =>
            editExerciseModal.classList.add('hidden')
        );

        // Toggle abbreviations in exercise modal
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

        loadClubsAndPlayers();
        loadAllExercises();
        loadStatistics();
    } catch (error) {
        showAuthError(`Initialisierungsfehler: ${error.message}`);
    }
}

async function handleInviteCoach(e) {
    e.preventDefault();
    const clubId = document.getElementById('clubId').value;
    if (!clubId) return alert('Bitte eine Vereins-ID angeben.');

    try {
        // Generate unique code
        let code = generateInvitationCode();
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const { data } = await supabase
                .from('invitation_codes')
                .select('id')
                .eq('code', code)
                .single();

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

        // Get current user
        const user = await getCurrentUser();

        // Create code document
        const expiresAt = getExpirationDate();
        const { error } = await supabase
            .from('invitation_codes')
            .insert({
                code,
                club_id: clubId,
                created_by: user.id,
                expires_at: expiresAt,
                max_uses: 1,
                used: false,
                used_by: null,
                used_at: null,
                first_name: '',
                last_name: '',
                subgroup_ids: [],
                role: 'coach',
            });

        if (error) throw error;

        // Display code
        inviteLinkInput.value = code;
        inviteLinkContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Fehler beim Erstellen des Codes:', error);
        alert('Fehler: Der Einladungscode konnte nicht erstellt werden.');
    }
}

function copyInviteLink() {
    inviteLinkInput.select();
    document.execCommand('copy');
    alert('Link in die Zwischenablage kopiert!');
}

function openExerciseModal(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } = dataset;
    modalExerciseTitle.textContent = title;
    modalExerciseImage.src = imageUrl || '';

    // Render description content
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

    // Handle points display with milestones
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
            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => a.count - b.count)
                .map((milestone, index) => {
                    const isFirst = index === 0;
                    const displayPoints = isFirst
                        ? milestone.points
                        : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
                    return `<div class="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg mb-2 border border-indigo-100">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">🎯</span>
                            <span class="text-base font-semibold text-gray-800">${milestone.count}× abgeschlossen</span>
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

    // Set data for both buttons
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        // Load clubs to identify test clubs
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        const testClubIds = new Set(
            (clubs || []).filter(c => c.is_test_club === true).map(c => c.id)
        );

        // Load users (excluding test clubs)
        const { data: allUsers } = await supabase
            .from('profiles')
            .select('*');

        const users = (allUsers || []).filter(u => !u.club_id || !testClubIds.has(u.club_id));

        // Load attendance (excluding test clubs)
        const { data: allAttendance } = await supabase
            .from('attendance')
            .select('*');

        const attendances = (allAttendance || []).filter(a => !a.club_id || !testClubIds.has(a.club_id));

        // Count non-test clubs
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

        // Load global competition statistics
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
        // Fetch all singles matches
        const { data: singlesMatches } = await supabase
            .from('matches')
            .select('created_at, club_id');

        // Fetch all doubles matches
        const { data: doublesMatches } = await supabase
            .from('doubles_matches')
            .select('created_at, club_id');

        // Process all matches (exclude test clubs)
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
        // Load clubs first
        const { data: clubs, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name, is_test_club');

        if (clubsError) throw clubsError;

        // Create clubs map
        const clubsMap = new Map();
        (clubs || []).forEach(club => {
            clubsMap.set(club.id, club);
        });

        // Initial load of users
        const { data: users, error } = await supabase
            .from('profiles')
            .select('*');

        if (error) throw error;

        renderClubsAndPlayers(users || [], clubsMap);

        // Setup realtime subscription
        if (usersSubscription) {
            supabase.removeChannel(usersSubscription);
        }

        usersSubscription = supabase
            .channel('profiles_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
                const { data: updatedUsers } = await supabase
                    .from('profiles')
                    .select('*');
                renderClubsAndPlayers(updatedUsers || [], clubsMap);
            })
            .subscribe();

    } catch (error) {
        console.error('Fehler beim Laden der Vereinsübersicht:', error);
        clubsListEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Vereine.</p>';
    }
}

function renderClubsAndPlayers(users, clubsMap = new Map()) {
    const clubs = users.reduce((acc, user) => {
        if (user.club_id) {
            if (!acc[user.club_id]) {
                acc[user.club_id] = [];
            }
            acc[user.club_id].push(user);
        }
        return acc;
    }, {});

    clubsListEl.innerHTML =
        Object.keys(clubs).length === 0
            ? '<p class="text-gray-500">Keine Vereine gefunden.</p>'
            : '';

    for (const clubId in clubs) {
        const clubData = clubsMap.get(clubId);
        const clubName = clubData?.name || clubId;
        const isTestClub = clubData?.is_test_club === true;

        const clubDiv = document.createElement('div');
        clubDiv.className = 'p-4 bg-gray-50 rounded-lg flex justify-between items-center';
        clubDiv.innerHTML = `
            <div>
                <p class="font-semibold">${clubName}</p>
                ${isTestClub ? '<span class="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">Test-Club</span>' : ''}
            </div>
            <button data-club-id="${clubId}" data-club-name="${clubName}" class="view-players-button bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600">Mitglieder anzeigen (${clubs[clubId].length})</button>`;
        clubsListEl.appendChild(clubDiv);
    }

    document.querySelectorAll('.view-players-button').forEach(button => {
        button.addEventListener('click', () => {
            const clubId = button.dataset.clubId;
            const clubName = button.dataset.clubName || clubId;
            modalClubIdEl.textContent = `Mitglieder von: ${clubName}`;
            modalPlayerListEl.innerHTML = '';
            clubs[clubId]
                .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''))
                .forEach(player => {
                    const playerEl = document.createElement('div');
                    const initials =
                        (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
                    const avatarSrc =
                        player.avatar_url ||
                        `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                    playerEl.className = 'p-2 border-b flex justify-between items-center';
                    playerEl.innerHTML = `<div class="flex items-center"><img src="${avatarSrc}" alt="Avatar" class="h-10 w-10 rounded-full object-cover mr-4"><div><p class="font-medium">${player.first_name || ''} ${player.last_name || ''} (${player.role})</p><p class="text-sm text-gray-500">${player.email || 'Offline'}</p></div></div><button data-id="${player.id}" class="delete-player-btn text-red-500 hover:text-red-700 font-semibold text-sm">Löschen</button>`;
                    modalPlayerListEl.appendChild(playerEl);
                });
            playerModal.classList.remove('hidden');
        });
    });
}

async function handleDeletePlayer(playerId) {
    if (confirm('Sind Sie sicher, dass Sie diesen Benutzer endgültig löschen möchten?')) {
        try {
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', playerId);

            if (error) throw error;
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
    const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

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

        // Upload image to Supabase Storage if provided
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

        const exerciseData = {
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
        };

        // Add partner system settings if enabled
        const partnerSettings = getExercisePartnerSettings();
        if (partnerSettings) {
            exerciseData.partner_system = {
                enabled: true,
                partner_percentage: partnerSettings.partnerPercentage,
            };
        } else {
            exerciseData.partner_system = {
                enabled: false,
                partner_percentage: 50,
            };
        }

        const { error } = await supabase
            .from('exercises')
            .insert(exerciseData);

        if (error) throw error;

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        createExerciseForm.reset();

        // Reset form fields
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
        // Initial load
        const { data: exercises, error } = await supabase
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        renderExercises(exercises || []);

        // Setup realtime subscription
        if (exercisesSubscription) {
            supabase.removeChannel(exercisesSubscription);
        }

        exercisesSubscription = supabase
            .channel('exercises_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'exercises' }, async () => {
                const { data: updatedExercises } = await supabase
                    .from('exercises')
                    .select('*')
                    .order('created_at', { ascending: false });
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

        // Support both old and new format
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

        const tagsHtml = (exercise.tags || [])
            .map(
                tag =>
                    `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
            )
            .join('');

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
                          <h3 class="font-bold text-md mb-2 flex-grow">${exercise.title}</h3>
                          <div class="pt-2">${tagsHtml}</div>
                      </div>`;
        exercisesListAdminEl.appendChild(card);
    });
}

async function handleDeleteExercise(exerciseId, imageUrl) {
    if (confirm('Sind Sie sicher, dass Sie diese Übung endgültig löschen möchten?')) {
        try {
            const { error } = await supabase
                .from('exercises')
                .delete()
                .eq('id', exerciseId);

            if (error) throw error;

            // Delete image from storage if it exists
            if (imageUrl && imageUrl !== 'undefined' && imageUrl.trim() !== '') {
                try {
                    // Extract file path from URL
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

// Migration function (simplified - runs directly in database)
const migrateDoublesNamesBtn = document.getElementById('migrate-doubles-names-btn');
const migrationStatus = document.getElementById('migration-status');

if (migrateDoublesNamesBtn) {
    migrateDoublesNamesBtn.addEventListener('click', async () => {
        if (!confirm('Möchtest du die Migration starten? Dies aktualisiert alle doublesPairings-Dokumente mit Spielernamen.')) {
            return;
        }

        migrateDoublesNamesBtn.disabled = true;
        migrateDoublesNamesBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Migration läuft...';
        migrationStatus.textContent = 'Migration wird ausgeführt...';
        migrationStatus.className = 'text-sm font-medium text-blue-600';

        try {
            // Get all doubles pairings without names
            const { data: pairings, error: pairingsError } = await supabase
                .from('doubles_pairings')
                .select('*')
                .or('player1_name.is.null,player2_name.is.null');

            if (pairingsError) throw pairingsError;

            let migrated = 0;
            let skipped = 0;

            for (const pairing of pairings || []) {
                // Get player names
                const { data: player1 } = await supabase
                    .from('profiles')
                    .select('display_name, first_name, last_name')
                    .eq('id', pairing.player1_id)
                    .single();

                const { data: player2 } = await supabase
                    .from('profiles')
                    .select('display_name, first_name, last_name')
                    .eq('id', pairing.player2_id)
                    .single();

                if (player1 && player2) {
                    const player1Name = player1.display_name || `${player1.first_name} ${player1.last_name}`;
                    const player2Name = player2.display_name || `${player2.first_name} ${player2.last_name}`;

                    await supabase
                        .from('doubles_pairings')
                        .update({
                            player1_name: player1Name,
                            player2_name: player2Name
                        })
                        .eq('id', pairing.id);

                    migrated++;
                } else {
                    skipped++;
                }
            }

            migrationStatus.textContent = `✅ Erfolgreich! ${migrated} Paarungen aktualisiert, ${skipped} übersprungen.`;
            migrationStatus.className = 'text-sm font-medium text-green-600';
            alert(`Migration erfolgreich!\n\n${migrated} Paarungen wurden aktualisiert.\n${skipped} wurden übersprungen.`);
        } catch (error) {
            console.error('Migration error:', error);
            migrationStatus.textContent = '❌ Fehler: ' + error.message;
            migrationStatus.className = 'text-sm font-medium text-red-600';
            alert('Fehler bei der Migration: ' + error.message);
        } finally {
            migrateDoublesNamesBtn.disabled = false;
            migrateDoublesNamesBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Migration starten';
        }
    });
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (usersSubscription) {
        supabase.removeChannel(usersSubscription);
    }
    if (exercisesSubscription) {
        supabase.removeChannel(exercisesSubscription);
    }
});
