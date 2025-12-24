// ===== Club Requests Manager for Coaches =====
// This module manages club join/leave requests for coaches

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    onSnapshot,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getFunctions,
    httpsCallable,
    connectFunctionsEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { firebaseConfig, shouldUseEmulators } from './firebase-config.js';
import { formatDate } from './ui-utils.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'europe-west3');

// Emulator-Verbindung nur wenn explizit aktiviert (USE_FIREBASE_EMULATORS = true)
if (shouldUseEmulators()) {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
}

let currentUserData = null;

// Initialize club requests manager
export async function initClubRequestsManager(userData) {
    currentUserData = userData;

    // Only load for coaches/admins
    if (!['coach', 'admin'].includes(userData.role)) {
        return;
    }

    // Load club join requests
    loadClubJoinRequests();
    // Load leave requests
    loadLeaveRequests();
}

// Load pending club join requests
function loadClubJoinRequests() {
    const requestsRef = collection(db, 'clubRequests');
    const q = query(
        requestsRef,
        where('clubId', '==', currentUserData.clubId),
        where('status', '==', 'pending')
    );

    // Real-time listener
    onSnapshot(q, snapshot => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayClubJoinRequests(requests);
    });
}

// Load pending leave requests
function loadLeaveRequests() {
    const requestsRef = collection(db, 'leaveClubRequests');
    const q = query(
        requestsRef,
        where('clubId', '==', currentUserData.clubId),
        where('status', '==', 'pending')
    );

    // Real-time listener
    onSnapshot(q, snapshot => {
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayLeaveRequests(requests);
    });
}

// Display club join requests
function displayClubJoinRequests(requests) {
    const container = document.getElementById('club-join-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Keine offenen Beitrittsanfragen</p>';
        return;
    }

    container.innerHTML = requests
        .map(
            request => `
        <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-900">${request.playerName}</h4>
                    <p class="text-sm text-gray-600">${request.playerEmail}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Angefragt am: ${formatDate(request.createdAt, { includeTime: true })}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button
                        onclick="window.approveClubRequest('${request.id}')"
                        class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        ✓ Genehmigen
                    </button>
                    <button
                        onclick="window.rejectClubRequest('${request.id}')"
                        class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                        ✗ Ablehnen
                    </button>
                </div>
            </div>
        </div>
    `
        )
        .join('');
}

// Display leave requests
function displayLeaveRequests(requests) {
    const container = document.getElementById('leave-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Keine offenen Austrittsanfragen</p>';
        return;
    }

    container.innerHTML = requests
        .map(
            request => `
        <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-900">${request.playerName}</h4>
                    <p class="text-sm text-gray-600">${request.playerEmail}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Angefragt am: ${formatDate(request.createdAt, { includeTime: true })}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button
                        onclick="window.approveLeaveRequest('${request.id}')"
                        class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        ✓ Genehmigen
                    </button>
                    <button
                        onclick="window.rejectLeaveRequest('${request.id}')"
                        class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                        ✗ Ablehnen
                    </button>
                </div>
            </div>
        </div>
    `
        )
        .join('');
}

// Global functions for button clicks
window.approveClubRequest = async function (requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich genehmigen?')) return;

    try {
        const handleClubRequest = httpsCallable(functions, 'handleClubRequest');
        await handleClubRequest({ requestId, action: 'approve' });
        alert('Spieler wurde erfolgreich genehmigt!');
    } catch (error) {
        console.error('Error approving club request:', error);
        alert('Fehler beim Genehmigen: ' + error.message);
    }
};

window.rejectClubRequest = async function (requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich ablehnen?')) return;

    try {
        const handleClubRequest = httpsCallable(functions, 'handleClubRequest');
        await handleClubRequest({ requestId, action: 'reject' });
        alert('Anfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting club request:', error);
        alert('Fehler beim Ablehnen: ' + error.message);
    }
};

window.approveLeaveRequest = async function (requestId) {
    if (!confirm('Möchtest du diese Austrittsanfrage wirklich genehmigen?')) return;

    try {
        const handleLeaveRequest = httpsCallable(functions, 'handleLeaveRequest');
        await handleLeaveRequest({ requestId, action: 'approve' });
        alert('Spieler hat den Verein verlassen.');
    } catch (error) {
        console.error('Error approving leave request:', error);
        alert('Fehler beim Genehmigen: ' + error.message);
    }
};

window.rejectLeaveRequest = async function (requestId) {
    if (!confirm('Möchtest du diese Austrittsanfrage wirklich ablehnen?')) return;

    try {
        const handleLeaveRequest = httpsCallable(functions, 'handleLeaveRequest');
        await handleLeaveRequest({ requestId, action: 'reject' });
        alert('Austrittsanfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting leave request:', error);
        alert('Fehler beim Ablehnen: ' + error.message);
    }
};

