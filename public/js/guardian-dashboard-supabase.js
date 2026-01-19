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
let children = [];
let currentChildId = null; // For modal
let initialized = false;

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenMessage = document.getElementById('no-children-message');
const loginCodeModal = document.getElementById('login-code-modal');

// Initialize with auth state
async function initialize(user) {
    console.log('[GUARDIAN-DASHBOARD] initialize() called, user:', user?.id);
    console.log('[GUARDIAN-DASHBOARD] initialized flag:', initialized);

    if (initialized) {
        console.log('[GUARDIAN-DASHBOARD] Already initialized, returning');
        return;
    }
    initialized = true;

    try {
        currentUser = user;
        console.log('[GUARDIAN-DASHBOARD] Loading children for user:', user.id);

        // Add timeout to detect hanging queries
        const queryWithTimeout = async (queryFn, timeoutMs = 10000, queryName = 'query') => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${queryName} timed out after ${timeoutMs}ms`)), timeoutMs)
            );
            return Promise.race([queryFn(), timeoutPromise]);
        };

        // First test: Can we query ANY table?
        console.log('[GUARDIAN-DASHBOARD] Testing basic database connectivity with clubs table...');
        try {
            const testResult = await queryWithTimeout(
                () => supabase.from('clubs').select('id').limit(1),
                5000,
                'clubs test query'
            );
            console.log('[GUARDIAN-DASHBOARD] Clubs test result:', testResult.data, 'error:', testResult.error);
        } catch (testErr) {
            console.error('[GUARDIAN-DASHBOARD] Clubs test failed:', testErr.message);
        }

        // Try direct query to guardian_links
        console.log('[GUARDIAN-DASHBOARD] Testing direct guardian_links query...');

        let links, linksError;
        try {
            const result = await queryWithTimeout(
                () => supabase.from('guardian_links').select('child_id').eq('guardian_id', user.id),
                10000,
                'guardian_links query'
            );
            links = result.data;
            linksError = result.error;
        } catch (timeoutErr) {
            console.error('[GUARDIAN-DASHBOARD] Query timeout:', timeoutErr.message);
            linksError = { message: timeoutErr.message };
        }

        console.log('[GUARDIAN-DASHBOARD] guardian_links result:', links, 'error:', linksError);

        if (linksError) {
            console.error('[GUARDIAN-DASHBOARD] guardian_links error:', linksError);
            // Try RPC as fallback
            console.log('[GUARDIAN-DASHBOARD] Trying RPC fallback...');
        }

        let childrenData = [];

        if (links && links.length > 0) {
            // Get child profiles directly
            const childIds = links.map(l => l.child_id);
            console.log('[GUARDIAN-DASHBOARD] Loading profiles for child IDs:', childIds);

            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, birthdate, avatar_url, elo_rating, xp, gender')
                .in('id', childIds);

            console.log('[GUARDIAN-DASHBOARD] Child profiles loaded:', profiles, 'error:', profilesError);

            if (profiles) {
                childrenData = profiles;
            }
        } else if (!linksError) {
            // No children found, but query worked
            console.log('[GUARDIAN-DASHBOARD] No children found for this guardian');
        } else {
            // Links query failed, try RPC with timeout
            console.log('[GUARDIAN-DASHBOARD] Starting RPC call with timeout...');
            let rpcData, rpcError;
            try {
                const result = await queryWithTimeout(
                    () => supabase.rpc('get_guardian_children'),
                    10000,
                    'get_guardian_children RPC'
                );
                rpcData = result.data;
                rpcError = result.error;
            } catch (timeoutErr) {
                console.error('[GUARDIAN-DASHBOARD] RPC timeout:', timeoutErr.message);
                rpcError = { message: timeoutErr.message };
            }

            console.log('[GUARDIAN-DASHBOARD] RPC result:', rpcData, 'error:', rpcError);

            if (rpcError) {
                // Both queries failed - show error to user
                console.error('[GUARDIAN-DASHBOARD] All queries failed');
                pageLoader.innerHTML = `
                    <div class="text-center p-6">
                        <div class="text-red-600 mb-4">
                            <i class="fas fa-exclamation-triangle text-4xl"></i>
                        </div>
                        <p class="text-gray-700 mb-2">Datenbankverbindung fehlgeschlagen</p>
                        <p class="text-gray-500 text-sm mb-4">Die Guardian-Tabellen sind möglicherweise nicht eingerichtet.</p>
                        <a href="/dashboard.html" class="text-indigo-600 hover:text-indigo-800 font-medium">
                            <i class="fas fa-arrow-left mr-1"></i>Zurück zum Dashboard
                        </a>
                    </div>
                `;
                return;
            }

            if (!rpcData?.success) {
                console.log('[GUARDIAN-DASHBOARD] User is not a guardian:', rpcData?.error);
                window.location.href = '/dashboard.html';
                return;
            }
            childrenData = rpcData.children || [];
        }

        children = childrenData;
        console.log('[GUARDIAN-DASHBOARD] Loaded children:', children.length);

        // Load stats for each child
        for (const child of children) {
            await loadChildStats(child);
        }

        renderChildren();

        // Setup event listeners
        setupEventListeners();

        // Show main content
        pageLoader.classList.add('hidden');
        mainContent.classList.remove('hidden');

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Init error:', err);
        pageLoader.innerHTML = `
            <div class="text-center text-red-600">
                <p>Fehler beim Laden. Bitte versuche es erneut.</p>
                <a href="/dashboard.html" class="text-indigo-600 underline mt-2 block">Zum Dashboard</a>
            </div>
        `;
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

        // Load completed challenges
        const { data: completedChallenges } = await supabase
            .from('completed_challenges')
            .select(`
                id,
                completed_at,
                challenges (
                    id,
                    title,
                    description,
                    points
                )
            `)
            .eq('user_id', child.id)
            .order('completed_at', { ascending: false })
            .limit(5);

        child.completedChallenges = completedChallenges || [];

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
        child.completedChallenges = [];
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

        // Format completed challenges
        let challengesHtml = '';
        if (child.completedChallenges && child.completedChallenges.length > 0) {
            challengesHtml = child.completedChallenges.slice(0, 3).map(cc => {
                const challenge = cc.challenges;
                if (!challenge) return '';

                const completedDate = cc.completed_at ? new Date(cc.completed_at).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short'
                }) : '';

                return `
                    <div class="flex items-center justify-between py-1.5">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <i class="fas fa-check-circle text-green-600 text-xs"></i>
                            <span class="text-xs text-gray-700 truncate">${escapeHtml(challenge.title)}</span>
                        </div>
                        <span class="text-[10px] text-green-600 font-semibold flex-shrink-0">+${challenge.points}</span>
                    </div>
                `;
            }).join('');
        } else {
            challengesHtml = '<p class="text-xs text-gray-400 py-2">Keine Challenges</p>';
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
                    <div class="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0 ${isUnread ? 'bg-indigo-50 -mx-2 px-2 rounded' : ''}">
                        <i class="${icon} text-xs mt-0.5 ${isUnread ? 'text-indigo-600' : 'text-gray-400'}"></i>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs ${isUnread ? 'text-gray-900 font-medium' : 'text-gray-700'} truncate">${escapeHtml(notif.title || '')}</p>
                            <p class="text-[10px] text-gray-500 truncate">${escapeHtml(notif.message || '')}</p>
                            <p class="text-[10px] text-gray-400">${date}</p>
                        </div>
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

                <!-- Challenges -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <p class="text-xs text-gray-500 mb-1 font-medium">Challenges</p>
                    ${challengesHtml}
                </div>

                <!-- Notifications -->
                <div class="px-4 pb-3 border-t border-gray-100 pt-3">
                    <p class="text-xs text-gray-500 mb-1 font-medium flex items-center gap-2">
                        Mitteilungen
                        ${unreadCount > 0 ? `<span class="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">${unreadCount}</span>` : ''}
                    </p>
                    <div class="max-h-40 overflow-y-auto">
                        ${notificationsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

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

// Setup event listeners
function setupEventListeners() {
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

// Wait for auth state and initialize
supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[GUARDIAN-DASHBOARD] Auth state changed:', event, 'session:', !!session, 'user:', session?.user?.id);

    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
        return;
    }

    if (session?.user && !initialized) {
        console.log('[GUARDIAN-DASHBOARD] Calling initialize from onAuthStateChange');
        await initialize(session.user);
    } else {
        console.log('[GUARDIAN-DASHBOARD] Not initializing - session?.user:', !!session?.user, 'initialized:', initialized);
    }
});

// Also try to initialize immediately if session already exists
async function checkSession() {
    try {
        console.log('[GUARDIAN-DASHBOARD] Checking session...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('[GUARDIAN-DASHBOARD] Session error:', error);
            throw error;
        }

        if (session?.user && !initialized) {
            console.log('[GUARDIAN-DASHBOARD] Session found, initializing...');
            await initialize(session.user);
        } else if (!session) {
            console.log('[GUARDIAN-DASHBOARD] No session, redirecting to login...');
            window.location.href = '/index.html';
        }
    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Check session error:', err);
        pageLoader.innerHTML = `
            <div class="text-center text-red-600">
                <p>Fehler beim Laden der Sitzung.</p>
                <a href="/index.html" class="text-indigo-600 underline mt-2 block">Zum Login</a>
            </div>
        `;
    }
}

checkSession();
