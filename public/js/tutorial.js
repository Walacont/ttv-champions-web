/**
 * Tutorial System - Wiederverwendbare Tutorial-Engine
 * Zeigt interaktive Tooltips mit Spotlight-Effekt
 */

import { getAuth } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getFirestore, doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

export class TutorialManager {
    constructor(steps = [], options = {}) {
        this.steps = steps;
        this.currentStepIndex = 0;
        this.options = {
            tutorialKey: 'default', // z.B. 'coach', 'player'
            autoScroll: true,
            scrollOffset: 100,
            onComplete: null,
            onSkip: null,
            ...options
        };

        this.overlay = null;
        this.tooltip = null;
        this.currentSpotlightElement = null;
        this.isActive = false;
    }

    /**
     * Tutorial starten
     */
    async start() {
        if (this.isActive) return;

        this.isActive = true;
        this.currentStepIndex = 0;

        // Overlay erstellen
        this.createOverlay();

        // Tooltip erstellen
        this.createTooltip();

        // Scroll sperren
        document.body.classList.add('tutorial-active');
        document.documentElement.classList.add('tutorial-active');

        // Ersten Step zeigen
        this.showStep(0);
    }

    /**
     * Overlay erstellen
     */
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay active';
        this.overlay.addEventListener('click', (e) => {
            // Klicks auf Overlay verhindern (außer auf Spotlight-Element)
            if (e.target === this.overlay) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        document.body.appendChild(this.overlay);
    }

    /**
     * Tooltip/Popover erstellen
     */
    createTooltip() {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tutorial-tooltip';
        this.tooltip.innerHTML = `
            <div class="tutorial-header">
                <div class="tutorial-progress">
                    <div class="tutorial-progress-bar">
                        <div class="tutorial-progress-fill" style="width: 0%"></div>
                    </div>
                    <span class="tutorial-step-counter">1 / ${this.steps.length}</span>
                </div>
                <div class="tutorial-category"></div>
                <h3 class="tutorial-title"></h3>
            </div>
            <div class="tutorial-body">
                <p class="tutorial-description"></p>
            </div>
            <div class="tutorial-footer">
                <button class="tutorial-btn tutorial-btn-skip">
                    <i class="fas fa-times"></i> Überspringen
                </button>
                <button class="tutorial-btn tutorial-btn-secondary tutorial-btn-back" disabled>
                    <i class="fas fa-arrow-left"></i> Zurück
                </button>
                <button class="tutorial-btn tutorial-btn-primary tutorial-btn-next">
                    Weiter <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;

        // Event Listener
        this.tooltip.querySelector('.tutorial-btn-next').addEventListener('click', () => this.next());
        this.tooltip.querySelector('.tutorial-btn-back').addEventListener('click', () => this.previous());
        this.tooltip.querySelector('.tutorial-btn-skip').addEventListener('click', () => this.skip());

        document.body.appendChild(this.tooltip);
    }

    /**
     * Step anzeigen
     */
    async showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        const step = this.steps[index];
        this.currentStepIndex = index;

        // Spotlight entfernen vom vorherigen Element
        if (this.currentSpotlightElement) {
            this.currentSpotlightElement.classList.remove('tutorial-spotlight');
            this.currentSpotlightElement = null;
        }

        // Overlay-Modus anpassen (mit oder ohne Spotlight)
        if (step.noSpotlight) {
            this.overlay.classList.add('tutorial-no-spotlight');
        } else {
            this.overlay.classList.remove('tutorial-no-spotlight');
        }

        // Warten bis Element verfügbar ist (falls Tab-Wechsel nötig)
        if (step.action) {
            await step.action();
        }

        // Warten auf Element
        const element = await this.waitForElement(step.element);

        if (!element) {
            console.error(`Tutorial: Element nicht gefunden - ${step.element}`);
            return;
        }

        // Auto-Scroll zum Element (nur wenn kein noSpotlight)
        if (this.options.autoScroll && !step.noSpotlight) {
            this.scrollToElement(element);
            // Warten nach Scroll (länger auf Mobile)
            const isMobile = window.innerWidth <= 640;
            await new Promise(resolve => setTimeout(resolve, isMobile ? 500 : 300));
        }

        // Spotlight setzen (nur wenn nicht noSpotlight)
        if (!step.noSpotlight) {
            this.currentSpotlightElement = element;
            element.classList.add('tutorial-spotlight');
        }

        // Tooltip-Inhalt aktualisieren
        this.updateTooltipContent(step, index);

        // Tooltip positionieren
        if (step.noSpotlight) {
            // Bei noSpotlight: Tooltip zentriert im Bildschirm
            this.centerTooltip();
        } else {
            this.positionTooltip(element, step.position || 'auto');
        }

        // Tooltip anzeigen
        setTimeout(() => {
            this.tooltip.classList.add('visible');
        }, 100);
    }

    /**
     * Tooltip-Inhalt aktualisieren
     */
    updateTooltipContent(step, index) {
        const progressPercent = ((index + 1) / this.steps.length) * 100;

        this.tooltip.querySelector('.tutorial-progress-fill').style.width = `${progressPercent}%`;
        this.tooltip.querySelector('.tutorial-step-counter').textContent = `${index + 1} / ${this.steps.length}`;

        const categoryEl = this.tooltip.querySelector('.tutorial-category');
        if (step.category) {
            categoryEl.textContent = step.category;
            categoryEl.style.display = 'inline-block';
        } else {
            categoryEl.style.display = 'none';
        }

        this.tooltip.querySelector('.tutorial-title').textContent = step.title;
        this.tooltip.querySelector('.tutorial-description').textContent = step.description;

        // Button Status
        const backBtn = this.tooltip.querySelector('.tutorial-btn-back');
        const nextBtn = this.tooltip.querySelector('.tutorial-btn-next');

        backBtn.disabled = index === 0;

        if (index === this.steps.length - 1) {
            nextBtn.innerHTML = '<i class="fas fa-check"></i> Abschließen';
        } else {
            nextBtn.innerHTML = 'Weiter <i class="fas fa-arrow-right"></i>';
        }
    }

    /**
     * Tooltip positionieren relativ zum Element
     */
    positionTooltip(element, preferredPosition = 'auto') {
        const rect = element.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const margin = 20;

        let position = preferredPosition;

        // Auto-Position: Beste Position finden
        if (position === 'auto') {
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const spaceRight = window.innerWidth - rect.right;
            const spaceLeft = rect.left;

            if (spaceBelow >= tooltipRect.height + margin) {
                position = 'bottom';
            } else if (spaceAbove >= tooltipRect.height + margin) {
                position = 'top';
            } else if (spaceRight >= tooltipRect.width + margin) {
                position = 'right';
            } else if (spaceLeft >= tooltipRect.width + margin) {
                position = 'left';
            } else {
                position = 'bottom'; // Fallback
            }
        }

        // Position berechnen
        let top, left;

        switch (position) {
            case 'bottom':
                top = rect.bottom + margin;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'top':
                top = rect.top - tooltipRect.height - margin;
                left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + margin;
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left - tooltipRect.width - margin;
                break;
        }

        // Grenzen beachten
        top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));
        left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

        this.tooltip.style.top = `${top}px`;
        this.tooltip.style.left = `${left}px`;

        // Pfeil-Klasse setzen
        this.tooltip.className = `tutorial-tooltip visible position-${position}`;
    }

    /**
     * Tooltip zentriert im Bildschirm positionieren (für noSpotlight Steps)
     */
    centerTooltip() {
        const tooltipRect = this.tooltip.getBoundingClientRect();

        const top = (window.innerHeight - tooltipRect.height) / 2;
        const left = (window.innerWidth - tooltipRect.width) / 2;

        this.tooltip.style.top = `${Math.max(20, top)}px`;
        this.tooltip.style.left = `${Math.max(20, left)}px`;

        // Centered Klasse hinzufügen (für Mobile-Ausnahme)
        this.tooltip.className = 'tutorial-tooltip visible centered';
    }

    /**
     * Zum Element scrollen
     */
    scrollToElement(element) {
        // Auf Mobile: scrollIntoView verwenden (funktioniert besser mit overflow: hidden)
        const isMobile = window.innerWidth <= 640;

        if (isMobile) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        } else {
            const rect = element.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const targetY = rect.top + scrollTop - this.options.scrollOffset;

            window.scrollTo({
                top: targetY,
                behavior: 'smooth'
            });
        }
    }

    /**
     * Auf Element warten (mit Timeout)
     */
    waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }, timeout);
        });
    }

    /**
     * Nächster Step
     */
    next() {
        // onNext Callback ausführen (z.B. zum Schließen von Modals)
        const currentStep = this.steps[this.currentStepIndex];
        if (currentStep.onNext && typeof currentStep.onNext === 'function') {
            currentStep.onNext();
        }

        if (this.currentStepIndex < this.steps.length - 1) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.showStep(this.currentStepIndex + 1);
            }, 200);
        } else {
            this.complete();
        }
    }

    /**
     * Vorheriger Step
     */
    previous() {
        if (this.currentStepIndex > 0) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.showStep(this.currentStepIndex - 1);
            }, 200);
        }
    }

    /**
     * Tutorial überspringen
     */
    async skip() {
        if (confirm('Möchtest du das Tutorial wirklich überspringen? Du kannst es später in den Einstellungen neu starten.')) {
            await this.cleanup();

            if (this.options.onSkip) {
                this.options.onSkip();
            }
        }
    }

    /**
     * Tutorial abschließen
     */
    async complete() {
        await this.cleanup();

        // In Firestore speichern
        const auth = getAuth();
        const db = getFirestore();

        if (auth.currentUser) {
            try {
                const userRef = doc(db, 'users', auth.currentUser.uid);
                await updateDoc(userRef, {
                    [`tutorialCompleted.${this.options.tutorialKey}`]: true,
                    [`tutorialCompletedAt.${this.options.tutorialKey}`]: new Date().toISOString()
                });

                console.log(`Tutorial "${this.options.tutorialKey}" abgeschlossen`);
            } catch (error) {
                console.error('Fehler beim Speichern des Tutorial-Status:', error);
            }
        }

        // Callback
        if (this.options.onComplete) {
            this.options.onComplete();
        }

        // Success Message
        this.showCompletionMessage();
    }

    /**
     * Completion Message anzeigen
     */
    showCompletionMessage() {
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span><strong>Tutorial abgeschlossen!</strong> Du kannst es jederzeit in den Einstellungen wiederholen.</span>
            </div>
        `;

        const container = document.querySelector('.toast-container') || this.createToastContainer();
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    /**
     * Toast Container erstellen (falls nicht vorhanden)
     */
    createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    }

    /**
     * Cleanup
     */
    async cleanup() {
        this.isActive = false;

        // Spotlight entfernen
        if (this.currentSpotlightElement) {
            this.currentSpotlightElement.classList.remove('tutorial-spotlight');
        }

        // Demo-Daten entfernen (falls vorhanden)
        const demoElements = document.querySelectorAll('[data-tutorial-demo="true"]');
        demoElements.forEach(el => el.remove());

        // Tooltip ausblenden
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
            setTimeout(() => {
                this.tooltip?.remove();
                this.tooltip = null;
            }, 300);
        }

        // Overlay entfernen
        if (this.overlay) {
            this.overlay.classList.remove('active');
            setTimeout(() => {
                this.overlay?.remove();
                this.overlay = null;
            }, 300);
        }

        // Scroll freigeben
        document.body.classList.remove('tutorial-active');
        document.documentElement.classList.remove('tutorial-active');
    }

    /**
     * Tutorial zurücksetzen
     */
    reset() {
        this.currentStepIndex = 0;
    }
}

/**
 * Helper: Tutorial-Status aus Firestore abrufen
 */
export async function getTutorialStatus(tutorialKey) {
    const auth = getAuth();
    const db = getFirestore();

    if (!auth.currentUser) return false;

    try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            return data.tutorialCompleted?.[tutorialKey] || false;
        }
    } catch (error) {
        console.error('Fehler beim Abrufen des Tutorial-Status:', error);
    }

    return false;
}

export default TutorialManager;
