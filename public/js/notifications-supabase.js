import { getSupabase } from './supabase-init.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils/security.js';

let notificationSubscription = null;
let matchRequestSubscription = null;
let doublesMatchRequestSubscription = null;
let notificationModalOpen = false;

/**
 * Initialisiert das Benachrichtigungssystem
 * @param {string} userId - Benutzer-ID
 */
export async function initNotifications(userId) {
    const db = getSupabase();
    if (!db || !userId) return;

    // Event-Handler ZUERST registrieren, bevor async Operations die UI blockieren könnten
    setupNotificationHandlers(userId);

    try {
        await updateNotificationBadge(userId);

        notificationSubscription = db
            .channel(`notifications-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                updateNotificationBadge(userId);
                if (notificationModalOpen) {
                    refreshNotificationModal(userId);
                }
            })
            .subscribe();

        // Reagiert auf zurückgezogene Match-Anfragen um Benachrichtigungen zu entfernen
        matchRequestSubscription = db
            .channel(`match-requests-${userId}`)
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'match_requests',
                filter: `player_b_id=eq.${userId}`
            }, async (payload) => {
                // Zurückgezogene Anfragen müssen aus Benachrichtigungen entfernt werden
                const deletedRequestId = payload.old?.id;
                if (deletedRequestId) {
                    await removeMatchRequestNotification(userId, deletedRequestId);
                    updateNotificationBadge(userId);
                    if (notificationModalOpen) {
                        refreshNotificationModal(userId);
                    }
                    if (typeof window.loadMatchRequests === 'function') {
                        window.loadMatchRequests();
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'match_requests',
                filter: `player_b_id=eq.${userId}`
            }, async (payload) => {
                if (typeof window.loadMatchRequests === 'function') {
                    window.loadMatchRequests();
                }
            })
            .subscribe();

        doublesMatchRequestSubscription = db
            .channel(`doubles-requests-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'doubles_match_requests'
            }, async (payload) => {
                // Nur für Anfragen bei denen der User beteiligt ist
                const record = payload.new || payload.old;
                if (!record) return;

                const teamA = record.team_a || {};
                const teamB = record.team_b || {};
                const isInvolved = teamA.player1_id === userId || teamA.player2_id === userId ||
                                  teamB.player1_id === userId || teamB.player2_id === userId;

                if (!isInvolved) return;

                if (payload.eventType === 'DELETE' && payload.old?.id) {
                    await removeDoublesRequestNotification(userId, payload.old.id);
                }

                updateNotificationBadge(userId);
                if (notificationModalOpen) {
                    refreshNotificationModal(userId);
                }

                if (typeof window.loadDoublesMatchRequests === 'function') {
                    window.loadDoublesMatchRequests();
                }
            })
            .subscribe();

        // Verhindert doppelte Listener bei mehrfacher Initialisierung
        if (window.notificationsLanguageListener) {
            window.removeEventListener('languageChanged', window.notificationsLanguageListener);
        }

        // Modal muss nach Sprachwechsel aktualisiert werden
        window.notificationsLanguageListener = async () => {
            // Kurze Verzögerung damit i18next die neue Sprache laden kann
            await new Promise(resolve => setTimeout(resolve, 100));
            if (notificationModalOpen) {
                refreshNotificationModal(userId);
            }
        };
        window.addEventListener('languageChanged', window.notificationsLanguageListener);
    } catch (e) {
        console.warn('Could not load notifications:', e);
    }
}

/**
 * Entfernt Benachrichtigung für zurückgezogene Match-Anfrage
 */
async function removeMatchRequestNotification(userId, requestId) {
    const db = getSupabase();
    if (!db) return;

    try {
        const { data: notifications } = await db
            .from('notifications')
            .select('id, data')
            .eq('user_id', userId)
            .eq('type', 'match_request');

        for (const notif of (notifications || [])) {
            if (notif.data?.request_id === requestId) {
                await db.from('notifications').delete().eq('id', notif.id);
            }
        }
    } catch (error) {
        console.error('Error removing match request notification:', error);
    }
}

/**
 * Entfernt Benachrichtigung für zurückgezogene Doppel-Anfrage
 */
async function removeDoublesRequestNotification(userId, requestId) {
    const db = getSupabase();
    if (!db) return;

    try {
        const { data: notifications } = await db
            .from('notifications')
            .select('id, data')
            .eq('user_id', userId)
            .eq('type', 'doubles_match_request');

        for (const notif of (notifications || [])) {
            if (notif.data?.request_id === requestId) {
                await db.from('notifications').delete().eq('id', notif.id);
            }
        }
    } catch (error) {
        console.error('Error removing doubles request notification:', error);
    }
}

/**
 * Aktualisiert Modal falls geöffnet
 */
async function refreshNotificationModal(userId) {
    const existingModal = document.getElementById('notification-modal');
    if (existingModal) {
        existingModal.remove();
        notificationModalOpen = false;
        showNotificationModal(userId);
    }
}

/**
 * Markiert Match-Anfragen automatisch als gelesen wenn sie bereits bestätigt wurden
 * @param {string} userId - Benutzer-ID
 * @param {Array} notifications - Benachrichtigungen
 * @returns {Array} - Aktualisierte Benachrichtigungen
 */
async function checkAndMarkConfirmedMatchRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    const unreadMatchRequestNotifs = notifications.filter(n =>
        n.type === 'match_request' && !n.is_read
    );

    if (unreadMatchRequestNotifs.length === 0) return notifications;

    const requestIds = unreadMatchRequestNotifs
        .map(n => n.data?.request_id)
        .filter(id => id);

    if (requestIds.length === 0) return notifications;

    try {
        const { data: matchRequests } = await db
            .from('match_requests')
            .select('id, status')
            .in('id', requestIds);

        const requestStatusMap = {};
        (matchRequests || []).forEach(mr => {
            requestStatusMap[mr.id] = mr.status;
        });

        // Gelöschte oder bereits bearbeitete Anfragen als gelesen markieren
        const notificationsToMarkRead = [];
        for (const notif of unreadMatchRequestNotifs) {
            const requestId = notif.data?.request_id;
            if (!requestId) continue;

            const status = requestStatusMap[requestId];
            if (!status || status === 'approved' || status === 'rejected') {
                notificationsToMarkRead.push(notif.id);
            }
        }

        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);

            return notifications.map(n => {
                if (notificationsToMarkRead.includes(n.id)) {
                    return { ...n, is_read: true };
                }
                return n;
            });
        }
    } catch (error) {
        console.error('Error checking confirmed match requests:', error);
    }

    return notifications;
}

/**
 * Markiert Doppel-Anfragen automatisch als gelesen wenn sie bereits bearbeitet wurden
 * @param {string} userId - Benutzer-ID
 * @param {Array} notifications - Benachrichtigungen
 * @returns {Array} - Aktualisierte Benachrichtigungen
 */
async function checkAndMarkConfirmedDoublesMatchRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    const unreadDoublesRequestNotifs = notifications.filter(n =>
        n.type === 'doubles_match_request' && !n.is_read
    );

    if (unreadDoublesRequestNotifs.length === 0) return notifications;

    const requestIds = unreadDoublesRequestNotifs
        .map(n => n.data?.request_id)
        .filter(id => id);

    if (requestIds.length === 0) return notifications;

    try {
        const { data: doublesRequests } = await db
            .from('doubles_match_requests')
            .select('id, status')
            .in('id', requestIds);

        const requestStatusMap = {};
        (doublesRequests || []).forEach(mr => {
            requestStatusMap[mr.id] = mr.status;
        });

        const notificationsToMarkRead = [];
        const notificationsToDelete = [];

        for (const notif of unreadDoublesRequestNotifs) {
            const requestId = notif.data?.request_id;
            if (!requestId) continue;

            const status = requestStatusMap[requestId];
            if (!status) {
                notificationsToDelete.push(notif.id);
            } else if (status === 'approved' || status === 'rejected' || status === 'processed') {
                notificationsToMarkRead.push(notif.id);
            }
        }

        if (notificationsToDelete.length > 0) {
            await db
                .from('notifications')
                .delete()
                .in('id', notificationsToDelete);
        }

        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);
        }

        return notifications
            .filter(n => !notificationsToDelete.includes(n.id))
            .map(n => {
                if (notificationsToMarkRead.includes(n.id)) {
                    return { ...n, is_read: true };
                }
                return n;
            });
    } catch (error) {
        console.error('Error checking confirmed doubles match requests:', error);
    }

    return notifications;
}

/**
 * Markiert Vereins-Anfragen automatisch als gelesen wenn sie bereits bearbeitet wurden
 * @param {string} userId - Benutzer-ID
 * @param {Array} notifications - Benachrichtigungen
 * @returns {Array} - Aktualisierte Benachrichtigungen
 */
async function checkAndMarkConfirmedClubRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    const unreadClubRequestNotifs = notifications.filter(n =>
        (n.type === 'club_join_request' || n.type === 'club_leave_request') && !n.is_read
    );

    if (unreadClubRequestNotifs.length === 0) return notifications;

    const joinNotifs = unreadClubRequestNotifs.filter(n => n.type === 'club_join_request');
    const leaveNotifs = unreadClubRequestNotifs.filter(n => n.type === 'club_leave_request');

    const notificationsToMarkRead = [];

    try {
        if (joinNotifs.length > 0) {
            const playerIds = joinNotifs
                .map(n => n.data?.player_id)
                .filter(id => id);

            if (playerIds.length > 0) {
                const { data: clubRequests } = await db
                    .from('club_requests')
                    .select('player_id, status')
                    .in('player_id', playerIds);

                const requestStatusMap = {};
                (clubRequests || []).forEach(r => {
                    requestStatusMap[r.player_id] = r.status;
                });

                for (const notif of joinNotifs) {
                    const playerId = notif.data?.player_id;
                    if (!playerId) continue;

                    const status = requestStatusMap[playerId];
                    if (!status || status === 'approved' || status === 'rejected') {
                        notificationsToMarkRead.push(notif.id);
                    }
                }
            }
        }

        if (leaveNotifs.length > 0) {
            const playerIds = leaveNotifs
                .map(n => n.data?.player_id)
                .filter(id => id);

            if (playerIds.length > 0) {
                const { data: leaveRequests } = await db
                    .from('leave_club_requests')
                    .select('player_id, status')
                    .in('player_id', playerIds);

                const requestStatusMap = {};
                (leaveRequests || []).forEach(r => {
                    requestStatusMap[r.player_id] = r.status;
                });

                for (const notif of leaveNotifs) {
                    const playerId = notif.data?.player_id;
                    if (!playerId) continue;

                    const status = requestStatusMap[playerId];
                    if (!status || status === 'approved' || status === 'rejected') {
                        notificationsToMarkRead.push(notif.id);
                    }
                }
            }
        }

        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);

            return notifications.map(n => {
                if (notificationsToMarkRead.includes(n.id)) {
                    return { ...n, is_read: true };
                }
                return n;
            });
        }
    } catch (error) {
        console.error('Error checking confirmed club requests:', error);
    }

    return notifications;
}

/**
 * Aktualisiert Badge mit Anzahl ungelesener Benachrichtigungen
 */
async function updateNotificationBadge(userId) {
    const db = getSupabase();
    if (!db) return;

    const { count, error } = await db
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (error) {
        console.error('Error fetching notification count:', error);
        return;
    }

    const unreadCount = count || 0;

    const desktopBadge = document.getElementById('desktop-notifications-badge');
    if (desktopBadge) {
        if (unreadCount > 0) {
            desktopBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            desktopBadge.classList.remove('hidden');
        } else {
            desktopBadge.classList.add('hidden');
        }
    }

    const mobileBadge = document.getElementById('mobile-notifications-badge');
    if (mobileBadge) {
        if (unreadCount > 0) {
            mobileBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            mobileBadge.style.display = 'flex';
        } else {
            mobileBadge.style.display = 'none';
        }
    }
}

/**
 * Registriert Click-Handler für Benachrichtigungs-Icons
 */
function setupNotificationHandlers(userId) {
    const desktopBtn = document.getElementById('desktop-notifications-btn');
    const mobileBtn = document.getElementById('mobile-notifications-btn');

    const handler = () => showNotificationModal(userId);

    if (desktopBtn) {
        desktopBtn.addEventListener('click', handler);
    }
    if (mobileBtn) {
        mobileBtn.addEventListener('click', handler);
    }
}

/**
 * Zeigt das Benachrichtigungs-Modal
 */
async function showNotificationModal(userId) {
    if (notificationModalOpen) return;
    notificationModalOpen = true;

    const db = getSupabase();
    if (!db) return;

    const { data: rawNotifications, error } = await db
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching notifications:', error);
        notificationModalOpen = false;
        return;
    }

    let notifications = await checkAndMarkConfirmedMatchRequests(userId, rawNotifications);
    notifications = await checkAndMarkConfirmedDoublesMatchRequests(userId, notifications);
    notifications = await checkAndMarkConfirmedClubRequests(userId, notifications);

    updateNotificationBadge(userId);

    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[99999] flex items-start justify-center pt-16 sm:pt-20';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="text-lg font-semibold text-gray-900">${t('notifications.title')}</h3>
                <button id="close-notification-modal" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto">
                ${notifications && notifications.length > 0 ? `
                    <ul class="divide-y divide-gray-200">
                        ${notifications.map(n => `
                            <li class="p-4 ${n.is_read ? 'bg-white' : 'bg-blue-50'} hover:bg-gray-50 notification-item" data-id="${n.id}" data-read="${n.is_read}" data-type="${n.type}">
                                <div class="flex items-start gap-3">
                                    <div class="flex-shrink-0 mt-1">
                                        ${getNotificationIcon(n.type)}
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <div class="cursor-pointer notification-content">
                                            <p class="text-sm font-medium text-gray-900">${escapeHtml(n.title)}</p>
                                            <p class="text-sm text-gray-600 mt-0.5">${escapeHtml(n.message)}</p>
                                            <p class="text-xs text-gray-400 mt-1">${formatTimeAgo(n.created_at)}</p>
                                        </div>
                                        ${renderFollowRequestActions(n)}
                                    </div>
                                    <div class="flex items-center gap-2 flex-shrink-0">
                                        ${!n.is_read && !isActionableRequest(n.type) ? '<span class="unread-dot w-2 h-2 bg-blue-500 rounded-full"></span>' : ''}
                                        ${n.is_read ? `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="${t('common.delete')}"><i class="fas fa-trash-alt text-sm"></i></button>` : ''}
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="p-8 text-center text-gray-500">
                        <i class="far fa-bell-slash text-4xl mb-3"></i>
                        <p>${t('notifications.noNotifications')}</p>
                    </div>
                `}
            </div>
            ${notifications && notifications.length > 0 ? `
                <div class="p-3 border-t flex gap-2">
                    <button id="mark-all-read" class="flex-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium py-2">
                        ${t('notifications.markAllRead')}
                    </button>
                    <button id="delete-all-read" class="flex-1 text-sm text-red-500 hover:text-red-700 font-medium py-2">
                        ${t('notifications.deleteRead')}
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
        modal.remove();
        notificationModalOpen = false;
    };

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.getElementById('close-notification-modal')?.addEventListener('click', closeModal);

    // Unterschiedliche Behandlung je nach Benachrichtigungstyp
    modal.querySelectorAll('.notification-content').forEach((content, index) => {
        content.addEventListener('click', async () => {
            const item = content.closest('.notification-item');
            const notificationId = item.dataset.id;
            const notification = notifications[index];

            // Match-Anfragen: Navigation ohne als gelesen zu markieren (User muss erst annehmen/ablehnen)
            if (isMatchRequest(notification.type)) {
                handleNotificationClick(notification);
                closeModal();
                return;
            }

            // Vereins-Anfragen: Navigation ohne als gelesen zu markieren (Coach muss erst bearbeiten)
            if (isClubRequest(notification.type)) {
                handleNotificationClick(notification);
                closeModal();
                return;
            }

            await markNotificationAsRead(notificationId);
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
            updateNotificationBadge(userId);

            handleNotificationClick(notification);
            closeModal();
        });
    });

    modal.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-notification');
        if (deleteBtn) {
            e.stopPropagation();
            const item = deleteBtn.closest('.notification-item');
            const notificationId = item.dataset.id;
            await deleteNotification(notificationId);
            item.remove();
            updateNotificationBadge(userId);
            checkEmptyNotifications(modal);
        }
    });

    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-follow-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requesterId = acceptBtn.dataset.requesterId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.follow-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptFollow(requesterId, notificationId, userId);
            if (success) {
                item.classList.remove('bg-blue-50');
                item.classList.add('bg-white');
                item.dataset.read = 'true';
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span class="text-sm text-green-600"><i class="fas fa-check mr-1"></i>Angenommen</span>';
                }
                updateNotificationBadge(userId);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-follow-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requesterId = declineBtn.dataset.requesterId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.follow-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleDeclineFollow(requesterId, notificationId, userId);
            if (success) {
                item.remove();
                updateNotificationBadge(userId);
                checkEmptyNotifications(modal);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-match-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requestId = acceptBtn.dataset.requestId;
            const requesterId = acceptBtn.dataset.requesterId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.match-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptMatch(requestId, requesterId, notificationId, userId);
            if (success) {
                item.classList.remove('bg-blue-50');
                item.classList.add('bg-white');
                item.dataset.read = 'true';
                if (actionsDiv) {
                    actionsDiv.innerHTML = '<span class="text-sm text-green-600"><i class="fas fa-check mr-1"></i>Angenommen</span>';
                }
                updateNotificationBadge(userId);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-match-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requestId = declineBtn.dataset.requestId;
            const requesterId = declineBtn.dataset.requesterId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.match-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleDeclineMatch(requestId, requesterId, notificationId, userId);
            if (success) {
                item.remove();
                updateNotificationBadge(userId);
                checkEmptyNotifications(modal);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-doubles-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requestId = acceptBtn.dataset.requestId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.doubles-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptDoublesMatch(requestId, notificationId, userId);
            if (success) {
                item.classList.remove('bg-blue-50');
                item.classList.add('bg-white');
                item.dataset.read = 'true';
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-green-600"><i class="fas fa-check mr-1"></i>${t('notifications.accepted')}</span>`;
                }
                updateNotificationBadge(userId);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-doubles-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requestId = declineBtn.dataset.requestId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            const actionsDiv = item.querySelector('.doubles-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleDeclineDoublesMatch(requestId, notificationId, userId);
            if (success) {
                item.remove();
                updateNotificationBadge(userId);
                checkEmptyNotifications(modal);
            } else {
                if (actionsDiv) {
                    actionsDiv.innerHTML = `<span class="text-sm text-red-500">${t('notifications.error')}</span>`;
                }
            }
        }
    });

    document.getElementById('mark-all-read')?.addEventListener('click', async () => {
        await markAllNotificationsAsRead(userId);
        modal.querySelectorAll('.notification-item').forEach(item => {
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
        });
        updateNotificationBadge(userId);
    });

    document.getElementById('delete-all-read')?.addEventListener('click', async () => {
        await deleteAllReadNotifications(userId);
        modal.querySelectorAll('.notification-item[data-read="true"]').forEach(item => {
            item.remove();
        });
        updateNotificationBadge(userId);
        const remainingItems = modal.querySelectorAll('.notification-item');
        if (remainingItems.length === 0) {
            modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="far fa-bell-slash text-4xl mb-3"></i>
                    <p>${t('notifications.noNotifications')}</p>
                </div>
            `;
            modal.querySelector('.p-3.border-t')?.remove();
        }
    });
}

/**
 * Markiert Benachrichtigung als gelesen
 */
async function markNotificationAsRead(notificationId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
}

/**
 * Markiert alle Benachrichtigungen als gelesen
 */
async function markAllNotificationsAsRead(userId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
}

/**
 * Löscht Benachrichtigung
 */
async function deleteNotification(notificationId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .delete()
        .eq('id', notificationId);
}

/**
 * Löscht alle gelesenen Benachrichtigungen
 */
async function deleteAllReadNotifications(userId) {
    const db = getSupabase();
    if (!db) return;

    await db
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .eq('is_read', true);
}

/**
 * Erstellt neue Benachrichtigung und sendet optional eine Push-Notification
 * @param {string} userId - Empfänger
 * @param {string} type - Benachrichtigungstyp
 * @param {string} title - Titel
 * @param {string} message - Nachricht
 * @param {Object} data - Zusätzliche Daten
 * @param {boolean} sendPush - Push-Notification senden (default: true für bestimmte Typen)
 */
export async function createNotification(userId, type, title, message, data = {}) {
    const db = getSupabase();
    if (!db) return;

    const { error } = await db
        .from('notifications')
        .insert({
            user_id: userId,
            type,
            title,
            message,
            data
        });

    if (error) {
        console.error('Error creating notification:', error);
        return;
    }

    // Push notification is sent automatically via DB trigger (send_push_notification_instant)
}

/**
 * Erstellt Follow-Request Benachrichtigung
 */
export async function createFollowRequestNotification(toUserId, fromUserId, fromUserName) {
    const title = t('notifications.types.followRequest');
    const message = t('notifications.messages.followRequest', { name: fromUserName });

    await createNotification(toUserId, 'follow_request', title, message, {
        requester_id: fromUserId,
        requester_name: fromUserName
    });
}

/**
 * Erstellt Follow-Accepted Benachrichtigung
 */
export async function createFollowAcceptedNotification(toUserId, accepterId, accepterName) {
    const title = t('notifications.types.followRequestAccepted');
    const message = t('notifications.messages.followRequestAccepted', { name: accepterName });

    await createNotification(toUserId, 'follow_accepted', title, message, {
        accepter_id: accepterId,
        accepter_name: accepterName
    });
}

/**
 * Erstellt Punkte-Benachrichtigung
 */
export async function createPointsNotification(userId, points, xp, eloChange, reason, awardedBy) {
    const isPositive = points >= 0;
    const type = isPositive ? 'points_awarded' : 'points_deducted';
    const title = isPositive ? 'Punkte erhalten!' : 'Punkte abgezogen';

    let message = `${isPositive ? '+' : ''}${points} Saisonpunkte`;
    if (xp !== undefined && xp !== points) {
        message += `, ${xp >= 0 ? '+' : ''}${xp} XP`;
    }
    if (eloChange && eloChange !== 0) {
        message += `, ${eloChange >= 0 ? '+' : ''}${eloChange} Elo`;
    }
    message += ` - ${reason}`;
    if (awardedBy) {
        message += ` (von ${awardedBy})`;
    }

    await createNotification(userId, type, title, message, {
        points,
        xp,
        elo_change: eloChange,
        reason,
        awarded_by: awardedBy
    });
}

/**
 * Prüft ob Benachrichtigungsliste leer ist
 */
function checkEmptyNotifications(modal) {
    const remainingItems = modal.querySelectorAll('.notification-item');
    if (remainingItems.length === 0) {
        modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <i class="far fa-bell-slash text-4xl mb-3"></i>
                <p>${t('notifications.noNotifications')}</p>
            </div>
        `;
        modal.querySelector('.p-3.border-t')?.remove();
    }
}

/**
 * Behandelt Click auf Benachrichtigung - Navigation je nach Typ
 */
function handleNotificationClick(notification) {
    if (!notification) return;

    const type = notification.type;

    if (type === 'match_request') {
        const wettkampfTab = document.querySelector('[data-tab="matches"]') ||
                            document.querySelector('[data-tab="wettkampf"]') ||
                            document.querySelector('button[onclick*="matches"]');
        if (wettkampfTab) {
            wettkampfTab.click();
            setTimeout(() => {
                const pendingSection = document.getElementById('pending-requests-section');
                if (pendingSection) {
                    pendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
            return;
        }
        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#pending-requests-section';
        }
        return;
    }

    if (type === 'doubles_match_request') {
        const wettkampfTab = document.querySelector('[data-tab="matches"]') ||
                            document.querySelector('[data-tab="wettkampf"]') ||
                            document.querySelector('button[onclick*="matches"]');
        if (wettkampfTab) {
            wettkampfTab.click();
            setTimeout(() => {
                const pendingSection = document.getElementById('pending-requests-section');
                if (pendingSection) {
                    pendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 150);
            return;
        }
        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#pending-requests-section';
        }
        return;
    }

    if (type === 'follow_request' || type === 'friend_request') {
        const requesterId = notification.data?.requester_id;
        if (requesterId) {
            window.location.href = `/profile.html?id=${requesterId}`;
            return;
        }
    }

    if (type === 'friend_request_accepted' || type === 'follow_accepted') {
        const accepterId = notification.data?.accepter_id;
        if (accepterId) {
            window.location.href = `/profile.html?id=${accepterId}`;
            return;
        }
        const communityTab = document.querySelector('[data-tab="community"]');
        if (communityTab) {
            communityTab.click();
        }
    }

    if (type === 'club_join_request' || type === 'club_leave_request') {
        const isLeaveRequest = type === 'club_leave_request';

        if (isLeaveRequest) {
            const statisticsTab = document.querySelector('[data-tab="statistics"]');
            if (statisticsTab) {
                statisticsTab.click();
                setTimeout(() => {
                    const requestsSection = document.getElementById('leave-requests-list');
                    if (requestsSection) {
                        requestsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
                return;
            }
        } else {
            const vereinTab = document.querySelector('[data-tab="club"]') ||
                              document.querySelector('[data-tab="verein"]') ||
                              document.querySelector('button[onclick*="club"]');
            if (vereinTab) {
                vereinTab.click();
                setTimeout(() => {
                    const requestsSection = document.getElementById('club-join-requests-list');
                    if (requestsSection) {
                        requestsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
                return;
            }
        }

        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#club-requests';
        }
        return;
    }

    // Event-Erinnerung: Zum Events-Bereich navigieren
    if (type === 'event_reminder') {
        const eventId = notification.data?.event_id;

        if (window.location.pathname.includes('dashboard')) {
            // Already on dashboard - scroll to upcoming events section
            const overviewTab = document.querySelector('[data-tab="overview"]');
            if (overviewTab) overviewTab.click();
            setTimeout(() => {
                const eventsSection = document.getElementById('upcoming-events-section');
                if (eventsSection) {
                    eventsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
            return;
        }

        window.location.href = '/dashboard.html#upcoming-events-section';
        return;
    }

    // Video-Feedback: Zum "Meine Videos"-Tab navigieren
    if (type === 'video_feedback') {
        const videoId = notification.data?.video_id;

        // Wenn auf dem Dashboard, zum Videos-Tab wechseln
        if (window.location.pathname.includes('dashboard')) {
            const exercisesTab = document.querySelector('[data-tab="exercises"]');
            if (exercisesTab) {
                exercisesTab.click();
                setTimeout(() => {
                    // Zum "Meine Videos" Sub-Tab wechseln
                    const myVideosSubTab = document.querySelector('[data-subtab="my-videos"]');
                    if (myVideosSubTab) {
                        myVideosSubTab.click();
                        // Video-Detail-Modal öffnen falls videoId vorhanden
                        if (videoId && typeof window.playerVideos?.showVideoDetail === 'function') {
                            setTimeout(() => {
                                window.playerVideos.showVideoDetail(videoId);
                            }, 300);
                        }
                    }
                }, 100);
                return;
            }
        }

        // Sonst zum Dashboard navigieren
        window.location.href = videoId
            ? `/dashboard.html#my-videos?video=${videoId}`
            : '/dashboard.html#my-videos';
        return;
    }
}

/**
 * Gibt Icon für Benachrichtigungstyp zurück
 */
function getNotificationIcon(type) {
    const icons = {
        'points_awarded': '<i class="fas fa-plus-circle text-green-500 text-lg"></i>',
        'points_deducted': '<i class="fas fa-minus-circle text-red-500 text-lg"></i>',
        'match_request': '<i class="fas fa-table-tennis-paddle-ball text-indigo-500 text-lg"></i>',
        'match_approved': '<i class="fas fa-check-circle text-green-500 text-lg"></i>',
        'doubles_match_request': '<i class="fas fa-people-group text-purple-500 text-lg"></i>',
        'doubles_match_rejected': '<i class="fas fa-people-group text-red-500 text-lg"></i>',
        'doubles_match_confirmed': '<i class="fas fa-people-group text-green-500 text-lg"></i>',
        'challenge_completed': '<i class="fas fa-trophy text-yellow-500 text-lg"></i>',
        'follow_request': '<i class="fas fa-user-plus text-indigo-500 text-lg"></i>',
        'friend_request': '<i class="fas fa-user-plus text-indigo-500 text-lg"></i>',
        'new_follower': '<i class="fas fa-user-plus text-indigo-500 text-lg"></i>',
        'friend_request_accepted': '<i class="fas fa-user-check text-green-500 text-lg"></i>',
        'follow_request_accepted': '<i class="fas fa-user-check text-green-500 text-lg"></i>',
        'follow_accepted': '<i class="fas fa-user-check text-green-500 text-lg"></i>',
        'follow_request_declined': '<i class="fas fa-user-times text-red-500 text-lg"></i>',
        'club_join_request': '<i class="fas fa-building text-blue-500 text-lg"></i>',
        'club_leave_request': '<i class="fas fa-door-open text-indigo-500 text-lg"></i>',
        'club_join_approved': '<i class="fas fa-building text-green-500 text-lg"></i>',
        'club_join_rejected': '<i class="fas fa-building text-red-500 text-lg"></i>',
        'club_leave_approved': '<i class="fas fa-door-open text-green-500 text-lg"></i>',
        'club_leave_rejected': '<i class="fas fa-door-open text-red-500 text-lg"></i>',
        'club_kicked': '<i class="fas fa-user-slash text-red-500 text-lg"></i>',
        'video_feedback': '<i class="fas fa-video text-purple-500 text-lg"></i>',
        'event_reminder': '<i class="fas fa-calendar-check text-amber-500 text-lg"></i>',
        'default': '<i class="fas fa-bell text-gray-500 text-lg"></i>'
    };
    return icons[type] || icons.default;
}

function isFollowRequest(type) {
    return type === 'follow_request' || type === 'friend_request';
}

function isMatchRequest(type) {
    return type === 'match_request';
}

function isDoublesMatchRequest(type) {
    return type === 'doubles_match_request';
}

function isClubRequest(type) {
    return type === 'club_join_request' || type === 'club_leave_request';
}

function isActionableRequest(type) {
    return isFollowRequest(type) || isMatchRequest(type) || isDoublesMatchRequest(type) || isClubRequest(type);
}

/**
 * Rendert Action-Buttons für Benachrichtigungen
 */
function renderFollowRequestActions(notification) {
    if (isFollowRequest(notification.type) && !notification.is_read) {
        const requesterId = notification.data?.requester_id;
        if (!requesterId) return '';

        return `
            <div class="follow-request-actions flex gap-2 mt-2">
                <button class="accept-follow-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
                        data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                    <i class="fas fa-check mr-1"></i>${t('notifications.accept')}
                </button>
                <button class="decline-follow-btn bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full transition"
                        data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                    <i class="fas fa-times mr-1"></i>${t('notifications.decline')}
                </button>
            </div>
        `;
    }

    if (isMatchRequest(notification.type)) {
        if (!notification.is_read) {
            return `
                <div class="match-request-hint mt-2">
                    <span class="text-xs text-indigo-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>${t('notifications.tapToMatch')}
                    </span>
                </div>
            `;
        } else {
            return `
                <div class="match-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>${t('notifications.alreadyProcessed')}
                    </span>
                </div>
            `;
        }
    }

    if (isClubRequest(notification.type)) {
        if (!notification.is_read) {
            const isJoinRequest = notification.type === 'club_join_request';
            return `
                <div class="club-request-hint mt-2">
                    <span class="text-xs text-blue-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>${isJoinRequest ? t('notifications.tapToJoinRequests') : t('notifications.tapToLeaveRequests')}
                    </span>
                </div>
            `;
        } else {
            return `
                <div class="club-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>${t('notifications.alreadyProcessed')}
                    </span>
                </div>
            `;
        }
    }

    if (isDoublesMatchRequest(notification.type)) {
        const requestId = notification.data?.request_id;
        if (!notification.is_read && requestId) {
            return `
                <div class="doubles-request-actions flex gap-2 mt-2">
                    <button class="accept-doubles-btn bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
                            data-request-id="${requestId}" data-notification-id="${notification.id}">
                        <i class="fas fa-check mr-1"></i>${t('notifications.confirm')}
                    </button>
                    <button class="decline-doubles-btn bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full transition"
                            data-request-id="${requestId}" data-notification-id="${notification.id}">
                        <i class="fas fa-times mr-1"></i>${t('notifications.decline')}
                    </button>
                </div>
            `;
        } else if (!requestId) {
            return `
                <div class="doubles-request-hint mt-2">
                    <span class="text-xs text-purple-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>${t('notifications.tapToDoubles')}
                    </span>
                </div>
            `;
        } else {
            return `
                <div class="doubles-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>${t('notifications.alreadyProcessed')}
                    </span>
                </div>
            `;
        }
    }

    return '';
}

/**
 * Behandelt Follow-Request Annahme
 */
async function handleAcceptFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        const { data: friendship } = await db
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('Friendship not found');
            return false;
        }

        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || t('notifications.someone');

        const { error } = await db.rpc('accept_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        await markNotificationAsRead(notificationId);
        await createFollowAcceptedNotification(requesterId, userId, currentUserName);

        return true;
    } catch (error) {
        console.error('Error accepting follow request:', error);
        return false;
    }
}

/**
 * Behandelt Follow-Request Ablehnung
 */
async function handleDeclineFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        const { data: friendship } = await db
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('Friendship not found');
            // Benachrichtigung trotzdem löschen falls Freundschaft bereits bearbeitet wurde
            await deleteNotification(notificationId);
            return true;
        }

        const { error } = await db.rpc('decline_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        await deleteNotification(notificationId);

        return true;
    } catch (error) {
        console.error('Error declining follow request:', error);
        return false;
    }
}

/**
 * Behandelt Match-Request Annahme
 */
async function handleAcceptMatch(requestId, requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        let matchRequest;
        if (requestId) {
            const { data } = await db
                .from('match_requests')
                .select('*')
                .eq('id', requestId)
                .single();
            matchRequest = data;
        } else if (requesterId) {
            const { data } = await db
                .from('match_requests')
                .select('*')
                .eq('player_a_id', requesterId)
                .eq('player_b_id', userId)
                .eq('status', 'pending_player')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            matchRequest = data;
        }

        if (!matchRequest) {
            console.error('Match request not found');
            await deleteNotification(notificationId);
            return true;
        }

        let approvals = matchRequest.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }
        approvals.player_b = true;

        const { error: updateError } = await db
            .from('match_requests')
            .update({
                status: 'approved',
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', matchRequest.id);

        if (updateError) throw updateError;

        if (typeof window.createMatchFromRequest === 'function') {
            await window.createMatchFromRequest(matchRequest);
        }

        await markNotificationAsRead(notificationId);

        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Der Gegner';

        await createNotification(
            matchRequest.player_a_id,
            'match_approved',
            t('notifications.matchApproved'),
            t('notifications.matchApprovedMessage', { name: currentUserName })
        );

        window.dispatchEvent(new CustomEvent('matchRequestUpdated', {
            detail: { type: 'singles', action: 'approved', requestId: matchRequest.id }
        }));

        if (typeof window.loadMatchRequests === 'function') {
            window.loadMatchRequests();
        }

        return true;
    } catch (error) {
        console.error('Error accepting match request:', error);
        return false;
    }
}

/**
 * Behandelt Match-Request Ablehnung
 */
async function handleDeclineMatch(requestId, requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        let matchRequest;
        if (requestId) {
            const { data } = await db
                .from('match_requests')
                .select('*')
                .eq('id', requestId)
                .single();
            matchRequest = data;
        } else if (requesterId) {
            const { data } = await db
                .from('match_requests')
                .select('*')
                .eq('player_a_id', requesterId)
                .eq('player_b_id', userId)
                .eq('status', 'pending_player')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            matchRequest = data;
        }

        if (!matchRequest) {
            console.error('Match request not found');
            await deleteNotification(notificationId);
            return true;
        }

        const { error: updateError } = await db
            .from('match_requests')
            .update({
                status: 'rejected',
                updated_at: new Date().toISOString()
            })
            .eq('id', matchRequest.id);

        if (updateError) throw updateError;

        await deleteNotification(notificationId);

        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Der Gegner';

        await createNotification(
            matchRequest.player_a_id,
            'match_rejected',
            t('notifications.matchRejected'),
            t('notifications.matchRejectedMessage', { name: currentUserName })
        );

        if (typeof window.loadMatchRequests === 'function') {
            window.loadMatchRequests();
        }

        return true;
    } catch (error) {
        console.error('Error declining match request:', error);
        return false;
    }
}

/**
 * Behandelt Doppel-Match Annahme
 */
async function handleAcceptDoublesMatch(requestId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        const { confirmDoublesMatchRequest } = await import('./doubles-matches-supabase.js');

        const result = await confirmDoublesMatchRequest(requestId, userId, db);

        if (!result.success) {
            console.error('Failed to confirm doubles match:', result.error);
            return false;
        }

        await markNotificationAsRead(notificationId);

        return true;
    } catch (error) {
        console.error('Error accepting doubles match request:', error);
        return false;
    }
}

/**
 * Behandelt Doppel-Match Ablehnung
 */
async function handleDeclineDoublesMatch(requestId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('id', userId)
            .single();

        const { rejectDoublesMatchRequest } = await import('./doubles-matches-supabase.js');

        await rejectDoublesMatchRequest(requestId, 'Vom Spieler abgelehnt', db, {
            id: userId,
            first_name: currentUserProfile?.first_name,
            last_name: currentUserProfile?.last_name
        });

        await deleteNotification(notificationId);

        return true;
    } catch (error) {
        console.error('Error declining doubles match request:', error);
        return false;
    }
}

/**
 * Formatiert Zeitangaben
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
}

/**
 * Räumt Subscriptions auf
 */
export function cleanupNotifications() {
    if (notificationSubscription) {
        notificationSubscription.unsubscribe();
        notificationSubscription = null;
    }
    if (matchRequestSubscription) {
        matchRequestSubscription.unsubscribe();
        matchRequestSubscription = null;
    }
}
