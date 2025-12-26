// Notifications Module - Supabase Version
// Handles in-app notifications for points, matches, etc.

import { getSupabase } from './supabase-init.js';
import { t } from './i18n.js';
import { escapeHtml } from './utils/security.js';

let notificationSubscription = null;
let matchRequestSubscription = null;
let doublesMatchRequestSubscription = null;
let notificationModalOpen = false;

/**
 * Initialize notifications system
 * @param {string} userId - Current user's ID
 */
export async function initNotifications(userId) {
    const db = getSupabase();
    if (!db || !userId) return;

    // Setup notification bell click handlers FIRST (before async operations)
    setupNotificationHandlers(userId);

    // Load initial notification count (non-blocking)
    try {
        await updateNotificationBadge(userId);

        // Subscribe to real-time notifications
        notificationSubscription = db
            .channel(`notifications-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                updateNotificationBadge(userId);
                // If notification modal is open, refresh it
                if (notificationModalOpen) {
                    refreshNotificationModal(userId);
                }
            })
            .subscribe();

        // Subscribe to match_requests changes (for real-time updates when requests are withdrawn)
        matchRequestSubscription = db
            .channel(`match-requests-${userId}`)
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'match_requests',
                filter: `player_b_id=eq.${userId}`
            }, async (payload) => {
                // When a match request is deleted (withdrawn), remove the corresponding notification
                const deletedRequestId = payload.old?.id;
                if (deletedRequestId) {
                    await removeMatchRequestNotification(userId, deletedRequestId);
                    updateNotificationBadge(userId);
                    if (notificationModalOpen) {
                        refreshNotificationModal(userId);
                    }
                    // Also refresh match requests list if available
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
                // When a match request is updated (e.g., status changed), refresh
                if (typeof window.loadMatchRequests === 'function') {
                    window.loadMatchRequests();
                }
            })
            .subscribe();

        // Subscribe to doubles_match_requests changes
        doublesMatchRequestSubscription = db
            .channel(`doubles-requests-${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'doubles_match_requests'
            }, async (payload) => {
                // Check if current user is involved in this request
                const record = payload.new || payload.old;
                if (!record) return;

                const teamA = record.team_a || {};
                const teamB = record.team_b || {};
                const isInvolved = teamA.player1_id === userId || teamA.player2_id === userId ||
                                  teamB.player1_id === userId || teamB.player2_id === userId;

                if (!isInvolved) return;

                // Handle deletion - remove corresponding notification
                if (payload.eventType === 'DELETE' && payload.old?.id) {
                    await removeDoublesRequestNotification(userId, payload.old.id);
                }

                // Refresh notifications
                updateNotificationBadge(userId);
                if (notificationModalOpen) {
                    refreshNotificationModal(userId);
                }

                // Refresh doubles requests list if available
                if (typeof window.loadDoublesMatchRequests === 'function') {
                    window.loadDoublesMatchRequests();
                }
            })
            .subscribe();

        // Remove any existing language change listener to avoid duplicates
        if (window.notificationsLanguageListener) {
            window.removeEventListener('languageChanged', window.notificationsLanguageListener);
        }

        // Listen for language changes and refresh notifications if modal is open
        window.notificationsLanguageListener = async () => {
            // Small delay to ensure i18next has loaded the new language
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
 * Remove notification for a withdrawn match request
 */
async function removeMatchRequestNotification(userId, requestId) {
    const db = getSupabase();
    if (!db) return;

    try {
        // Find and delete notifications with this request_id
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
 * Remove notification for a withdrawn doubles match request
 */
async function removeDoublesRequestNotification(userId, requestId) {
    const db = getSupabase();
    if (!db) return;

    try {
        // Find and delete notifications with this request_id
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
 * Refresh the notification modal if it's open
 */
async function refreshNotificationModal(userId) {
    const existingModal = document.getElementById('notification-modal');
    if (existingModal) {
        existingModal.remove();
        notificationModalOpen = false;
        // Re-open the modal with fresh data
        showNotificationModal(userId);
    }
}

/**
 * Check and mark match request notifications as read if the match is already confirmed
 * @param {string} userId - Current user's ID
 * @param {Array} notifications - Array of notifications to check
 * @returns {Array} - Updated notifications array with is_read updated for confirmed matches
 */
async function checkAndMarkConfirmedMatchRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    // Find all unread match_request notifications
    const unreadMatchRequestNotifs = notifications.filter(n =>
        n.type === 'match_request' && !n.is_read
    );

    if (unreadMatchRequestNotifs.length === 0) return notifications;

    // Get all request IDs from these notifications
    const requestIds = unreadMatchRequestNotifs
        .map(n => n.data?.request_id)
        .filter(id => id);

    if (requestIds.length === 0) return notifications;

    try {
        // Check status of these match requests
        const { data: matchRequests } = await db
            .from('match_requests')
            .select('id, status')
            .in('id', requestIds);

        // Create a map of request statuses
        const requestStatusMap = {};
        (matchRequests || []).forEach(mr => {
            requestStatusMap[mr.id] = mr.status;
        });

        // Find notifications that should be marked as read (approved, rejected, or deleted)
        const notificationsToMarkRead = [];
        for (const notif of unreadMatchRequestNotifs) {
            const requestId = notif.data?.request_id;
            if (!requestId) continue;

            const status = requestStatusMap[requestId];
            // If request doesn't exist (deleted) or is approved/rejected, mark notification as read
            if (!status || status === 'approved' || status === 'rejected') {
                notificationsToMarkRead.push(notif.id);
            }
        }

        // Mark these notifications as read in the database
        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);

            // Update the notifications array to reflect the change
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
 * Check and mark doubles match request notifications as read if the request is already handled
 * @param {string} userId - Current user's ID
 * @param {Array} notifications - Array of notifications to check
 * @returns {Array} - Updated notifications array with is_read updated for handled requests
 */
async function checkAndMarkConfirmedDoublesMatchRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    // Find all unread doubles_match_request notifications
    const unreadDoublesRequestNotifs = notifications.filter(n =>
        n.type === 'doubles_match_request' && !n.is_read
    );

    if (unreadDoublesRequestNotifs.length === 0) return notifications;

    // Get all request IDs from these notifications
    const requestIds = unreadDoublesRequestNotifs
        .map(n => n.data?.request_id)
        .filter(id => id);

    if (requestIds.length === 0) return notifications;

    try {
        // Check status of these doubles match requests
        const { data: doublesRequests } = await db
            .from('doubles_match_requests')
            .select('id, status')
            .in('id', requestIds);

        // Create a map of request statuses
        const requestStatusMap = {};
        (doublesRequests || []).forEach(mr => {
            requestStatusMap[mr.id] = mr.status;
        });

        // Find notifications that should be marked as read (approved, rejected, processed, or deleted)
        const notificationsToMarkRead = [];
        const notificationsToDelete = [];

        for (const notif of unreadDoublesRequestNotifs) {
            const requestId = notif.data?.request_id;
            if (!requestId) continue;

            const status = requestStatusMap[requestId];
            // If request doesn't exist (deleted) or is not pending anymore, mark notification as handled
            if (!status) {
                // Request was deleted - delete notification too
                notificationsToDelete.push(notif.id);
            } else if (status === 'approved' || status === 'rejected' || status === 'processed') {
                // Request was already handled - mark as read
                notificationsToMarkRead.push(notif.id);
            }
        }

        // Delete notifications for deleted requests
        if (notificationsToDelete.length > 0) {
            await db
                .from('notifications')
                .delete()
                .in('id', notificationsToDelete);
        }

        // Mark these notifications as read in the database
        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);
        }

        // Update the notifications array to reflect the changes
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
 * Check and mark club request notifications as read if the request is already handled
 * @param {string} userId - Current user's ID
 * @param {Array} notifications - Array of notifications to check
 * @returns {Array} - Updated notifications array with is_read updated for handled requests
 */
async function checkAndMarkConfirmedClubRequests(userId, notifications) {
    const db = getSupabase();
    if (!db || !notifications || notifications.length === 0) return notifications;

    // Find all unread club_join_request and club_leave_request notifications
    const unreadClubRequestNotifs = notifications.filter(n =>
        (n.type === 'club_join_request' || n.type === 'club_leave_request') && !n.is_read
    );

    if (unreadClubRequestNotifs.length === 0) return notifications;

    // Separate join and leave requests
    const joinNotifs = unreadClubRequestNotifs.filter(n => n.type === 'club_join_request');
    const leaveNotifs = unreadClubRequestNotifs.filter(n => n.type === 'club_leave_request');

    const notificationsToMarkRead = [];

    try {
        // Check join requests by player_id
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
                    // If request doesn't exist or is approved/rejected, mark as read
                    if (!status || status === 'approved' || status === 'rejected') {
                        notificationsToMarkRead.push(notif.id);
                    }
                }
            }
        }

        // Check leave requests by player_id
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
                    // If request doesn't exist or is approved/rejected, mark as read
                    if (!status || status === 'approved' || status === 'rejected') {
                        notificationsToMarkRead.push(notif.id);
                    }
                }
            }
        }

        // Mark these notifications as read in the database
        if (notificationsToMarkRead.length > 0) {
            await db
                .from('notifications')
                .update({ is_read: true })
                .in('id', notificationsToMarkRead);

            // Update the notifications array to reflect the change
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
 * Update the notification badge count
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

    // Update desktop badge
    const desktopBadge = document.getElementById('desktop-notifications-badge');
    if (desktopBadge) {
        if (unreadCount > 0) {
            desktopBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            desktopBadge.classList.remove('hidden');
        } else {
            desktopBadge.classList.add('hidden');
        }
    }

    // Update mobile badge
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
 * Setup click handlers for notification bells
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
 * Show the notification modal/dropdown
 */
async function showNotificationModal(userId) {
    if (notificationModalOpen) return;
    notificationModalOpen = true;

    const db = getSupabase();
    if (!db) return;

    // Fetch recent notifications
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

    // Check and mark confirmed match request notifications as read
    let notifications = await checkAndMarkConfirmedMatchRequests(userId, rawNotifications);

    // Check and mark confirmed doubles match request notifications as read
    notifications = await checkAndMarkConfirmedDoublesMatchRequests(userId, notifications);

    // Check and mark confirmed club request notifications as read
    notifications = await checkAndMarkConfirmedClubRequests(userId, notifications);

    // Update badge count if any notifications were marked as read
    updateNotificationBadge(userId);

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-[99999] flex items-start justify-center pt-16 sm:pt-20';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="text-lg font-semibold text-gray-900">Benachrichtigungen</h3>
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
                                        ${n.is_read ? `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>` : ''}
                                    </div>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                ` : `
                    <div class="p-8 text-center text-gray-500">
                        <i class="far fa-bell-slash text-4xl mb-3"></i>
                        <p>Keine Benachrichtigungen</p>
                    </div>
                `}
            </div>
            ${notifications && notifications.length > 0 ? `
                <div class="p-3 border-t flex gap-2">
                    <button id="mark-all-read" class="flex-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium py-2">
                        Alle gelesen
                    </button>
                    <button id="delete-all-read" class="flex-1 text-sm text-red-500 hover:text-red-700 font-medium py-2">
                        Gelesene löschen
                    </button>
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => {
        modal.remove();
        notificationModalOpen = false;
    };

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.getElementById('close-notification-modal')?.addEventListener('click', closeModal);

    // Mark as read on click (on content, not delete button)
    modal.querySelectorAll('.notification-content').forEach((content, index) => {
        content.addEventListener('click', async () => {
            const item = content.closest('.notification-item');
            const notificationId = item.dataset.id;
            const notification = notifications[index];

            // For match requests: navigate to Wettkampf tab without marking as read
            // User should accept/decline there, which will handle the notification
            if (isMatchRequest(notification.type)) {
                handleNotificationClick(notification);
                closeModal();
                return;
            }

            // For club requests (coaches): navigate to Verein tab without marking as read
            // Coach should accept/decline there, which will handle the notification
            if (isClubRequest(notification.type)) {
                handleNotificationClick(notification);
                closeModal();
                return;
            }

            // For other notifications: mark as read and navigate
            await markNotificationAsRead(notificationId);
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            // Add delete button after marking as read
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
            updateNotificationBadge(userId);

            // Handle navigation based on notification type
            handleNotificationClick(notification);
            closeModal();
        });
    });

    // Delete single notification
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

    // Accept follow request
    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-follow-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requesterId = acceptBtn.dataset.requesterId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            // Disable buttons while processing
            const actionsDiv = item.querySelector('.follow-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptFollow(requesterId, notificationId, userId);
            if (success) {
                // Update UI to show accepted
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

    // Decline follow request
    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-follow-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requesterId = declineBtn.dataset.requesterId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            // Disable buttons while processing
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

    // Accept match request
    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-match-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requestId = acceptBtn.dataset.requestId;
            const requesterId = acceptBtn.dataset.requesterId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            // Disable buttons while processing
            const actionsDiv = item.querySelector('.match-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptMatch(requestId, requesterId, notificationId, userId);
            if (success) {
                // Update UI to show accepted
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

    // Decline match request
    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-match-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requestId = declineBtn.dataset.requestId;
            const requesterId = declineBtn.dataset.requesterId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            // Disable buttons while processing
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

    // Accept doubles match request
    modal.addEventListener('click', async (e) => {
        const acceptBtn = e.target.closest('.accept-doubles-btn');
        if (acceptBtn) {
            e.stopPropagation();
            const requestId = acceptBtn.dataset.requestId;
            const notificationId = acceptBtn.dataset.notificationId;
            const item = acceptBtn.closest('.notification-item');

            // Disable buttons while processing
            const actionsDiv = item.querySelector('.doubles-request-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = '<span class="text-sm text-gray-500"><i class="fas fa-spinner fa-spin mr-1"></i>Wird verarbeitet...</span>';
            }

            const success = await handleAcceptDoublesMatch(requestId, notificationId, userId);
            if (success) {
                // Update UI to show accepted
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

    // Decline doubles match request
    modal.addEventListener('click', async (e) => {
        const declineBtn = e.target.closest('.decline-doubles-btn');
        if (declineBtn) {
            e.stopPropagation();
            const requestId = declineBtn.dataset.requestId;
            const notificationId = declineBtn.dataset.notificationId;
            const item = declineBtn.closest('.notification-item');

            // Disable buttons while processing
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

    // Mark all as read
    document.getElementById('mark-all-read')?.addEventListener('click', async () => {
        await markAllNotificationsAsRead(userId);
        modal.querySelectorAll('.notification-item').forEach(item => {
            item.classList.remove('bg-blue-50');
            item.classList.add('bg-white');
            item.querySelector('.unread-dot')?.remove();
            item.dataset.read = 'true';
            // Add delete button
            const actionsDiv = item.querySelector('.flex.items-center.gap-2');
            if (actionsDiv && !actionsDiv.querySelector('.delete-notification')) {
                actionsDiv.innerHTML = `<button class="delete-notification text-gray-400 hover:text-red-500 p-1" title="Löschen"><i class="fas fa-trash-alt text-sm"></i></button>`;
            }
        });
        updateNotificationBadge(userId);
    });

    // Delete all read notifications
    document.getElementById('delete-all-read')?.addEventListener('click', async () => {
        await deleteAllReadNotifications(userId);
        modal.querySelectorAll('.notification-item[data-read="true"]').forEach(item => {
            item.remove();
        });
        updateNotificationBadge(userId);
        // Check if no notifications left
        const remainingItems = modal.querySelectorAll('.notification-item');
        if (remainingItems.length === 0) {
            modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="far fa-bell-slash text-4xl mb-3"></i>
                    <p>Keine Benachrichtigungen</p>
                </div>
            `;
            modal.querySelector('.p-3.border-t')?.remove();
        }
    });
}

/**
 * Mark a single notification as read
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
 * Mark all notifications as read
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
 * Delete a single notification
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
 * Delete all read notifications for a user
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
 * Create a notification for a user
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
    }
}

/**
 * Create a follow request notification
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
 * Create a follow accepted notification
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
 * Create a points notification
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
 * Check if notifications list is empty and update UI
 */
function checkEmptyNotifications(modal) {
    const remainingItems = modal.querySelectorAll('.notification-item');
    if (remainingItems.length === 0) {
        modal.querySelector('.flex-1.overflow-y-auto').innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <i class="far fa-bell-slash text-4xl mb-3"></i>
                <p>Keine Benachrichtigungen</p>
            </div>
        `;
        modal.querySelector('.p-3.border-t')?.remove();
    }
}

/**
 * Handle notification click - navigate based on type
 */
function handleNotificationClick(notification) {
    if (!notification) return;

    const type = notification.type;

    // Match request notifications - navigate to Wettkampf tab and scroll to pending requests
    if (type === 'match_request') {
        // Try to click the Wettkampf tab
        const wettkampfTab = document.querySelector('[data-tab="matches"]') ||
                            document.querySelector('[data-tab="wettkampf"]') ||
                            document.querySelector('button[onclick*="matches"]');
        if (wettkampfTab) {
            wettkampfTab.click();
            // Scroll to pending requests section after tab switch
            setTimeout(() => {
                const pendingSection = document.getElementById('pending-requests-section');
                if (pendingSection) {
                    pendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
            return;
        }
        // If we're not on dashboard, navigate there with hash
        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#pending-requests-section';
        }
        return;
    }

    // Doubles match request notifications - navigate to Wettkampf tab, pending requests section
    if (type === 'doubles_match_request') {
        // Try to click the Wettkampf tab
        const wettkampfTab = document.querySelector('[data-tab="matches"]') ||
                            document.querySelector('[data-tab="wettkampf"]') ||
                            document.querySelector('button[onclick*="matches"]');
        if (wettkampfTab) {
            wettkampfTab.click();
            // Scroll to pending requests section after tab switch
            setTimeout(() => {
                const pendingSection = document.getElementById('pending-requests-section');
                if (pendingSection) {
                    pendingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 150);
            return;
        }
        // If we're not on dashboard, navigate there with hash
        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#pending-requests-section';
        }
        return;
    }

    // Follow request notifications - navigate to profile or community
    if (type === 'follow_request' || type === 'friend_request') {
        const requesterId = notification.data?.requester_id;
        if (requesterId) {
            window.location.href = `/profile.html?id=${requesterId}`;
            return;
        }
    }

    // Friend request accepted - navigate to their profile
    if (type === 'friend_request_accepted' || type === 'follow_accepted') {
        const accepterId = notification.data?.accepter_id;
        if (accepterId) {
            window.location.href = `/profile.html?id=${accepterId}`;
            return;
        }
        // Fallback to community tab
        const communityTab = document.querySelector('[data-tab="community"]');
        if (communityTab) {
            communityTab.click();
        }
    }

    // Club request notifications (for coaches) - navigate to correct tab
    if (type === 'club_join_request' || type === 'club_leave_request') {
        // Join requests are in "club" tab, Leave requests are in "statistics" tab
        const isLeaveRequest = type === 'club_leave_request';

        if (isLeaveRequest) {
            // Navigate to Statistics tab for leave requests
            const statisticsTab = document.querySelector('[data-tab="statistics"]');
            if (statisticsTab) {
                statisticsTab.click();
                // Scroll to leave requests section after tab switch
                setTimeout(() => {
                    const requestsSection = document.getElementById('leave-requests-list');
                    if (requestsSection) {
                        requestsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
                return;
            }
        } else {
            // Navigate to Club/Verein tab for join requests
            const vereinTab = document.querySelector('[data-tab="club"]') ||
                              document.querySelector('[data-tab="verein"]') ||
                              document.querySelector('button[onclick*="club"]');
            if (vereinTab) {
                vereinTab.click();
                // Scroll to club requests section after tab switch
                setTimeout(() => {
                    const requestsSection = document.getElementById('club-join-requests-list');
                    if (requestsSection) {
                        requestsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
                return;
            }
        }

        // If we're not on dashboard, navigate there
        if (!window.location.pathname.includes('dashboard')) {
            window.location.href = '/dashboard.html#club-requests';
        }
        return;
    }
}

/**
 * Get icon for notification type
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
        'default': '<i class="fas fa-bell text-gray-500 text-lg"></i>'
    };
    return icons[type] || icons.default;
}

/**
 * Check if notification type is an actionable follow request
 */
function isFollowRequest(type) {
    return type === 'follow_request' || type === 'friend_request';
}

/**
 * Check if notification type is an actionable match request (singles)
 */
function isMatchRequest(type) {
    return type === 'match_request';
}

/**
 * Check if notification type is a doubles match request
 */
function isDoublesMatchRequest(type) {
    return type === 'doubles_match_request';
}

/**
 * Check if notification type is an actionable club request (for coaches)
 */
function isClubRequest(type) {
    return type === 'club_join_request' || type === 'club_leave_request';
}

/**
 * Check if notification is actionable (follow, match, doubles, or club request)
 */
function isActionableRequest(type) {
    return isFollowRequest(type) || isMatchRequest(type) || isDoublesMatchRequest(type) || isClubRequest(type);
}

/**
 * Render action buttons for follow request notifications
 */
function renderFollowRequestActions(notification) {
    // Handle follow requests
    if (isFollowRequest(notification.type) && !notification.is_read) {
        const requesterId = notification.data?.requester_id;
        if (!requesterId) return '';

        return `
            <div class="follow-request-actions flex gap-2 mt-2">
                <button class="accept-follow-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
                        data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                    <i class="fas fa-check mr-1"></i>Annehmen
                </button>
                <button class="decline-follow-btn bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full transition"
                        data-requester-id="${requesterId}" data-notification-id="${notification.id}">
                    <i class="fas fa-times mr-1"></i>Ablehnen
                </button>
            </div>
        `;
    }

    // Handle match requests - show hint to go to Wettkampf tab or status if already handled
    if (isMatchRequest(notification.type)) {
        if (!notification.is_read) {
            return `
                <div class="match-request-hint mt-2">
                    <span class="text-xs text-indigo-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>Tippe hier um zum Wettkampf-Tab zu gelangen
                    </span>
                </div>
            `;
        } else {
            // Match request has already been handled (confirmed/rejected/withdrawn)
            return `
                <div class="match-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>Bereits bearbeitet
                    </span>
                </div>
            `;
        }
    }

    // Handle club requests (for coaches) - show hint to go to coach dashboard
    if (isClubRequest(notification.type)) {
        if (!notification.is_read) {
            const isJoinRequest = notification.type === 'club_join_request';
            return `
                <div class="club-request-hint mt-2">
                    <span class="text-xs text-blue-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>Tippe hier um zur ${isJoinRequest ? 'Beitritts' : 'Austritts'}anfragen-Verwaltung zu gelangen
                    </span>
                </div>
            `;
        } else {
            return `
                <div class="club-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>Bereits bearbeitet
                    </span>
                </div>
            `;
        }
    }

    // Handle doubles match requests - show accept/reject buttons
    if (isDoublesMatchRequest(notification.type)) {
        const requestId = notification.data?.request_id;
        if (!notification.is_read && requestId) {
            return `
                <div class="doubles-request-actions flex gap-2 mt-2">
                    <button class="accept-doubles-btn bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded-full transition"
                            data-request-id="${requestId}" data-notification-id="${notification.id}">
                        <i class="fas fa-check mr-1"></i>Bestätigen
                    </button>
                    <button class="decline-doubles-btn bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full transition"
                            data-request-id="${requestId}" data-notification-id="${notification.id}">
                        <i class="fas fa-times mr-1"></i>Ablehnen
                    </button>
                </div>
            `;
        } else if (!requestId) {
            return `
                <div class="doubles-request-hint mt-2">
                    <span class="text-xs text-purple-600 font-medium">
                        <i class="fas fa-arrow-right mr-1"></i>Tippe hier um zum Doppel-Tab zu gelangen
                    </span>
                </div>
            `;
        } else {
            return `
                <div class="doubles-request-status mt-2">
                    <span class="text-xs text-gray-500">
                        <i class="fas fa-check-circle mr-1"></i>Bereits bearbeitet
                    </span>
                </div>
            `;
        }
    }

    return '';
}

/**
 * Handle accept follow request from notification
 */
async function handleAcceptFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the friendship
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

        // Get current user's name for notification
        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Jemand';

        const { error } = await db.rpc('accept_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        // Mark notification as read
        await markNotificationAsRead(notificationId);

        // Notify the requester that their request was accepted
        await createFollowAcceptedNotification(requesterId, userId, currentUserName);

        return true;
    } catch (error) {
        console.error('Error accepting follow request:', error);
        return false;
    }
}

/**
 * Handle decline follow request from notification
 */
async function handleDeclineFollow(requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the friendship
        const { data: friendship } = await db
            .from('friendships')
            .select('id')
            .eq('requester_id', requesterId)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('Friendship not found');
            // Still delete the notification since the friendship might have been handled
            await deleteNotification(notificationId);
            return true;
        }

        const { error } = await db.rpc('decline_friend_request', {
            current_user_id: userId,
            friendship_id: friendship.id
        });

        if (error) throw error;

        // Delete the notification
        await deleteNotification(notificationId);

        return true;
    } catch (error) {
        console.error('Error declining follow request:', error);
        return false;
    }
}

/**
 * Handle accept match request from notification
 */
async function handleAcceptMatch(requestId, requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the match request - either by ID or by requester
        let matchRequest;
        if (requestId) {
            const { data } = await db
                .from('match_requests')
                .select('*')
                .eq('id', requestId)
                .single();
            matchRequest = data;
        } else if (requesterId) {
            // Find pending request from this requester to current user
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
            return true; // Still return true to remove notification UI
        }

        // Update approvals
        let approvals = matchRequest.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }
        approvals.player_b = true;

        // Update the match request to approved
        const { error: updateError } = await db
            .from('match_requests')
            .update({
                status: 'approved',
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', matchRequest.id);

        if (updateError) throw updateError;

        // Create the actual match using the global function if available
        if (typeof window.createMatchFromRequest === 'function') {
            await window.createMatchFromRequest(matchRequest);
        }

        // Mark notification as read
        await markNotificationAsRead(notificationId);

        // Notify player A that match was accepted
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

        // Dispatch event to notify other components (dashboard, etc.) to refresh
        window.dispatchEvent(new CustomEvent('matchRequestUpdated', {
            detail: { type: 'singles', action: 'approved', requestId: matchRequest.id }
        }));

        // Refresh match requests if function exists (legacy support)
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
 * Handle decline match request from notification
 */
async function handleDeclineMatch(requestId, requesterId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Find the match request
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

        // Update the match request to rejected
        const { error: updateError } = await db
            .from('match_requests')
            .update({
                status: 'rejected',
                updated_at: new Date().toISOString()
            })
            .eq('id', matchRequest.id);

        if (updateError) throw updateError;

        // Delete the notification
        await deleteNotification(notificationId);

        // Notify player A that match was rejected
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

        // Refresh match requests if function exists
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
 * Handle accept doubles match request from notification
 */
async function handleAcceptDoublesMatch(requestId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Import confirmDoublesMatchRequest function dynamically
        const { confirmDoublesMatchRequest } = await import('./doubles-matches-supabase.js');

        // Call the confirm function
        const result = await confirmDoublesMatchRequest(requestId, userId, db);

        if (!result.success) {
            console.error('Failed to confirm doubles match:', result.error);
            return false;
        }

        // Mark notification as read
        await markNotificationAsRead(notificationId);

        return true;
    } catch (error) {
        console.error('Error accepting doubles match request:', error);
        return false;
    }
}

/**
 * Handle decline doubles match request from notification
 */
async function handleDeclineDoublesMatch(requestId, notificationId, userId) {
    const db = getSupabase();
    if (!db) return false;

    try {
        // Get current user data for the reject function
        const { data: currentUserProfile } = await db
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('id', userId)
            .single();

        // Import rejectDoublesMatchRequest function dynamically
        const { rejectDoublesMatchRequest } = await import('./doubles-matches-supabase.js');

        // Call the reject function
        await rejectDoublesMatchRequest(requestId, 'Vom Spieler abgelehnt', db, {
            id: userId,
            first_name: currentUserProfile?.first_name,
            last_name: currentUserProfile?.last_name
        });

        // Delete the notification
        await deleteNotification(notificationId);

        return true;
    } catch (error) {
        console.error('Error declining doubles match request:', error);
        return false;
    }
}

/**
 * Format time ago
 */
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    return date.toLocaleDateString('de-DE');
}

/**
 * Cleanup subscriptions
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
