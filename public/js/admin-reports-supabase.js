/**
 * Admin Reports Management
 * Handles viewing and managing content reports
 */

import { getSupabase, getCurrentUser } from './supabase-init.js';

const supabase = getSupabase();

let currentUser = null;
let currentUserProfile = null;
let reports = [];
let selectedReport = null;

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const authError = document.getElementById('auth-error-container');
const reportsList = document.getElementById('reports-list');
const noReportsEl = document.getElementById('no-reports');
const reportModal = document.getElementById('report-modal');

// Stats elements
const pendingCount = document.getElementById('pending-count');
const reviewedCount = document.getElementById('reviewed-count');
const resolvedCount = document.getElementById('resolved-count');
const totalCount = document.getElementById('total-count');

// Filter elements
const filterStatus = document.getElementById('filter-status');
const filterType = document.getElementById('filter-type');
const filterContentType = document.getElementById('filter-content-type');

// Report type labels
const REPORT_TYPE_LABELS = {
    spam: 'Spam',
    harassment: 'Belästigung',
    hate_speech: 'Hassrede',
    violence: 'Gewalt',
    inappropriate_content: 'Unangemessener Inhalt',
    impersonation: 'Identitätsdiebstahl',
    misinformation: 'Fehlinformation',
    other: 'Sonstiges'
};

// Content type labels
const CONTENT_TYPE_LABELS = {
    user: 'Nutzer',
    post: 'Beitrag',
    poll: 'Umfrage',
    comment: 'Kommentar',
    match_media: 'Spielmedien'
};

// Status labels and colors
const STATUS_CONFIG = {
    pending: { label: 'Offen', color: 'red', bg: 'bg-red-100', text: 'text-red-800' },
    reviewed: { label: 'In Bearbeitung', color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    resolved: { label: 'Erledigt', color: 'green', bg: 'bg-green-100', text: 'text-green-800' },
    dismissed: { label: 'Abgelehnt', color: 'gray', bg: 'bg-gray-100', text: 'text-gray-800' }
};

/**
 * Initialize the page
 */
async function init() {
    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            showAuthError();
            return;
        }

        // Check if user is coach or admin
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role, club_id, first_name, last_name')
            .eq('id', currentUser.id)
            .single();

        if (error || !profile || !['coach', 'admin', 'head_coach'].includes(profile.role)) {
            showAuthError();
            return;
        }

        currentUserProfile = profile;

        // Setup event listeners
        setupEventListeners();

        // Load reports
        await loadReports();

        // Show content
        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

    } catch (err) {
        console.error('[AdminReports] Init error:', err);
        showAuthError();
    }
}

/**
 * Show auth error
 */
function showAuthError() {
    pageLoader.style.display = 'none';
    authError.style.display = 'flex';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Filter changes
    filterStatus?.addEventListener('change', loadReports);
    filterType?.addEventListener('change', loadReports);
    filterContentType?.addEventListener('change', loadReports);

    // Modal close
    document.getElementById('close-report-modal')?.addEventListener('click', closeModal);
    reportModal?.addEventListener('click', (e) => {
        if (e.target === reportModal) closeModal();
    });

    // Action buttons
    document.getElementById('action-dismiss')?.addEventListener('click', () => handleAction('dismissed'));
    document.getElementById('action-warn')?.addEventListener('click', () => handleAction('resolved', 'warning'));
    document.getElementById('action-delete-content')?.addEventListener('click', () => handleAction('resolved', 'delete_content'));
    document.getElementById('action-block-user')?.addEventListener('click', () => handleAction('resolved', 'block_user'));
}

/**
 * Load reports from database
 */
async function loadReports() {
    try {
        const statusFilter = filterStatus?.value || 'pending';
        const typeFilter = filterType?.value || 'all';
        const contentTypeFilter = filterContentType?.value || 'all';

        // Build query
        let query = supabase
            .from('content_reports')
            .select(`
                *,
                reporter:reporter_id(id, first_name, last_name, avatar_url),
                reported_user:reported_user_id(id, first_name, last_name, avatar_url)
            `)
            .order('created_at', { ascending: false });

        // Apply filters
        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (typeFilter !== 'all') {
            query = query.eq('report_type', typeFilter);
        }

        if (contentTypeFilter !== 'all') {
            query = query.eq('content_type', contentTypeFilter);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[AdminReports] Error loading reports:', error);
            reportsList.innerHTML = `
                <div class="text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>Fehler beim Laden der Meldungen</p>
                </div>
            `;
            return;
        }

        reports = data || [];

        // Update stats
        await updateStats();

        // Render reports
        renderReports();

    } catch (err) {
        console.error('[AdminReports] Error:', err);
    }
}

/**
 * Update stats display
 */
async function updateStats() {
    try {
        const { data: allReports } = await supabase
            .from('content_reports')
            .select('status');

        if (!allReports) return;

        const counts = {
            pending: 0,
            reviewed: 0,
            resolved: 0,
            dismissed: 0
        };

        allReports.forEach(r => {
            if (counts[r.status] !== undefined) {
                counts[r.status]++;
            }
        });

        pendingCount.textContent = counts.pending;
        reviewedCount.textContent = counts.reviewed;
        resolvedCount.textContent = counts.resolved + counts.dismissed;
        totalCount.textContent = allReports.length;

    } catch (err) {
        console.error('[AdminReports] Error updating stats:', err);
    }
}

/**
 * Render reports list
 */
function renderReports() {
    if (reports.length === 0) {
        reportsList.classList.add('hidden');
        noReportsEl.classList.remove('hidden');
        return;
    }

    reportsList.classList.remove('hidden');
    noReportsEl.classList.add('hidden');

    const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

    reportsList.innerHTML = reports.map(report => {
        const status = STATUS_CONFIG[report.status] || STATUS_CONFIG.pending;
        const reporterName = report.reporter
            ? `${report.reporter.first_name || ''} ${report.reporter.last_name || ''}`.trim() || 'Unbekannt'
            : 'Unbekannt';
        const reportedName = report.reported_user
            ? `${report.reported_user.first_name || ''} ${report.reported_user.last_name || ''}`.trim() || 'Unbekannt'
            : 'Gelöschter Nutzer';

        return `
            <div class="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer" onclick="window.openReportDetail('${report.id}')">
                <div class="flex items-start gap-4">
                    <div class="flex-shrink-0">
                        <img
                            src="${report.reported_user?.avatar_url || DEFAULT_AVATAR}"
                            alt=""
                            class="w-12 h-12 rounded-full object-cover"
                            onerror="this.src='${DEFAULT_AVATAR}'"
                        />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 text-xs font-medium rounded-full ${status.bg} ${status.text}">
                                ${status.label}
                            </span>
                            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                                ${CONTENT_TYPE_LABELS[report.content_type] || report.content_type}
                            </span>
                            <span class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                ${REPORT_TYPE_LABELS[report.report_type] || report.report_type}
                            </span>
                        </div>
                        <p class="font-medium text-gray-900">
                            ${escapeHtml(reportedName)}
                        </p>
                        <p class="text-sm text-gray-500">
                            Gemeldet von ${escapeHtml(reporterName)} &bull; ${formatDate(report.created_at)}
                        </p>
                        ${report.description ? `
                            <p class="text-sm text-gray-600 mt-2 line-clamp-2">
                                "${escapeHtml(report.description)}"
                            </p>
                        ` : ''}
                    </div>
                    <div class="flex-shrink-0">
                        <i class="fas fa-chevron-right text-gray-400"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Open report detail modal
 */
window.openReportDetail = async function(reportId) {
    selectedReport = reports.find(r => r.id === reportId);
    if (!selectedReport) return;

    const status = STATUS_CONFIG[selectedReport.status] || STATUS_CONFIG.pending;
    const reporterName = selectedReport.reporter
        ? `${selectedReport.reporter.first_name || ''} ${selectedReport.reporter.last_name || ''}`.trim() || 'Unbekannt'
        : 'Unbekannt';
    const reportedName = selectedReport.reported_user
        ? `${selectedReport.reported_user.first_name || ''} ${selectedReport.reported_user.last_name || ''}`.trim() || 'Unbekannt'
        : 'Gelöschter Nutzer';

    const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

    // Load content preview if it's a post/poll/comment
    let contentPreview = '';
    if (selectedReport.content_type === 'post') {
        const { data: post } = await supabase
            .from('community_posts')
            .select('content')
            .eq('id', selectedReport.content_id)
            .single();

        if (post) {
            contentPreview = `
                <div class="bg-gray-50 p-3 rounded-lg mt-3">
                    <p class="text-sm text-gray-600 font-medium mb-1">Gemeldeter Beitrag:</p>
                    <p class="text-gray-800">${escapeHtml(post.content).substring(0, 300)}${post.content.length > 300 ? '...' : ''}</p>
                </div>
            `;
        }
    } else if (selectedReport.content_type === 'comment') {
        const { data: comment } = await supabase
            .from('post_comments')
            .select('content')
            .eq('id', selectedReport.content_id)
            .single();

        if (comment) {
            contentPreview = `
                <div class="bg-gray-50 p-3 rounded-lg mt-3">
                    <p class="text-sm text-gray-600 font-medium mb-1">Gemeldeter Kommentar:</p>
                    <p class="text-gray-800">${escapeHtml(comment.content)}</p>
                </div>
            `;
        }
    }

    document.getElementById('modal-content').innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center gap-2">
                <span class="px-3 py-1 text-sm font-medium rounded-full ${status.bg} ${status.text}">
                    ${status.label}
                </span>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-500">Gemeldeter Nutzer</p>
                    <div class="flex items-center gap-2 mt-1">
                        <img src="${selectedReport.reported_user?.avatar_url || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'" />
                        <span class="font-medium">${escapeHtml(reportedName)}</span>
                    </div>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Gemeldet von</p>
                    <div class="flex items-center gap-2 mt-1">
                        <img src="${selectedReport.reporter?.avatar_url || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'" />
                        <span class="font-medium">${escapeHtml(reporterName)}</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-500">Inhaltstyp</p>
                    <p class="font-medium">${CONTENT_TYPE_LABELS[selectedReport.content_type] || selectedReport.content_type}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Meldegrund</p>
                    <p class="font-medium">${REPORT_TYPE_LABELS[selectedReport.report_type] || selectedReport.report_type}</p>
                </div>
            </div>

            <div>
                <p class="text-sm text-gray-500">Datum</p>
                <p class="font-medium">${formatDate(selectedReport.created_at, true)}</p>
            </div>

            ${selectedReport.description ? `
                <div>
                    <p class="text-sm text-gray-500">Beschreibung</p>
                    <p class="font-medium mt-1">"${escapeHtml(selectedReport.description)}"</p>
                </div>
            ` : ''}

            ${contentPreview}

            ${selectedReport.resolution_notes ? `
                <div class="bg-blue-50 p-3 rounded-lg">
                    <p class="text-sm text-blue-600 font-medium">Bearbeiter-Notiz:</p>
                    <p class="text-blue-800">${escapeHtml(selectedReport.resolution_notes)}</p>
                </div>
            ` : ''}
        </div>
    `;

    reportModal.classList.remove('hidden');
};

/**
 * Close modal
 */
function closeModal() {
    reportModal.classList.add('hidden');
    selectedReport = null;
}

/**
 * Handle action on report
 */
async function handleAction(newStatus, action = null) {
    if (!selectedReport) return;

    let resolutionNotes = '';

    if (action === 'warning') {
        resolutionNotes = 'Nutzer wurde verwarnt.';
    } else if (action === 'delete_content') {
        resolutionNotes = 'Inhalt wurde gelöscht.';

        // Actually delete the content
        if (selectedReport.content_type === 'post') {
            await supabase
                .from('community_posts')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', selectedReport.content_id);
        } else if (selectedReport.content_type === 'poll') {
            await supabase
                .from('community_polls')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', selectedReport.content_id);
        } else if (selectedReport.content_type === 'comment') {
            await supabase
                .from('post_comments')
                .delete()
                .eq('id', selectedReport.content_id);
        }
    } else if (action === 'block_user') {
        resolutionNotes = 'Nutzer wurde gesperrt.';

        // TODO: Implement user suspension/ban functionality
        // This would require a new field in profiles or a separate table
    } else if (newStatus === 'dismissed') {
        resolutionNotes = 'Meldung wurde abgelehnt - kein Verstoß festgestellt.';
    }

    try {
        const { error } = await supabase
            .from('content_reports')
            .update({
                status: newStatus,
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString(),
                resolution_notes: resolutionNotes,
                updated_at: new Date().toISOString()
            })
            .eq('id', selectedReport.id);

        if (error) throw error;

        // Close modal and reload
        closeModal();
        await loadReports();

        showToast('Meldung wurde bearbeitet', 'success');

    } catch (err) {
        console.error('[AdminReports] Error updating report:', err);
        showToast('Fehler beim Bearbeiten', 'error');
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format date
 */
function formatDate(dateStr, detailed = false) {
    const date = new Date(dateStr);
    if (detailed) {
        return date.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());

    const toast = document.createElement('div');
    toast.className = `toast-notification fixed bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        'bg-gray-800 text-white'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
