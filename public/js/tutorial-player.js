/**
 * Player Tutorial - Spezifische Tutorial-Steps für Spieler
 */

/**
 * Helper: Tab wechseln und warten
 */
function switchToTab(tabName) {
    return new Promise((resolve) => {
        const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (tabButton) {
            tabButton.click();
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
 * Player Tutorial Steps
 */
export const playerTutorialSteps = [
    // 1. Willkommen
    {
        element: 'body',
        title: '👋 Willkommen beim Spieler-Tutorial!',
        description: 'In den nächsten Schritten zeigen wir dir alle wichtigen Funktionen. Du kannst das Tutorial jederzeit überspringen und später in den Einstellungen neu starten.',
        category: 'Einführung',
        position: 'auto',
        noSpotlight: true
    },

    // === ANSICHTEN & FILTER ===

    // 2. Untergruppen-Filter
    {
        element: '#player-subgroup-filter',
        title: 'Ansicht wechseln',
        description: 'Hier kannst du zwischen verschiedenen Ansichten wechseln: Mein Verein (nur deine Vereinskollegen), Global (alle Spieler) oder spezifische Untergruppen (z.B. Jugend, Herren). Die Ansicht beeinflusst alle Ranglisten und Statistiken.',
        category: 'Ansichten & Filter',
        position: 'bottom'
    },

    // === RANGLISTEN ===

    // 3. Ranglisten Tab
    {
        element: '[data-tab="leaderboard"]',
        title: 'Ranglisten',
        description: 'Hier siehst du die ELO-Rankings. Du kannst zwischen verschiedenen Ranglisten wechseln und einzelne auch ausblenden.',
        category: 'Ranglisten',
        position: 'bottom',
        action: async () => {
            await switchToTab('leaderboard');
        }
    },

    // 4. Ranglisten-Toggles
    {
        element: '#leaderboard-toggles',
        title: 'Ranglisten ein-/ausschalten',
        description: 'Mit diesen Buttons kannst du einzelne Ranglisten ein- oder ausblenden. So siehst du nur die Rankings, die dich interessieren (z.B. nur ELO-Ranking ohne Saison-Punkte).',
        category: 'Ranglisten',
        position: 'auto',
        action: async () => {
            await switchToTab('leaderboard');
        }
    },

    // 5. Liga-Tabs
    {
        element: '#league-tabs',
        title: 'Zwischen Ranglisten wechseln',
        description: 'Hier kannst du zwischen verschiedenen Ranking-Typen wechseln: ELO-Ranking, Saison-Punkte oder XP-Level. Jede Rangliste zeigt einen anderen Aspekt deiner Leistung.',
        category: 'Ranglisten',
        position: 'auto',
        action: async () => {
            await switchToTab('leaderboard');
        }
    },

    // === WETTKAMPF ===

    // 6. Wettkampf Tab
    {
        element: '[data-tab="matches"]',
        title: 'Wettkampf',
        description: 'Im Wettkampf-Tab kannst du Match-Anfragen an andere Spieler senden und deine Match-Historie einsehen.',
        category: 'Wettkampf',
        position: 'bottom',
        action: async () => {
            await switchToTab('matches');
        }
    },

    // 7. Match-Anfrage senden
    {
        element: '#player-match-form',
        title: 'Match-Anfrage senden',
        description: 'Wähle einen Gegner, trage das Ergebnis ein und sende die Anfrage an deinen Coach. Der Coach genehmigt das Match und die Punkte werden automatisch berechnet.',
        category: 'Wettkampf',
        position: 'auto',
        action: async () => {
            await switchToTab('matches');
        }
    },

    // === ÜBERSICHT / STARTSEITE ===

    // 8. Übersicht Tab
    {
        element: '[data-tab="overview"]',
        title: 'Startseite / Übersicht',
        description: 'Die Übersicht zeigt deine wichtigsten Widgets: Aktuelle Challenges, deine Stats, Trainingsplan und mehr.',
        category: 'Startseite',
        position: 'bottom',
        action: async () => {
            await switchToTab('overview');
        }
    },

    // 9. Widget-Einstellungen
    {
        element: '#dashboard-settings-button',
        title: 'Startseite anpassen',
        description: 'Mit dem Zahnrad-Icon kannst du deine Startseite personalisieren: Widgets hinzufügen, entfernen, anordnen und Farben anpassen.',
        category: 'Startseite',
        position: 'left',
        action: async () => {
            await switchToTab('overview');
        }
    },

    // === ÜBUNGEN ===

    // 10. Übungen Tab
    {
        element: '[data-tab="exercises"]',
        title: 'Übungskatalog',
        description: 'Hier findest du alle verfügbaren Trainingsübungen. Du kannst nach Schwierigkeit und Level filtern.',
        category: 'Übungen',
        position: 'bottom',
        action: async () => {
            await switchToTab('exercises');
        }
    },

    // 11. Übungen Filter
    {
        element: '#exercise-filters',
        title: 'Übungen filtern',
        description: 'Filtere die Übungen nach Schwierigkeit (Leicht, Mittel, Schwer) und Level (Anfänger, Fortgeschritten, Profi). So findest du die passenden Übungen für dein Training.',
        category: 'Übungen',
        position: 'auto',
        action: async () => {
            await switchToTab('exercises');
        }
    },

    // === ANWESENHEIT ===

    // 12. Anwesenheit Tab
    {
        element: '[data-tab="profile"]',
        title: 'Anwesenheit & Kalender',
        description: 'Hier markierst du deine Trainingsanwesenheit. Für jedes Training bekommst du XP-Punkte. Streaks (mehrere Trainings hintereinander) bringen Bonus-Punkte!',
        category: 'Anwesenheit',
        position: 'bottom',
        action: async () => {
            await switchToTab('profile');
        }
    },

    // 13. Kalender
    {
        element: '#calendar-container',
        title: 'Trainingskalender',
        description: 'Im Kalender siehst du alle Trainingstage. Grün = anwesend, Gelb = Streak-Tag, Rot = gefehlt. Klicke auf einen Tag um deine Anwesenheit zu markieren.',
        category: 'Anwesenheit',
        position: 'auto',
        action: async () => {
            await switchToTab('profile');
        }
    },

    // === PUNKTESYSTEM ===

    // 14. FAQ Link
    {
        element: 'a[href="/faq.html"]',
        title: 'FAQ & Punktesystem',
        description: 'Hier findest du alle Antworten zum Punktesystem: Wie funktionieren ELO-Punkte? Was sind XP? Wie berechnen sich Saison-Punkte? Alle wichtigen Infos zum Ranking-System.',
        category: 'Hilfe',
        position: 'bottom'
    },

    // === ABSCHLUSS ===

    // 15. Abschluss
    {
        element: 'body',
        title: '🎉 Tutorial abgeschlossen!',
        description: 'Du kennst jetzt alle wichtigen Funktionen! Falls du etwas vergessen hast, kannst du das Tutorial jederzeit in den Einstellungen neu starten. Viel Erfolg!',
        category: 'Abschluss',
        position: 'auto',
        noSpotlight: true
    }
];

export default playerTutorialSteps;
