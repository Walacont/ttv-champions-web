/**
 * Block & Report Manager
 * Handles user blocking, content reporting, and content hiding
 * Required for App Store Compliance (Apple & Google)
 */

import { supabase } from './supabase-init.js';
import { getCurrentUserId } from './auth-utils-supabase.js';
import { showToast } from './toast.js';
import i18next from './i18n-init.js';

// Cache for blocked user IDs (refreshed periodically)
let blockedUserIdsCache = null;
let blockedUserIdsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Report types with translations
export const REPORT_TYPES = {
    spam: { key: 'report.types.spam', default: 'Spam' },
    harassment: { key: 'report.types.harassment', default: 'Belästigung' },
    hate_speech: { key: 'report.types.hate_speech', default: 'Hassrede' },
    violence: { key: 'report.types.violence', default: 'Gewalt' },
    inappropriate_content: { key: 'report.types.inappropriate_content', default: 'Unangemessener Inhalt' },
    impersonation: { key: 'report.types.impersonation', default: 'Identitätsdiebstahl' },
    misinformation: { key: 'report.types.misinformation', default: 'Fehlinformation' },
    other: { key: 'report.types.other', default: 'Sonstiges' }
};

// Content types
export const CONTENT_TYPES = {
    USER: 'user',
    POST: 'post',
    POLL: 'poll',
    COMMENT: 'comment',
    MATCH_MEDIA: 'match_media'
};

// ============================================
// BLOCKING FUNCTIONS
// ============================================

/**
 * Block a user
 * @param {string} targetUserId - The user ID to block
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function blockUser(targetUserId) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase.rpc('block_user', {
            current_user_id: currentUserId,
            target_user_id: targetUserId
        });

        if (error) {
            console.error('Error blocking user:', error);
            return { success: false, error: error.message };
        }

        if (data.success) {
            // Invalidate cache
            blockedUserIdsCache = null;
            showToast(i18next.t('block.success', { defaultValue: 'Nutzer blockiert' }), 'success');
        } else {
            showToast(data.error || i18next.t('block.error', { defaultValue: 'Fehler beim Blockieren' }), 'error');
        }

        return data;
    } catch (err) {
        console.error('Error in blockUser:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Unblock a user
 * @param {string} targetUserId - The user ID to unblock
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unblockUser(targetUserId) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase.rpc('unblock_user', {
            current_user_id: currentUserId,
            target_user_id: targetUserId
        });

        if (error) {
            console.error('Error unblocking user:', error);
            return { success: false, error: error.message };
        }

        if (data.success) {
            // Invalidate cache
            blockedUserIdsCache = null;
            showToast(i18next.t('block.unblock_success', { defaultValue: 'Blockierung aufgehoben' }), 'success');
        }

        return data;
    } catch (err) {
        console.error('Error in unblockUser:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get list of blocked users
 * @returns {Promise<Array>}
 */
export async function getBlockedUsers() {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return [];
        }

        const { data, error } = await supabase.rpc('get_blocked_users', {
            current_user_id: currentUserId
        });

        if (error) {
            console.error('Error getting blocked users:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Error in getBlockedUsers:', err);
        return [];
    }
}

/**
 * Check if a user is blocked
 * @param {string} targetUserId - The user ID to check
 * @returns {Promise<{is_blocked: boolean, is_blocked_by: boolean}>}
 */
export async function isUserBlocked(targetUserId) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { is_blocked: false, is_blocked_by: false };
        }

        const { data, error } = await supabase.rpc('is_user_blocked', {
            current_user_id: currentUserId,
            target_user_id: targetUserId
        });

        if (error) {
            console.error('Error checking block status:', error);
            return { is_blocked: false, is_blocked_by: false };
        }

        return data || { is_blocked: false, is_blocked_by: false };
    } catch (err) {
        console.error('Error in isUserBlocked:', err);
        return { is_blocked: false, is_blocked_by: false };
    }
}

/**
 * Get blocked user IDs (for filtering)
 * Uses cache to minimize database calls
 * @returns {Promise<string[]>}
 */
export async function getBlockedUserIds() {
    try {
        // Check cache
        const now = Date.now();
        if (blockedUserIdsCache && (now - blockedUserIdsCacheTime) < CACHE_DURATION) {
            return blockedUserIdsCache;
        }

        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return [];
        }

        const { data, error } = await supabase.rpc('get_blocked_user_ids', {
            current_user_id: currentUserId
        });

        if (error) {
            console.error('Error getting blocked user IDs:', error);
            return blockedUserIdsCache || [];
        }

        // Update cache
        blockedUserIdsCache = data || [];
        blockedUserIdsCacheTime = now;

        return blockedUserIdsCache;
    } catch (err) {
        console.error('Error in getBlockedUserIds:', err);
        return blockedUserIdsCache || [];
    }
}

/**
 * Check if content should be hidden (from blocked user)
 * @param {string} userId - The user ID who created the content
 * @returns {Promise<boolean>}
 */
export async function shouldHideContent(userId) {
    const blockedIds = await getBlockedUserIds();
    return blockedIds.includes(userId);
}


// ============================================
// REPORTING FUNCTIONS
// ============================================

/**
 * Report content or user
 * @param {string} contentType - Type of content (user, post, poll, comment, match_media)
 * @param {string} contentId - ID of the content
 * @param {string} reportType - Type of report (spam, harassment, etc.)
 * @param {string} description - Optional description
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function reportContent(contentType, contentId, reportType, description = null) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase.rpc('report_content', {
            reporter_user_id: currentUserId,
            p_content_type: contentType,
            p_content_id: contentId,
            p_report_type: reportType,
            p_description: description
        });

        if (error) {
            console.error('Error reporting content:', error);
            return { success: false, error: error.message };
        }

        if (data.success) {
            showToast(i18next.t('report.success', { defaultValue: 'Meldung eingereicht. Vielen Dank!' }), 'success');
        } else {
            showToast(data.error || i18next.t('report.error', { defaultValue: 'Fehler beim Melden' }), 'error');
        }

        return data;
    } catch (err) {
        console.error('Error in reportContent:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Report a user
 * @param {string} userId - The user ID to report
 * @param {string} reportType - Type of report
 * @param {string} description - Optional description
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function reportUser(userId, reportType, description = null) {
    return reportContent(CONTENT_TYPES.USER, userId, reportType, description);
}

/**
 * Report a post
 * @param {string} postId - The post ID to report
 * @param {string} reportType - Type of report
 * @param {string} description - Optional description
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function reportPost(postId, reportType, description = null) {
    return reportContent(CONTENT_TYPES.POST, postId, reportType, description);
}

/**
 * Get my submitted reports
 * @returns {Promise<Array>}
 */
export async function getMyReports() {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return [];
        }

        const { data, error } = await supabase.rpc('get_my_reports', {
            current_user_id: currentUserId
        });

        if (error) {
            console.error('Error getting reports:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Error in getMyReports:', err);
        return [];
    }
}


// ============================================
// HIDE CONTENT FUNCTIONS
// ============================================

/**
 * Hide a piece of content (without blocking the user)
 * @param {string} contentType - Type of content
 * @param {string} contentId - ID of the content
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function hideContent(contentType, contentId) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase.rpc('hide_content', {
            current_user_id: currentUserId,
            p_content_type: contentType,
            p_content_id: contentId
        });

        if (error) {
            console.error('Error hiding content:', error);
            return { success: false, error: error.message };
        }

        if (data.success) {
            showToast(i18next.t('hide.success', { defaultValue: 'Beitrag ausgeblendet' }), 'success');
        }

        return data;
    } catch (err) {
        console.error('Error in hideContent:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Unhide a piece of content
 * @param {string} contentType - Type of content
 * @param {string} contentId - ID of the content
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unhideContent(contentType, contentId) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return { success: false, error: 'Not authenticated' };
        }

        const { data, error } = await supabase.rpc('unhide_content', {
            current_user_id: currentUserId,
            p_content_type: contentType,
            p_content_id: contentId
        });

        if (error) {
            console.error('Error unhiding content:', error);
            return { success: false, error: error.message };
        }

        return data;
    } catch (err) {
        console.error('Error in unhideContent:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get hidden content IDs for a specific type
 * @param {string} contentType - Type of content
 * @returns {Promise<string[]>}
 */
export async function getHiddenContentIds(contentType) {
    try {
        const currentUserId = await getCurrentUserId();
        if (!currentUserId) {
            return [];
        }

        const { data, error } = await supabase.rpc('get_hidden_content_ids', {
            current_user_id: currentUserId,
            p_content_type: contentType
        });

        if (error) {
            console.error('Error getting hidden content IDs:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('Error in getHiddenContentIds:', err);
        return [];
    }
}


// ============================================
// UI HELPERS
// ============================================

/**
 * Show block confirmation dialog
 * @param {string} userName - Name of the user to block
 * @param {Function} onConfirm - Callback when confirmed
 */
export function showBlockConfirmDialog(userName, onConfirm) {
    const title = i18next.t('block.confirm_title', { defaultValue: 'Nutzer blockieren?' });
    const message = i18next.t('block.confirm_message', {
        name: userName,
        defaultValue: `Möchtest du ${userName} wirklich blockieren? Du wirst keine Beiträge mehr von dieser Person sehen und sie kann dir nicht mehr folgen.`
    });

    if (confirm(`${title}\n\n${message}`)) {
        onConfirm();
    }
}

/**
 * Show report dialog
 * @param {string} contentType - Type of content being reported
 * @param {string} contentId - ID of the content
 * @param {string} contentOwnerName - Name of the content owner (for display)
 */
export function showReportDialog(contentType, contentId, contentOwnerName = '') {
    // Create modal HTML
    const modalId = 'report-modal';

    // Remove existing modal if any
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
        existingModal.remove();
    }

    const contentTypeLabel = getContentTypeLabel(contentType);
    const title = i18next.t('report.title', {
        type: contentTypeLabel,
        defaultValue: `${contentTypeLabel} melden`
    });

    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-900 dark:text-white">${title}</h2>
                        <button id="close-report-modal" class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <p class="text-gray-600 dark:text-gray-400 mb-4">
                        ${i18next.t('report.description', { defaultValue: 'Warum meldest du diesen Inhalt?' })}
                    </p>

                    <form id="report-form" class="space-y-4">
                        <div class="space-y-2">
                            ${Object.entries(REPORT_TYPES).map(([key, val]) => `
                                <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                    <input type="radio" name="report_type" value="${key}" class="mr-3 text-primary-600">
                                    <span class="text-gray-900 dark:text-white">${i18next.t(val.key, { defaultValue: val.default })}</span>
                                </label>
                            `).join('')}
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                ${i18next.t('report.additional_info', { defaultValue: 'Zusätzliche Informationen (optional)' })}
                            </label>
                            <textarea
                                id="report-description"
                                rows="3"
                                maxlength="1000"
                                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                placeholder="${i18next.t('report.description_placeholder', { defaultValue: 'Beschreibe das Problem...' })}"
                            ></textarea>
                        </div>

                        <div class="flex gap-3 pt-4">
                            <button type="button" id="cancel-report" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                                ${i18next.t('common.cancel', { defaultValue: 'Abbrechen' })}
                            </button>
                            <button type="submit" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                ${i18next.t('report.submit', { defaultValue: 'Melden' })}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById(modalId);
    const form = document.getElementById('report-form');
    const closeBtn = document.getElementById('close-report-modal');
    const cancelBtn = document.getElementById('cancel-report');

    // Close handlers
    const closeModal = () => modal.remove();
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Form submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const reportType = form.querySelector('input[name="report_type"]:checked');
        if (!reportType) {
            showToast(i18next.t('report.select_type', { defaultValue: 'Bitte wähle einen Grund aus' }), 'error');
            return;
        }

        const description = document.getElementById('report-description').value.trim();

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = i18next.t('common.loading', { defaultValue: 'Wird gesendet...' });

        const result = await reportContent(contentType, contentId, reportType.value, description || null);

        if (result.success) {
            closeModal();
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = i18next.t('report.submit', { defaultValue: 'Melden' });
        }
    });
}

/**
 * Get translated label for content type
 * @param {string} contentType
 * @returns {string}
 */
function getContentTypeLabel(contentType) {
    const labels = {
        user: i18next.t('content.user', { defaultValue: 'Nutzer' }),
        post: i18next.t('content.post', { defaultValue: 'Beitrag' }),
        poll: i18next.t('content.poll', { defaultValue: 'Umfrage' }),
        comment: i18next.t('content.comment', { defaultValue: 'Kommentar' }),
        match_media: i18next.t('content.match_media', { defaultValue: 'Spielmedien' })
    };
    return labels[contentType] || contentType;
}

/**
 * Create the action menu HTML for a content item
 * @param {Object} options
 * @param {string} options.contentType - Type of content
 * @param {string} options.contentId - ID of the content
 * @param {string} options.userId - ID of the content owner
 * @param {string} options.userName - Name of the content owner
 * @param {boolean} options.isOwnContent - Whether this is the current user's content
 * @returns {string} HTML string
 */
export function createContentActionMenu(options) {
    const { contentType, contentId, userId, userName, isOwnContent } = options;

    if (isOwnContent) {
        return ''; // No action menu for own content
    }

    return `
        <div class="relative content-action-menu">
            <button class="action-menu-trigger p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" aria-label="Mehr Optionen">
                <svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                </svg>
            </button>
            <div class="action-menu-dropdown hidden absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 py-1 z-50">
                <button class="action-hide w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                        data-content-type="${contentType}" data-content-id="${contentId}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                    </svg>
                    ${i18next.t('action.hide', { defaultValue: 'Ausblenden' })}
                </button>
                <button class="action-report w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                        data-content-type="${contentType}" data-content-id="${contentId}" data-user-name="${userName}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    ${i18next.t('action.report', { defaultValue: 'Melden' })}
                </button>
                <hr class="my-1 border-gray-200 dark:border-gray-700">
                <button class="action-block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600 dark:text-red-400"
                        data-user-id="${userId}" data-user-name="${userName}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                    </svg>
                    ${i18next.t('action.block_user', { defaultValue: 'Nutzer blockieren' })}
                </button>
            </div>
        </div>
    `;
}

/**
 * Initialize action menu event listeners
 * Call this after rendering content with action menus
 */
export function initActionMenuListeners() {
    // Toggle dropdown
    document.querySelectorAll('.action-menu-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = trigger.nextElementSibling;

            // Close all other dropdowns
            document.querySelectorAll('.action-menu-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.add('hidden');
            });

            dropdown.classList.toggle('hidden');
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.action-menu-dropdown').forEach(d => {
            d.classList.add('hidden');
        });
    });

    // Hide action
    document.querySelectorAll('.action-hide').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const contentType = btn.dataset.contentType;
            const contentId = btn.dataset.contentId;

            const result = await hideContent(contentType, contentId);
            if (result.success) {
                // Remove the content from view
                const contentElement = btn.closest('[data-content-id]') || btn.closest('.activity-card');
                if (contentElement) {
                    contentElement.style.opacity = '0';
                    contentElement.style.height = contentElement.offsetHeight + 'px';
                    setTimeout(() => {
                        contentElement.style.height = '0';
                        contentElement.style.margin = '0';
                        contentElement.style.padding = '0';
                        contentElement.style.overflow = 'hidden';
                    }, 200);
                    setTimeout(() => contentElement.remove(), 400);
                }
            }
        });
    });

    // Report action
    document.querySelectorAll('.action-report').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const contentType = btn.dataset.contentType;
            const contentId = btn.dataset.contentId;
            const userName = btn.dataset.userName;

            showReportDialog(contentType, contentId, userName);
        });
    });

    // Block action
    document.querySelectorAll('.action-block').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userId = btn.dataset.userId;
            const userName = btn.dataset.userName;

            showBlockConfirmDialog(userName, async () => {
                const result = await blockUser(userId);
                if (result.success) {
                    // Remove all content from this user
                    document.querySelectorAll(`[data-user-id="${userId}"]`).forEach(el => {
                        el.style.opacity = '0';
                        setTimeout(() => el.remove(), 300);
                    });

                    // Reload the feed to reflect changes
                    if (typeof window.refreshActivityFeed === 'function') {
                        setTimeout(() => window.refreshActivityFeed(), 500);
                    }
                }
            });
        });
    });
}

/**
 * Filter out blocked users from an array of items
 * @param {Array} items - Array of items with user_id property
 * @returns {Promise<Array>} Filtered array
 */
export async function filterBlockedContent(items) {
    const blockedIds = await getBlockedUserIds();
    if (!blockedIds.length) return items;

    return items.filter(item => {
        const userId = item.user_id || item.userId || item.requester_id;
        return !blockedIds.includes(userId);
    });
}

// Export for global access
window.BlockReportManager = {
    blockUser,
    unblockUser,
    getBlockedUsers,
    isUserBlocked,
    getBlockedUserIds,
    reportContent,
    reportUser,
    reportPost,
    hideContent,
    unhideContent,
    showReportDialog,
    showBlockConfirmDialog,
    createContentActionMenu,
    initActionMenuListeners,
    filterBlockedContent,
    REPORT_TYPES,
    CONTENT_TYPES
};
