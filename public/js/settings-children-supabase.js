// Settings - Children Management (Supabase Version)

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenState = document.getElementById('no-children');

// Login code modal elements
const loginCodeModal = document.getElementById('login-code-modal');
const loginCodeChildName = document.getElementById('login-code-child-name');
const loginCodeLoading = document.getElementById('login-code-loading');
const loginCodeDisplay = document.getElementById('login-code-display');
const loginCodeValue = document.getElementById('login-code-value');
const loginCodeValidity = document.getElementById('login-code-validity');
const loginCodeError = document.getElementById('login-code-error');
const loginCodeErrorText = document.getElementById('login-code-error-text');
const copyLoginCodeBtn = document.getElementById('copy-login-code');
const closeLoginCodeModal = document.getElementById('close-login-code-modal');

// Invite guardian modal elements
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

let currentUser = null;
let childrenData = [];

// Initialize authentication
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;
        await loadChildren();
        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialize on DOMContentLoaded or immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Auth state change listener
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

/**
 * Load children from database
 */
async function loadChildren() {
    try {
        const { data, error } = await supabase.rpc('get_my_children');

        if (error) {
            console.error('Error loading children:', error);
            showNoChildren();
            return;
        }

        if (!data?.success || !data.children || data.children.length === 0) {
            showNoChildren();
            return;
        }

        childrenData = data.children;
        renderChildren(childrenData);
    } catch (error) {
        console.error('Error in loadChildren:', error);
        showNoChildren();
    }
}

/**
 * Show empty state
 */
function showNoChildren() {
    childrenList.innerHTML = '';
    noChildrenState?.classList.remove('hidden');
}

/**
 * Render children cards
 */
function renderChildren(children) {
    noChildrenState?.classList.add('hidden');

    childrenList.innerHTML = children.map(child => {
        const age = calculateAge(child.birthdate);
        const ageMode = age < 14 ? 'kids' : (age < 16 ? 'teen' : 'full');
        const ageModeLabel = ageMode === 'kids' ? 'Kind (<14)' : (ageMode === 'teen' ? 'Teen (14-15)' : 'Erwachsen');
        const ageModeColor = ageMode === 'kids' ? 'pink' : (ageMode === 'teen' ? 'purple' : 'green');

        return `
            <div class="child-card bg-white rounded-xl shadow-md p-5 border border-gray-200">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">
                            ${(child.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900 text-lg">${child.first_name} ${child.last_name}</h3>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-sm text-gray-500">${age} Jahre</span>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${ageModeColor}-100 text-${ageModeColor}-800">
                                    ${ageModeLabel}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                ${child.club_name ? `
                    <div class="mb-4 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-users text-gray-400 mr-2"></i>
                            <span>${child.club_name}</span>
                        </div>
                    </div>
                ` : ''}

                <div class="flex flex-wrap gap-2">
                    <button
                        class="generate-login-code-btn flex-1 bg-green-600 text-white text-sm font-semibold py-2 px-3 rounded-lg hover:bg-green-700 transition-colors"
                        data-child-id="${child.child_id}"
                        data-child-name="${child.first_name}"
                    >
                        <i class="fas fa-key mr-1"></i>
                        Login-Code
                    </button>
                    <button
                        class="invite-guardian-btn flex-1 bg-purple-600 text-white text-sm font-semibold py-2 px-3 rounded-lg hover:bg-purple-700 transition-colors"
                        data-child-id="${child.child_id}"
                        data-child-name="${child.first_name} ${child.last_name}"
                    >
                        <i class="fas fa-user-plus mr-1"></i>
                        Vormund einladen
                    </button>
                </div>

                ${child.other_guardians && child.other_guardians.length > 0 ? `
                    <div class="mt-4 pt-4 border-t border-gray-200">
                        <p class="text-xs text-gray-500 mb-2">
                            <i class="fas fa-user-shield mr-1"></i>
                            Weitere Vormünder:
                        </p>
                        <div class="flex flex-wrap gap-2">
                            ${child.other_guardians.map(g => `
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                                    ${g.first_name} ${g.last_name}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.generate-login-code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            showLoginCodeModal(childId, childName);
        });
    });

    document.querySelectorAll('.invite-guardian-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            showInviteGuardianModal(childId, childName);
        });
    });
}

/**
 * Calculate age from birthdate
 */
function calculateAge(birthdate) {
    if (!birthdate) return 0;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// =====================================================
// Login Code Modal
// =====================================================

/**
 * Show login code modal and generate code
 */
async function showLoginCodeModal(childId, childName) {
    loginCodeChildName.textContent = `für ${childName}`;
    loginCodeLoading?.classList.remove('hidden');
    loginCodeDisplay?.classList.add('hidden');
    loginCodeError?.classList.add('hidden');
    loginCodeModal?.classList.remove('hidden');

    try {
        // Generate login code via RPC
        const { data, error } = await supabase.rpc('validate_child_login_code', {
            p_code: 'GENERATE_NEW'
        });

        // Actually we need a different RPC to generate codes - let's use a direct insert approach
        // For now, generate a simple 6-char code
        const code = generateRandomCode(6);

        // Store the code in child_login_codes table
        const { error: insertError } = await supabase
            .from('child_login_codes')
            .upsert({
                child_id: childId,
                code: code,
                created_by: currentUser.id,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
                is_active: true
            }, {
                onConflict: 'child_id'
            });

        if (insertError) {
            throw insertError;
        }

        loginCodeValue.textContent = code;
        loginCodeValidity.textContent = '24 Stunden';
        loginCodeLoading?.classList.add('hidden');
        loginCodeDisplay?.classList.remove('hidden');

    } catch (error) {
        console.error('Error generating login code:', error);
        loginCodeLoading?.classList.add('hidden');
        loginCodeErrorText.textContent = error.message || 'Fehler beim Generieren des Codes';
        loginCodeError?.classList.remove('hidden');
    }
}

/**
 * Generate random alphanumeric code
 */
function generateRandomCode(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars like 0/O, 1/I
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Close login code modal
closeLoginCodeModal?.addEventListener('click', () => {
    loginCodeModal?.classList.add('hidden');
});

// Copy login code
copyLoginCodeBtn?.addEventListener('click', async () => {
    const code = loginCodeValue?.textContent;
    if (code) {
        try {
            await navigator.clipboard.writeText(code);
            copyLoginCodeBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
            setTimeout(() => {
                copyLoginCodeBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Code kopieren';
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }
});

// =====================================================
// Invite Guardian Modal
// =====================================================

/**
 * Show invite guardian modal and generate invite code
 */
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
        console.error('Error generating guardian invite code:', error);
        inviteGuardianLoading?.classList.add('hidden');
        inviteGuardianErrorText.textContent = error.message || 'Fehler beim Generieren des Codes';
        inviteGuardianError?.classList.remove('hidden');
    }
}

// Close invite guardian modal
closeInviteGuardianModal?.addEventListener('click', () => {
    inviteGuardianModal?.classList.add('hidden');
});

// Copy invite code
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
            console.error('Copy failed:', error);
        }
    }
});

// Close modals on backdrop click
loginCodeModal?.addEventListener('click', (e) => {
    if (e.target === loginCodeModal) {
        loginCodeModal.classList.add('hidden');
    }
});

inviteGuardianModal?.addEventListener('click', (e) => {
    if (e.target === inviteGuardianModal) {
        inviteGuardianModal.classList.add('hidden');
    }
});
