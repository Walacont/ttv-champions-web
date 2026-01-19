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

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenMessage = document.getElementById('no-children-message');
const loginCodeModal = document.getElementById('login-code-modal');

// Initialize
async function initialize() {
    try {
        // Check if user is logged in
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            console.log('[GUARDIAN-DASHBOARD] Not logged in, redirecting...');
            window.location.href = '/index.html';
            return;
        }

        currentUser = user;

        // Check if user is a guardian
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, is_guardian, first_name')
            .eq('id', user.id)
            .single();

        if (!profile || (profile.account_type !== 'guardian' && !profile.is_guardian)) {
            console.log('[GUARDIAN-DASHBOARD] User is not a guardian');
            // Redirect to regular dashboard
            window.location.href = '/dashboard.html';
            return;
        }

        // Load children
        await loadChildren();

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

        renderChildren();

    } catch (err) {
        console.error('[GUARDIAN-DASHBOARD] Error loading children:', err);
        childrenList.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
                <i class="fas fa-exclamation-circle mr-2"></i>
                Fehler beim Laden der Kinder: ${escapeHtml(err.message)}
            </div>
        `;
    }
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
        const ageMode = child.age_mode || (age < 14 ? 'kids' : age < 16 ? 'teen' : 'full');
        const ageModeLabel = ageMode === 'kids' ? 'Kinder-Modus' : ageMode === 'teen' ? 'Teen-Modus' : 'Standard';
        const ageModeColor = ageMode === 'kids' ? 'purple' : ageMode === 'teen' ? 'blue' : 'green';

        const avatarUrl = child.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(child.first_name || 'K')}&background=7c3aed&color=fff`;

        return `
            <div class="child-card bg-white rounded-xl shadow-md overflow-hidden">
                <div class="p-4">
                    <div class="flex items-start gap-4">
                        <!-- Avatar -->
                        <img
                            src="${escapeHtml(avatarUrl)}"
                            alt="${escapeHtml(child.first_name)}"
                            class="w-16 h-16 rounded-full object-cover border-2 border-purple-200"
                        />

                        <!-- Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h3 class="text-lg font-bold text-gray-900 truncate">
                                    ${escapeHtml(child.first_name || '')} ${escapeHtml(child.last_name || '')}
                                </h3>
                                <span class="px-2 py-0.5 text-xs font-medium bg-${ageModeColor}-100 text-${ageModeColor}-700 rounded-full">
                                    ${ageModeLabel}
                                </span>
                            </div>

                            <p class="text-sm text-gray-600 mb-2">
                                ${age} Jahre alt
                                ${child.club_id ? '' : ' • <span class="text-yellow-600">Kein Verein</span>'}
                            </p>

                            <!-- Stats -->
                            <div class="flex gap-4 text-sm">
                                <div class="text-center">
                                    <p class="font-bold text-purple-600">${child.xp || 0}</p>
                                    <p class="text-gray-500 text-xs">XP</p>
                                </div>
                                <div class="text-center">
                                    <p class="font-bold text-indigo-600">${child.elo_rating || 800}</p>
                                    <p class="text-gray-500 text-xs">Elo</p>
                                </div>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex flex-col gap-2">
                            <button
                                onclick="generateLoginCode('${child.id}', '${escapeHtml(child.first_name)}')"
                                class="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition text-sm font-medium flex items-center gap-1"
                            >
                                <i class="fas fa-key"></i>
                                <span class="hidden sm:inline">Login-Code</span>
                            </button>
                            <a
                                href="/profile.html?id=${child.id}"
                                class="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition text-sm font-medium flex items-center gap-1 justify-center"
                            >
                                <i class="fas fa-user"></i>
                                <span class="hidden sm:inline">Profil</span>
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Activity Preview (optional - can expand later) -->
                <div class="bg-gray-50 px-4 py-3 border-t border-gray-100">
                    <p class="text-xs text-gray-500">
                        <i class="fas fa-clock mr-1"></i>
                        Letzter Login: <span class="text-gray-700">Nicht verfügbar</span>
                    </p>
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

// Initialize on load
initialize();
