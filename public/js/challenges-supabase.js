// Herausforderungen-Modul (Supabase-Version)

import { getSupabase } from './supabase-init.js';
import { getChallengePartnerSettings } from './milestone-management.js';
import { formatDate } from './ui-utils-supabase.js';

const supabase = getSupabase();

// Subscription-Channels werden gespeichert für späteres Cleanup
let challengeSubscriptions = [];

/** Challenge-Formular verarbeiten */
export async function handleCreateChallenge(e, currentUserData) {
    e.preventDefault();
    const feedbackEl = document.getElementById('challenge-feedback');
    const title = document.getElementById('challenge-title').value;
    const type = document.getElementById('challenge-type').value;
    const description = document.getElementById('challenge-description').value;
    const subgroupId = document.getElementById('challenge-subgroup').value;
    const isRepeatable = document.getElementById('challenge-repeatable').checked;
    const unit = document.getElementById('challenge-unit')?.value || 'Wiederholungen';

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
            unit,
            club_id: currentUserData.clubId,
            subgroup_id: subgroupId === 'all' ? null : subgroupId,
            is_active: true,
            is_repeatable: isRepeatable,
            created_at: new Date().toISOString(),
            last_reactivated_at: new Date().toISOString(),
        };

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

        document.getElementById('challenge-subgroup').value = 'all';

        const unitSelect = document.getElementById('challenge-unit');
        if (unitSelect) unitSelect.value = 'Wiederholungen';

        document.getElementById('challenge-milestones-list').innerHTML = '';
        document.getElementById('challenge-milestones-enabled').checked = false;
        document.getElementById('challenge-standard-points-container').classList.remove('hidden');
        document.getElementById('challenge-milestones-container').classList.add('hidden');

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

/** Punktempfehlungen basierend auf Challenge-Typ */
export function setupChallengePointRecommendations() {
    const typeSelect = document.getElementById('challenge-type');
    const pointsRangeEl = document.getElementById('challenge-points-range');
    const durationTextEl = document.getElementById('challenge-duration-text');

    if (!typeSelect || !pointsRangeEl || !durationTextEl) return;

    const updateRecommendation = () => {
        const type = typeSelect.value;
        const recommendations = {
            daily: { range: '8-20 Punkte', text: '1-Tages' },
            weekly: { range: '20-50 Punkte', text: '1-Wochen' },
            monthly: { range: '40-100 Punkte', text: '1-Monats' },
        };

        const rec = recommendations[type] || recommendations.daily;
        pointsRangeEl.textContent = rec.range;
        durationTextEl.textContent = rec.text;
    };

    typeSelect.addEventListener('change', updateRecommendation);
    updateRecommendation();
}

/** Meilenstein-System für Challenges konfigurieren */
export function setupChallengeMilestones() {
    const milestonesEnabled = document.getElementById('challenge-milestones-enabled');
    const standardContainer = document.getElementById('challenge-standard-points-container');
    const milestonesContainer = document.getElementById('challenge-milestones-container');
    const pointsInput = document.getElementById('challenge-points');

    if (!milestonesEnabled || !standardContainer || !milestonesContainer) {
        console.error('[Challenges] Milestone setup: Missing required elements');
        return;
    }

    const updateUI = () => {
        if (milestonesEnabled.checked) {
            standardContainer.classList.add('hidden');
            milestonesContainer.classList.remove('hidden');
            if (pointsInput) pointsInput.removeAttribute('required');
            // Erster Meilenstein wird automatisch hinzugefügt für bessere UX
            if (getChallengeMilestones().length === 0) {
                addChallengeMilestone();
            }
        } else {
            standardContainer.classList.remove('hidden');
            milestonesContainer.classList.add('hidden');
            if (pointsInput) pointsInput.setAttribute('required', 'required');
        }
    };

    updateUI();

    milestonesEnabled.addEventListener('change', updateUI);

    const addBtn = document.getElementById('add-challenge-milestone-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addChallengeMilestone);
    }

    // Bei Form-Reset muss UI ebenfalls zurückgesetzt werden
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

/** Neue Meilenstein-Zeile hinzufügen */
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

    row.querySelector('.remove-challenge-milestone').addEventListener('click', () => {
        row.remove();
        updateChallengeTotalPoints();
    });

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateChallengeTotalPoints);
    });

    list.appendChild(row);
    updateChallengeTotalPoints();
}

/** Alle Meilensteine aus dem Formular auslesen */
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

    milestones.sort((a, b) => a.count - b.count);
    return milestones;
}

/** Gesamtpunktzahl der Meilensteine aktualisieren */
function updateChallengeTotalPoints() {
    const milestones = getChallengeMilestones();
    const total = milestones.reduce((sum, m) => sum + m.points, 0);
    const totalEl = document.getElementById('challenge-total-milestone-points');
    if (totalEl) {
        totalEl.textContent = total;
    }
}

/** Ablaufdatum basierend auf Challenge-Typ berechnen */
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

/** Aktive Challenges laden und anzeigen */
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
                unit: c.unit,
                subgroupId: c.subgroup_id,
                isRepeatable: c.is_repeatable,
                tieredPoints: c.tiered_points,
                partnerSystem: c.partner_system,
                createdAt: c.created_at
            }))
            .filter(challenge => calculateExpiry(challenge.createdAt, challenge.type) > now);

        if (currentSubgroupFilter !== 'all') {
            challenges = challenges.filter(
                challenge =>
                    challenge.subgroupId === currentSubgroupFilter ||
                    !challenge.subgroupId  // null = Alle (Gesamtverein)
            );
        }

        if (challenges.length === 0) {
            activeChallengesList.innerHTML =
                '<p class="text-gray-500">Keine aktiven Challenges fuer diese Ansicht gefunden.</p>';
            return;
        }

        const subgroupIds = [...new Set(challenges.map(c => c.subgroupId).filter(id => id))];
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

        subscribeToChallenge(clubId, () => {
            loadActiveChallenges(clubId, currentSubgroupFilter);
        });

    } catch (error) {
        console.error('[Challenges] Error loading active challenges:', error);
        activeChallengesList.innerHTML =
            '<p class="text-red-500">Fehler beim Laden der Challenges.</p>';
    }
}

/** Challenge-Card-Element erstellen */
function createChallengeCard(challenge, subgroupNamesMap, isExpired) {
    const card = document.createElement('div');
    card.className = 'p-4 border rounded-lg bg-gray-50';
    const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);

    let subgroupBadge = '';
    if (!challenge.subgroupId || challenge.subgroupId === 'all') {
        subgroupBadge =
            '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Alle (Gesamtverein)</span>';
    } else if (subgroupNamesMap[challenge.subgroupId]) {
        subgroupBadge = `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">${subgroupNamesMap[challenge.subgroupId]}</span>`;
    }

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

/** Challenges für Dropdown laden (Punktevergabe) */
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
                unit: c.unit,
                subgroupId: c.subgroup_id,
                tieredPoints: c.tiered_points,
                partnerSystem: c.partner_system,
                createdAt: c.created_at
            }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                return expiresAt > now;
            });

        if (currentSubgroupFilter !== 'all') {
            activeChallenges = activeChallenges.filter(
                challenge =>
                    challenge.subgroupId === currentSubgroupFilter ||
                    !challenge.subgroupId  // null = Alle (Gesamtverein)
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
            option.dataset.unit = challenge.unit || 'Wiederholungen';

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(challenge.tieredPoints.milestones);
            }

            const hasPartnerSystem = challenge.partnerSystem?.enabled || false;
            option.dataset.hasPartnerSystem = hasPartnerSystem;
            if (hasPartnerSystem) {
                option.dataset.partnerPercentage = challenge.partnerSystem.partnerPercentage || 50;
            }

            select.appendChild(option);
        });

        subscribeToChallenge(clubId, () => {
            loadChallengesForDropdown(clubId, currentSubgroupFilter);
        });

    } catch (error) {
        console.error('[Challenges] Error loading challenges for dropdown:', error);
        select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

/** Abgelaufene Challenges laden */
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
                return expiresAt <= now || challenge.isActive === false;
            });

        if (expiredChallenges.length === 0) {
            expiredChallengesList.innerHTML =
                '<p class="text-gray-500">Keine abgelaufenen Challenges gefunden.</p>';
            return;
        }

        const subgroupIds = [...new Set(expiredChallenges.map(c => c.subgroupId).filter(id => id))];
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

/** Challenge reaktivieren mit neuer Dauer und Subgruppe */
export async function reactivateChallenge(challengeId, duration, subgroupId) {
    try {
        const { error } = await supabase
            .from('challenges')
            .update({
                created_at: new Date().toISOString(),
                type: duration,
                subgroup_id: subgroupId === 'all' ? null : subgroupId,
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

/** Challenge vorzeitig beenden */
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

/** Challenge dauerhaft löschen */
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

/** Alle Countdown-Timer aktualisieren */
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

/** Subgruppen-Dropdown mit Daten füllen */
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

        // "Alle"-Option muss erhalten bleiben für Gesamtverein
        const currentValue = select.value;
        select.innerHTML = '<option value="all">Alle (Gesamtverein)</option>';

        (data || []).forEach(subgroup => {
            const option = document.createElement('option');
            option.value = subgroup.id;
            option.textContent = subgroup.name;
            select.appendChild(option);
        });

        // Vorherige Auswahl wiederherstellen falls noch vorhanden
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

/** Echtzeit-Updates für Challenges abonnieren */
function subscribeToChallenge(clubId, callback) {
    // Doppelte Subscriptions vermeiden um Mehrfach-Updates zu verhindern
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

/** Alle Challenge-Subscriptions beenden */
export function unsubscribeFromChallenges() {
    challengeSubscriptions.forEach(channel => {
        supabase.removeChannel(channel);
    });
    challengeSubscriptions = [];
}

/** Countdown-Aktualisierung starten */
export function startCountdownInterval() {
    setInterval(updateAllCountdowns, 1000);
}
