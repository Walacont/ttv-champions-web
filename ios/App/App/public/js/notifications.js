// Toast-Benachrichtigungssystem

class NotificationManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-enter`;

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
            <button class="toast-close" aria-label="Schließen">×</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.hide(toast);
        });

        this.container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-visible');
        });

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

    loading(message = 'Lädt...') {
        const toast = this.show(message, 'info', 0);
        toast.classList.add('toast-loading');

        return {
            update: (newMessage, newType = 'info') => {
                const messageEl = toast.querySelector('.toast-message');
                if (messageEl) messageEl.textContent = newMessage;
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

if (!window.notifications) {
    window.notifications = new NotificationManager();
}

export default NotificationManager;
