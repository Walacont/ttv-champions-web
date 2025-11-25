/**
 * Global Toast Notification System
 * Shows beautiful toast messages that work across all pages
 */

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type: 'success', 'error', 'info', 'warning'
     * @param {number} duration - Duration in milliseconds (default: 4000)
     */
    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-enter`;

        // Icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close">×</button>
        `;

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.hide(toast);
        });

        // Add to container
        this.container.appendChild(toast);

        // Trigger enter animation
        requestAnimationFrame(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-visible');
        });

        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                this.hide(toast);
            }, duration);
        }

        return toast;
    }

    hide(toast) {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-exit');

        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }

    // Convenience methods
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    /**
     * Show a loading toast that can be updated
     * @param {string} message - Initial message
     * @returns {Object} - Object with update() and close() methods
     */
    loading(message = 'Lädt...') {
        const toast = this.show(message, 'info', 0); // Don't auto-hide
        toast.classList.add('toast-loading');

        return {
            update: (newMessage, newType = 'info') => {
                const messageEl = toast.querySelector('.toast-message');
                if (messageEl) messageEl.textContent = newMessage;

                // Update type
                toast.className = `toast toast-${newType} toast-visible`;
                if (newType === 'info') {
                    toast.classList.add('toast-loading');
                }
            },
            close: () => {
                this.hide(toast);
            },
            success: message => {
                this.hide(toast);
                this.success(message);
            },
            error: message => {
                this.hide(toast);
                this.error(message);
            },
        };
    }
}

// Create global instance
if (!window.notifications) {
    window.notifications = new NotificationManager();
}

// Export for module usage
export default NotificationManager;
