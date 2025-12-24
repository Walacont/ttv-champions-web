/**
 * Activity Comments Module
 * Handles comments for all activity types (matches, posts, polls, events)
 */

import { getSupabase } from './supabase-init.js';
import { t } from './i18n.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

let currentUser = null;
let currentActivityId = null;
let currentActivityType = null;

/**
 * Initialize comments module with current user
 */
export function initComments(user) {
    currentUser = user;
    setupCommentsModal();
}

/**
 * Setup the comments modal HTML
 */
function setupCommentsModal() {
    // Check if modal already exists
    if (document.getElementById('comments-modal')) return;

    const modalHTML = `
        <div id="comments-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
                <!-- Modal Header -->
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">
                        <i class="far fa-comment mr-2"></i>
                        <span data-i18n="dashboard.activityFeed.comments.title">Kommentare</span>
                    </h3>
                    <button onclick="window.closeComments()" class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Comments List -->
                <div id="comments-list" class="flex-1 overflow-y-auto p-4 space-y-4">
                    <div class="text-center text-gray-400 py-8">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm" data-i18n="common.loading">Lädt...</p>
                    </div>
                </div>

                <!-- Add Comment Form -->
                <div class="p-4 border-t border-gray-200">
                    <div class="flex gap-3">
                        <img id="comment-user-avatar" src="${DEFAULT_AVATAR}" alt="You"
                             class="w-10 h-10 rounded-full object-cover border-2 border-gray-200">
                        <div class="flex-1">
                            <textarea
                                id="comment-input"
                                placeholder="Schreib einen Kommentar..."
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                rows="2"
                                maxlength="2000"
                            ></textarea>
                            <div class="flex items-center justify-between mt-2">
                                <span id="comment-char-count" class="text-xs text-gray-400">0 / 2000</span>
                                <button
                                    onclick="window.submitComment()"
                                    id="submit-comment-btn"
                                    class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled
                                >
                                    <i class="far fa-paper-plane mr-2"></i>
                                    <span data-i18n="dashboard.activityFeed.comments.post">Posten</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup event listeners
    const commentInput = document.getElementById('comment-input');
    const submitBtn = document.getElementById('submit-comment-btn');
    const charCount = document.getElementById('comment-char-count');

    commentInput.addEventListener('input', () => {
        const length = commentInput.value.length;
        charCount.textContent = `${length} / 2000`;
        submitBtn.disabled = length === 0 || length > 2000;
    });

    commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!submitBtn.disabled) {
                window.submitComment();
            }
        }
    });

    // Close modal when clicking outside
    document.getElementById('comments-modal').addEventListener('click', (e) => {
        if (e.target.id === 'comments-modal') {
            window.closeComments();
        }
    });
}

/**
 * Open comments modal for an activity
 */
export async function openComments(activityId, activityType) {
    // Convert legacy match types
    if (activityType === 'singles') activityType = 'singles_match';
    if (activityType === 'doubles') activityType = 'doubles_match';

    currentActivityId = activityId;
    currentActivityType = activityType;

    const modal = document.getElementById('comments-modal');
    if (!modal) {
        console.error('Comments modal not found');
        return;
    }

    // Show modal
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Load comments
    await loadComments();

    // Set user avatar
    if (currentUser) {
        const userAvatar = document.getElementById('comment-user-avatar');
        if (userAvatar && currentUser.avatar_url) {
            userAvatar.src = currentUser.avatar_url;
        }
    }

    // Focus input
    document.getElementById('comment-input').focus();
}

/**
 * Close comments modal
 */
export function closeComments() {
    const modal = document.getElementById('comments-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    // Reset
    currentActivityId = null;
    currentActivityType = null;
    document.getElementById('comment-input').value = '';
    document.getElementById('submit-comment-btn').disabled = true;
    document.getElementById('comment-char-count').textContent = '0 / 2000';
}

/**
 * Load comments for current activity
 */
async function loadComments() {
    const commentsList = document.getElementById('comments-list');
    if (!commentsList) return;

    // Show loading
    commentsList.innerHTML = `
        <div class="text-center text-gray-400 py-8">
            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">${t('common.loading')}</p>
        </div>
    `;

    try {
        const { data, error } = await supabase.rpc('get_activity_comments', {
            p_activity_id: currentActivityId,
            p_activity_type: currentActivityType,
            p_limit: 100,
            p_offset: 0
        });

        if (error) {
            console.error('Error loading comments:', error);
            commentsList.innerHTML = `
                <div class="text-center text-gray-400 py-8">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p class="text-sm">${t('common.error')}</p>
                </div>
            `;
            return;
        }

        if (!data || data.length === 0) {
            commentsList.innerHTML = `
                <div class="text-center text-gray-400 py-8">
                    <i class="far fa-comment text-4xl mb-2"></i>
                    <p class="text-sm">${t('dashboard.activityFeed.comments.empty')}</p>
                </div>
            `;
            return;
        }

        // Render comments
        commentsList.innerHTML = data.map(comment => renderComment(comment)).join('');

    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p class="text-sm">${t('common.error')}</p>
            </div>
        `;
    }
}

/**
 * Render a single comment
 */
function renderComment(comment) {
    const createdAt = new Date(comment.created_at);
    const isEdited = comment.updated_at && comment.updated_at !== comment.created_at;
    const timeAgo = getTimeAgo(createdAt);

    return `
        <div class="flex gap-3" data-comment-id="${comment.id}">
            <a href="/profile.html?id=${comment.user_id}" class="flex-shrink-0">
                <img src="${comment.user_avatar_url || DEFAULT_AVATAR}" alt="${comment.user_name}"
                     class="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                     onerror="this.src='${DEFAULT_AVATAR}'">
            </a>
            <div class="flex-1">
                <div class="bg-gray-100 rounded-lg px-3 py-2">
                    <div class="flex items-center gap-2 mb-1">
                        <a href="/profile.html?id=${comment.user_id}" class="font-semibold text-sm text-gray-900 hover:text-indigo-600">
                            ${comment.user_name}
                        </a>
                        ${isEdited ? '<span class="text-xs text-gray-400">(bearbeitet)</span>' : ''}
                    </div>
                    <p class="text-sm text-gray-800 whitespace-pre-wrap break-words">${escapeHtml(comment.content)}</p>
                </div>
                <div class="flex items-center gap-3 mt-1 px-3">
                    <span class="text-xs text-gray-400">${timeAgo}</span>
                    ${comment.is_author ? `
                        <button
                            onclick="window.deleteComment('${comment.id}')"
                            class="text-xs text-red-500 hover:text-red-700 transition"
                        >
                            <i class="far fa-trash-alt mr-1"></i>${t('common.delete')}
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Submit a new comment
 */
export async function submitComment() {
    const input = document.getElementById('comment-input');
    const submitBtn = document.getElementById('submit-comment-btn');
    const content = input.value.trim();

    if (!content || content.length > 2000) return;

    // Disable button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Posting...';

    try {
        const { data, error } = await supabase.rpc('add_activity_comment', {
            p_activity_id: currentActivityId,
            p_activity_type: currentActivityType,
            p_content: content
        });

        if (error) throw error;

        // Clear input
        input.value = '';
        document.getElementById('comment-char-count').textContent = '0 / 2000';

        // Reload comments
        await loadComments();

        // Update comment count in feed
        if (data && data.comment_count !== undefined) {
            const countEl = document.querySelector(`[data-comment-count="${currentActivityType}-${currentActivityId}"]`);
            if (countEl) {
                countEl.textContent = data.comment_count;
            }
        }

    } catch (error) {
        console.error('Error submitting comment:', error);
        alert(t('common.error'));
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="far fa-paper-plane mr-2"></i>' + t('dashboard.activityFeed.comments.post');
    }
}

/**
 * Delete a comment
 */
export async function deleteComment(commentId) {
    if (!confirm(t('dashboard.activityFeed.comments.deleteConfirm'))) return;

    try {
        const { data, error } = await supabase.rpc('delete_activity_comment', {
            p_comment_id: commentId
        });

        if (error) throw error;

        // Reload comments
        await loadComments();

        // Update comment count in feed
        if (data && data.comment_count !== undefined) {
            const countEl = document.querySelector(`[data-comment-count="${currentActivityType}-${currentActivityId}"]`);
            if (countEl) {
                countEl.textContent = data.comment_count;
            }
        }

    } catch (error) {
        console.error('Error deleting comment:', error);
        alert(t('common.error'));
    }
}

/**
 * Get time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'gerade eben';
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
    if (seconds < 604800) return `vor ${Math.floor(seconds / 86400)} Tag(en)`;

    return date.toLocaleDateString('de-DE');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions available globally
window.openComments = openComments;
window.closeComments = closeComments;
window.submitComment = submitComment;
window.deleteComment = deleteComment;
