/**
 * Guardian Dashboard - Overview of all children for parents
 * Shows children's profiles, activity, and allows generating login codes
 */

import { getSupabase } from './supabase-init.js';
import { calculateAge } from './age-utils.js';
import { escapeHtml } from './utils/security.js';

console.log('[GUARDIAN-DASHBOARD] Script starting...');

const supabase = getSupabase();

// State
let currentUser = null;
let currentProfile = null;
let children = [];
let currentChildId = null; // For modal
let initialized = false;
let validatedCodeData = null; // For add child via code
let sportsData = []; // Cache for sports
let upgradeChildId = null; // For upgrade modal

// Check if coming from settings
const urlParams = new URLSearchParams(window.location.search);
const fromSettings = urlParams.get('from') === 'settings';

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenMessage = document.getElementById('no-children-message');
const credentialsModal = document.getElementById('credentials-modal');
const credentialsForm = document.getElementById('credentials-form');
const credentialsUsername = document.getElementById('credentials-username');
const credentialsPin = document.getElementById('credentials-pin');
const credentialsPinConfirm = document.getElementById('credentials-pin-confirm');
const credentialsError = document.getElementById('credentials-error');
const credentialsErrorText = document.getElementById('credentials-error-text');
const credentialsSuccess = document.getElementById('credentials-success');
const credentialsSuccessText = document.getElementById('credentials-success-text');
const credentialsSubmitBtn = document.getElementById('credentials-submit-btn');
const usernameCheckStatus = document.getElementById('username-check-status');
const usernameHint = document.getElementById('username-hint');
let usernameCheckTimeout = null;

// Menu Elements
const guardianMenu = document.getElementById('guardian-menu');
const menuBackdrop = document.getElementById('menu-backdrop');
const menuPanel = document.getElementById('menu-panel');
const openMenuBtn = document.getElementById('open-menu-btn');
const backToSettingsBtn = document.getElementById('back-to-settings-btn');
const headerTitle = document.getElementById('header-title');
const switchToPlayerBtn = document.getElementById('switch-to-player-btn');
const becomePlayerBtn = document.getElementById('become-player-btn');
const logoutBtn = document.getElementById('logout-btn');
const menuUserName = document.getElementById('menu-user-name');

// Add Child Modal Elements
const addChildModal = document.getElementById('add-child-modal');
const addChildBtn = document.getElementById('add-child-btn');
const addChildModalTitle = document.getElementById('add-child-modal-title');
const addChildModalSubtitle = document.getElementById('add-child-modal-subtitle');
const addChildStepChoice = document.getElementById('add-child-step-choice');
const btnWithCode = document.getElementById('btn-with-code');
const btnManual = document.getElementById('btn-manual');
const invitationCodeInput = document.getElementById('invitation-code-input');
const validateCodeBtn = document.getElementById('validate-code-btn');
const addChildCodeError = document.getElementById('add-child-code-error');
const addChildCodeErrorText = document.getElementById('add-child-code-error-text');
const addChildStepCode = document.getElementById('add-child-step-code');
const addChildStepConfirm = document.getElementById('add-child-step-confirm');
const addChildStepSuccess = document.getElementById('add-child-step-success');
const addChildStepManual = document.getElementById('add-child-step-manual');
const childPreviewInitial = document.getElementById('child-preview-initial');
const childPreviewName = document.getElementById('child-preview-name');
const childPreviewAge = document.getElementById('child-preview-age');
const backToCodeBtn = document.getElementById('back-to-code-btn');
const backToChoiceBtn = document.getElementById('back-to-choice-btn');
const confirmLinkBtn = document.getElementById('confirm-link-btn');
const addChildConfirmError = document.getElementById('add-child-confirm-error');
const addChildConfirmErrorText = document.getElementById('add-child-confirm-error-text');
const addChildSuccessName = document.getElementById('add-child-success-name');
const addChildDoneBtn = document.getElementById('add-child-done-btn');
const closeAddChildModal = document.getElementById('close-add-child-modal');
const manualChildForm = document.getElementById('manual-child-form');
const manualFirstName = document.getElementById('manual-first-name');
const manualLastName = document.getElementById('manual-last-name');
const manualBirthdate = document.getElementById('manual-birthdate');
const manualGender = document.getElementById('manual-gender');
const manualSport = document.getElementById('manual-sport');
const manualChildError = document.getElementById('manual-child-error');
const manualChildErrorText = document.getElementById('manual-child-error-text');

// Invite Guardian Modal Elements
const inviteGuardianModal = document.getElementById('invite-guardian-modal');
const inviteGuardianChildName = document.getElementById('invite-guardian-child-name');
const inviteGuardianLoading = document.getElementById('invite-guardian-loading');
const inviteGuardianDisplay = document.getElementById('invite-guardian-display');
const inviteGuardianCode = document.getElementById('invite-guardian-code');
const inviteGuardianValidity = document.getElementById('invite-guardian-validity');
const inviteGuardianError = document.getElementById('invite-guardian-error');
const inviteGuardianErrorText = document.getElementById('invite-guardian-error-text');
const copyInviteCodeBtn = document.getElementById('copy-invite-code');
const closeInviteGuardianModal = document.getElementById('close-invite-guardian-modal');

// Child Upgrade Modal Elements
const childUpgradeModal = document.getElementById('child-upgrade-modal');
const upgradeChildNameEl = document.getElementById('upgrade-child-name');
const childUpgradeForm = document.getElementById('child-upgrade-form');
const upgradeEmail = document.getElementById('upgrade-email');
const upgradeError = document.getElementById('upgrade-error');
const upgradeErrorText = document.getElementById('upgrade-error-text');
const upgradeSuccess = document.getElementById('upgrade-success');
const upgradeSuccessText = document.getElementById('upgrade-success-text');
const upgradeSubmitBtn = document.getElementById('upgrade-submit-btn');
const closeUpgradeModal = document.getElementById('close-upgrade-modal');

// Sport Selection Modal Elements
const sportSelectModal = document.getElementById('sport-select-modal');
const playerSportSelect = document.getElementById('player-sport-select');
const closeSportModalBtn = document.getElementById('close-sport-modal');
const cancelSportSelectBtn = document.getElementById('cancel-sport-select');
const confirmSportSelectBtn = document.getElementById('confirm-sport-select');

// Initialize with user
async function initializeWithUser(user) {
    if (initialized) return;
    initialized = true;

    try {
        currentUser = user;
        console.log('[GUARDIAN-DASHBOARD] User:', currentUser.id);

        // Check if user is a guardian and get full profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, is_guardian, is_player, first_name, last_name, display_name')
            .eq('id', user.id)
            .single();

        // If coming from settings, allow access even if not yet a guardian (they want to add a child)
        // Otherwise, redirect non-guardians to dashboard
        if (!fromSettings && !profile?.is_guardian && profile?.account_type !== 'guardian') {
            console.log('[GUARDIAN-DASHBOARD] User is not a guardian, redirecting to dashboard');
            window.location.href = '/dashboard.html';
            return;
        }

        currentProfile = profile;

        // Update menu user name
        if (menuUserName) {
            menuUserName.textContent = profile.display_name || profile.first_name || 'Eltern-Account';
        }

        // Show/hide menu buttons based on is_player
        if (profile.is_player) {
            // User is also a player - show switch button
            switchToPlayerBtn?.classList.remove('hidden');
            becomePlayerBtn?.classList.add('hidden');
        } else {
            // Pure guardian - show become player button
            switchToPlayerBtn?.classList.add('hidden');
            becomePlayerBtn?.classList.remove('hidden');
        }

        // Handle from=settings mode - show back button instead of menu
        if (fromSettings) {
            openMenuBtn?.classList.add('hidden');
            backToSettingsBtn?.classList.remove('hidden');
            if (headerTitle) headerTitle.textContent = 'Meine Kinder';
        }

        // Load children using RPC
        await loadChildren();

        // Setup event listeners
        setupEventListeners();

        // Show main content
        pageLoader.classList.add('hidden');
        mainContent.classList.remove('hidden');

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Init error:', err);
        pageLoader.innerHTML = `
            <div class="text-center text-red-600 p-6">
                <p class="mb-2">Fehler beim Laden: ${err.message || 'Unbekannter Fehler'}</p>
                <a href="/index.html" class="text-indigo-600 underline mt-2 block">Zur Startseite</a>
            </div>
        `;
    }
}

// Try to initialize - first with getSession, fallback to onAuthStateChange
async function initialize() {
    // First try getSession
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        console.log('[GUARDIAN-DASHBOARD] Session found immediately');
        await initializeWithUser(session.user);
    } else {
        console.log('[GUARDIAN-DASHBOARD] No session yet, waiting for auth state...');
        // Wait for auth state change
        supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[GUARDIAN-DASHBOARD] Auth state changed:', event);
            if (session?.user && !initialized) {
                await initializeWithUser(session.user);
            } else if (event === 'SIGNED_OUT' || (!session && event === 'INITIAL_SESSION')) {
                window.location.href = '/index.html';
            }
        });
    }
}

// Load children from guardian_links
async function loadChildren() {
    try {
        // Use get_my_children which includes username and has_pin fields
        const { data, error } = await supabase.rpc('get_my_children');

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error);
        }

        children = data.children || [];
        console.log('[GUARDIAN-DASHBOARD] Loaded children:', children.length);

        // Load stats for each child
        for (const child of children) {
            await loadChildStats(child);
        }

        renderChildren();

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error loading children:', err);
        childrenList.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Fehler beim Laden: ${escapeHtml(err.message)}
            </div>
        `;
    }
}

// Load stats and recent activity for a child
async function loadChildStats(child) {
    try {
        // Load match stats
        const { data: matches } = await supabase
            .from('matches')
            .select('id, winner_id, created_at, player_a_id, player_b_id')
            .or(`player_a_id.eq.${child.id},player_b_id.eq.${child.id}`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (matches) {
            child.totalMatches = matches.length;
            child.wins = matches.filter(m => m.winner_id === child.id).length;
            child.recentMatches = matches.slice(0, 5);
        } else {
            child.totalMatches = 0;
            child.wins = 0;
            child.recentMatches = [];
        }

        // Load points history
        const { data: pointsHistory } = await supabase
            .from('points_history')
            .select('*')
            .eq('user_id', child.id)
            .order('timestamp', { ascending: false })
            .limit(10);

        child.pointsHistory = pointsHistory || [];

        // Load notifications for child
        const { data: notifications } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', child.id)
            .order('created_at', { ascending: false })
            .limit(10);

        child.notifications = notifications || [];

        // Load video analyses for child
        const { data: videos } = await supabase
            .rpc('get_player_videos', { p_player_id: child.id });

        child.videos = (videos || []).slice(0, 10);

        // Load upcoming event invitations for child
        const today = new Date().toISOString().split('T')[0];
        const { data: eventInvitations } = await supabase
            .from('event_invitations')
            .select('id, status, event_id, events(id, title, event_category, start_date, end_date, start_time, end_time, meeting_time, location, description, created_by, cancelled)')
            .eq('user_id', child.id)
            .or('cancelled.eq.false,cancelled.is.null', { foreignTable: 'events' });

        // Filter to upcoming events only (start_date >= today)
        const upcomingEvents = (eventInvitations || [])
            .filter(inv => inv.events && inv.events.start_date >= today && !inv.events.cancelled)
            .sort((a, b) => a.events.start_date.localeCompare(b.events.start_date));

        child.upcomingEvents = upcomingEvents.slice(0, 10);

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error loading child stats:', err);
        child.totalMatches = 0;
        child.wins = 0;
        child.recentMatches = [];
        child.pointsHistory = [];
        child.notifications = [];
        child.videos = [];
        child.upcomingEvents = [];
    }
}

// Helper functions for points display
function getColorClass(value) {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-500';
}

function getSign(value) {
    if (value > 0) return '+';
    if (value < 0) return '';
    return '±';
}

function getNotificationIcon(type) {
    const icons = {
        'match_request': 'fas fa-table-tennis',
        'match_result': 'fas fa-trophy',
        'challenge': 'fas fa-flag-checkered',
        'points': 'fas fa-star',
        'attendance': 'fas fa-calendar-check',
        'coach': 'fas fa-user-tie',
        'event': 'fas fa-calendar',
        'club': 'fas fa-users',
        'system': 'fas fa-info-circle',
        'friend_request': 'fas fa-user-plus',
        'message': 'fas fa-envelope'
    };
    return icons[type] || 'fas fa-bell';
}

// Render children list
function renderChildren() {
    if (children.length === 0) {
        childrenList.classList.add('hidden');
        noChildrenMessage.classList.remove('hidden');
        return;
    }

    childrenList.classList.remove('hidden');
    noChildrenMessage.classList.add('hidden');

    childrenList.innerHTML = children.map(child => {
        const age = child.age || calculateAge(child.birthdate);
        const avatarUrl = child.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(child.first_name || 'K')}&background=6366f1&color=fff`;

        // Format points history
        let pointsHistoryHtml = '';
        if (child.pointsHistory && child.pointsHistory.length > 0) {
            pointsHistoryHtml = child.pointsHistory.slice(0, 5).map(entry => {
                const date = new Date(entry.created_at || entry.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const reason = entry.reason || entry.description || 'Punkte';
                const points = entry.points || 0;
                const xp = entry.xp !== undefined ? entry.xp : points;
                const elo = entry.elo_change || 0;

                return `
                    <div class="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                        <div class="flex-1 min-w-0">
                            <span class="text-gray-700 text-xs">${escapeHtml(reason)}</span>
                            <span class="text-[10px] text-gray-400 ml-1">${date}</span>
                        </div>
                        <div class="flex gap-2 text-[10px] flex-shrink-0">
                            <div class="text-center min-w-[28px]">
                                <div class="text-gray-400 leading-tight">Elo</div>
                                <div class="${getColorClass(elo)} font-semibold">${getSign(elo)}${elo}</div>
                            </div>
                            <div class="text-center min-w-[28px]">
                                <div class="text-gray-400 leading-tight">XP</div>
                                <div class="${getColorClass(xp)} font-semibold">${getSign(xp)}${xp}</div>
                            </div>
                            <div class="text-center min-w-[28px]">
                                <div class="text-gray-400 leading-tight">Pkt</div>
                                <div class="${getColorClass(points)} font-semibold">${getSign(points)}${points}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            pointsHistoryHtml = '<p class="text-xs text-gray-400 py-2">Keine Einträge</p>';
        }

        // Format notifications
        let notificationsHtml = '';
        const unreadCount = (child.notifications || []).filter(n => !n.is_read).length;
        if (child.notifications && child.notifications.length > 0) {
            notificationsHtml = child.notifications.slice(0, 5).map(notif => {
                const date = new Date(notif.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const isUnread = !notif.is_read;
                const icon = getNotificationIcon(notif.type);

                return `
                    <div class="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0 ${isUnread ? 'bg-indigo-50 -mx-2 px-2 rounded' : ''}" data-notification-id="${notif.id}">
                        <i class="${icon} text-xs mt-0.5 ${isUnread ? 'text-indigo-600' : 'text-gray-400'}"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs ${isUnread ? 'text-gray-900 font-medium' : 'text-gray-700'}">${escapeHtml(notif.title || '')}</p>
                            <p class="text-[10px] text-gray-500 line-clamp-2">${escapeHtml(notif.message || '')}</p>
                            <p class="text-[10px] text-gray-400">${date}</p>
                        </div>
                        <button onclick="deleteNotification('${notif.id}', '${child.id}')" class="text-gray-400 hover:text-red-500 p-1 -mr-1" title="Löschen">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                    </div>
                `;
            }).join('');
        } else {
            notificationsHtml = '<p class="text-xs text-gray-400 py-2">Keine Mitteilungen</p>';
        }

        return `
            <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <!-- Header with basic info -->
                <div class="p-4">
                    <div class="flex items-center gap-3">
                        <img
                            src="${escapeHtml(avatarUrl)}"
                            alt="${escapeHtml(child.first_name)}"
                            class="w-12 h-12 rounded-full object-cover"
                        />
                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-900 truncate">
                                ${escapeHtml(child.first_name || '')} ${escapeHtml(child.last_name || '')}
                            </h3>
                            <p class="text-sm text-gray-500">${age} Jahre</p>
                        </div>
                        <a
                            href="/settings.html?child_id=${child.id}"
                            class="text-gray-500 hover:text-gray-700 p-2"
                            title="Einstellungen für ${escapeHtml(child.first_name)}"
                        >
                            <i class="fas fa-cog"></i>
                        </a>
                        <button
                            onclick="showCredentialsModal('${child.id}', '${escapeHtml(child.first_name)}', '${child.username || ''}')"
                            class="${child.username && child.has_pin ? 'text-green-600 hover:text-green-800' : 'text-blue-600 hover:text-blue-800'} p-2"
                            title="${child.username && child.has_pin ? 'Zugangsdaten ändern' : 'Zugangsdaten einrichten'}"
                        >
                            <i class="fas ${child.username && child.has_pin ? 'fa-check-circle' : 'fa-user-lock'}"></i>
                        </button>
                    </div>
                </div>

                <!-- Stats -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <div class="grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                            <p class="font-bold text-gray-900">${child.elo_rating || 800}</p>
                            <p class="text-gray-500">Elo</p>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${child.xp || 0}</p>
                            <p class="text-gray-500">XP</p>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${child.totalMatches || 0}</p>
                            <p class="text-gray-500">Spiele</p>
                        </div>
                        <div>
                            <p class="font-bold text-green-600">${child.wins || 0}</p>
                            <p class="text-gray-500">Siege</p>
                        </div>
                    </div>
                </div>

                <!-- Upcoming Events -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <p class="text-xs text-gray-500 mb-1 font-medium flex items-center gap-2">
                        <i class="fas fa-calendar text-indigo-500"></i>
                        Anstehende Veranstaltungen
                        ${child.upcomingEvents && child.upcomingEvents.length > 0 ? `<span class="bg-indigo-100 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-full">${child.upcomingEvents.length}</span>` : ''}
                    </p>
                    <div class="max-h-48 overflow-y-auto">
                        ${child.upcomingEvents && child.upcomingEvents.length > 0 ? child.upcomingEvents.map(inv => {
                            const ev = inv.events;
                            const date = new Date(ev.start_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                            const timeStr = ev.start_time ? ev.start_time.slice(0, 5) : '';
                            const categoryIcons = { training: 'fa-dumbbell', competition: 'fa-trophy', meeting: 'fa-users', social: 'fa-glass-cheers', other: 'fa-calendar' };
                            const categoryIcon = categoryIcons[ev.event_category] || 'fa-calendar';
                            const statusColors = { accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', pending: 'bg-yellow-100 text-yellow-700' };
                            const statusLabels = { accepted: 'Zugesagt', rejected: 'Abgesagt', pending: 'Offen' };
                            const statusClass = statusColors[inv.status] || statusColors.pending;
                            const statusLabel = statusLabels[inv.status] || 'Offen';
                            return `
                                <div class="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                                    <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                        <i class="fas ${categoryIcon} text-indigo-500 text-xs"></i>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs text-gray-700 font-medium truncate">${escapeHtml(ev.title)}</p>
                                        <div class="flex items-center gap-2 text-[10px] text-gray-400">
                                            <span>${date}</span>
                                            ${timeStr ? `<span>${timeStr} Uhr</span>` : ''}
                                            ${ev.location ? `<span class="truncate">${escapeHtml(ev.location)}</span>` : ''}
                                        </div>
                                    </div>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full ${statusClass} flex-shrink-0">${statusLabel}</span>
                                </div>
                            `;
                        }).join('') : '<p class="text-xs text-gray-400 py-2">Keine anstehenden Veranstaltungen</p>'}
                    </div>
                </div>

                <!-- Points History -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <p class="text-xs text-gray-500 mb-1 font-medium">Punkte-Historie</p>
                    <div class="max-h-40 overflow-y-auto">
                        ${pointsHistoryHtml}
                    </div>
                </div>

                <!-- Notifications -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <div class="flex items-center justify-between mb-1">
                        <p class="text-xs text-gray-500 font-medium flex items-center gap-2">
                            Mitteilungen
                            ${unreadCount > 0 ? `<span class="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">${unreadCount}</span>` : ''}
                        </p>
                        ${child.notifications && child.notifications.length > 0 ? `
                            <button onclick="clearAllNotifications('${child.id}')" class="text-[10px] text-gray-400 hover:text-red-500" title="Alle löschen">
                                <i class="fas fa-trash-alt mr-1"></i>Alle löschen
                            </button>
                        ` : ''}
                    </div>
                    <div class="max-h-40 overflow-y-auto">
                        ${notificationsHtml}
                    </div>
                </div>

                <!-- Video Analysen -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <p class="text-xs text-gray-500 mb-1 font-medium flex items-center gap-2">
                        <i class="fas fa-video text-indigo-500"></i>
                        Videoanalysen
                        ${child.videos && child.videos.length > 0 ? `<span class="bg-indigo-100 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded-full">${child.videos.length}</span>` : ''}
                    </p>
                    <div class="max-h-48 overflow-y-auto">
                        ${child.videos && child.videos.length > 0 ? child.videos.map(video => {
                            const date = new Date(video.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
                            const statusClass = video.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
                            const statusText = video.status === 'reviewed' ? 'Bewertet' : 'Ausstehend';
                            const title = video.title || video.exercise_name || 'Video';
                            const thumbnailUrl = video.thumbnail_url || '';
                            return `
                                <div class="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1 transition-colors" onclick="openVideoPlayer('${escapeHtml(video.video_url || '')}', '${escapeHtml(title)}', '${video.id}')">
                                    ${thumbnailUrl ? `
                                        <div class="w-12 h-8 rounded overflow-hidden flex-shrink-0 bg-gray-100 relative">
                                            <img src="${escapeHtml(thumbnailUrl)}" alt="" class="w-full h-full object-cover">
                                            <div class="absolute inset-0 flex items-center justify-center bg-black/30">
                                                <i class="fas fa-play text-white text-[8px]"></i>
                                            </div>
                                        </div>
                                    ` : `
                                        <div class="w-12 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <i class="fas fa-play text-gray-400 text-xs"></i>
                                        </div>
                                    `}
                                    <div class="flex-1 min-w-0">
                                        <p class="text-xs text-gray-700 truncate">${escapeHtml(title)}</p>
                                        <div class="flex items-center gap-2">
                                            <span class="text-[10px] text-gray-400">${date}</span>
                                            ${video.uploader_name ? `<span class="text-[10px] text-gray-400">von ${escapeHtml(video.uploader_name)}</span>` : ''}
                                        </div>
                                    </div>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full ${statusClass} flex-shrink-0">${statusText}</span>
                                    ${video.comment_count > 0 ? `<span class="text-[10px] text-gray-400 flex-shrink-0"><i class="fas fa-comment text-xs"></i> ${video.comment_count}</span>` : ''}
                                </div>
                            `;
                        }).join('') : '<p class="text-xs text-gray-400 py-2">Keine Videoanalysen</p>'}
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                    <button
                        onclick="showInviteGuardianModal('${child.id}', '${escapeHtml(child.first_name)} ${escapeHtml(child.last_name)}')"
                        class="w-full bg-purple-100 text-purple-700 text-xs font-medium py-2 px-3 rounded-lg hover:bg-purple-200 transition-colors"
                    >
                        <i class="fas fa-user-plus mr-1"></i>
                        Weiteren Vormund einladen
                    </button>
                    ${age >= 16 ? `
                        <button
                            onclick="showUpgradeModal('${child.id}', '${escapeHtml(child.first_name)} ${escapeHtml(child.last_name)}')"
                            class="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white text-xs font-medium py-2 px-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-colors"
                        >
                            <i class="fas fa-graduation-cap mr-1"></i>
                            Eigenen Account erstellen (16+)
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Delete a single notification
window.deleteNotification = async function(notificationId, childId) {
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);

        if (error) throw error;

        // Update local state
        const child = children.find(c => c.id === childId);
        if (child) {
            child.notifications = child.notifications.filter(n => n.id !== notificationId);
            renderChildren();
        }
    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error deleting notification:', err);
        alert('Fehler beim Löschen der Mitteilung');
    }
};

// Show invite guardian modal (exposed to window for onclick)
window.showInviteGuardianModal = function(childId, childName) {
    showInviteGuardianModal(childId, childName);
};

// Show upgrade modal (exposed to window for onclick)
window.showUpgradeModal = function(childId, childName) {
    showUpgradeModal(childId, childName);
};

// Clear all notifications for a child
window.clearAllNotifications = async function(childId) {
    if (!confirm('Alle Mitteilungen für dieses Kind löschen?')) return;

    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', childId);

        if (error) throw error;

        // Update local state
        const child = children.find(c => c.id === childId);
        if (child) {
            child.notifications = [];
            renderChildren();
        }
    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error clearing notifications:', err);
        alert('Fehler beim Löschen der Mitteilungen');
    }
};

// Show credentials modal for a child
window.showCredentialsModal = async function(childId, childName, existingUsername = '') {
    currentChildId = childId;

    // Update modal title
    document.getElementById('modal-child-name').textContent = childName;

    // Reset form
    if (credentialsUsername) {
        credentialsUsername.value = existingUsername || '';
    }
    if (credentialsPin) credentialsPin.value = '';
    if (credentialsPinConfirm) credentialsPinConfirm.value = '';
    credentialsError?.classList.add('hidden');
    credentialsSuccess?.classList.add('hidden');
    if (usernameCheckStatus) usernameCheckStatus.innerHTML = '';
    if (usernameHint) {
        usernameHint.textContent = '3-30 Zeichen, nur Kleinbuchstaben, Zahlen, Punkte und Unterstriche';
        usernameHint.classList.remove('text-red-500', 'text-green-500');
        usernameHint.classList.add('text-gray-500');
    }

    if (credentialsSubmitBtn) {
        credentialsSubmitBtn.disabled = false;
        credentialsSubmitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Zugangsdaten speichern';
    }

    // If no existing username, get suggestions
    if (!existingUsername) {
        const child = children.find(c => c.id === childId);
        if (child?.first_name) {
            const birthYear = child.birthdate ? new Date(child.birthdate).getFullYear() : null;
            try {
                const { data } = await supabase.rpc('suggest_username', {
                    p_first_name: child.first_name,
                    p_birth_year: birthYear
                });
                if (data?.suggestions?.length > 0) {
                    if (credentialsUsername) {
                        credentialsUsername.value = data.suggestions[0];
                        credentialsUsername.placeholder = `z.B. ${data.suggestions.slice(0, 3).join(', ')}`;
                    }
                }
            } catch (e) {
                console.log('[GUARDIAN-DASHBOARD] Could not get username suggestions:', e);
            }
        }
    }

    credentialsModal?.classList.remove('hidden');
    credentialsUsername?.focus();
};

// Save child credentials
async function saveCredentials() {
    const username = credentialsUsername?.value?.trim().toLowerCase();
    const pin = credentialsPin?.value?.trim();
    const pinConfirm = credentialsPinConfirm?.value?.trim();

    // Validation
    if (!username || username.length < 3) {
        showCredentialsError('Benutzername muss mindestens 3 Zeichen haben.');
        return;
    }

    if (!pin || pin.length < 4 || pin.length > 6) {
        showCredentialsError('PIN muss 4-6 Ziffern haben.');
        return;
    }

    if (!/^[0-9]+$/.test(pin)) {
        showCredentialsError('PIN darf nur Ziffern enthalten.');
        return;
    }

    if (pin !== pinConfirm) {
        showCredentialsError('Die PINs stimmen nicht überein.');
        return;
    }

    if (!currentChildId) {
        showCredentialsError('Kein Kind ausgewählt.');
        return;
    }

    // Disable button and show loading
    if (credentialsSubmitBtn) {
        credentialsSubmitBtn.disabled = true;
        credentialsSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Speichere...';
    }

    try {
        const { data, error } = await supabase.rpc('set_child_credentials', {
            p_child_id: currentChildId,
            p_username: username,
            p_pin: pin
        });

        if (error) throw error;

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Speichern der Zugangsdaten');
        }

        // Show success
        credentialsError?.classList.add('hidden');
        if (credentialsSuccessText) {
            credentialsSuccessText.textContent = `Zugangsdaten gespeichert! Benutzername: ${data.username}`;
        }
        credentialsSuccess?.classList.remove('hidden');

        // Refresh children list after a short delay
        setTimeout(async () => {
            await loadChildren();
            credentialsModal?.classList.add('hidden');
            currentChildId = null;
        }, 2000);

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Credentials save error:', error);
        showCredentialsError(error.message || 'Fehler beim Speichern. Bitte versuche es erneut.');

        if (credentialsSubmitBtn) {
            credentialsSubmitBtn.disabled = false;
            credentialsSubmitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Zugangsdaten speichern';
        }
    }
}

function showCredentialsError(message) {
    if (credentialsErrorText) credentialsErrorText.textContent = message;
    credentialsError?.classList.remove('hidden');
    credentialsSuccess?.classList.add('hidden');
}

// =====================================================
// Add Child Modal Functions
// =====================================================

function showAddChildModal() {
    // Reset to choice step
    addChildStepChoice?.classList.remove('hidden');
    addChildStepCode?.classList.add('hidden');
    addChildStepConfirm?.classList.add('hidden');
    addChildStepSuccess?.classList.add('hidden');
    addChildStepManual?.classList.add('hidden');
    addChildCodeError?.classList.add('hidden');
    addChildConfirmError?.classList.add('hidden');
    manualChildError?.classList.add('hidden');
    if (invitationCodeInput) invitationCodeInput.value = '';
    if (manualChildForm) manualChildForm.reset();
    validatedCodeData = null;

    // Reset title
    if (addChildModalTitle) addChildModalTitle.textContent = 'Kind hinzufügen';
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Wie möchtest du das Kind hinzufügen?';

    addChildModal?.classList.remove('hidden');
}

function showCodeStep() {
    addChildStepChoice?.classList.add('hidden');
    addChildStepCode?.classList.remove('hidden');
    addChildCodeError?.classList.add('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Gib den Einladungscode vom Trainer ein';
    invitationCodeInput?.focus();
}

async function showManualStep() {
    addChildStepChoice?.classList.add('hidden');
    addChildStepManual?.classList.remove('hidden');
    manualChildError?.classList.add('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Gib die Daten deines Kindes ein';

    // Load sports if not already loaded
    if (sportsData.length === 0) {
        await loadSportsForManualChild();
    }

    manualFirstName?.focus();
}

async function loadSportsForManualChild() {
    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        sportsData = sports || [];

        // Populate sport dropdown
        if (manualSport && sports) {
            manualSport.innerHTML = '<option value="">Bitte wählen...</option>';
            sports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = sport.display_name || sport.name;
                manualSport.appendChild(option);
            });
        }
    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error loading sports:', error);
    }
}

function backToChoice() {
    addChildStepCode?.classList.add('hidden');
    addChildStepManual?.classList.add('hidden');
    addChildStepConfirm?.classList.add('hidden');
    addChildStepChoice?.classList.remove('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Wie möchtest du das Kind hinzufügen?';
}

async function validateInvitationCode() {
    const code = invitationCodeInput?.value?.trim().toUpperCase();

    if (!code) {
        showAddChildCodeError('Bitte gib einen Code ein.');
        return;
    }

    // Basic format validation (TTV-XXX-YYY)
    if (!/^TTV-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) {
        showAddChildCodeError('Ungültiges Code-Format. Erwartet: TTV-XXX-YYY');
        return;
    }

    // Show loading state
    if (validateCodeBtn) {
        validateCodeBtn.disabled = true;
        validateCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Prüfe...';
    }

    try {
        const { data, error } = await supabase.rpc('validate_guardian_invitation_code', {
            p_code: code
        });

        if (error) {
            throw error;
        }

        if (!data?.valid) {
            showAddChildCodeError(data?.error || 'Ungültiger Code');
            return;
        }

        // Store validated data
        validatedCodeData = {
            code: code,
            child: data.child,
            code_id: data.code_id,
            needs_profile: data.needs_profile || false
        };

        // Show child preview
        showChildPreview(data.child);

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error validating code:', error);
        showAddChildCodeError(error.message || 'Fehler beim Prüfen des Codes');
    } finally {
        if (validateCodeBtn) {
            validateCodeBtn.disabled = false;
            validateCodeBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Code prüfen';
        }
    }
}

function showChildPreview(child) {
    if (childPreviewInitial) {
        childPreviewInitial.textContent = (child.first_name?.[0] || '?').toUpperCase();
    }
    if (childPreviewName) {
        childPreviewName.textContent = `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Unbekannt';
    }
    if (childPreviewAge) {
        if (child.birthdate) {
            const age = calculateAge(child.birthdate);
            childPreviewAge.textContent = `${age} Jahre`;
        } else {
            childPreviewAge.textContent = 'Alter unbekannt';
        }
    }

    // Switch to confirm step
    addChildStepCode?.classList.add('hidden');
    addChildStepConfirm?.classList.remove('hidden');
    addChildConfirmError?.classList.add('hidden');
}

async function confirmLinkChild() {
    if (!validatedCodeData) {
        showAddChildConfirmError('Kein gültiger Code. Bitte versuche es erneut.');
        return;
    }

    // Show loading state
    if (confirmLinkBtn) {
        confirmLinkBtn.disabled = true;
        confirmLinkBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verknüpfe...';
    }

    try {
        const { data, error } = await supabase.rpc('link_guardian_via_invitation_code', {
            p_code: validatedCodeData.code
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            showAddChildConfirmError(data?.error || 'Fehler beim Verknüpfen');
            return;
        }

        // Show success
        showAddChildSuccess(validatedCodeData.child);

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error linking child:', error);
        showAddChildConfirmError(error.message || 'Fehler beim Verknüpfen des Kindes');
    } finally {
        if (confirmLinkBtn) {
            confirmLinkBtn.disabled = false;
            confirmLinkBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Verknüpfen';
        }
    }
}

function showAddChildSuccess(child) {
    const name = `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Das Kind';
    if (addChildSuccessName) {
        addChildSuccessName.textContent = `${name} wurde mit deinem Account verknüpft.`;
    }

    addChildStepConfirm?.classList.add('hidden');
    addChildStepSuccess?.classList.remove('hidden');

    // Also update the profile to mark as guardian if not already
    updateGuardianStatus();
}

async function updateGuardianStatus() {
    try {
        await supabase
            .from('profiles')
            .update({ is_guardian: true })
            .eq('id', currentUser.id);
    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error updating guardian status:', error);
    }
}

function showAddChildCodeError(message) {
    if (addChildCodeErrorText) addChildCodeErrorText.textContent = message;
    addChildCodeError?.classList.remove('hidden');
}

function showAddChildConfirmError(message) {
    if (addChildConfirmErrorText) addChildConfirmErrorText.textContent = message;
    addChildConfirmError?.classList.remove('hidden');
}

function closeAddChildModalAndRefresh() {
    addChildModal?.classList.add('hidden');
    validatedCodeData = null;
    loadChildren();
}

async function submitManualChild() {
    const firstName = manualFirstName?.value?.trim();
    const lastName = manualLastName?.value?.trim();
    const birthdate = manualBirthdate?.value;
    const gender = manualGender?.value || null;
    const sportId = manualSport?.value || null;

    // Validation
    if (!firstName || !lastName) {
        showManualChildError('Bitte gib Vor- und Nachname ein.');
        return;
    }

    if (!birthdate) {
        showManualChildError('Bitte gib das Geburtsdatum ein.');
        return;
    }

    if (!sportId) {
        showManualChildError('Bitte wähle eine Sportart aus.');
        return;
    }

    // Check age - must be under 18
    const age = calculateAge(birthdate);
    if (age >= 18) {
        showManualChildError('Das Kind muss unter 18 Jahre alt sein.');
        return;
    }

    // Show loading
    const submitBtn = document.getElementById('submit-manual-child-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird hinzugefügt...';
    }

    try {
        // Create child profile using RPC
        const { data, error } = await supabase.rpc('create_child_profile', {
            p_first_name: firstName,
            p_last_name: lastName,
            p_birthdate: birthdate,
            p_gender: gender,
            p_sport_id: sportId
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Erstellen des Profils');
        }

        // Show success
        if (addChildSuccessName) {
            addChildSuccessName.textContent = `${firstName} ${lastName} wurde hinzugefügt.`;
        }
        addChildStepManual?.classList.add('hidden');
        addChildStepSuccess?.classList.remove('hidden');

        // Update guardian status
        await updateGuardianStatus();

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error creating child profile:', error);
        showManualChildError(error.message || 'Fehler beim Hinzufügen des Kindes');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Hinzufügen';
        }
    }
}

function showManualChildError(message) {
    if (manualChildErrorText) manualChildErrorText.textContent = message;
    manualChildError?.classList.remove('hidden');
}

// =====================================================
// Invite Guardian Modal Functions
// =====================================================

async function showInviteGuardianModal(childId, childName) {
    inviteGuardianChildName.textContent = `für ${childName}`;
    inviteGuardianLoading?.classList.remove('hidden');
    inviteGuardianDisplay?.classList.add('hidden');
    inviteGuardianError?.classList.add('hidden');
    inviteGuardianModal?.classList.remove('hidden');

    try {
        // Generate guardian invite code via RPC
        const { data, error } = await supabase.rpc('generate_guardian_invite_code', {
            p_child_id: childId,
            p_validity_minutes: 2880 // 48 hours
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Generieren des Codes');
        }

        inviteGuardianCode.textContent = data.code;
        inviteGuardianValidity.textContent = '48 Stunden';
        inviteGuardianLoading?.classList.add('hidden');
        inviteGuardianDisplay?.classList.remove('hidden');

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error generating guardian invite code:', error);
        inviteGuardianLoading?.classList.add('hidden');
        inviteGuardianErrorText.textContent = error.message || 'Fehler beim Generieren des Codes';
        inviteGuardianError?.classList.remove('hidden');
    }
}

// =====================================================
// Child Upgrade Modal Functions (for children 16+)
// =====================================================

function showUpgradeModal(childId, childName) {
    upgradeChildId = childId;
    if (upgradeChildNameEl) upgradeChildNameEl.textContent = `für ${childName}`;

    // Reset form
    if (upgradeEmail) upgradeEmail.value = '';
    upgradeError?.classList.add('hidden');
    upgradeSuccess?.classList.add('hidden');
    if (upgradeSubmitBtn) {
        upgradeSubmitBtn.disabled = false;
        upgradeSubmitBtn.innerHTML = '<i class="fas fa-arrow-up mr-2"></i>Upgrade starten';
    }

    childUpgradeModal?.classList.remove('hidden');
}

async function handleUpgradeFormSubmit(e) {
    e.preventDefault();

    const email = upgradeEmail?.value?.trim();

    if (!email) {
        showUpgradeError('Bitte gib eine E-Mail-Adresse ein.');
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showUpgradeError('Bitte gib eine gültige E-Mail-Adresse ein.');
        return;
    }

    if (!upgradeChildId) {
        showUpgradeError('Kein Kind ausgewählt.');
        return;
    }

    // Disable button and show loading state
    if (upgradeSubmitBtn) {
        upgradeSubmitBtn.disabled = true;
        upgradeSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird verarbeitet...';
    }

    try {
        // Call the upgrade RPC function
        const { data, error } = await supabase.rpc('upgrade_child_account', {
            p_child_id: upgradeChildId,
            p_email: email,
            p_guardian_approval: true
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Upgrade');
        }

        // Show success message
        upgradeError?.classList.add('hidden');
        if (upgradeSuccessText) {
            upgradeSuccessText.textContent = 'Das Profil wurde für das Upgrade vorbereitet. Eine Einladungs-E-Mail wird gesendet.';
        }
        upgradeSuccess?.classList.remove('hidden');

        // Now we need to send a password reset / invite email
        const { error: inviteError } = await supabase.auth.admin?.inviteUserByEmail?.(email) ||
            await supabase.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: `${window.location.origin}/complete-upgrade.html?child_id=${upgradeChildId}`
                }
            });

        if (inviteError) {
            console.warn('[GUARDIAN-DASHBOARD] Could not send invite email:', inviteError);
            if (upgradeSuccessText) {
                upgradeSuccessText.textContent = 'Profil vorbereitet! Bitte lass das Kind sich mit dieser E-Mail registrieren.';
            }
        }

        // Refresh children list after a short delay
        setTimeout(async () => {
            await loadChildren();
        }, 2000);

    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Upgrade error:', error);
        showUpgradeError(error.message || 'Fehler beim Upgrade. Bitte versuche es erneut.');
        if (upgradeSubmitBtn) {
            upgradeSubmitBtn.disabled = false;
            upgradeSubmitBtn.innerHTML = '<i class="fas fa-arrow-up mr-2"></i>Upgrade starten';
        }
    }
}

function showUpgradeError(message) {
    if (upgradeErrorText) upgradeErrorText.textContent = message;
    upgradeError?.classList.remove('hidden');
    upgradeSuccess?.classList.add('hidden');
}

// Open menu
function openMenu() {
    guardianMenu?.classList.remove('hidden');
    // Trigger animation after a frame
    requestAnimationFrame(() => {
        menuPanel?.classList.remove('-translate-x-full');
    });
}

// Close menu
function closeMenu() {
    menuPanel?.classList.add('-translate-x-full');
    setTimeout(() => {
        guardianMenu?.classList.add('hidden');
    }, 200);
}

// Load available sports for the dropdown
async function loadSportsForPlayer() {
    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        if (playerSportSelect && sports) {
            playerSportSelect.innerHTML = '<option value="">Sportart wählen...</option>';
            sports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = sport.display_name || sport.name;
                playerSportSelect.appendChild(option);
            });

            // Auto-select if only one sport
            if (sports.length === 1) {
                playerSportSelect.value = sports[0].id;
                confirmSportSelectBtn.disabled = false;
            }
        }

        return sports || [];
    } catch (error) {
        console.error('[GUARDIAN-DASHBOARD] Error loading sports:', error);
        return [];
    }
}

// Show sport selection modal for becoming a player
async function showSportSelectionModal() {
    closeMenu();
    await loadSportsForPlayer();
    sportSelectModal?.classList.remove('hidden');
}

// Close sport selection modal
function closeSportModal() {
    sportSelectModal?.classList.add('hidden');
    if (playerSportSelect) playerSportSelect.value = '';
    if (confirmSportSelectBtn) confirmSportSelectBtn.disabled = true;
}

// Upgrade to player with selected sport
async function upgradeToPlayer(sportId) {
    try {
        // First call the RPC to set is_player = true
        const { data, error } = await supabase.rpc('upgrade_guardian_to_player');

        if (error) throw error;

        if (!data.success) {
            throw new Error(data.error);
        }

        // Then update the profile with the selected sport
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                active_sport_id: sportId,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        // Create sport stats entry
        const { error: statsError } = await supabase
            .from('user_sport_stats')
            .insert({
                user_id: currentUser.id,
                sport_id: sportId
            });

        if (statsError) {
            console.warn('[GUARDIAN-DASHBOARD] Could not create sport stats:', statsError);
        }

        // Success - go directly to player dashboard
        alert('Du bist jetzt auch als Spieler registriert!');
        window.location.href = '/dashboard.html';

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error upgrading to player:', err);
        alert('Fehler: ' + err.message);
    }
}

// Logout
async function logout() {
    try {
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Logout error:', err);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Menu events (only if not from settings)
    if (!fromSettings) {
        openMenuBtn?.addEventListener('click', openMenu);
        menuBackdrop?.addEventListener('click', closeMenu);
        becomePlayerBtn?.addEventListener('click', showSportSelectionModal);
        logoutBtn?.addEventListener('click', logout);
    }

    // Add Child Modal events
    addChildBtn?.addEventListener('click', showAddChildModal);
    closeAddChildModal?.addEventListener('click', () => addChildModal?.classList.add('hidden'));
    addChildModal?.addEventListener('click', (e) => {
        if (e.target === addChildModal) addChildModal.classList.add('hidden');
    });
    btnWithCode?.addEventListener('click', showCodeStep);
    btnManual?.addEventListener('click', showManualStep);
    validateCodeBtn?.addEventListener('click', validateInvitationCode);
    invitationCodeInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            validateInvitationCode();
        }
    });
    // Auto-format code input (add dashes)
    invitationCodeInput?.addEventListener('input', (e) => {
        let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (value.length > 3) value = value.slice(0, 3) + '-' + value.slice(3);
        if (value.length > 7) value = value.slice(0, 7) + '-' + value.slice(7);
        e.target.value = value.slice(0, 11);
    });
    backToCodeBtn?.addEventListener('click', () => {
        addChildStepConfirm?.classList.add('hidden');
        addChildStepCode?.classList.remove('hidden');
        addChildCodeError?.classList.add('hidden');
    });
    backToChoiceBtn?.addEventListener('click', backToChoice);
    confirmLinkBtn?.addEventListener('click', confirmLinkChild);
    addChildDoneBtn?.addEventListener('click', closeAddChildModalAndRefresh);
    manualChildForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitManualChild();
    });

    // Invite Guardian Modal events
    closeInviteGuardianModal?.addEventListener('click', () => inviteGuardianModal?.classList.add('hidden'));
    inviteGuardianModal?.addEventListener('click', (e) => {
        if (e.target === inviteGuardianModal) inviteGuardianModal.classList.add('hidden');
    });
    copyInviteCodeBtn?.addEventListener('click', async () => {
        const code = inviteGuardianCode?.textContent;
        if (code) {
            try {
                await navigator.clipboard.writeText(code);
                copyInviteCodeBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
                setTimeout(() => {
                    copyInviteCodeBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Code kopieren';
                }, 2000);
            } catch (error) {
                console.error('[GUARDIAN-DASHBOARD] Copy failed:', error);
            }
        }
    });

    // Child Upgrade Modal events
    closeUpgradeModal?.addEventListener('click', () => {
        childUpgradeModal?.classList.add('hidden');
        upgradeChildId = null;
    });
    childUpgradeModal?.addEventListener('click', (e) => {
        if (e.target === childUpgradeModal) {
            childUpgradeModal.classList.add('hidden');
            upgradeChildId = null;
        }
    });
    childUpgradeForm?.addEventListener('submit', handleUpgradeFormSubmit);

    // Sport selection modal events
    closeSportModalBtn?.addEventListener('click', closeSportModal);
    cancelSportSelectBtn?.addEventListener('click', closeSportModal);
    sportSelectModal?.addEventListener('click', (e) => {
        if (e.target === sportSelectModal) {
            closeSportModal();
        }
    });

    playerSportSelect?.addEventListener('change', () => {
        if (confirmSportSelectBtn) {
            confirmSportSelectBtn.disabled = !playerSportSelect.value;
        }
    });

    confirmSportSelectBtn?.addEventListener('click', async () => {
        const selectedSportId = playerSportSelect?.value;
        if (!selectedSportId) return;

        confirmSportSelectBtn.disabled = true;
        confirmSportSelectBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Speichern...';

        await upgradeToPlayer(selectedSportId);

        // Reset button state (in case of error)
        confirmSportSelectBtn.disabled = false;
        confirmSportSelectBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Bestätigen';
    });

    // Close credentials modal
    document.getElementById('close-credentials-modal')?.addEventListener('click', () => {
        credentialsModal?.classList.add('hidden');
        currentChildId = null;
    });

    // Close credentials modal on backdrop click
    credentialsModal?.addEventListener('click', (e) => {
        if (e.target === credentialsModal) {
            credentialsModal.classList.add('hidden');
            currentChildId = null;
        }
    });

    // Handle credentials form submission
    credentialsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveCredentials();
    });

    // Real-time username validation
    credentialsUsername?.addEventListener('input', (e) => {
        // Normalize to lowercase
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');

        // Debounce the availability check
        if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout);

        if (usernameCheckStatus) usernameCheckStatus.innerHTML = '';

        const username = e.target.value;
        if (username.length < 3) {
            if (usernameHint) {
                usernameHint.textContent = 'Mindestens 3 Zeichen erforderlich';
                usernameHint.classList.remove('text-green-500', 'text-gray-500');
                usernameHint.classList.add('text-red-500');
            }
            return;
        }

        if (usernameHint) {
            usernameHint.textContent = 'Prüfe Verfügbarkeit...';
            usernameHint.classList.remove('text-red-500', 'text-green-500');
            usernameHint.classList.add('text-gray-500');
        }
        if (usernameCheckStatus) {
            usernameCheckStatus.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400"></i>';
        }

        usernameCheckTimeout = setTimeout(async () => {
            try {
                const { data } = await supabase.rpc('check_username_available', {
                    p_username: username,
                    p_child_id: currentChildId
                });

                if (data?.available) {
                    if (usernameHint) {
                        usernameHint.textContent = `"${data.normalized}" ist verfügbar`;
                        usernameHint.classList.remove('text-red-500', 'text-gray-500');
                        usernameHint.classList.add('text-green-500');
                    }
                    if (usernameCheckStatus) {
                        usernameCheckStatus.innerHTML = '<i class="fas fa-check text-green-500"></i>';
                    }
                } else {
                    if (usernameHint) {
                        usernameHint.textContent = data?.reason || 'Benutzername nicht verfügbar';
                        usernameHint.classList.remove('text-green-500', 'text-gray-500');
                        usernameHint.classList.add('text-red-500');
                    }
                    if (usernameCheckStatus) {
                        usernameCheckStatus.innerHTML = '<i class="fas fa-times text-red-500"></i>';
                    }
                }
            } catch (error) {
                console.error('[GUARDIAN-DASHBOARD] Username check error:', error);
            }
        }, 500);
    });
}

// =====================================================
// Video Player Modal with Comments & Drawings
// =====================================================

window.openVideoPlayer = async function(videoUrl, title, videoId) {
    if (!videoUrl) {
        alert('Kein Video verfügbar.');
        return;
    }

    // Remove existing modal if any
    const existing = document.getElementById('video-player-modal');
    if (existing) existing.remove();

    // Show loading state
    const loadingModal = document.createElement('div');
    loadingModal.id = 'video-player-modal';
    loadingModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80';
    loadingModal.innerHTML = '<i class="fas fa-spinner fa-spin text-white text-3xl"></i>';
    document.body.appendChild(loadingModal);

    // Load comments if we have a video ID
    let comments = [];
    if (videoId) {
        try {
            const { data } = await supabase.rpc('get_video_comments', {
                p_video_id: videoId
            });
            comments = data || [];
        } catch (err) {
            console.error('[GUARDIAN-DASHBOARD] Error loading comments:', err);
        }
    }

    // Generate comments HTML
    const commentsHtml = comments.length > 0
        ? comments.map(c => {
            const isCoach = c.user_role === 'coach' || c.user_role === 'head_coach';
            const timestampBtn = c.timestamp_seconds !== null
                ? `<button class="guardian-timestamp-btn text-indigo-600 hover:text-indigo-800 text-xs font-mono bg-indigo-50 px-2 py-0.5 rounded" data-time="${c.timestamp_seconds}">${formatVideoTimestamp(c.timestamp_seconds)}</button>`
                : '';

            // Check if comment has a drawing
            const drawingUrl = c.drawing_url || extractDrawingUrlFromContent(c.content);
            let contentHtml = '';
            if (drawingUrl) {
                contentHtml = `
                    <div class="mt-2">
                        <img src="${escapeHtml(drawingUrl)}"
                             alt="Zeichnung vom Coach"
                             class="max-w-full rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                             style="max-height: 200px;"
                             onclick="window.open('${escapeHtml(drawingUrl)}', '_blank')">
                        <p class="text-xs text-gray-500 mt-1"><i class="fas fa-pen text-orange-500 mr-1"></i>Zeichnung vom Coach</p>
                    </div>
                `;
            } else {
                contentHtml = `<p class="text-sm text-gray-700">${escapeHtml(c.content)}</p>`;
            }

            return `
                <div class="border-b border-gray-100 pb-3 mb-3 last:border-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-sm ${isCoach ? 'text-indigo-600' : 'text-gray-900'}">${escapeHtml(c.user_name)}</span>
                        ${isCoach ? '<span class="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">Coach</span>' : ''}
                        ${timestampBtn}
                    </div>
                    ${contentHtml}
                </div>
            `;
        }).join('')
        : '<p class="text-gray-500 text-center py-4 text-sm">Noch keine Kommentare vom Coach</p>';

    // Remove loading and create full modal
    loadingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'video-player-modal';
    modal.className = 'fixed inset-0 z-50 overflow-y-auto';
    modal.innerHTML = `
        <div class="min-h-full flex items-start sm:items-center justify-center p-4 py-6">
            <div class="absolute inset-0 bg-black/80" onclick="closeVideoPlayer()"></div>
            <div class="relative w-full max-w-4xl bg-white rounded-xl overflow-hidden shadow-2xl">
                <div class="flex items-center justify-between px-4 py-3 bg-gray-900">
                    <h3 class="text-sm text-white font-medium truncate pr-4">${escapeHtml(title)}</h3>
                    <button onclick="closeVideoPlayer()" class="text-gray-400 hover:text-white transition-colors flex-shrink-0">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <div class="grid grid-cols-1 ${comments.length > 0 ? 'lg:grid-cols-2' : ''} gap-0">
                    <div class="bg-black flex items-center justify-center">
                        <video
                            id="guardian-video-player"
                            class="w-full max-h-[40vh] lg:max-h-[60vh]"
                            controls
                            autoplay
                            playsinline
                            src="${escapeHtml(videoUrl)}"
                        >
                            Dein Browser unterstützt kein Video-Playback.
                        </video>
                    </div>
                    ${comments.length > 0 ? `
                        <div class="p-4 max-h-[40vh] lg:max-h-[60vh] overflow-y-auto bg-gray-50">
                            <h4 class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <i class="fas fa-comments text-indigo-500"></i>
                                Coach-Feedback
                                <span class="text-xs font-normal text-gray-500">(${comments.length})</span>
                            </h4>
                            <div class="space-y-2">${commentsHtml}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Timestamp click handlers
    modal.querySelectorAll('.guardian-timestamp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const time = parseFloat(btn.dataset.time);
            const videoEl = document.getElementById('guardian-video-player');
            if (videoEl && !isNaN(time)) {
                videoEl.currentTime = time;
                videoEl.play();
            }
        });
    });

    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') closeVideoPlayer();
    };
    document.addEventListener('keydown', escHandler);
    modal._escHandler = escHandler;
};

window.closeVideoPlayer = function() {
    const modal = document.getElementById('video-player-modal');
    if (modal) {
        // Stop video playback
        const video = modal.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
        }
        // Remove escape handler
        if (modal._escHandler) {
            document.removeEventListener('keydown', modal._escHandler);
        }
        modal.remove();
    }
};

// Helper: Format timestamp as MM:SS
function formatVideoTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper: Extract drawing URL from markdown content
function extractDrawingUrlFromContent(content) {
    if (!content) return null;
    const match = content.match(/\[Zeichnung\]\((https?:\/\/[^\)]+)\)/);
    return match ? match[1] : null;
}

// Wait for DOM to be ready before initializing (same pattern as dashboard)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
