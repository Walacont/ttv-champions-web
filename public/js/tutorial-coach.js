/**
 * Coach Tutorial - Spezifische Tutorial-Steps für Coaches
 */

/**
 * Helper: Tab wechseln und warten
 */
function switchToTab(tabName) {
    return new Promise((resolve) => {
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabButton) {
            tabButton.click();
            // Kurz warten bis Tab-Inhalt geladen ist
            setTimeout(resolve, 400);
        } else {
            resolve();
        }
    });
}

/**
 * Helper: Modal öffnen und warten
 */
function openModal(buttonSelector, modalSelector) {
    return new Promise((resolve) => {
        const button = document.querySelector(buttonSelector);
        if (button) {
            button.click();
            // Warten bis Modal sichtbar ist
            setTimeout(resolve, 400);
        } else {
            resolve();
        }
    });
}

/**
 * Helper: Modal schließen
 */
function closeModal(closeButtonSelector) {
    const closeButton = document.querySelector(closeButtonSelector);
    if (closeButton) {
        closeButton.click();
    }
}

/**
 * Helper: Alle Demo-Daten entfernen
 */
function removeDemoData() {
    const demoElements = document.querySelectorAll('[data-tutorial-demo="true"]');
    demoElements.forEach(el => el.remove());
}

/**
 * Helper: Demo Wettkampf-Anfrage erstellen
 */
function createDemoMatchRequest() {
    const container = document.getElementById('coach-pending-requests-list');
    if (!container) return;

    // Bestehende "Keine Anfragen" Nachricht entfernen
    const noRequests = container.querySelector('p.text-gray-500');
    if (noRequests) noRequests.style.display = 'none';

    const demoRequest = document.createElement('div');
    demoRequest.setAttribute('data-tutorial-demo', 'true');
    demoRequest.className = 'bg-white p-4 rounded-lg border-2 border-orange-300 shadow-sm';
    demoRequest.innerHTML = `
        <div class="flex items-start justify-between">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-sm font-semibold text-gray-900">Demo Spieler A</span>
                    <span class="text-gray-400">vs</span>
                    <span class="text-sm font-semibold text-gray-900">Demo Spieler B</span>
                    <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Einzel</span>
                </div>
                <p class="text-sm text-gray-600 mb-2">Ergebnis: 3:1 (11:9, 11:7, 9:11, 11:5)</p>
                <p class="text-xs text-gray-500">⏱️ Vor 5 Minuten</p>
            </div>
            <div class="flex gap-2 ml-4">
                <button class="bg-green-600 text-white px-3 py-1 rounded text-sm" disabled>✓ Genehmigen</button>
                <button class="bg-red-600 text-white px-3 py-1 rounded text-sm" disabled>✗ Ablehnen</button>
            </div>
        </div>
        <div class="mt-2 bg-yellow-50 border-l-4 border-yellow-400 p-2 text-xs">
            <strong>Tutorial-Demo:</strong> So sieht eine Wettkampf-Anfrage aus
        </div>
    `;
    container.insertBefore(demoRequest, container.firstChild);
}

/**
 * Helper: Demo Spieler erstellen
 */
function createDemoPlayers() {
    const container = document.getElementById('modal-player-list');
    if (!container) return;

    const demoPlayers = [
        { name: 'Max Mustermann', elo: '1650', status: 'Online', competitive: true },
        { name: 'Anna Schmidt', elo: '1580', status: 'Offline', competitive: true },
        { name: 'Tom Weber', elo: '1420', status: 'Online', competitive: false }
    ];

    demoPlayers.forEach(player => {
        const playerEl = document.createElement('div');
        playerEl.setAttribute('data-tutorial-demo', 'true');
        playerEl.className = 'p-4 hover:bg-gray-50 cursor-pointer border-b';
        playerEl.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                        ${player.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <p class="font-semibold text-gray-900">${player.name}</p>
                        <p class="text-sm text-gray-500">ELO: ${player.elo} ${player.competitive ? '• Wettkampfbereit' : '• Nicht wettkampfbereit'}</p>
                    </div>
                </div>
                <span class="text-xs px-2 py-1 rounded ${player.status === 'Online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}">
                    ${player.status}
                </span>
            </div>
        `;
        container.appendChild(playerEl);
    });
}

/**
 * Helper: Demo Rangliste erstellen
 */
function createDemoLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    const demoRankings = [
        { rank: 1, name: 'Lisa Müller', elo: 1850, change: '+25' },
        { rank: 2, name: 'Max Mustermann', elo: 1650, change: '+12' },
        { rank: 3, name: 'Anna Schmidt', elo: 1580, change: '-8' },
        { rank: 4, name: 'Tom Weber', elo: 1420, change: '+5' }
    ];

    demoRankings.forEach(player => {
        const rankEl = document.createElement('div');
        rankEl.setAttribute('data-tutorial-demo', 'true');
        rankEl.className = 'flex items-center justify-between p-3 bg-white rounded-lg border hover:shadow-md transition';
        rankEl.innerHTML = `
            <div class="flex items-center gap-4">
                <span class="text-2xl font-bold text-gray-400">#${player.rank}</span>
                <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                    ${player.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                    <p class="font-semibold text-gray-900">${player.name}</p>
                    <p class="text-sm text-gray-500">ELO: ${player.elo}</p>
                </div>
            </div>
            <span class="text-sm font-semibold ${player.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}">
                ${player.change}
            </span>
        `;
        container.appendChild(rankEl);
    });
}

/**
 * Helper: Demo Untergruppe erstellen
 */
function createDemoSubgroup() {
    const container = document.getElementById('subgroups-list');
    if (!container) return;

    const demoSubgroup = document.createElement('div');
    demoSubgroup.setAttribute('data-tutorial-demo', 'true');
    demoSubgroup.className = 'bg-white p-6 rounded-xl border-2 border-indigo-200 shadow-sm';
    demoSubgroup.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <h3 class="text-xl font-bold text-gray-900">Demo Jugend-Gruppe</h3>
                <p class="text-sm text-gray-500 mt-1">Spieler unter 18 Jahren</p>
            </div>
            <div class="flex gap-2">
                <button class="text-indigo-600 hover:text-indigo-800" disabled>
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-600 hover:text-red-800" disabled>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="flex items-center gap-4 text-sm">
            <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full">
                <i class="fas fa-users mr-1"></i> 8 Spieler
            </span>
            <span class="text-gray-600">
                <i class="fas fa-chart-line mr-1"></i> Ø ELO: 1450
            </span>
        </div>
        <div class="mt-3 bg-yellow-50 border-l-4 border-yellow-400 p-2 text-xs">
            <strong>Tutorial-Demo:</strong> Beispiel einer Untergruppe
        </div>
    `;
    container.insertBefore(demoSubgroup, container.firstChild);
}

/**
 * Coach Tutorial Steps
 */
export const coachTutorialSteps = [
    // 1. Willkommen
    {
        element: 'body',
        title: '👋 Willkommen beim Coach-Tutorial!',
        description: 'In den nächsten Schritten zeigen wir dir alle wichtigen Funktionen für Coaches. Du kannst das Tutorial jederzeit überspringen und später in den Einstellungen neu starten.',
        category: 'Einführung',
        position: 'auto',
        noSpotlight: true // Kein Spotlight-Effekt beim Willkommens-Screen
    },

    // === GRUNDLAGEN ===

    // 2. Statistik-Seite
    {
        element: '[data-tab="statistics"]',
        title: 'Statistik-Übersicht',
        description: 'Hier findest du alle wichtigen Statistiken deines Teams. Besonders wichtig: Hier siehst du eingehende Anfragen von Spielern, die wettkämpfe melden möchten.',
        category: 'Grundlagen',
        position: 'bottom',
        action: async () => {
            await switchToTab('statistics');
        }
    },

    // 3. Anfragen-Bereich
    {
        element: '#coach-pending-requests-list',
        title: 'Anfragen verwalten',
        description: 'In diesem Bereich werden alle Wettkampf-Anfragen von Spielern angezeigt, die auf deine Genehmigung warten. Du kannst diese annehmen oder ablehnen.',
        category: 'Grundlagen',
        position: 'auto',
        action: async () => {
            await switchToTab('statistics');
            createDemoMatchRequest();
        },
        onNext: () => {
            removeDemoData();
        }
    },

    // 4. Spieler verwalten Button
    {
        element: '#open-player-modal-button',
        title: 'Spieler verwalten',
        description: 'Mit diesem Button öffnest du die Spielerverwaltung. Lass uns das Modal öffnen...',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // 5. Spieler verwalten Modal
    {
        element: '#modal-player-list',
        title: 'Spielerverwaltung',
        description: 'Hier siehst du alle Spieler deines Teams. Du kannst Spieler bearbeiten, löschen oder von Offline zu Online konvertieren. Klicke auf einen Spieler um Details zu sehen.',
        category: 'Grundlagen',
        position: 'right',
        action: async () => {
            await openModal('#open-player-modal-button', '#player-list-modal');
            // Kurz warten damit Modal sichtbar ist
            setTimeout(() => createDemoPlayers(), 200);
        },
        onNext: () => {
            removeDemoData();
            closeModal('#close-player-modal-button');
        }
    },

    // 6. Offline-Spieler Button
    {
        element: '#add-offline-player-button',
        title: 'Offline-Spieler erstellen',
        description: 'Hier kannst du Offline-Spieler anlegen. Lass uns das Formular anschauen...',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // 7. Offline-Spieler Formular
    {
        element: '#add-offline-player-form',
        title: 'Offline-Spieler Formular',
        description: 'Hier gibst du die Daten des Offline-Spielers ein. Wichtig: Mit der Checkbox "Wettkampfbereit" legst du fest, ob der Spieler in offiziellen Wettkämpfen antreten kann und in der Rangliste erscheint.',
        category: 'Grundlagen',
        position: 'auto',
        action: async () => {
            await openModal('#add-offline-player-button', '#add-offline-player-modal');
        },
        onNext: () => {
            closeModal('#close-add-player-modal-button');
        }
    },

    // 8. Einladungs-Code Button
    {
        element: '#manage-invitation-codes-button',
        title: 'Einladungs-Codes',
        description: 'Hier verwaltest du Einladungs-Codes. Lass uns das Modal öffnen...',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // 9. Einladungs-Codes Modal
    {
        element: '#invitation-codes-modal',
        title: 'Einladungs-Codes verwalten',
        description: 'Spieler benötigen einen Code, um sich zu registrieren und deinem Team beizutreten. Hier kannst du neue Codes erstellen, bestehende anzeigen oder deaktivieren.',
        category: 'Grundlagen',
        position: 'auto',
        action: async () => {
            await openModal('#manage-invitation-codes-button', '#invitation-codes-modal');
        },
        onNext: () => {
            closeModal('#close-invitation-codes-modal-button');
        }
    },

    // === VERWALTUNG ===

    // 8. Rangliste Tab
    {
        element: '[data-tab="dashboard"]',
        title: 'Rangliste',
        description: 'Die Rangliste zeigt das ELO-Ranking aller wettkampfbereiten Spieler. Sie wird automatisch nach jedem Wettkampf aktualisiert.',
        category: 'Verwaltung',
        position: 'bottom',
        action: async () => {
            await switchToTab('dashboard');
            setTimeout(() => createDemoLeaderboard(), 200);
        },
        onNext: () => {
            removeDemoData();
        }
    },

    // 11. Untergruppen-Filter
    {
        element: '#subgroup-filter',
        title: 'Ansicht nach Untergruppen',
        description: 'Oben bei "Ansicht" kannst du die Rangliste nach Untergruppen filtern (z.B. Jugend, Herren, Damen). So siehst du separate Rankings für jede Gruppe.',
        category: 'Verwaltung',
        position: 'bottom',
        action: async () => {
            await switchToTab('dashboard');
        }
    },

    // === TRAINING & WETTKAMPF ===

    // 12. Anwesenheit Tab
    {
        element: '[data-tab="attendance"]',
        title: 'Anwesenheit & Kalender',
        description: 'Hier trägst du die Anwesenheit beim Training ein. Der Kalender zeigt alle Trainingstage und -zeiten. Spieler können auch selbst ihre Anwesenheit markieren.',
        category: 'Training & Wettkampf',
        position: 'bottom',
        action: async () => {
            await switchToTab('attendance');
        }
    },

    // 13. Paarungen erstellen
    {
        element: '#generate-pairings-button',
        title: 'Paarungen erstellen',
        description: 'Mit "Paarungen erstellen" werden automatisch Wettkampf-Paarungen basierend auf den anwesenden Spielern generiert. Perfekter Übergang zum Wettkampf-Tab!',
        category: 'Training & Wettkampf',
        position: 'auto',
        action: async () => {
            await switchToTab('attendance');
        }
    },

    // 14. Wettkampf Tab
    {
        element: '[data-tab="matches"]',
        title: 'Wettkampf-Verwaltung',
        description: 'Im Wettkampf-Tab trägst du Spiel-Ergebnisse ein. Du kannst neue Wettkämpfe erstellen, Ergebnisse nachtragen und die Historie einsehen.',
        category: 'Training & Wettkampf',
        position: 'bottom',
        action: async () => {
            await switchToTab('matches');
        }
    },

    // 15. Wettkampf eintragen
    {
        element: '#match-form',
        title: 'Wettkampf eintragen',
        description: 'Hier erstellst du neue Wettkämpfe. Wähle zwei Spieler aus, trage das Ergebnis ein und das System berechnet automatisch ELO-Änderungen und XP-Punkte.',
        category: 'Training & Wettkampf',
        position: 'auto',
        action: async () => {
            await switchToTab('matches');
        }
    },

    // === GAMIFICATION ===

    // 16. Punkte vergeben Tab
    {
        element: '[data-tab="points"]',
        title: 'Punkte vergeben',
        description: 'Hier kannst du manuell XP-Punkte an Spieler vergeben - z.B. für besondere Leistungen, Training mit Partner oder andere Aktivitäten.',
        category: 'Gamification',
        position: 'bottom',
        action: async () => {
            await switchToTab('points');
        }
    },

    // 17. Punktetypen
    {
        element: '#reason-select',
        title: 'Verschiedene Punktetypen',
        description: 'Es gibt verschiedene Punktetypen: Training, Wettkampf, Challenge, Trainingspartner und mehr. Jeder Typ hat unterschiedliche XP-Werte und wird separat in der Statistik angezeigt.',
        category: 'Gamification',
        position: 'auto',
        action: async () => {
            await switchToTab('points');
        }
    },

    // 18. Challenges Tab
    {
        element: '[data-tab="challenges"]',
        title: 'Challenges',
        description: 'Challenges sind zeitlich begrenzte Herausforderungen für deine Spieler. Du kannst tägliche, wöchentliche oder monatliche Challenges erstellen (z.B. "10 Trainings in diesem Monat").',
        category: 'Gamification',
        position: 'bottom',
        action: async () => {
            await switchToTab('challenges');
        }
    },

    // 19. Challenge erstellen
    {
        element: '#create-challenge-form',
        title: 'Challenge erstellen',
        description: 'Beim Erstellen einer Challenge legst du Titel, Beschreibung, Ziel-Wert, XP-Belohnung und Zeitraum fest. Spieler sehen ihre Challenges in der App und können den Fortschritt verfolgen.',
        category: 'Gamification',
        position: 'auto',
        action: async () => {
            await switchToTab('challenges');
        }
    },

    // 20. Übungen Tab
    {
        element: '[data-tab="exercises"]',
        title: 'Übungen',
        description: 'Im Übungen-Tab kannst du Trainingsübungen erstellen und verwalten. Diese können später von Spielern abgerufen werden.',
        category: 'Gamification',
        position: 'bottom',
        action: async () => {
            await switchToTab('exercises');
        }
    },

    // === ORGANISATION ===

    // 21. Untergruppen Tab
    {
        element: '[data-tab="subgroups"]',
        title: 'Untergruppen verwalten',
        description: 'Untergruppen helfen dir, dein Team zu organisieren (z.B. Jugend, Herren, Damen, Anfänger, Fortgeschrittene). Jede Gruppe kann separate Ranglisten und Statistiken haben.',
        category: 'Organisation',
        position: 'bottom',
        action: async () => {
            await switchToTab('subgroups');
            setTimeout(() => createDemoSubgroup(), 200);
        },
        onNext: () => {
            removeDemoData();
        }
    },

    // 22. Untergruppe erstellen
    {
        element: '#create-subgroup-form',
        title: 'Untergruppe erstellen',
        description: 'Erstelle neue Untergruppen, weise Spieler zu und nutze die Filter-Funktionen, um spezifische Ansichten zu erhalten.',
        category: 'Organisation',
        position: 'auto',
        action: async () => {
            await switchToTab('subgroups');
        }
    },

    // Abschluss
    {
        element: 'body',
        title: '🎉 Tutorial abgeschlossen!',
        description: 'Du kennst jetzt alle wichtigen Funktionen für Coaches! Falls du etwas vergessen hast, kannst du das Tutorial jederzeit in den Einstellungen neu starten. Viel Erfolg mit deinem Team!',
        category: 'Abschluss',
        position: 'auto',
        noSpotlight: true
    }
];

export default coachTutorialSteps;
