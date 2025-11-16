/**
 * Tutorial System for TTV Champions
 * Provides interactive step-by-step tutorials for coaches and players
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

// Use existing Firebase app if already initialized, otherwise initialize
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

class TutorialManager {
    constructor() {
        this.currentStep = 0;
        this.steps = [];
        this.userRole = null;
        this.tutorialOverlay = null;
        this.spotlightElement = null;
        this.tutorialBox = null;
        this.onComplete = null;
        this.isActive = false;
    }

    /**
     * Initialize tutorial for a specific role
     * @param {string} role - 'player' or 'coach'
     * @param {Array} steps - Tutorial steps configuration
     * @param {Function} onComplete - Callback when tutorial completes
     */
    async init(role, steps, onComplete = null) {
        this.userRole = role;
        this.steps = steps;
        this.onComplete = onComplete;
        this.currentStep = 0;

        // Check if tutorial has been completed
        const hasSeenTutorial = await this.hasCompletedTutorial();

        if (!hasSeenTutorial) {
            // Wait a bit for page to fully load
            setTimeout(() => {
                this.start();
            }, 1000);
        }
    }

    /**
     * Check if user has completed the tutorial
     */
    async hasCompletedTutorial() {
        try {
            const user = auth.currentUser;
            if (!user) return true;

            const tutorialDoc = await getDoc(doc(db, `users/${user.uid}/preferences/tutorial`));

            if (tutorialDoc.exists()) {
                const data = tutorialDoc.data();
                if (this.userRole === 'coach') {
                    return data.coachTutorialCompleted === true;
                } else {
                    return data.playerTutorialCompleted === true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error checking tutorial status:', error);
            return true; // Don't show tutorial if there's an error
        }
    }

    /**
     * Mark tutorial as completed in Firestore
     */
    async markAsCompleted() {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const tutorialRef = doc(db, `users/${user.uid}/preferences/tutorial`);

            if (this.userRole === 'coach') {
                await setDoc(tutorialRef, {
                    coachTutorialCompleted: true,
                    coachTutorialCompletedAt: new Date(),
                    updatedAt: new Date()
                }, { merge: true });
            } else {
                await setDoc(tutorialRef, {
                    playerTutorialCompleted: true,
                    playerTutorialCompletedAt: new Date(),
                    updatedAt: new Date()
                }, { merge: true });
            }
        } catch (error) {
            console.error('Error marking tutorial as completed:', error);
        }
    }

    /**
     * Reset tutorial status (for settings)
     * @param {string} role - Optional role override ('player' or 'coach')
     */
    async resetTutorial(role = null) {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const tutorialRef = doc(db, `users/${user.uid}/preferences/tutorial`);
            const userRole = role || this.userRole;

            if (userRole === 'coach') {
                await setDoc(tutorialRef, {
                    coachTutorialCompleted: false,
                    updatedAt: new Date()
                }, { merge: true });
            } else {
                await setDoc(tutorialRef, {
                    playerTutorialCompleted: false,
                    updatedAt: new Date()
                }, { merge: true });
            }
        } catch (error) {
            console.error('Error resetting tutorial:', error);
        }
    }

    /**
     * Start the tutorial
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.currentStep = 0;
        this.createTutorialUI();
        this.showStep(0);
    }

    /**
     * Create the tutorial UI elements
     */
    createTutorialUI() {
        // Create overlay
        this.tutorialOverlay = document.createElement('div');
        this.tutorialOverlay.id = 'tutorial-overlay';
        this.tutorialOverlay.className = 'tutorial-overlay';
        document.body.appendChild(this.tutorialOverlay);

        // Create spotlight (transparent area)
        this.spotlightElement = document.createElement('div');
        this.spotlightElement.id = 'tutorial-spotlight';
        this.spotlightElement.className = 'tutorial-spotlight';
        document.body.appendChild(this.spotlightElement);

        // Create tutorial box
        this.tutorialBox = document.createElement('div');
        this.tutorialBox.id = 'tutorial-box';
        this.tutorialBox.className = 'tutorial-box';
        this.tutorialBox.innerHTML = `
            <div class="tutorial-header">
                <h3 class="tutorial-title"></h3>
                <button class="tutorial-close" title="Tutorial beenden">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="tutorial-content">
                <p class="tutorial-description"></p>
            </div>
            <div class="tutorial-footer">
                <div class="tutorial-progress">
                    <span class="tutorial-step-counter"></span>
                </div>
                <div class="tutorial-buttons">
                    <button class="tutorial-btn tutorial-btn-secondary tutorial-prev">
                        <i class="fas fa-arrow-left"></i> Zurück
                    </button>
                    <button class="tutorial-btn tutorial-btn-primary tutorial-next">
                        Weiter <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(this.tutorialBox);

        // Add event listeners
        this.tutorialBox.querySelector('.tutorial-close').addEventListener('click', () => {
            this.skip();
        });

        this.tutorialBox.querySelector('.tutorial-prev').addEventListener('click', () => {
            this.previousStep();
        });

        this.tutorialBox.querySelector('.tutorial-next').addEventListener('click', () => {
            this.nextStep();
        });
    }

    /**
     * Show a specific step
     */
    showStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= this.steps.length) return;

        this.currentStep = stepIndex;
        const step = this.steps[stepIndex];

        // Update tutorial box content
        this.tutorialBox.querySelector('.tutorial-title').textContent = step.title;
        this.tutorialBox.querySelector('.tutorial-description').textContent = step.description;
        this.tutorialBox.querySelector('.tutorial-step-counter').textContent =
            `Schritt ${stepIndex + 1} von ${this.steps.length}`;

        // Update button states
        const prevBtn = this.tutorialBox.querySelector('.tutorial-prev');
        const nextBtn = this.tutorialBox.querySelector('.tutorial-next');

        prevBtn.disabled = stepIndex === 0;

        if (stepIndex === this.steps.length - 1) {
            nextBtn.innerHTML = 'Fertig <i class="fas fa-check"></i>';
        } else {
            nextBtn.innerHTML = 'Weiter <i class="fas fa-arrow-right"></i>';
        }

        // Execute step action (switch tab, etc.)
        if (step.action) {
            step.action();
        }

        // Position spotlight on target element
        if (step.target) {
            this.highlightElement(step.target);
        } else {
            this.removeSpotlight();
        }

        // Position tutorial box
        this.positionTutorialBox(step);
    }

    /**
     * Highlight a specific element with spotlight
     */
    highlightElement(selector) {
        const element = document.querySelector(selector);

        if (!element) {
            console.warn(`Tutorial target not found: ${selector}`);
            this.removeSpotlight();
            return;
        }

        const rect = element.getBoundingClientRect();
        const padding = 8;

        this.spotlightElement.style.display = 'block';
        this.spotlightElement.style.top = `${rect.top - padding}px`;
        this.spotlightElement.style.left = `${rect.left - padding}px`;
        this.spotlightElement.style.width = `${rect.width + padding * 2}px`;
        this.spotlightElement.style.height = `${rect.height + padding * 2}px`;

        // Add pulse animation
        this.spotlightElement.classList.add('tutorial-spotlight-pulse');
        setTimeout(() => {
            this.spotlightElement.classList.remove('tutorial-spotlight-pulse');
        }, 1000);
    }

    /**
     * Remove spotlight
     */
    removeSpotlight() {
        if (this.spotlightElement) {
            this.spotlightElement.style.display = 'none';
        }
    }

    /**
     * Position the tutorial box relative to the highlighted element
     */
    positionTutorialBox(step) {
        if (!step.target) {
            // Center the box if no target
            this.tutorialBox.style.position = 'fixed';
            this.tutorialBox.style.top = '50%';
            this.tutorialBox.style.left = '50%';
            this.tutorialBox.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const element = document.querySelector(step.target);
        if (!element) {
            // Fallback to center
            this.tutorialBox.style.position = 'fixed';
            this.tutorialBox.style.top = '50%';
            this.tutorialBox.style.left = '50%';
            this.tutorialBox.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const rect = element.getBoundingClientRect();
        const boxRect = this.tutorialBox.getBoundingClientRect();
        const position = step.position || 'bottom';

        this.tutorialBox.style.position = 'fixed';
        this.tutorialBox.style.transform = 'none';

        switch (position) {
            case 'bottom':
                this.tutorialBox.style.top = `${rect.bottom + 20}px`;
                this.tutorialBox.style.left = `${rect.left + rect.width / 2 - boxRect.width / 2}px`;
                break;
            case 'top':
                this.tutorialBox.style.top = `${rect.top - boxRect.height - 20}px`;
                this.tutorialBox.style.left = `${rect.left + rect.width / 2 - boxRect.width / 2}px`;
                break;
            case 'left':
                this.tutorialBox.style.top = `${rect.top + rect.height / 2 - boxRect.height / 2}px`;
                this.tutorialBox.style.left = `${rect.left - boxRect.width - 20}px`;
                break;
            case 'right':
                this.tutorialBox.style.top = `${rect.top + rect.height / 2 - boxRect.height / 2}px`;
                this.tutorialBox.style.left = `${rect.right + 20}px`;
                break;
            case 'center':
                this.tutorialBox.style.top = '50%';
                this.tutorialBox.style.left = '50%';
                this.tutorialBox.style.transform = 'translate(-50%, -50%)';
                break;
        }

        // Ensure box stays within viewport
        const boxBounds = this.tutorialBox.getBoundingClientRect();
        if (boxBounds.right > window.innerWidth - 20) {
            this.tutorialBox.style.left = `${window.innerWidth - boxRect.width - 20}px`;
        }
        if (boxBounds.left < 20) {
            this.tutorialBox.style.left = '20px';
        }
        if (boxBounds.bottom > window.innerHeight - 20) {
            this.tutorialBox.style.top = `${window.innerHeight - boxRect.height - 20}px`;
        }
        if (boxBounds.top < 20) {
            this.tutorialBox.style.top = '20px';
        }
    }

    /**
     * Go to next step
     */
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        } else {
            this.complete();
        }
    }

    /**
     * Go to previous step
     */
    previousStep() {
        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    }

    /**
     * Complete the tutorial
     */
    async complete() {
        await this.markAsCompleted();
        this.cleanup();

        if (this.onComplete) {
            this.onComplete();
        }
    }

    /**
     * Skip/close tutorial
     */
    skip() {
        const confirmed = confirm('Möchtest du das Tutorial wirklich beenden? Du kannst es jederzeit in den Einstellungen wiederholen.');

        if (confirmed) {
            this.cleanup();
        }
    }

    /**
     * Clean up tutorial UI
     */
    cleanup() {
        this.isActive = false;

        if (this.tutorialOverlay) {
            this.tutorialOverlay.remove();
            this.tutorialOverlay = null;
        }

        if (this.spotlightElement) {
            this.spotlightElement.remove();
            this.spotlightElement = null;
        }

        if (this.tutorialBox) {
            this.tutorialBox.remove();
            this.tutorialBox = null;
        }
    }
}

// Export singleton instance
export const tutorialManager = new TutorialManager();

/**
 * Player Tutorial Steps
 */
export const playerTutorialSteps = [
    {
        title: 'Willkommen bei TTV Champions! 🏓',
        description: 'Dieses Tutorial zeigt dir alle wichtigen Funktionen der Plattform. Du kannst es jederzeit in den Einstellungen wiederholen.',
        position: 'center',
        target: null,
        action: null
    },
    {
        title: 'Übersicht',
        description: 'Hier siehst du deine wichtigsten Statistiken: XP (Trainingserfahrung), Elo-Rating (Spielstärke) und Saisonpunkte. Diese Widgets kannst du anpassen.',
        target: '[data-tab="overview"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="overview"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Ranglisten',
        description: 'Hier findest du verschiedene Ranglisten: XP-Rangliste, Elo-Rating, Saisonpunkte, Ränge und Doppel-Rangliste. Vergleiche dich mit anderen Spielern!',
        target: '[data-tab="leaderboard"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="leaderboard"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Wettkampf',
        description: 'Hier kannst du Wettkampfanfragen an andere Spieler stellen. Wähle deinen Gegner, gib das Ergebnis ein und erhalte Elo-Punkte und XP!',
        target: '[data-tab="match"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="match"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Übungskatalog',
        description: 'Entdecke hier alle verfügbaren Übungen. Jede abgeschlossene Übung bringt dir XP. Dein Coach kann neue Übungen hinzufügen.',
        target: '[data-tab="exercises"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="exercises"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Anwesenheit',
        description: 'Dein Trainingskalender zeigt dir, wann du trainiert hast. Regelmäßiges Training wird mit Streak-Boni belohnt!',
        target: '[data-tab="attendance"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="attendance"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Einstellungen',
        description: 'In den Einstellungen kannst du dein Profil bearbeiten, Benachrichtigungen verwalten und dieses Tutorial jederzeit wiederholen.',
        target: '.settings-link',
        position: 'left',
        action: null
    },
    {
        title: 'Viel Erfolg! 🎉',
        description: 'Du kennst jetzt alle wichtigen Bereiche! Viel Spaß beim Trainieren und Wettkämpfen. Bei Fragen schau in die FAQ oder frag deinen Coach.',
        position: 'center',
        target: null,
        action: () => {
            const tab = document.querySelector('[data-tab="overview"]');
            if (tab) tab.click();
        }
    }
];

/**
 * Coach Tutorial Steps
 */
export const coachTutorialSteps = [
    {
        title: 'Willkommen im Coach-Dashboard! 👨‍🏫',
        description: 'Dieses Tutorial zeigt dir alle Funktionen des Coach-Bereichs. Du kannst es jederzeit in den Einstellungen wiederholen.',
        position: 'center',
        target: null,
        action: null
    },
    {
        title: 'Statistik',
        description: 'Hier siehst du wichtige Statistiken deines Vereins: aktive Spieler, Trainingsteilnahmen, Top-Performer und mehr.',
        target: '[data-tab="statistics"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="statistics"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Rangliste',
        description: 'Überblick über alle Ranglisten: XP, Elo, Saisonpunkte. Du siehst hier alle Spieler deines Vereins und ihre Fortschritte.',
        target: '[data-tab="leaderboard"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="leaderboard"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Kalender & Anwesenheit',
        description: 'Verwalte Trainingseinheiten und markiere die Anwesenheit deiner Spieler. Dies ist wichtig für XP-Vergabe und Statistiken.',
        target: '[data-tab="calendar"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="calendar"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Wettkampf',
        description: 'Hier siehst du alle Wettkampfanfragen deiner Spieler. Du kannst diese genehmigen, ablehnen oder Handicap-Paarungen erstellen.',
        target: '[data-tab="matches"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="matches"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Punkte vergeben',
        description: 'Vergib manuell XP oder Saisonpunkte an Spieler, z.B. für besondere Leistungen oder Turniere.',
        target: '[data-tab="points"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="points"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Challenges',
        description: 'Erstelle und verwalte Challenges für deine Spieler. Challenges motivieren und bringen zusätzliche XP.',
        target: '[data-tab="challenges"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="challenges"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Übungen',
        description: 'Verwalte den Übungskatalog deines Vereins. Füge neue Übungen hinzu oder bearbeite bestehende.',
        target: '[data-tab="exercises"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="exercises"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Gruppen',
        description: 'Erstelle und verwalte Untergruppen (z.B. Jugend, Erwachsene) um deine Spieler besser zu organisieren.',
        target: '[data-tab="groups"]',
        position: 'bottom',
        action: () => {
            const tab = document.querySelector('[data-tab="groups"]');
            if (tab) tab.click();
        }
    },
    {
        title: 'Spielerverwaltung',
        description: 'Klicke hier, um Spieler anzulegen, zu bearbeiten oder zu löschen. Du kannst auch Einladungscodes erstellen.',
        target: '#manage-players-btn',
        position: 'bottom',
        action: null
    },
    {
        title: 'Viel Erfolg! 🎉',
        description: 'Du kennst jetzt alle Coach-Funktionen! Bei Fragen kannst du dieses Tutorial in den Einstellungen jederzeit wiederholen.',
        position: 'center',
        target: null,
        action: () => {
            const tab = document.querySelector('[data-tab="statistics"]');
            if (tab) tab.click();
        }
    }
];
