import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Matches Module
 * Handles match pairings, handicap calculation, and match result reporting
 */

/**
 * Calculates handicap points based on ELO rating difference
 * @param {Object} playerA - First player object with eloRating
 * @param {Object} playerB - Second player object with eloRating
 * @returns {Object|null} Handicap object with player and points, or null if no handicap needed
 */
export function calculateHandicap(playerA, playerB) {
    const eloA = playerA.eloRating || 0;
    const eloB = playerB.eloRating || 0;
    const eloDiff = Math.abs(eloA - eloB);

    if (eloDiff < 25) {
        return null;
    }

    let handicapPoints = Math.round(eloDiff / 50);

    if (handicapPoints > 10) {
        handicapPoints = 10;
    }

    if (handicapPoints < 1) {
        return null;
    }

    const weakerPlayer = eloA < eloB ? playerA : playerB;
    return {
        player: weakerPlayer,
        points: handicapPoints
    };
}

/**
 * Generates match pairings from present and match-ready players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function handleGeneratePairings(clubPlayers, currentSubgroupFilter = 'all') {
    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    let matchReadyAndPresentPlayers = clubPlayers.filter(player => presentPlayerIds.includes(player.id) && player.isMatchReady);

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        matchReadyAndPresentPlayers = matchReadyAndPresentPlayers.filter(player =>
            player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
    }

    matchReadyAndPresentPlayers.sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

    const pairingsByGroup = {};
    const groupSize = 4;

    for (let i = 0; i < matchReadyAndPresentPlayers.length; i += groupSize) {
        const groupNumber = Math.floor(i / groupSize) + 1;
        pairingsByGroup[`Gruppe ${groupNumber}`] = matchReadyAndPresentPlayers.slice(i, i + groupSize);
    }

    const finalPairings = {};
    let leftoverPlayer = null;

    for (const groupName in pairingsByGroup) {
        let playersInGroup = pairingsByGroup[groupName];
        for (let i = playersInGroup.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playersInGroup[i], playersInGroup[j]] = [playersInGroup[j], playersInGroup[i]];
        }
        finalPairings[groupName] = [];
        for (let i = 0; i < playersInGroup.length - 1; i += 2) {
            finalPairings[groupName].push([playersInGroup[i], playersInGroup[i + 1]]);
        }
        if (playersInGroup.length % 2 !== 0) {
            leftoverPlayer = playersInGroup[playersInGroup.length - 1];
        }
    }
    renderPairingsInModal(finalPairings, leftoverPlayer);
}

/**
 * Renders generated pairings in the modal
 * @param {Object} pairings - Object containing groups and their pairings
 * @param {Object|null} leftoverPlayer - Player without a match, if any
 */
export function renderPairingsInModal(pairings, leftoverPlayer) {
    const modal = document.getElementById('pairings-modal');
    const container = document.getElementById('modal-pairings-content');
    container.innerHTML = '';

    const hasPairings = Object.values(pairings).some(group => group.length > 0);
    if (!hasPairings && !leftoverPlayer) {
        container.innerHTML = '<p class="text-center text-gray-500">Keine möglichen Paarungen gefunden.</p>';
        modal.classList.remove('hidden');
        return;
    }

    for (const groupName in pairings) {
        if (pairings[groupName].length === 0) continue;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-3';
        groupDiv.innerHTML = `<h5 class="font-bold text-gray-800 bg-gray-100 p-2 rounded-t-md">${groupName}</h5>`;
        const list = document.createElement('ul');
        list.className = 'space-y-2 p-2 border-l border-r border-b rounded-b-md';

        pairings[groupName].forEach(pair => {
            const [playerA, playerB] = pair;
            const handicap = calculateHandicap(playerA, playerB);
            let handicapHTML = '<p class="text-xs text-gray-400 mt-1">Kein Handicap</p>';
            if (handicap) {
                handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold"><i class="fas fa-balance-scale-right"></i> ${handicap.player.firstName} startet mit <strong>${handicap.points}</strong> Pkt. Vorsprung.</p>`;
            }
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-3 bg-white rounded shadow-sm border';
            listItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold text-indigo-700">${playerA.firstName} ${playerA.lastName}</span>
                        <span class="text-gray-500 mx-2">vs.</span>
                        <span class="font-bold text-indigo-700">${playerB.firstName} ${playerB.lastName}</span>
                    </div>
                    <div class="text-xs text-gray-400">(${Math.round(playerA.eloRating || 0)} vs ${Math.round(playerB.eloRating || 0)})</div>
                </div>
                ${handicapHTML}
            `;
            list.appendChild(listItem);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    }

    if (leftoverPlayer) {
        const leftoverEl = document.createElement('p');
        leftoverEl.className = 'text-sm text-center text-orange-600 bg-orange-100 p-2 rounded-md mt-4';
        leftoverEl.innerHTML = `<strong>${leftoverPlayer.firstName} ${leftoverPlayer.lastName}</strong> (sitzt diese Runde aus)`;
        container.appendChild(leftoverEl);
    }
    modal.classList.remove('hidden');
}

/**
 * Updates the state of the pairings button based on eligible players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function updatePairingsButtonState(clubPlayers, currentSubgroupFilter = 'all') {
    const pairingsButton = document.getElementById('generate-pairings-button');
    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    let eligiblePlayers = clubPlayers.filter(player => presentPlayerIds.includes(player.id) && player.isMatchReady);

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        eligiblePlayers = eligiblePlayers.filter(player =>
            player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
    }

    const eligiblePlayerCount = eligiblePlayers.length;

    if (eligiblePlayerCount >= 2) {
        pairingsButton.disabled = false;
        pairingsButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.add('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = '<i class="fas fa-random mr-2"></i> Paarungen erstellen';
    } else {
        pairingsButton.disabled = true;
        pairingsButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = `(${eligiblePlayerCount}/2 Spieler bereit)`;
    }
}

/**
 * Handles match result submission
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 * @param {Array} clubPlayers - Array of all club players
 */
export async function handleMatchSave(e, db, currentUserData, clubPlayers) {
    e.preventDefault();
    const feedbackEl = document.getElementById('match-feedback');
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const winnerId = document.getElementById('winner-select').value;
    const handicapUsed = document.getElementById('handicap-toggle').checked;

    if (!playerAId || !playerBId || !winnerId || playerAId === playerBId) {
        feedbackEl.textContent = 'Bitte zwei unterschiedliche Spieler und einen Gewinner auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const loserId = winnerId === playerAId ? playerBId : playerAId;
    feedbackEl.textContent = 'Speichere Match-Ergebnis...';

    try {
        await addDoc(collection(db, 'matches'), {
            playerAId,
            playerBId,
            winnerId,
            loserId,
            handicapUsed: handicapUsed,
            reportedBy: currentUserData.id,
            clubId: currentUserData.clubId,
            createdAt: serverTimestamp(),
            processed: false
        });
        feedbackEl.textContent = 'Match gemeldet! Punkte werden in Kürze aktualisiert.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
        updateMatchUI(clubPlayers);
    } catch (error) {
        console.error("Fehler beim Melden des Matches:", error);
        feedbackEl.textContent = 'Fehler: Das Match konnte nicht gemeldet werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

/**
 * Updates the match form UI based on selected players
 * @param {Array} clubPlayers - Array of all club players
 */
export function updateMatchUI(clubPlayers) {
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const winnerSelect = document.getElementById('winner-select');
    const handicapContainer = document.getElementById('handicap-suggestion');
    const handicapToggleContainer = document.getElementById('handicap-toggle-container');

    winnerSelect.innerHTML = '<option value="">Bitte Gewinner wählen...</option>';
    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (playerA) winnerSelect.innerHTML += `<option value="${playerA.id}">${playerA.firstName} ${playerA.lastName}</option>`;
    if (playerB) winnerSelect.innerHTML += `<option value="${playerB.id}">${playerB.firstName} ${playerB.lastName}</option>`;

    if (playerA && playerB && playerAId !== playerBId) {
        const handicap = calculateHandicap(playerA, playerB);

        if (handicap && handicap.points > 0) {
            document.getElementById('handicap-text').textContent = `${handicap.player.firstName} startet mit ${handicap.points} Punkten Vorsprung pro Satz.`;
            handicapContainer.classList.remove('hidden');
            handicapToggleContainer.classList.remove('hidden');
            handicapToggleContainer.classList.add('flex');
        } else {
            handicapContainer.classList.add('hidden');
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    } else {
        if(handicapContainer) handicapContainer.classList.add('hidden');
        if(handicapToggleContainer) {
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    }
}

/**
 * Populates match dropdowns with match-ready players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function populateMatchDropdowns(clubPlayers, currentSubgroupFilter = 'all') {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

    // Filter by match-ready status
    let matchReadyPlayers = clubPlayers.filter(p => p.isMatchReady === true);

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        matchReadyPlayers = matchReadyPlayers.filter(player =>
            player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
    }

    if (matchReadyPlayers.length < 2) {
         const handicapSuggestion = document.getElementById('handicap-suggestion');
         if(handicapSuggestion) {
            const message = currentSubgroupFilter !== 'all'
                ? '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler in dieser Untergruppe müssen Match-bereit sein.</p>'
                : '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler müssen Match-bereit sein.</p>';
            handicapSuggestion.innerHTML = message;
            handicapSuggestion.classList.remove('hidden');
         }
    }

    matchReadyPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName} (Elo: ${Math.round(player.eloRating || 0)})`;
        playerASelect.appendChild(option.cloneNode(true));
        playerBSelect.appendChild(option);
    });
}
