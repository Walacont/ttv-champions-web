import { openModal, closeModal } from './validation-utils.js';

/**
 * Coach Tutorial - Spezifische Tutorial-Steps für Coaches
 */

/**
 * Helper: Tab wechseln und warten
 */
function switchToTab(tabName) {
  return new Promise(resolve => {
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
    description:
      'In den nächsten Schritten zeigen wir dir alle wichtigen Funktionen für Coaches. Du kannst das Tutorial jederzeit überspringen und später in den Einstellungen neu starten.',
    category: 'Einführung',
    position: 'auto',
    noSpotlight: true, // Kein Spotlight-Effekt beim Willkommens-Screen
  },

  // === GRUNDLAGEN ===

  // 2. Statistik-Seite
  {
    element: '[data-tab="statistics"]',
    title: 'Statistik-Übersicht',
    description:
      'Hier findest du alle wichtigen Statistiken deines Teams. Besonders wichtig: Hier siehst du eingehende Anfragen von Spielern, die Wettkämpfe melden möchten.',
    category: 'Grundlagen',
    position: 'bottom',
    action: async () => {
      await switchToTab('statistics');
    },
  },

  // 3. Anfragen-Bereich
  {
    element: '#coach-pending-requests-list',
    title: 'Anfragen verwalten',
    description:
      'In diesem Bereich werden alle Wettkampf-Anfragen von Spielern angezeigt, die auf deine Genehmigung warten. Du kannst diese annehmen oder ablehnen.',
    category: 'Grundlagen',
    position: 'auto',
    action: async () => {
      await switchToTab('statistics');
    },
  },

  // 4. Spieler verwalten Button
  {
    element: '#open-player-modal-button',
    title: 'Spieler verwalten',
    description: 'Mit diesem Button öffnest du die Spielerverwaltung. Lass uns das Modal öffnen...',
    category: 'Grundlagen',
    position: 'bottom',
  },

  // 5. Spieler verwalten Modal
  {
    element: '#modal-player-list',
    title: 'Spielerverwaltung',
    description:
      'Hier siehst du alle Spieler deines Teams. Du kannst Spieler bearbeiten, zum Coach ernennen, löschen oder von Offline zu Online konvertieren. Klicke auf einen Spieler um Details zu sehen.',
    category: 'Grundlagen',
    position: 'right',
    action: async () => {
      await openModal('#open-player-modal-button', '#player-list-modal');
    },
    onNext: () => {
      closeModal('#close-player-modal-button');
    },
  },

  // 6. Offline-Spieler Button
  {
    element: '#add-offline-player-button',
    title: 'Offline-Spieler erstellen',
    description: 'Hier kannst du Offline-Spieler anlegen. Lass uns das Formular anschauen...',
    category: 'Grundlagen',
    position: 'bottom',
  },

  // 7. Offline-Spieler Formular
  {
    element: '#add-offline-player-form',
    title: 'Offline-Spieler Formular',
    description:
      'Hier gibst du die Daten des Offline-Spielers ein. Wichtig: Mit der Checkbox "Wettkampfbereit" legst du fest, ob der Spieler in offiziellen Wettkämpfen antreten kann und in der Rangliste erscheint.',
    category: 'Grundlagen',
    position: 'auto',
    action: async () => {
      await openModal('#add-offline-player-button', '#add-offline-player-modal');
    },
    onNext: () => {
      closeModal('#close-add-player-modal-button');
    },
  },

  // 8. Einladungs-Code Button
  {
    element: '#manage-invitation-codes-button',
    title: 'Einladungs-Codes',
    description: 'Hier verwaltest du Einladungs-Codes. Lass uns das Modal öffnen...',
    category: 'Grundlagen',
    position: 'bottom',
  },

  // 9. Einladungs-Codes Modal
  {
    element: '#invitation-codes-modal',
    title: 'Einladungs-Codes verwalten',
    description:
      'Spieler benötigen einen Code, um sich zu registrieren und deinem Team beizutreten. Hier kannst du bestehende Codees anzeigen oder deaktivieren.',
    category: 'Grundlagen',
    position: 'auto',
    action: async () => {
      await openModal('#manage-invitation-codes-button', '#invitation-codes-modal');
    },
    onNext: () => {
      closeModal('#close-invitation-codes-modal-button');
    },
  },

  // === VERWALTUNG ===

  // 8. Rangliste Tab
  {
    element: '[data-tab="dashboard"]',
    title: 'Rangliste',
    description:
      'Die Rangliste zeigt das ELO-Ranking und XP-Ranking aller wettkampfbereiten Spieler. Sie wird automatisch nach jedem Wettkampf aktualisiert.',
    category: 'Verwaltung',
    position: 'bottom',
    action: async () => {
      await switchToTab('dashboard');
    },
  },

  // 11. Untergruppen-Filter
  {
    element: '#subgroup-filter',
    title: 'Ansicht nach Untergruppen',
    description:
      'Oben bei "Ansicht" kannst du die Rangliste nach Untergruppen filtern (z.B. Jugend, Herren, Damen). So siehst du separate Rankings für jede Gruppe.',
    category: 'Verwaltung',
    position: 'bottom',
    action: async () => {
      await switchToTab('dashboard');
    },
  },

  // === TRAINING & WETTKAMPF ===

  // 12. Anwesenheit Tab
  {
    element: '[data-tab="attendance"]',
    title: 'Anwesenheit & Kalender',
    description:
      'Hier trägst du die Anwesenheit beim Training ein. Der Kalender zeigt alle Trainingstage und -zeiten.',
    category: 'Training & Wettkampf',
    position: 'bottom',
    action: async () => {
      await switchToTab('attendance');
    },
  },

  // 14. Wettkampf Tab
  {
    element: '[data-tab="matches"]',
    title: 'Wettkampf-Verwaltung',
    description:
      'Im Wettkampf-Tab trägst du Spiel-Ergebnisse ein. Du kannst neue Wettkämpfe erstellen, Ergebnisse nachtragen und die Historie einsehen.',
    category: 'Training & Wettkampf',
    position: 'bottom',
    action: async () => {
      await switchToTab('matches');
    },
  },

  // 15. Wettkampf eintragen
  {
    element: '#match-form',
    title: 'Wettkampf eintragen',
    description:
      'Hier erstellst du neue Wettkämpfe. Wähle zwei Spieler aus, trage das Ergebnis ein und das System berechnet automatisch ELO-Änderungen und XP-Punkte.',
    category: 'Training & Wettkampf',
    position: 'auto',
    action: async () => {
      await switchToTab('matches');
    },
  },

  // === GAMIFICATION ===

  // 16. Punkte vergeben Tab
  {
    element: '[data-tab="points"]',
    title: 'Punkte vergeben',
    description:
      'Hier kannst du manuell XP-Punkte an Spieler vergeben - z.B. für besondere Leistungen, Training mit Partner oder andere Aktivitäten. Du kannst aber auch Bestrafungspunkte vergeben.',
    category: 'Gamification',
    position: 'bottom',
    action: async () => {
      await switchToTab('points');
    },
  },

  // 17. Punktetypen
  {
    element: '#reason-select',
    title: 'Verschiedene Punktetypen',
    description:
      'Es gibt verschiedene Punktetypen: Training, Wettkampf, Challenge, Trainingspartner und mehr. Jeder Typ hat unterschiedliche XP-Werte und wird separat in der Statistik angezeigt.',
    category: 'Gamification',
    position: 'auto',
    action: async () => {
      await switchToTab('points');
    },
  },

  // 18. Challenges Tab
  {
    element: '[data-tab="challenges"]',
    title: 'Challenges',
    description:
      'Challenges sind zeitlich begrenzte Herausforderungen für deine Spieler. Du kannst tägliche, wöchentliche oder monatliche Challenges erstellen (z.B. "10 Trainings in diesem Monat").',
    category: 'Gamification',
    position: 'bottom',
    action: async () => {
      await switchToTab('challenges');
    },
  },

  // 19. Challenge erstellen
  {
    element: '#create-challenge-form',
    title: 'Challenge erstellen',
    description:
      'Beim Erstellen einer Challenge legst du Titel, Beschreibung, Ziel-Wert, XP-Belohnung und Zeitraum fest. Spieler sehen ihre Challenges und können den Fortschritt verfolgen.',
    category: 'Gamification',
    position: 'auto',
    action: async () => {
      await switchToTab('challenges');
    },
  },

  // 20. Übungen Tab
  {
    element: '[data-tab="exercises"]',
    title: 'Übungen',
    description:
      'Im Übungen-Tab kannst du Trainingsübungen erstellen. Diese können später von Spielern abgerufen werden.',
    category: 'Gamification',
    position: 'bottom',
    action: async () => {
      await switchToTab('exercises');
    },
  },

  // === ORGANISATION ===

  // 21. Untergruppen Tab
  {
    element: '[data-tab="subgroups"]',
    title: 'Untergruppen verwalten',
    description:
      'Untergruppen helfen dir, dein Team zu organisieren (z.B. Jugend, Herren, Damen, Anfänger, Fortgeschrittene). Jede Gruppe kann separate Ranglisten und Statistiken haben.',
    category: 'Organisation',
    position: 'bottom',
    action: async () => {
      await switchToTab('subgroups');
    },
  },

  // 22. Untergruppe erstellen
  {
    element: '#create-subgroup-form',
    title: 'Untergruppe erstellen',
    description:
      'Erstelle neue Untergruppen, weise Spieler zu und nutze die Filter-Funktionen, um spezifische Ansichten zu erhalten.',
    category: 'Organisation',
    position: 'auto',
    action: async () => {
      await switchToTab('subgroups');
    },
  },

  // Abschluss
  {
    element: 'body',
    title: '🎉 Tutorial abgeschlossen!',
    description:
      'Du kennst jetzt alle wichtigen Funktionen für Coaches! Falls du etwas vergessen hast, kannst du das Tutorial jederzeit in den Einstellungen neu starten. Viel Spaß mit TTV Champions!!!',
    category: 'Abschluss',
    position: 'auto',
    noSpotlight: true,
  },
];

export default coachTutorialSteps;
