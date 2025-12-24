// Challenges Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

import { getSupabase } from './supabase-init.js';
import { getChallengePartnerSettings } from './milestone-management.js';
import { formatDate } from './ui-utils.js';

/**
 * Challenges Module - Supabase Version
 * Handles challenge creation, display, and countdown timers
 */

const supabase = getSupabase();

// Store subscription channels for cleanup
let challengeSubscriptions = [];

/**
 * Handles challenge creation form submission
 * @param {Event} e - Form submit event
 * @param {Object} currentUserData - Current user's data
 */
export async function handleCreateChallenge(e, currentUserData) {
    e.preventDefault();
    const feedbackEl = document.getElementById('challenge-feedback');
    const title = document.getElementById('challenge-title').value;
    const type = document.getElementById('challenge-type').value;
    const description = document.getElementById('challenge-description').value;
    const subgroupId = document.getElementById('challenge-subgroup').value;
    const isRepeatable = document.getElementById('challenge-repeatable').checked;

    // Check if milestones are enabled
    const milestonesEnabled =
        document.getElementById('challenge-milestones-enabled')?.checked || false;
    let points = 0;
    let milestones = null;

    if (milestonesEnabled) {
        milestones = getChallengeMilestones();
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufuegen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        // Total points is sum of all milestones
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('challenge-points').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gueltige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
    }

    feedbackEl.textContent = '';
    if (!title || !type || !subgroupId) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfuellen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    try {
        const challengeData = {
            title,
            type,
            description,
            points,
            club_id: currentUserData.clubId,
            subgroup_id: subgroupId,
            is_active: true,
            is_repeatable: isRepeatable,
            created_at: new Date().toISOString(),
            last_reactivated_at: new Date().toISOString(),
        };

        // Add tieredPoints if enabled
        if (milestonesEnabled && milestones) {
            challengeData.tiered_points = {
                enabled: true,
                milestones: milestones,
            };
        } else {
            challengeData.tiered_points = {
                enabled: false,
                milestones: [],
            };
        }

        // Add partner system settings if enabled
        const partnerSettings = getChallengePartnerSettings();
        if (partnerSettings) {
            challengeData.partner_system = {
                enabled: true,
                partnerPercentage: partnerSettings.partnerPercentage,
            };
        } else {
            challengeData.partner_system = {
                enabled: false,
                partnerPercentage: 50,
            };
        }

        const { error } = await supabase
            .from('challenges')
            .insert(challengeData);

        if (error) throw error;

        feedbackEl.textContent = 'Challenge erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        // Reset dropdown to "all"
        document.getElementById('challenge-subgroup').value = 'all';

        // Reset milestones
        document.getElementById('challenge-milestones-list').innerHTML = '';
        document.getElementById('challenge-milestones-enabled').checked = false;
        document.getElementById('challenge-standard-points-container').classList.remove('hidden');
        document.getElementById('challenge-milestones-container').classList.add('hidden');

        // Reset partner system
        const partnerToggle = document.getElementById('challenge-partner-system-toggle-coach');
        const partnerContainer = document.getElementById('challenge-partner-container-coach');
        const partnerPercentageInput = document.getElementById(
            'challenge-partner-percentage-coach'
        );
        if (partnerToggle) partnerToggle.checked = false;
        if (partnerContainer) partnerContainer.classList.add('hidden');
        if (partnerPercentageInput) partnerPercentageInput.value = 50;
    } catch (error) {
        console.error('Fehler beim Erstellen der Challenge:', error);
        feedbackEl.textContent = 'Fehler: Challenge konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
    setTimeout(() => {
        feedbackEl.textContent = '';
    }, 4000);
}

/**
 * Sets up dynamic point range recommendations based on challenge type
 */
export function setupChallengePointRecommendations() {
    const typeSelect = document.getElementById('challenge-type');
    const pointsRangeEl = document.getElementById('challenge-points-range');
    const durationTextEl = document.getElementById('challenge-duration-text');

    if (!typeSelect || !pointsRangeEl || !durationTextEl) return;

    const updateRecommendation = () => {
        const type = typeSelect.value;
        const recommendations = {
            daily: { range: '8-20 Punkte', text: 'taegliche' },
            weekly: { range: '20-50 Punkte', text: 'woechentliche' },
            monthly: { range: '40-100 Punkte', text: 'monatliche' },
        };

        const rec = recommendations[type] || recommendations.daily;
        pointsRangeEl.textContent = rec.range;
        durationTextEl.textContent = rec.text;
    };

    typeSelect.addEventListener('change', updateRecommendation);
    updateRecommendation(); // Set initial value
}

/**
 * Sets up milestone system for challenges
 */
export function setupChallengeMilestones() {
    const milestonesEnabled = document.getElementById('challenge-milestones-enabled');
    const standardContainer = document.getElementById('challenge-standard-points-container');
    const milestonesContainer = document.getElementById('challenge-milestones-container');
    const pointsInput = document.getElementById('challenge-points');

    if (!milestonesEnabled || !standardContainer || !milestonesContainer) {
        console.error('[Challenges] Milestone setup: Missing required elements');
        return;
    }

    // Function to update UI based on checkbox state
    const updateUI = () => {
        if (milestonesEnabled.checked) {
            standardContainer.classList.add('hidden');
            milestonesContainer.classList.remove('hidden');
            if (pointsInput) pointsInput.removeAttribute('required');
            // Add first milestone by default if none exist
            if (getChallengeMilestones().length === 0) {
                addChallengeMilestone();
            }
        } else {
            standardContainer.classList.remove('hidden');
            milestonesContainer.classList.add('hidden');
            if (pointsInput) pointsInput.setAttribute('required', 'required');
        }
    };

    // Set initial state
    updateUI();

    // Toggle between standard points and milestones
    milestonesEnabled.addEventListener('change', updateUI);

    // Add milestone button
    const addBtn = document.getElementById('add-challenge-milestone-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addChallengeMilestone);
    }

    // When form is reset, ensure UI is reset too
    const form = document.getElementById('create-challenge-form');
    if (form) {
        form.addEventListener('reset', () => {
            setTimeout(() => {
                milestonesEnabled.checked = false;
                updateUI();
            }, 0);
        });
    }
}

/**
 * Adds a new milestone input row for challenges
 */
function addChallengeMilestone() {
    const list = document.getElementById('challenge-milestones-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center bg-gray-50 p-2 rounded';
    row.innerHTML = `
        <input type="number"
               class="challenge-milestone-count w-16 px-2 py-1 border border-gray-300 rounded text-sm"
               placeholder="z.B. 1"
               min="1"
               required>
        <span class="text-gray-600 text-xs whitespace-nowrap">x -></span>
        <input type="number"
               class="challenge-milestone-points w-16 px-2 py-1 border border-gray-300 rounded text-sm"
               placeholder="Punkte"
               min="1"
               required>
        <span class="text-gray-600 text-xs">P.</span>
        <button type="button" class="remove-challenge-milestone text-red-600 hover:text-red-800 px-1 text-sm flex-shrink-0">
            X
        </button>
    `;

    // Add remove handler
    row.querySelector('.remove-challenge-milestone').addEventListener('click', () => {
        row.remove();
        updateChallengeTotalPoints();
    });

    // Add update handlers
    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateChallengeTotalPoints);
    });

    list.appendChild(row);
    updateChallengeTotalPoints();
}

/**
 * Gets all milestones from the challenge form
 * @returns {Array} Array of {count, points} objects
 */
function getChallengeMilestones() {
    const list = document.getElementById('challenge-milestones-list');
    if (!list) return [];

    const milestones = [];
    list.querySelectorAll('.flex').forEach(row => {
        const count = parseInt(row.querySelector('.challenge-milestone-count')?.value || 0);
        const points = parseInt(row.querySelector('.challenge-milestone-points')?.value || 0);
        if (count > 0 && points > 0) {
            milestones.push({ count, points });
        }
    });

    // Sort by count ascending
    milestones.sort((a, b) => a.count - b.count);
    return milestones;
}

/**
 * Updates the total milestone points display for challenges
 */
function updateChallengeTotalPoints() {
    const milestones = getChallengeMilestones();
    const total = milestones.reduce((sum, m) => sum + m.points, 0);
    const totalEl = document.getElementById('challenge-total-milestone-points');
    if (totalEl) {
        totalEl.textContent = total;
    }
}

/**
 * Calculates the expiry date for a challenge based on type
 * @param {string} createdAt - ISO timestamp when challenge was created
 * @param {string} type - Challenge type (daily, weekly, monthly)
 * @returns {Date} Expiry date
 */
export function calculateExpiry(createdAt, type) {
    if (!createdAt) return new Date();
    const startDate = new Date(createdAt);
    const expiryDate = new Date(startDate);
    switch (type) {
        case 'daily':
            expiryDate.setDate(startDate.getDate() + 1);
            break;
        case 'weekly':
            expiryDate.setDate(startDate.getDate() + 7);
            break;
        case 'monthly':
            expiryDate.setMonth(startDate.getMonth() + 1);
            break;
    }
    return expiryDate;
}

/**
 * Loads and displays active challenges for the club
 * @param {string} clubId - Club ID
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export async function loadActiveChallenges(clubId, currentSubgroupFilter = 'all') {
    const activeChallengesList = document.getElementById('active-challenges-list');
    if (!activeChallengesList) return;

    activeChallengesList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        const { data, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', clubId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const now = new Date();
        let challenges = (data || [])
            .map(c => ({
                id: c.id,
                title: c.title,
                type: c.type,
                description: c.description,
                points: c.points,
                subgroupId: c.subgroup_id,
                isRepeatable: c.is_repeatable,
                tieredPoints: c.tiered_points,
                partnerSystem: c.partner_system,
                createdAt: c.created_at
            }))
            .filter(challenge => calculateExpiry(challenge.createdAt, challenge.type) > now);

        // Filter by subgroup
        if (currentSubgroupFilter !== 'all') {
            challenges = challenges.filter(
                challenge =>
                    challenge.subgroupId === currentSubgroupFilter ||
                    challenge.subgroupId === 'all'
            );
        }

        if (challenges.length === 0) {
            activeChallengesList.innerHTML =
                '<p class="text-gray-500">Keine aktiven Challenges fuer diese Ansicht gefunden.</p>';
            return;
        }

        // Load subgroup names for badges
        const subgroupIds = [...new Set(challenges.map(c => c.subgroupId).filter(id => id && id !== 'all'))];
        let subgroupNamesMap = {};

        if (subgroupIds.length > 0) {
            const { data: subgroups } = await supabase
                .from('subgroups')
                .select('id, name')
                .in('id', subgroupIds);

            if (subgroups) {
                subgroups.forEach(s => {
                    subgroupNamesMap[s.id] = s.name;
                });
            }
        }

        activeChallengesList.innerHTML = '';
        challenges.forEach(challenge => {
            const card = createChallengeCard(challenge, subgroupNamesMap, false);
            activeChallengesList.appendChild(card);
        });

        updateAllCountdowns();

        // Set up real-time subscription
        subscribeToChallenge(clubId, () => {
            loadActiveChallenges(clubId, currentSubgroupFilter);
        });

    } catch (error) {
        console.error('[Challenges] Error loading active challenges:', error);
        activeChallengesList.innerHTML =
            '<p class="text-red-500">Fehler beim Laden der Challenges.</p>';
    }
}

/**
 * Creates a challenge card element
 */
function createChallengeCard(challenge, subgroupNamesMap, isExpired) {
    const card = document.createElement('div');
    card.className = 'p-4 border rounded-lg bg-gray-50';
    const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);

    // Determine subgroup badge
    let subgroupBadge = '';
    if (challenge.subgroupId === 'all') {
        subgroupBadge =
            '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Alle (Gesamtverein)</span>';
    } else if (challenge.subgroupId && subgroupNamesMap[challenge.subgroupId]) {
        subgroupBadge = `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">${subgroupNamesMap[challenge.subgroupId]}</span>`;
    }

    // Determine repeatable badge
    const isRepeatable = challenge.isRepeatable !== undefined ? challenge.isRepeatable : true;
    const repeatableBadge = isRepeatable
        ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Mehrfach</span>'
        : '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">Einmalig</span>';

    if (isExpired) {
        const wasManuallyEnded = challenge.isActive === false;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-gray-700">${challenge.title}</h3>
                    <div class="flex gap-2 mt-1 flex-wrap">
                        <span class="text-xs font-semibold bg-gray-300 text-gray-600 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                        ${subgroupBadge}
                        ${repeatableBadge}
                    </div>
                </div>
            </div>
            <p class="text-sm text-gray-600 my-2">${challenge.description || ''}</p>
            <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t">
                <span class="font-bold text-gray-600">+${challenge.points} Punkte</span>
                <span class="text-xs text-gray-500">
                    ${wasManuallyEnded ? 'Vorzeitig beendet' : 'Abgelaufen am ' + formatDate(expiresAt)}
                </span>
            </div>
            <div class="flex gap-2 mt-3">
                <button onclick="showReactivateModal('${challenge.id}', '${challenge.title}')"
                        class="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 px-3 rounded">
                    Reaktivieren
                </button>
                <button onclick="confirmDeleteChallenge('${challenge.id}', '${challenge.title}')"
                        class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded">
                    Loeschen
                </button>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold">${challenge.title}</h3>
                    <div class="flex gap-2 mt-1 flex-wrap">
                        <span class="text-xs font-semibold bg-gray-200 text-gray-700 px-2 py-1 rounded-full uppercase">${challenge.type}</span>
                        ${subgroupBadge}
                        ${repeatableBadge}
                    </div>
                </div>
            </div>
            <p class="text-sm text-gray-600 my-2">${challenge.description || ''}</p>
            <div class="flex justify-between items-center text-sm mt-3 pt-3 border-t">
                <span class="font-bold text-indigo-600">+${challenge.points} Punkte</span>
                <span class="challenge-countdown font-mono text-red-600" data-expires-at="${expiresAt.toISOString()}">Berechne...</span>
            </div>
            <div class="flex gap-2 mt-3">
                <button onclick="confirmEndChallenge('${challenge.id}', '${challenge.title}')"
                        class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded">
                    Beenden
                </button>
            </div>
        `;
    }

    return card;
}

/**
 * Loads challenges for dropdown selection (used in points assignment)
 * @param {string} clubId - Club ID
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export async function loadChallengesForDropdown(clubId, currentSubgroupFilter = 'all') {
    const select = document.getElementById('challenge-select');
    if (!select) return;

    try {
        const { data, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', clubId)
            .eq('is_active', true);

        if (error) throw error;

        if (!data || data.length === 0) {
            select.innerHTML = '<option value="">Keine aktiven Challenges</option>';
            return;
        }

        const now = new Date();
        let activeChallenges = data
            .map(c => ({
                id: c.id,
                title: c.title,
                type: c.type,
                points: c.points,
                subgroupId: c.subgroup_id,
                tieredPoints: c.tiered_points,
                partnerSystem: c.partner_system,
                createdAt: c.created_at
            }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                return expiresAt > now;
            });

        // Filter by subgroup
        if (currentSubgroupFilter !== 'all') {
            activeChallenges = activeChallenges.filter(
                challenge =>
                    challenge.subgroupId === currentSubgroupFilter || challenge.subgroupId === 'all'
            );
        }

        if (activeChallenges.length === 0) {
            select.innerHTML = '<option value="">Keine passenden Challenges</option>';
            return;
        }

        select.innerHTML = '<option value="">Challenge waehlen...</option>';

        activeChallenges.forEach(challenge => {
            const option = document.createElement('option');
            option.value = challenge.id;

            // Check for tieredPoints format
            const hasTieredPoints =
                challenge.tieredPoints?.enabled && challenge.tieredPoints?.milestones?.length > 0;
            const displayText = hasTieredPoints
                ? `${challenge.title} (bis zu ${challenge.points} P. - Meilensteine)`
                : `${challenge.title} (+${challenge.points} P.)`;

            option.textContent = displayText;
            option.dataset.points = challenge.points;
            option.dataset.title = challenge.title;
            option.dataset.subgroupId = challenge.subgroupId || 'all';
            option.dataset.hasMilestones = hasTieredPoints;

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(challenge.tieredPoints.milestones);
            }

            // Add partner system data
            const hasPartnerSystem = challenge.partnerSystem?.enabled || false;
            option.dataset.hasPartnerSystem = hasPartnerSystem;
            if (hasPartnerSystem) {
                option.dataset.partnerPercentage = challenge.partnerSystem.partnerPercentage || 50;
            }

            select.appendChild(option);
        });

        // Set up real-time subscription
        subscribeToChallenge(clubId, () => {
            loadChallengesForDropdown(clubId, currentSubgroupFilter);
        });

    } catch (error) {
        console.error('[Challenges] Error loading challenges for dropdown:', error);
        select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

/**
 * Loads expired challenges for the club
 * @param {string} clubId - Club ID
 */
export async function loadExpiredChallenges(clubId) {
    const expiredChallengesList = document.getElementById('expired-challenges-list');
    if (!expiredChallengesList) return;

    expiredChallengesList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        const { data, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', clubId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const now = new Date();
        const expiredChallenges = (data || [])
            .map(c => ({
                id: c.id,
                title: c.title,
                type: c.type,
                description: c.description,
                points: c.points,
                subgroupId: c.subgroup_id,
                isActive: c.is_active,
                isRepeatable: c.is_repeatable,
                createdAt: c.created_at
            }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                // Show if expired OR manually ended
                return expiresAt <= now || challenge.isActive === false;
            });

        if (expiredChallenges.length === 0) {
            expiredChallengesList.innerHTML =
                '<p class="text-gray-500">Keine abgelaufenen Challenges gefunden.</p>';
            return;
        }

        // Load subgroup names for badges
        const subgroupIds = [...new Set(expiredChallenges.map(c => c.subgroupId).filter(id => id && id !== 'all'))];
        let subgroupNamesMap = {};

        if (subgroupIds.length > 0) {
            const { data: subgroups } = await supabase
                .from('subgroups')
                .select('id, name')
                .in('id', subgroupIds);

            if (subgroups) {
                subgroups.forEach(s => {
                    subgroupNamesMap[s.id] = s.name;
                });
            }
        }

        expiredChallengesList.innerHTML = '';
        expiredChallenges.forEach(challenge => {
            const card = createChallengeCard(challenge, subgroupNamesMap, true);
            expiredChallengesList.appendChild(card);
        });

    } catch (error) {
        console.error('[Challenges] Error loading expired challenges:', error);
        expiredChallengesList.innerHTML = '<p class="text-red-500">Fehler beim Laden.</p>';
    }
}

/**
 * Reactivates a challenge with a new duration and subgroup
 * @param {string} challengeId - Challenge ID
 * @param {string} duration - New duration (daily, weekly, monthly)
 * @param {string} subgroupId - Subgroup ID (or "all")
 */
export async function reactivateChallenge(challengeId, duration, subgroupId) {
    try {
        const { error } = await supabase
            .from('challenges')
            .update({
                created_at: new Date().toISOString(),
                type: duration,
                subgroup_id: subgroupId,
                is_active: true,
                last_reactivated_at: new Date().toISOString(),
            })
            .eq('id', challengeId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('[Challenges] Error reactivating challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Ends a challenge early
 * @param {string} challengeId - Challenge ID
 */
export async function endChallenge(challengeId) {
    try {
        const { error } = await supabase
            .from('challenges')
            .update({ is_active: false })
            .eq('id', challengeId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('[Challenges] Error ending challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a challenge permanently
 * @param {string} challengeId - Challenge ID
 */
export async function deleteChallenge(challengeId) {
    try {
        const { error } = await supabase
            .from('challenges')
            .delete()
            .eq('id', challengeId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('[Challenges] Error deleting challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates all countdown timers on the page
 */
export function updateAllCountdowns() {
    const countdownElements = document.querySelectorAll('.challenge-countdown');
    const now = new Date();
    countdownElements.forEach(el => {
        const expiresAt = new Date(el.dataset.expiresAt);
        const diff = expiresAt - now;
        if (diff <= 0) {
            el.textContent = 'Abgelaufen';
            el.classList.remove('text-red-600');
            el.classList.add('text-gray-500');
            return;
        }
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        el.textContent = `Verbleibend: ${days}T ${hours}h ${minutes}m ${seconds}s`;
    });
}

/**
 * Populates a subgroup dropdown with subgroups from the club
 * @param {string} clubId - Club ID
 * @param {string} selectId - ID of the select element
 */
export async function populateSubgroupDropdown(clubId, selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    try {
        const { data, error } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', clubId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Keep the "Alle" option
        const currentValue = select.value;
        select.innerHTML = '<option value="all">Alle (Gesamtverein)</option>';

        (data || []).forEach(subgroup => {
            const option = document.createElement('option');
            option.value = subgroup.id;
            option.textContent = subgroup.name;
            select.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (
            currentValue &&
            Array.from(select.options).some(opt => opt.value === currentValue)
        ) {
            select.value = currentValue;
        }

    } catch (error) {
        console.error('[Challenges] Error loading subgroups for dropdown:', error);
    }
}

/**
 * Subscribe to challenge changes (real-time)
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback to run on changes
 */
function subscribeToChallenge(clubId, callback) {
    // Avoid duplicate subscriptions
    const existingChannel = challengeSubscriptions.find(c => c.topic === `challenges_${clubId}`);
    if (existingChannel) return;

    const channel = supabase
        .channel(`challenges_${clubId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'challenges',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                callback();
            }
        )
        .subscribe();

    challengeSubscriptions.push(channel);
}

/**
 * Unsubscribe from all challenge channels
 */
export function unsubscribeFromChallenges() {
    challengeSubscriptions.forEach(channel => {
        supabase.removeChannel(channel);
    });
    challengeSubscriptions = [];
}

/**
 * Start countdown update interval
 */
export function startCountdownInterval() {
    setInterval(updateAllCountdowns, 1000);
}
