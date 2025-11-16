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
        }
    },

    // 4. Spieler verwalten Button
    {
        element: '#open-player-modal-button',
        title: 'Spieler verwalten',
        description: 'Mit diesem Button öffnest du die Spielerverwaltung. Hier siehst du alle Spieler und kannst sie bearbeiten, löschen oder von Offline zu Online konvertieren.',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // 5. Offline-Spieler Button
    {
        element: '#add-offline-player-button',
        title: 'Offline-Spieler erstellen',
        description: 'Hier kannst du Offline-Spieler anlegen. Diese haben keinen App-Zugang, können aber trotzdem in Wettkämpfen, Ranglisten und Statistiken erfasst werden. Wichtig: Nur "wettkampfbereite" Spieler erscheinen in der Rangliste.',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // 6. Einladungs-Code
    {
        element: '#manage-invitation-codes-button',
        title: 'Einladungs-Codes',
        description: 'Hier verwaltest du Einladungs-Codes. Spieler benötigen einen Code, um sich zu registrieren und deinem Team beizutreten. Du kannst Codes erstellen, anzeigen und deaktivieren.',
        category: 'Grundlagen',
        position: 'bottom'
    },

    // === VERWALTUNG ===

    // 8. Spieler verwalten
    {
        element: '#player-list',
        title: 'Spieler verwalten',
        description: 'In der Spielerliste kannst du auf einen Spieler klicken, um Details zu sehen. Du kannst Spieler bearbeiten, löschen oder von Offline zu Online konvertieren.',
        category: 'Verwaltung',
        position: 'right'
    },

    // 9. Offline → Online
    {
        element: '#player-details-container',
        title: 'Offline zu Online konvertieren',
        description: 'Wenn du einen Offline-Spieler ausgewählt hast, siehst du die Option "Zu Online-Spieler konvertieren". Damit erhält der Spieler Zugang zur App und kann sich dann selbst einloggen.',
        category: 'Verwaltung',
        position: 'left'
    },

    // 10. Rangliste Tab
    {
        element: '[data-tab="dashboard"]',
        title: 'Rangliste',
        description: 'Die Rangliste zeigt das ELO-Ranking aller wettkampfbereiten Spieler. Sie wird automatisch nach jedem Wettkampf aktualisiert.',
        category: 'Verwaltung',
        position: 'bottom',
        action: async () => {
            await switchToTab('dashboard');
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

    // 23. Abschluss
    {
        element: '#main-content',
        title: '🎉 Tutorial abgeschlossen!',
        description: 'Du kennst jetzt alle wichtigen Funktionen für Coaches! Falls du etwas vergessen hast, kannst du das Tutorial jederzeit in den Einstellungen neu starten. Viel Erfolg mit deinem Team!',
        category: 'Abschluss',
        position: 'auto'
    }
];

export default coachTutorialSteps;
