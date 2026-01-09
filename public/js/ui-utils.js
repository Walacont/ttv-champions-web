

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

let cachedSeasonEnd = null;
let lastFetchTime = null;
const CACHE_DURATION = 60 * 60 * 1000;


async function fetchSeasonEndDate(db) {
    try {
        if (cachedSeasonEnd && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
            return cachedSeasonEnd;
        }

        const configRef = doc(db, 'config', 'seasonReset');
        const configDoc = await getDoc(configRef);

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastResetDate = data.lastResetDate.toDate();
            const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
            const seasonEnd = new Date(lastResetDate.getTime() + sixWeeksInMs);

            cachedSeasonEnd = seasonEnd;
            lastFetchTime = Date.now();

            console.log(
                '📅 Season end date loaded from Firestore:',
                seasonEnd.toLocaleString('de-DE')
            );
            return seasonEnd;
        } else {
            console.warn('⚠️ No season reset config found, using fallback calculation');
            const now = new Date();
            const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
            const fallbackEnd = new Date(now.getTime() + sixWeeksInMs);

            cachedSeasonEnd = fallbackEnd;
            lastFetchTime = Date.now();

            return fallbackEnd;
        }
    } catch (error) {
        console.error('Error fetching season end date:', error);

        const now = new Date();
        const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
        return new Date(now.getTime() + sixWeeksInMs);
    }
}


export function setupTabs(defaultTab = 'overview') {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const defaultButton = document.querySelector(`.tab-button[data-tab="${defaultTab}"]`);

    tabButtons.forEach(btn => btn.classList.remove('tab-active'));
    tabContents.forEach(content => content.classList.add('hidden'));

    if (defaultButton) {
        defaultButton.classList.add('tab-active');
        const defaultContent = document.getElementById(`tab-content-${defaultTab}`);
        if (defaultContent) defaultContent.classList.remove('hidden');
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('tab-active'));
            tabContents.forEach(content => content.classList.add('hidden'));
            button.classList.add('tab-active');
            const targetContent = document.getElementById(`tab-content-${tabName}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });
}


export async function updateSeasonCountdown(
    elementId = 'season-countdown',
    reloadOnEnd = false,
    db = null
) {
    const seasonCountdownEl = document.getElementById(elementId);
    if (!seasonCountdownEl) return;

    if (!db) {
        console.error('Firestore instance required for season countdown');
        seasonCountdownEl.textContent = 'Lädt...';
        return;
    }

    const now = new Date();
    const endOfSeason = await fetchSeasonEndDate(db);

    const diff = endOfSeason - now;

    if (diff <= 0) {
        seasonCountdownEl.textContent = 'Saison beendet! Wird automatisch zurückgesetzt...';

        if (reloadOnEnd) {
            console.log('🔄 Season ended, reloading page in 30 seconds...');
            setTimeout(() => window.location.reload(), 30000);
        }
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    seasonCountdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
}


export async function getSeasonEndDate(db) {
    return await fetchSeasonEndDate(db);
}


export async function formatSeasonEndDate(db) {
    const endDate = await fetchSeasonEndDate(db);
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();

    return `${day}.${month}.${year}`;
}


export async function getCurrentSeasonKey(db) {
    try {
        const configRef = doc(db, 'config', 'seasonReset');
        const configDoc = await getDoc(configRef);

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastResetDate = data.lastResetDate.toDate();

            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        } else {
            const now = new Date();
            return `${now.getMonth() + 1}-${now.getFullYear()}`;
        }
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}
