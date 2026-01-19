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
        // Wait for auth state to be ready
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
            console.log('[GUARDIAN-DASHBOARD] No session, redirecting...');
            window.location.href = '/index.html';
            return;
        }

        currentUser = session.user;

        // Check if user is a guardian
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, is_guardian, first_name')
            .eq('id', session.user.id)
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
        const avatarUrl = child.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(child.first_name || 'K')}&background=6366f1&color=fff`;

        return `
            <div class="bg-white rounded-lg p-4 border border-gray-200">
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
