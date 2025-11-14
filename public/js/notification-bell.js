/**
 * NotificationBellManager
 * Manages in-app notifications with a bell icon, badge count, and dropdown panel
 */

import {
    collection,
    query,
    where,
    onSnapshot,
    orderBy,
    limit,
    deleteDoc,
    doc,
    updateDoc,
    writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export class NotificationBellManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.notifications = [];
        this.unsubscribe = null;

        // DOM elements
        this.bellButton = document.getElementById('notification-bell');
        this.badge = document.getElementById('notification-badge');
        this.panel = document.getElementById('notification-panel');
        this.list = document.getElementById('notifications-list');
        this.markAllReadButton = document.getElementById('mark-all-read');
        this.clearAllButton = document.getElementById('clear-notifications');

        if (!this.bellButton || !this.badge || !this.panel || !this.list) {
            console.error('NotificationBellManager: Required DOM elements not found');
            return;
        }

        this.setupEventListeners();
        this.loadNotifications();
    }

    setupEventListeners() {
        // Toggle dropdown on bell click
        this.bellButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        // Close panel when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.panel.contains(e.target) && !this.bellButton.contains(e.target)) {
                this.closePanel();
            }
        });

        // Mark all as read
        if (this.markAllReadButton) {
            this.markAllReadButton.addEventListener('click', () => {
                this.markAllAsRead();
            });
        }

        // Clear all notifications
        if (this.clearAllButton) {
            this.clearAllButton.addEventListener('click', () => {
                this.clearAll();
            });
        }
    }

    loadNotifications() {
        // Query user's notifications subcollection
        const notificationsRef = collection(this.db, `users/${this.userId}/notifications`);
        const q = query(
            notificationsRef,
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        // Real-time listener
        this.unsubscribe = onSnapshot(q, (snapshot) => {
            this.notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            this.updateUI();
        }, (error) => {
            console.error('Error loading notifications:', error);
            this.showError('Fehler beim Laden der Benachrichtigungen');
        });
    }

    updateUI() {
        this.updateBadge();
        this.updateList();
    }

    updateBadge() {
        // Count unread notifications
        const unreadCount = this.notifications.filter(n => !n.read).length;

        if (unreadCount > 0) {
            this.badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            this.badge.classList.remove('hidden');
        } else {
            this.badge.classList.add('hidden');
        }
    }

    updateList() {
        if (this.notifications.length === 0) {
            this.list.innerHTML = '<li class="p-4 text-center text-gray-500 text-sm">Keine Benachrichtigungen</li>';
            return;
        }

        this.list.innerHTML = this.notifications.map(notification => {
            const isUnread = !notification.read;
            const icon = this.getIconForType(notification.type);
            const bgClass = isUnread ? 'bg-blue-50' : 'bg-white';
            const borderClass = isUnread ? 'border-l-4 border-indigo-500' : '';

            return `
                <li class="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${bgClass} ${borderClass}" data-notification-id="${notification.id}">
                    <div class="flex gap-3">
                        <div class="flex-shrink-0 text-2xl">
                            ${icon}
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-start justify-between gap-2">
                                <p class="font-medium text-gray-900 text-sm ${isUnread ? 'font-semibold' : ''}">${this.escapeHtml(notification.title)}</p>
                                <button
                                    class="delete-notification flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
                                    data-id="${notification.id}"
                                    title="Löschen"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <p class="text-xs text-gray-600 mt-1">${this.escapeHtml(notification.body)}</p>
                            <p class="text-xs text-gray-400 mt-1">${this.formatTime(notification.createdAt)}</p>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        // Add click handlers for notifications
        this.list.querySelectorAll('li[data-notification-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking delete button
                if (e.target.closest('.delete-notification')) {
                    return;
                }

                const notificationId = item.dataset.notificationId;
                const notification = this.notifications.find(n => n.id === notificationId);

                if (notification && !notification.read) {
                    this.markAsRead(notificationId);
                }

                // Handle notification action (e.g., navigate to relevant page)
                if (notification && notification.data && notification.data.url) {
                    window.location.href = notification.data.url;
                }
            });
        });

        // Add delete handlers
        this.list.querySelectorAll('.delete-notification').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notificationId = btn.dataset.id;
                this.delete(notificationId);
            });
        });
    }

    getIconForType(type) {
        const icons = {
            'match_request': '🏓',
            'match_approved': '✅',
            'match_rejected': '❌',
            'challenge': '🎯',
            'challenge_completed': '🏆',
            'rank_up': '⬆️',
            'points_awarded': '⭐',
            'xp_awarded': '💪',
            'elo_change': '⚡',
            'training_reminder': '📅',
            'default': '🔔'
        };

        return icons[type] || icons.default;
    }

    togglePanel() {
        this.panel.classList.toggle('hidden');
    }

    closePanel() {
        this.panel.classList.add('hidden');
    }

    async markAsRead(notificationId) {
        try {
            const notificationRef = doc(this.db, `users/${this.userId}/notifications/${notificationId}`);
            await updateDoc(notificationRef, {
                read: true
            });
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    async markAllAsRead() {
        try {
            const unreadNotifications = this.notifications.filter(n => !n.read);

            if (unreadNotifications.length === 0) {
                return;
            }

            const batch = writeBatch(this.db);

            unreadNotifications.forEach(notification => {
                const notificationRef = doc(this.db, `users/${this.userId}/notifications/${notification.id}`);
                batch.update(notificationRef, { read: true });
            });

            await batch.commit();

            // Show success feedback
            if (window.notifications) {
                window.notifications.success('Alle Benachrichtigungen als gelesen markiert', 2000);
            }
        } catch (error) {
            console.error('Error marking all as read:', error);
            if (window.notifications) {
                window.notifications.error('Fehler beim Markieren der Benachrichtigungen', 3000);
            }
        }
    }

    async delete(notificationId) {
        try {
            const notificationRef = doc(this.db, `users/${this.userId}/notifications/${notificationId}`);
            await deleteDoc(notificationRef);
        } catch (error) {
            console.error('Error deleting notification:', error);
            if (window.notifications) {
                window.notifications.error('Fehler beim Löschen', 2000);
            }
        }
    }

    async clearAll() {
        if (this.notifications.length === 0) {
            return;
        }

        // Confirm before clearing
        if (!confirm(`Möchtest du wirklich alle ${this.notifications.length} Benachrichtigungen löschen?`)) {
            return;
        }

        try {
            const batch = writeBatch(this.db);

            this.notifications.forEach(notification => {
                const notificationRef = doc(this.db, `users/${this.userId}/notifications/${notification.id}`);
                batch.delete(notificationRef);
            });

            await batch.commit();

            // Show success feedback
            if (window.notifications) {
                window.notifications.success('Alle Benachrichtigungen gelöscht', 2000);
            }

            this.closePanel();
        } catch (error) {
            console.error('Error clearing all notifications:', error);
            if (window.notifications) {
                window.notifications.error('Fehler beim Löschen aller Benachrichtigungen', 3000);
            }
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '';

        // Handle Firestore Timestamp
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Min.`;
        if (diffHours < 24) return `vor ${diffHours} Std.`;
        if (diffDays === 1) return 'gestern';
        if (diffDays < 7) return `vor ${diffDays} Tagen`;

        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: diffDays > 365 ? 'numeric' : undefined
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        this.list.innerHTML = `
            <li class="p-4 text-center text-red-500 text-sm">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                ${message}
            </li>
        `;
    }

    // Cleanup method to unsubscribe from listeners
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

export default NotificationBellManager;
