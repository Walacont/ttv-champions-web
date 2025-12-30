// Challenges-Modul (Firebase-Version)

import {
    collection,
    query,
    where,
    orderBy,
    addDoc,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    doc,
    getDoc,
    deleteDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { getChallengePartnerSettings } from './milestone-management.js';
import { formatDate } from './ui-utils.js';

/** Verarbeitet das Challenge-Erstellungsformular */
export async function handleCreateChallenge(e, db, currentUserData) {
    e.preventDefault();
    const feedbackEl = document.getElementById('challenge-feedback');
    const title = document.getElementById('challenge-title').value;
    const type = document.getElementById('challenge-type').value;
    const description = document.getElementById('challenge-description').value;
    const subgroupId = document.getElementById('challenge-subgroup').value;
    const isRepeatable = document.getElementById('challenge-repeatable').checked;

    const milestonesEnabled =
        document.getElementById('challenge-milestones-enabled')?.checked || false;
    let points = 0;
    let milestones = null;

    if (milestonesEnabled) {
        milestones = getChallengeMilestones();
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufügen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('challenge-points').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gültige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
    }

    feedbackEl.textContent = '';
    if (!title || !type || !subgroupId) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    try {
        const challengeData = {
            title,
            type,
            description,
            points,
            clubId: currentUserData.clubId,
            subgroupId: subgroupId,
            isActive: true,
            isRepeatable: isRepeatable,
            createdAt: serverTimestamp(),
            lastReactivatedAt: serverTimestamp(),
        };

        if (milestonesEnabled && milestones) {
            challengeData.tieredPoints = {
                enabled: true,
                milestones: milestones,
            };
        } else {
            challengeData.tieredPoints = {
                enabled: false,
                milestones: [],
            };
        }

        const partnerSettings = getChallengePartnerSettings();
        if (partnerSettings) {
            challengeData.partnerSystem = {
                enabled: true,
                partnerPercentage: partnerSettings.partnerPercentage,
            };
        } else {
            challengeData.partnerSystem = {
                enabled: false,
                partnerPercentage: 50,
            };
        }

        await addDoc(collection(db, 'challenges'), challengeData);
        feedbackEl.textContent = 'Challenge erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        document.getElementById('challenge-subgroup').value = 'all';
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

/** Richtet dynamische Punkteempfehlungen basierend auf Challenge-Typ ein */
export function setupChallengePointRecommendations() {
    const typeSelect = document.getElementById('challenge-type');
    const pointsRangeEl = document.getElementById('challenge-points-range');
    const durationTextEl = document.getElementById('challenge-duration-text');

    if (!typeSelect || !pointsRangeEl || !durationTextEl) return;

    const updateRecommendation = () => {
        const type = typeSelect.value;
        const recommendations = {
            daily: { range: '8-20 Punkte', text: 'tägliche' },
            weekly: { range: '20-50 Punkte', text: 'wöchentliche' },
            monthly: { range: '40-100 Punkte', text: 'monatliche' },
        };

        const rec = recommendations[type] || recommendations.daily;
        pointsRangeEl.textContent = rec.range;
        durationTextEl.textContent = rec.text;
    };

    typeSelect.addEventListener('change', updateRecommendation);
    updateRecommendation();
}

/** Richtet das Meilenstein-System für Challenges ein */
export function setupChallengeMilestones() {
    const milestonesEnabled = document.getElementById('challenge-milestones-enabled');
    const standardContainer = document.getElementById('challenge-standard-points-container');
    const milestonesContainer = document.getElementById('challenge-milestones-container');
    const pointsInput = document.getElementById('challenge-points');

    if (!milestonesEnabled || !standardContainer || !milestonesContainer) {
        return;
    }

    const updateUI = () => {
        if (milestonesEnabled.checked) {
            standardContainer.classList.add('hidden');
            milestonesContainer.classList.remove('hidden');
            if (pointsInput) pointsInput.removeAttribute('required');
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

/** Fügt eine neue Meilenstein-Eingabezeile hinzu */
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
        <span class="text-gray-600 text-xs whitespace-nowrap">× →</span>
        <input type="number"
               class="challenge-milestone-points w-16 px-2 py-1 border border-gray-300 rounded text-sm"
               placeholder="Punkte"
               min="1"
               required>
        <span class="text-gray-600 text-xs">P.</span>
        <button type="button" class="remove-challenge-milestone text-red-600 hover:text-red-800 px-1 text-sm flex-shrink-0">
            🗑️
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

/** Holt alle Meilensteine aus dem Formular */
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

/** Aktualisiert die Gesamtpunkteanzeige für Meilensteine */
function updateChallengeTotalPoints() {
    const milestones = getChallengeMilestones();
    const total = milestones.reduce((sum, m) => sum + m.points, 0);
    const totalEl = document.getElementById('challenge-total-milestone-points');
    if (totalEl) {
        totalEl.textContent = total;
    }
}

/** Lädt und zeigt aktive Challenges für den Verein */
export function loadActiveChallenges(clubId, db, currentSubgroupFilter = 'all') {
    const activeChallengesList = document.getElementById('active-challenges-list');
    if (!activeChallengesList) return;
    const q = query(
        collection(db, 'challenges'),
        where('clubId', '==', clubId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
    );
    onSnapshot(
        q,
        async snapshot => {
            activeChallengesList.innerHTML = '';
            const now = new Date();
            let challenges = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(challenge => calculateExpiry(challenge.createdAt, challenge.type) > now);

            if (currentSubgroupFilter !== 'all') {
                challenges = challenges.filter(
                    challenge =>
                        challenge.subgroupId === currentSubgroupFilter ||
                        challenge.subgroupId === 'all'
                );
            }

            if (challenges.length === 0) {
                activeChallengesList.innerHTML =
                    '<p class="text-gray-500">Keine aktiven Challenges für diese Ansicht gefunden.</p>';
                return;
            }

            // Load subgroup names for badges
            const subgroupNamesMap = {};
            for (const challenge of challenges) {
                if (
                    challenge.subgroupId &&
                    challenge.subgroupId !== 'all' &&
                    !subgroupNamesMap[challenge.subgroupId]
                ) {
                    try {
                        const subgroupDoc = await getDoc(
                            doc(db, 'subgroups', challenge.subgroupId)
                        );
                        if (subgroupDoc.exists()) {
                            subgroupNamesMap[challenge.subgroupId] = subgroupDoc.data().name;
                        }
                    } catch (error) {
                        console.error('Error loading subgroup name:', error);
                    }
                }
            }

            challenges.forEach(challenge => {
                const card = document.createElement('div');
                card.className = 'p-4 border rounded-lg bg-gray-50';
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);

                let subgroupBadge = '';
                if (challenge.subgroupId === 'all') {
                    subgroupBadge =
                        '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">🏠 Alle (Gesamtverein)</span>';
                } else if (challenge.subgroupId && subgroupNamesMap[challenge.subgroupId]) {
                    subgroupBadge = `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">👥 ${subgroupNamesMap[challenge.subgroupId]}</span>`;
                }

                // Determine repeatable badge
                const isRepeatable =
                    challenge.isRepeatable !== undefined ? challenge.isRepeatable : true;
                const repeatableBadge = isRepeatable
                    ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">🔄 Mehrfach</span>'
                    : '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">1️⃣ Einmalig</span>';

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
                        🛑 Beenden
                    </button>
                </div>
            `;
                activeChallengesList.appendChild(card);
            });
            updateAllCountdowns();
        },
        error => {
            console.error('Fehler beim Laden der aktiven Challenges:', error);
            activeChallengesList.innerHTML =
                '<p class="text-red-500">Fehler beim Laden der Challenges. Möglicherweise wird ein Index benötigt.</p>';
        }
    );
}

/** Lädt Challenges für Dropdown-Auswahl (für Punktevergabe) */
export function loadChallengesForDropdown(clubId, db, currentSubgroupFilter = 'all') {
    const select = document.getElementById('challenge-select');
    if (!select) return;
    const q = query(
        collection(db, 'challenges'),
        where('clubId', '==', clubId),
        where('isActive', '==', true)
    );
    onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            select.innerHTML = '<option value="">Keine aktiven Challenges</option>';
            return;
        }
        select.innerHTML = '<option value="">Challenge wählen...</option>';

        const now = new Date();
        let activeChallenges = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(challenge => {
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                return expiresAt > now;
            });

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
    });
}

/** Berechnet das Ablaufdatum einer Challenge basierend auf Typ */
export function calculateExpiry(createdAt, type) {
    if (!createdAt || !createdAt.toDate) return new Date();
    const startDate = createdAt.toDate();
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

/** Lädt abgelaufene Challenges für den Verein */
export function loadExpiredChallenges(clubId, db) {
    const expiredChallengesList = document.getElementById('expired-challenges-list');
    if (!expiredChallengesList) return;

    const q = query(
        collection(db, 'challenges'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'desc')
    );
    onSnapshot(
        q,
        async snapshot => {
            expiredChallengesList.innerHTML = '';
            const now = new Date();

            const expiredChallenges = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(challenge => {
                    const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                    return expiresAt <= now || challenge.isActive === false;
                });

            if (expiredChallenges.length === 0) {
                expiredChallengesList.innerHTML =
                    '<p class="text-gray-500">Keine abgelaufenen Challenges gefunden.</p>';
                return;
            }

            const subgroupNamesMap = {};
            for (const challenge of expiredChallenges) {
                if (
                    challenge.subgroupId &&
                    challenge.subgroupId !== 'all' &&
                    !subgroupNamesMap[challenge.subgroupId]
                ) {
                    try {
                        const subgroupDoc = await getDoc(
                            doc(db, 'subgroups', challenge.subgroupId)
                        );
                        if (subgroupDoc.exists()) {
                            subgroupNamesMap[challenge.subgroupId] = subgroupDoc.data().name;
                        }
                    } catch (error) {
                        console.error('Error loading subgroup name:', error);
                    }
                }
            }

            expiredChallenges.forEach(challenge => {
                const card = document.createElement('div');
                card.className = 'p-4 border rounded-lg bg-gray-50';
                const expiresAt = calculateExpiry(challenge.createdAt, challenge.type);
                const wasManuallyEnded = challenge.isActive === false;

                let subgroupBadge = '';
                if (challenge.subgroupId === 'all') {
                    subgroupBadge =
                        '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">🏠 Alle (Gesamtverein)</span>';
                } else if (challenge.subgroupId && subgroupNamesMap[challenge.subgroupId]) {
                    subgroupBadge = `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">👥 ${subgroupNamesMap[challenge.subgroupId]}</span>`;
                }

                // Determine repeatable badge
                const isRepeatable =
                    challenge.isRepeatable !== undefined ? challenge.isRepeatable : true;
                const repeatableBadge = isRepeatable
                    ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">🔄 Mehrfach</span>'
                    : '<span class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">1️⃣ Einmalig</span>';

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
                        🔄 Reaktivieren
                    </button>
                    <button onclick="confirmDeleteChallenge('${challenge.id}', '${challenge.title}')"
                            class="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-3 rounded">
                        🗑️ Löschen
                    </button>
                </div>
            `;
                expiredChallengesList.appendChild(card);
            });
        },
        error => {
            console.error('Fehler beim Laden der abgelaufenen Challenges:', error);
            expiredChallengesList.innerHTML = '<p class="text-red-500">Fehler beim Laden.</p>';
        }
    );
}

/** Reaktiviert eine Challenge mit neuer Dauer und Untergruppe */
export async function reactivateChallenge(challengeId, duration, subgroupId, db) {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await updateDoc(challengeRef, {
            createdAt: serverTimestamp(),
            type: duration,
            subgroupId: subgroupId,
            isActive: true,
            lastReactivatedAt: serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        console.error('Error reactivating challenge:', error);
        return { success: false, error: error.message };
    }
}

/** Beendet eine Challenge vorzeitig */
export async function endChallenge(challengeId, db) {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await updateDoc(challengeRef, {
            isActive: false,
        });
        return { success: true };
    } catch (error) {
        console.error('Error ending challenge:', error);
        return { success: false, error: error.message };
    }
}

/** Löscht eine Challenge permanent */
export async function deleteChallenge(challengeId, db) {
    try {
        const challengeRef = doc(db, 'challenges', challengeId);
        await deleteDoc(challengeRef);
        return { success: true };
    } catch (error) {
        console.error('Error deleting challenge:', error);
        return { success: false, error: error.message };
    }
}

/** Aktualisiert alle Countdown-Timer auf der Seite */
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

/** Befüllt ein Untergruppen-Dropdown mit Untergruppen des Vereins */
export function populateSubgroupDropdown(clubId, selectId, db) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc')
    );

    onSnapshot(
        q,
        snapshot => {
            const currentValue = select.value;
            select.innerHTML = '<option value="all">Alle (Gesamtverein)</option>';

            snapshot.forEach(doc => {
                const subgroup = doc.data();
                if (subgroup.isDefault) {
                    return;
                }
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = subgroup.name;
                select.appendChild(option);
            });

            if (
                currentValue &&
                Array.from(select.options).some(opt => opt.value === currentValue)
            ) {
                select.value = currentValue;
            }
        },
        error => {
            console.error('Error loading subgroups for dropdown:', error);
        }
    );
}
