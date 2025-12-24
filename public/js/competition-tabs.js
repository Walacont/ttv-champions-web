// Competition Tabs Module
// Handles switching between Matches and Tournaments sub-tabs

/**
 * Initialize competition sub-tabs
 */
export function initCompetitionTabs() {
    console.log('[Competition Tabs] Initializing...');

    // Get tab buttons
    const matchesTabBtn = document.getElementById('competition-tab-matches');
    const tournamentsTabBtn = document.getElementById('competition-tab-tournaments');

    // Get content containers
    const matchesContent = document.getElementById('competition-content-matches');
    const tournamentsContent = document.getElementById('competition-content-tournaments');

    if (!matchesTabBtn || !tournamentsTabBtn || !matchesContent || !tournamentsContent) {
        console.warn('[Competition Tabs] Required elements not found');
        return;
    }

    // Set up event listeners
    matchesTabBtn.addEventListener('click', () => switchCompetitionTab('matches'));
    tournamentsTabBtn.addEventListener('click', () => switchCompetitionTab('tournaments'));

    // Initialize with matches tab active
    switchCompetitionTab('matches');

    console.log('[Competition Tabs] Initialized');
}

/**
 * Switch between competition sub-tabs
 * @param {string} tab - 'matches' or 'tournaments'
 */
function switchCompetitionTab(tab) {
    console.log('[Competition Tabs] Switching to:', tab);

    // Get all elements
    const matchesTabBtn = document.getElementById('competition-tab-matches');
    const tournamentsTabBtn = document.getElementById('competition-tab-tournaments');
    const matchesContent = document.getElementById('competition-content-matches');
    const tournamentsContent = document.getElementById('competition-content-tournaments');

    // Reset all tab buttons
    document.querySelectorAll('.competition-tab-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    // Hide all content
    document.querySelectorAll('.competition-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Activate selected tab
    if (tab === 'matches') {
        matchesTabBtn?.classList.remove('text-gray-400', 'border-transparent');
        matchesTabBtn?.classList.add('text-indigo-600', 'border-indigo-600');
        matchesContent?.classList.remove('hidden');
    } else if (tab === 'tournaments') {
        tournamentsTabBtn?.classList.remove('text-gray-400', 'border-transparent');
        tournamentsTabBtn?.classList.add('text-indigo-600', 'border-indigo-600');
        tournamentsContent?.classList.remove('hidden');
    }
}

export default {
    initCompetitionTabs
};
