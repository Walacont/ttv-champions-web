/**
 * Notification Permission Dialog
 * Beautiful UI for requesting push notification permission
 */

class NotificationPermissionDialog {
    constructor() {
        this.dialog = null;
        this.onAccept = null;
        this.onDecline = null;
    }

    /**
     * Show the permission dialog
     * @param {Object} options - Dialog options
     * @param {Function} options.onAccept - Callback when user accepts
     * @param {Function} options.onDecline - Callback when user declines
     */
    show(options = {}) {
        this.onAccept = options.onAccept || (() => {});
        this.onDecline = options.onDecline || (() => {});

        // Create dialog if it doesn't exist
        if (!this.dialog) {
            this.createDialog();
        }

        // Show dialog
        this.dialog.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Animate in
        requestAnimationFrame(() => {
            this.dialog.classList.add('dialog-visible');
        });
    }

    /**
     * Hide the dialog
     */
    hide() {
        if (!this.dialog) return;

        this.dialog.classList.remove('dialog-visible');

        setTimeout(() => {
            this.dialog.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }

    /**
     * Create dialog HTML
     */
    createDialog() {
        this.dialog = document.createElement('div');
        this.dialog.id = 'notification-permission-dialog';
        this.dialog.className = 'notification-permission-dialog hidden';

        this.dialog.innerHTML = `
            <div class="dialog-overlay"></div>
            <div class="dialog-content">
                <div class="dialog-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </div>

                <h2 class="dialog-title">Benachrichtigungen aktivieren</h2>

                <p class="dialog-description">
                    Bleib auf dem Laufenden und erhalte wichtige Updates direkt auf dein Gerät:
                </p>

                <ul class="dialog-features">
                    <li>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Match-Genehmigungen</span>
                    </li>
                    <li>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Training-Erinnerungen</span>
                    </li>
                    <li>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Neue Challenges</span>
                    </li>
                    <li>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Rang-Updates</span>
                    </li>
                </ul>

                <p class="dialog-note">
                    Du kannst Benachrichtigungen jederzeit in den Einstellungen wieder deaktivieren.
                </p>

                <div class="dialog-actions">
                    <button id="notification-decline-btn" class="btn-secondary">
                        Vielleicht später
                    </button>
                    <button id="notification-accept-btn" class="btn-primary">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        Benachrichtigungen aktivieren
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        const acceptBtn = this.dialog.querySelector('#notification-accept-btn');
        const declineBtn = this.dialog.querySelector('#notification-decline-btn');

        acceptBtn.addEventListener('click', () => {
            this.hide();
            this.onAccept();
        });

        declineBtn.addEventListener('click', () => {
            this.hide();
            this.onDecline();
        });

        // Close on overlay click
        const overlay = this.dialog.querySelector('.dialog-overlay');
        overlay.addEventListener('click', () => {
            this.hide();
            this.onDecline();
        });

        document.body.appendChild(this.dialog);
    }

    /**
     * Remove dialog from DOM
     */
    destroy() {
        if (this.dialog && this.dialog.parentElement) {
            this.dialog.parentElement.removeChild(this.dialog);
            this.dialog = null;
        }
    }
}

// Global instance
if (!window.notificationPermissionDialog) {
    window.notificationPermissionDialog = new NotificationPermissionDialog();
}

export default NotificationPermissionDialog;
