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

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenMessage = document.getElementById('no-children-message');
const loginCodeModal = document.getElementById('login-code-modal');

// Menu Elements
const guardianMenu = document.getElementById('guardian-menu');
const menuBackdrop = document.getElementById('menu-backdrop');
const menuPanel = document.getElementById('menu-panel');
const openMenuBtn = document.getElementById('open-menu-btn');
const switchToPlayerBtn = document.getElementById('switch-to-player-btn');
const becomePlayerBtn = document.getElementById('become-player-btn');
const logoutBtn = document.getElementById('logout-btn');
const menuUserName = document.getElementById('menu-user-name');

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

        if (!profile || (profile.account_type !== 'guardian' && !profile.is_guardian)) {
            console.log('[GUARDIAN-DASHBOARD] User is not a guardian');
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
        const { data, error } = await supabase.rpc('get_guardian_children');

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

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error loading child stats:', err);
        child.totalMatches = 0;
        child.wins = 0;
        child.recentMatches = [];
        child.pointsHistory = [];
        child.notifications = [];
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
                            onclick="generateLoginCode('${child.id}', '${escapeHtml(child.first_name)}')"
                            class="text-indigo-600 hover:text-indigo-800 p-2"
                            title="Login-Code generieren"
                        >
                            <i class="fas fa-key"></i>
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

// Generate login code for a child
window.generateLoginCode = async function(childId, childName) {
    currentChildId = childId;

    // Show modal
    document.getElementById('modal-child-name').textContent = childName;
    document.getElementById('modal-login-code').textContent = '......';
    loginCodeModal.classList.remove('hidden');

    // Generate code
    try {
        const { data, error } = await supabase.rpc('generate_child_login_code', {
            p_child_id: childId,
            p_validity_minutes: 15
        });

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error);
        }

        document.getElementById('modal-login-code').textContent = data.code;
        console.log('[GUARDIAN-DASHBOARD] Login code generated:', data.code);

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error generating code:', err);
        document.getElementById('modal-login-code').textContent = 'Fehler';
        alert('Fehler beim Generieren des Codes: ' + err.message);
    }
};

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

// Upgrade to player
async function upgradeToPlayer() {
    if (!confirm('Moechtest du auch als Spieler mitmachen? Du kannst dann selbst trainieren und an Wettkampfen teilnehmen.')) {
        return;
    }

    try {
        const { data, error } = await supabase.rpc('upgrade_guardian_to_player');

        if (error) throw error;

        if (!data.success) {
            throw new Error(data.error);
        }

        // Success - reload page to reflect changes
        alert('Du bist jetzt auch als Spieler registriert!');
        window.location.reload();

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
    // Menu events
    openMenuBtn?.addEventListener('click', openMenu);
    menuBackdrop?.addEventListener('click', closeMenu);
    becomePlayerBtn?.addEventListener('click', upgradeToPlayer);
    logoutBtn?.addEventListener('click', logout);

    // Close modal
    document.getElementById('close-code-modal')?.addEventListener('click', () => {
        loginCodeModal.classList.add('hidden');
        currentChildId = null;
    });

    // Close modal on backdrop click
    loginCodeModal?.addEventListener('click', (e) => {
        if (e.target === loginCodeModal) {
            loginCodeModal.classList.add('hidden');
            currentChildId = null;
        }
    });

    // Copy code
    document.getElementById('copy-modal-code')?.addEventListener('click', async () => {
        const code = document.getElementById('modal-login-code').textContent;
        if (!code || code === '......' || code === 'Fehler') return;

        try {
            await navigator.clipboard.writeText(code);

            const btn = document.getElementById('copy-modal-code');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
            btn.classList.add('bg-green-600');

            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('bg-green-600');
            }, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    });

    // Regenerate code
    document.getElementById('regenerate-modal-code')?.addEventListener('click', async () => {
        if (!currentChildId) return;

        const childName = document.getElementById('modal-child-name').textContent;
        await window.generateLoginCode(currentChildId, childName);
    });
}

// Wait for DOM to be ready before initializing (same pattern as dashboard)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
