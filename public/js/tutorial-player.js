import { openModal, closeModal } from './validation-utils.js';

/**
 * Player Tutorial - Spezifische Tutorial-Steps für Spieler
 */

/**
 * Helper: Tab wechseln und warten
 */
function switchToTab(tabName) {
  return new Promise(resolve => {
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
    description:
      'In den nächsten Schritten zeigen wir dir alle wichtigen Funktionen. Du kannst das Tutorial jederzeit überspringen und später in den Einstellungen neu starten.',
    category: 'Einführung',
    position: 'auto',
    noSpotlight: true,
  },

  // === ÜBERSICHT / STARTSEITE ===

  // 2. Übersicht Tab
  {
    element: '[data-tab="overview"]',
    title: 'Deine Startseite',
    description:
      'Das ist deine Startseite mit den wichtigsten Widgets: Aktuelle Challenges, deine Stats, Punkte-Historie und mehr. Hier siehst du auf einen Blick alle wichtigen Informationen.',
    category: 'Startseite',
    position: 'bottom',
    action: async () => {
      await switchToTab('overview');
    },
  },

  // 3. Widget-Einstellungen
  {
    element: '#edit-dashboard-button',
    title: 'Startseite anpassen',
    description:
      'Mit diesem Button kannst du deine Startseite personalisieren: Widgets hinzufügen, entfernen. Mach dein Dashboard zu deinem eigenen!',
    category: 'Startseite',
    position: 'top',
    action: async () => {
      await switchToTab('overview');
      // Länger warten, damit alle Widgets laden
      await new Promise(resolve => setTimeout(resolve, 600));
    },
  },

  // === ANSICHTEN & FILTER ===

  // 4. Untergruppen-Filter
  {
    element: '#player-subgroup-filter-container',
    title: 'Ansicht wechseln',
    description:
      'Hier kannst du zwischen verschiedenen Ansichten wechseln: Mein Verein (nur deine Vereinskollegen), Global (alle Spieler) oder spezifische Untergruppen (z.B. Jugend, Herren). Die Ansicht beeinflusst alle Ranglisten und Statistiken.',
    category: 'Ansichten & Filter',
    position: 'bottom',
  },

  // === RANGLISTEN ===

  // 5. Ranglisten Tab
  {
    element: '[data-tab="leaderboard"]',
    title: 'Ranglisten',
    description:
      'Hier siehst du die ELO-Rankings. Du kannst zwischen verschiedenen Ranglisten wechseln und einzelne auch ausblenden.',
    category: 'Ranglisten',
    position: 'bottom',
    action: async () => {
      await switchToTab('leaderboard');
    },
  },

  // 6. Ranglisten-Toggles
  {
    element: '#toggle-leaderboard-preferences',
    title: 'Ranglisten ein-/ausschalten',
    description:
      'Mit diesem Button öffnest du die Einstellungen, um einzelne Ranglisten ein- oder auszublenden. So siehst du nur die Rankings, die dich interessieren (z.B. nur ELO-Ranking ohne Saison-Punkte).',
    category: 'Ranglisten',
    position: 'auto',
    action: async () => {
      await switchToTab('leaderboard');
    },
  },

  // 7. Liga-Tabs
  {
    element: '#tab-skill',
    title: 'Zwischen Ranglisten wechseln',
    description:
      'Mit diesen Tabs kannst du zwischen verschiedenen Ranking-Typen wechseln: Skill (ELO), Fleiß (XP), Season (Saison-Punkte), Ränge oder Doppel. Jede Rangliste zeigt einen anderen Aspekt deiner Leistung.',
    category: 'Ranglisten',
    position: 'top',
    action: async () => {
      await switchToTab('leaderboard');
    },
  },

  // === WETTKAMPF ===

  // 8. Wettkampf Tab
  {
    element: '[data-tab="matches"]',
    title: 'Wettkampf',
    description:
      'Im Wettkampf-Tab kannst du Match-Anfragen an andere Spieler senden und deine Match-Historie einsehen.',
    category: 'Wettkampf',
    position: 'bottom',
    action: async () => {
      await switchToTab('matches');
    },
  },

  // 9. Match-Vorschläge
  {
    element: '#toggle-match-suggestions',
    title: 'Gegnervorschläge',
    description:
      'Hier findest du Vorschläge für Vereinmitglieder gegen die du noch nie oder lange nicht mehr gespielt hast. Perfekt, um ein wenig Abwechslung reinzubringen!',
    category: 'Wettkampf',
    position: 'bottom',
    action: async () => {
      await switchToTab('matches');
    },
  },

  // 10. Match-Anfrage senden
  {
    element: '#match-request-form',
    title: 'Match-Anfrage senden',
    description:
      'Wähle einen Gegner, trage das Ergebnis ein und sende die Anfrage an deinen Gegner. Der Coach genehmigt das Match und die Punkte werden automatisch berechnet.',
    category: 'Wettkampf',
    position: 'auto',
    action: async () => {
      await switchToTab('matches');
    },
  },

  // === ÜBUNGEN ===

  // 11. Übungen Tab
  {
    element: '[data-tab="exercises"]',
    title: 'Übungskatalog',
    description: 'Hier findest du alle verfügbaren Trainingsübungen. Du kannst nach Tags filtern.',
    category: 'Übungen',
    position: 'bottom',
    action: async () => {
      await switchToTab('exercises');
    },
  },

  // 12. Übungen Filter
  {
    element: '#toggle-tags-filter-player',
    title: 'Übungen filtern',
    description:
      'Mit diesem Button öffnest du die Tag-Filter. Hier kannst du Übungen nach verschiedenen Kategorien filtern (z.B. Technik, Taktik, Fitness). So findest du die passenden Übungen für dein Training.',
    category: 'Übungen',
    position: 'bottom',
    action: async () => {
      await switchToTab('exercises');
    },
  },

  // === ANWESENHEIT ===

  // 13. Anwesenheit Tab
  {
    element: '[data-tab="profile"]',
    title: 'Anwesenheit & Kalender',
    description:
      'Hier siehst du deine Trainingsanwesenheit. Für jedes Training bekommst du XP-Punkte. Streaks (mehrere Trainings hintereinander) bringen Bonus-Punkte!',
    category: 'Anwesenheit',
    position: 'bottom',
    action: async () => {
      await switchToTab('profile');
    },
  },

  // 14. Kalender
  {
    element: '#calendar-grid',
    title: 'Trainingskalender',
    description:
      'Im Kalender siehst du alle Trainingstage. Grün = anwesend, Gelb = Streak-Tag, Rot = gefehlt. Klicke auf einen Tag um deine Anwesenheit zu markieren.',
    category: 'Anwesenheit',
    position: 'auto',
    action: async () => {
      await switchToTab('profile');
    },
  },

  // === PUNKTESYSTEM ===

  // 15. FAQ Link
  {
    element: '#faq-link',
    title: 'FAQ & Punktesystem',
    description:
      'Hier findest du alle Antworten zum Punktesystem: Wie funktionieren ELO-Punkte? Was sind XP? Wie berechnen sich Saison-Punkte? Alle wichtigen Infos zum Ranking-System.',
    category: 'Hilfe',
    position: 'bottom',
  },

  // === ABSCHLUSS ===

  // 16. Abschluss
  {
    element: 'body',
    title: '🎉 Tutorial abgeschlossen!',
    description:
      'Du kennst jetzt alle wichtigen Funktionen! Falls du etwas vergessen hast, kannst du das Tutorial jederzeit in den Einstellungen neu starten. Viel Erfolg!',
    category: 'Abschluss',
    position: 'auto',
    noSpotlight: true,
  },
];

export default playerTutorialSteps;
