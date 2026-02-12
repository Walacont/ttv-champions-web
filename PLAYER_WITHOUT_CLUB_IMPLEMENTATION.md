# Implementation Guide: Spieler-Registrierung ohne Verein

## ✅ Fertig implementiert

### Backend
- **Firestore Rules** komplett überarbeitet
  - `clubId` kann jetzt `null` sein
  - Neue Funktionen: `canViewUser()`, `hasClub()`
  - Privacy-basierte Sichtbarkeit implementiert
  - Neue Collections: `clubRequests`, `leaveClubRequests`

- **Cloud Functions** (3 neue Functions)
  - `registerWithoutCode`: Registrierung ohne Einladungscode
  - `handleClubRequest`: Coach genehmigt/lehnt Beitrittsanfrage ab
  - `handleLeaveRequest`: Coach genehmigt/lehnt Austrittsanfrage ab
  - `claimInvitationCode`: Erweitert um `privacySettings`

- **Database Schema Updates**
  - Users: `clubId` (nullable), `privacySettings`, `clubRequestStatus`, `clubRequestId`, `clubJoinedAt`, `previousClubId`
  - Clubs: `isTestClub` (boolean) für Filterung
  - Collections: `clubRequests`, `leaveClubRequests`

### Frontend
- **Registrierung** (`register.html`, `register.js`)
  - ✅ Button "Ohne Code registrieren"
  - ✅ Erweiterte Form mit Vor-/Nachname
  - ✅ Integration der `registerWithoutCode` Cloud Function

- **Onboarding** (`onboarding.html`, `onboarding.js`)
  - ✅ Club-Auswahl Dialog nach Profil-Vervollständigung
  - ✅ Optionen: "Ja, ich bin in einem Verein" / "Nein, noch nicht"
  - ✅ Club-Dropdown mit Filterung (keine Test-Clubs)
  - ✅ Beitrittsanfrage wird automatisch erstellt

- **Club Requests Manager** (`/public/js/club-requests-manager.js`)
  - ✅ Modul für Coach-Anfragen-Verwaltung
  - ✅ Lädt Join/Leave Requests in Echtzeit
  - ✅ Genehmigen/Ablehnen Buttons mit Cloud Function Integration

---

## 🚧 Noch zu implementieren

### 1. Coach Interface Integration

**Wo:** `public/coach.html` + `public/js/coach.js`

**Was zu tun:**
1. **coach.html**: Füge nach dem Header (ca. Zeile 250) einen neuen Container hinzu:
```html
<!-- Ausstehende Anfragen - OBEN im Statistics Tab -->
<div id="pending-requests-container" class="mb-8">
    <!-- Beitrittsanfragen -->
    <div class="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">
            <i class="fas fa-user-plus text-indigo-600 mr-2"></i>
            Ausstehende Beitrittsanfragen
        </h3>
        <div id="club-join-requests-list">
            <!-- Wird dynamisch von club-requests-manager.js gefüllt -->
        </div>
    </div>

    <!-- Austrittsanfragen -->
    <div class="bg-white rounded-lg shadow-md p-6">
        <h3 class="text-lg font-bold text-gray-900 mb-4">
            <i class="fas fa-sign-out-alt text-orange-600 mr-2"></i>
            Ausstehende Austrittsanfragen
        </h3>
        <div id="leave-requests-list">
            <!-- Wird dynamisch von club-requests-manager.js gefüllt -->
        </div>
    </div>
</div>
```

2. **coach.js**: Am Anfang importieren:
```javascript
import { initClubRequestsManager } from './club-requests-manager.js';
```

3. **coach.js**: Nach dem Laden der User-Daten initialisieren (suche nach `onAuthStateChanged`):
```javascript
onAuthStateChanged(auth, async user => {
    // ... existing code ...
    const userData = userDocSnap.data();

    // NEU: Club Requests Manager initialisieren
    await initClubRequestsManager(userData);

    // ... rest of existing code ...
});
```

### 2. Privatsphäre-Einstellungen

**Wo:** `public/settings.html` + `public/js/settings.js`

**Was zu tun:**
1. Füge in `settings.html` einen neuen Bereich ein:
```html
<section id="privacy-settings" class="mb-8">
    <h3 class="text-xl font-bold text-gray-900 mb-4">
        <i class="fas fa-eye text-indigo-600 mr-2"></i>
        Privatsphäre
    </h3>

    <div class="bg-white rounded-lg shadow-md p-6">
        <label class="block text-sm font-medium text-gray-700 mb-2">
            Wer kann dich finden?
        </label>

        <select id="searchability-select" class="w-full p-2 border border-gray-300 rounded-md">
            <option value="global">Global sichtbar (alle Spieler)</option>
            <option value="club_only">Nur für meinen Verein sichtbar</option>
        </select>

        <p class="text-sm text-gray-500 mt-2">
            <strong>Global:</strong> Alle Spieler können dich in der Suche finden und Wettkämpfe anfragen.<br>
            <strong>Nur Verein:</strong> Nur Spieler aus deinem Verein sehen dich in Ranglisten und können gegen dich spielen.
        </p>

        <button id="save-privacy-btn" class="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
            Einstellungen speichern
        </button>
    </div>
</section>
```

2. In `settings.js` die Logik hinzufügen:
```javascript
// Privacy Settings laden
const searchabilitySelect = document.getElementById('searchability-select');
if (searchabilitySelect && userData.privacySettings) {
    searchabilitySelect.value = userData.privacySettings.searchable || 'global';
}

// Speichern
document.getElementById('save-privacy-btn')?.addEventListener('click', async () => {
    const searchable = searchabilitySelect.value;

    await updateDoc(userRef, {
        'privacySettings.searchable': searchable
    });

    alert('Privatsphäre-Einstellungen gespeichert!');
});
```

### 3. Vereinsverwaltung in Einstellungen

**Wo:** `public/settings.html` + `public/js/settings.js`

**Was zu tun:**
1. Füge in `settings.html` den Vereinsbereich ein:
```html
<section id="club-management" class="mb-8">
    <h3 class="text-xl font-bold text-gray-900 mb-4">
        <i class="fas fa-users text-indigo-600 mr-2"></i>
        Vereinsverwaltung
    </h3>

    <!-- Aktueller Verein -->
    <div id="current-club-section" class="bg-white rounded-lg shadow-md p-6 mb-4 hidden">
        <p class="text-sm text-gray-600 mb-2">Aktueller Verein:</p>
        <p class="text-lg font-bold text-gray-900" id="current-club-name"></p>
        <p class="text-sm text-gray-500" id="club-join-date"></p>

        <button id="leave-club-btn" class="mt-4 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">
            Verein verlassen (Coach-Genehmigung erforderlich)
        </button>
    </div>

    <!-- Vereinssuche -->
    <div id="club-search-section" class="bg-white rounded-lg shadow-md p-6">
        <h4 class="font-bold text-gray-900 mb-4">Verein suchen</h4>

        <input
            type="text"
            id="club-search-input"
            placeholder="Vereinsname eingeben..."
            class="w-full p-2 border border-gray-300 rounded-md mb-4"
        />

        <div id="club-search-results">
            <!-- Dynamisch gefüllt -->
        </div>
    </div>

    <!-- Pending Request Info -->
    <div id="pending-request-info" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4 hidden">
        <p class="text-yellow-800">
            ⏳ Deine Beitrittsanfrage an <strong id="requested-club-name"></strong> wurde gesendet.
            Ein Coach muss diese noch genehmigen.
        </p>
        <button id="cancel-request-btn" class="mt-2 text-red-600 underline">
            Anfrage zurückziehen
        </button>
    </div>
</section>
```

2. In `settings.js` Logik für Vereinssuche:
```javascript
// Club Search
const clubSearchInput = document.getElementById('club-search-input');
clubSearchInput?.addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (searchTerm.length < 2) return;

    const clubsRef = collection(db, 'clubs');
    const snapshot = await getDocs(clubsRef);

    const clubs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(club => !club.isTestClub && club.name.toLowerCase().includes(searchTerm));

    displayClubSearchResults(clubs);
});

function displayClubSearchResults(clubs) {
    const resultsContainer = document.getElementById('club-search-results');

    if (clubs.length === 0) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm">Keine Vereine gefunden.</p>';
        return;
    }

    resultsContainer.innerHTML = clubs.map(club => `
        <div class="border border-gray-200 rounded-lg p-4 mb-2">
            <h5 class="font-bold text-gray-900">${club.name}</h5>
            <button
                class="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                onclick="requestClubJoin('${club.id}', '${club.name}')"
            >
                Beitritt anfragen
            </button>
        </div>
    `).join('');
}

// Request Club Join
window.requestClubJoin = async function(clubId, clubName) {
    if (!confirm(`Möchtest du dem Verein "${clubName}" beitreten?`)) return;

    try {
        // Create club request
        await addDoc(collection(db, 'clubRequests'), {
            playerId: currentUser.uid,
            clubId: clubId,
            status: 'pending',
            playerName: `${currentUserData.firstName} ${currentUserData.lastName}`,
            playerEmail: currentUser.email,
            createdAt: Timestamp.now()
        });

        // Update user
        await updateDoc(userRef, {
            clubRequestStatus: 'pending',
            clubRequestId: clubId
        });

        alert('Beitrittsanfrage wurde gesendet!');
        location.reload();
    } catch (error) {
        alert('Fehler: ' + error.message);
    }
};

// Leave Club
document.getElementById('leave-club-btn')?.addEventListener('click', async () => {
    if (!confirm('Möchtest du wirklich deinen Verein verlassen?')) return;

    try {
        // Create leave request
        await addDoc(collection(db, 'leaveClubRequests'), {
            playerId: currentUser.uid,
            clubId: currentUserData.clubId,
            status: 'pending',
            playerName: `${currentUserData.firstName} ${currentUserData.lastName}`,
            playerEmail: currentUser.email,
            createdAt: Timestamp.now()
        });

        alert('Austrittsanfrage wurde gesendet. Ein Coach muss diese genehmigen.');
        location.reload();
    } catch (error) {
        alert('Fehler: ' + error.message);
    }
});
```

### 4. Dashboard Features anpassen

**Wo:** `public/js/dashboard.js`

**Was zu tun:**
- Füge Feature-Checks hinzu:
```javascript
function checkFeatureAccess(feature) {
    const hasClub = currentUserData.clubId !== null;

    const clubOnlyFeatures = ['challenges', 'attendance', 'subgroups'];

    if (clubOnlyFeatures.includes(feature) && !hasClub) {
        return {
            allowed: false,
            message: 'Diese Funktion ist nur für Vereinsmitglieder verfügbar. Tritt einem Verein bei, um diese Funktion zu nutzen.'
        };
    }

    return { allowed: true };
}

// Bei Feature-Zugriff:
const challengesAccess = checkFeatureAccess('challenges');
if (!challengesAccess.allowed) {
    document.getElementById('challenges-section').innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <i class="fas fa-lock text-yellow-600 text-3xl mb-3"></i>
            <p class="text-yellow-800 font-medium">${challengesAccess.message}</p>
            <a href="/settings.html#club-management" class="mt-4 inline-block bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                Verein suchen
            </a>
        </div>
    `;
    return;
}
```

### 5. Ranglisten anpassen

**Wo:** `public/js/leaderboard.js`

**Was zu tun:**
1. Füge Global/Verein Switch hinzu:
```javascript
// Im HTML oben:
<div class="flex gap-2 mb-4">
    <button id="club-leaderboard-btn" class="toggle-btn-active">Mein Verein</button>
    <button id="global-leaderboard-btn" class="toggle-btn">Global</button>
</div>

// Im JS:
let currentScope = 'club'; // or 'global'

async function loadLeaderboard(scope) {
    let q = collection(db, 'users');

    if (scope === 'club') {
        if (!currentUserData.clubId) {
            // Zeige Hinweis
            showNoClubMessage();
            return;
        }
        q = query(q, where('clubId', '==', currentUserData.clubId), where('role', '==', 'player'));
    } else {
        // Global: Nur Spieler mit global sichtbar ODER im eigenen Verein
        q = query(q, where('role', '==', 'player'));
    }

    const snapshot = await getDocs(q);
    let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Privacy Filter für global
    if (scope === 'global') {
        players = players.filter(p =>
            p.id === currentUser.uid || // Eigenes Profil
            (p.privacySettings?.searchable === 'global') || // Global sichtbar
            (currentUserData.clubId && p.clubId === currentUserData.clubId) // Gleicher Verein
        );
    }

    displayLeaderboard(players);
}
```

### 6. Wettkampf Gegnerwahl

**Wo:** `public/js/player-matches.js`

**Was zu tun:**
1. Ersetze festes Dropdown durch Suchfeld:
```html
<div class="opponent-search mb-4">
    <input
        type="text"
        id="opponent-search-input"
        placeholder="Gegner suchen (Name eingeben)..."
        class="w-full p-2 border border-gray-300 rounded-md"
    />
    <div id="opponent-results" class="mt-2">
        <!-- Dynamisch gefüllt -->
    </div>
</div>
```

2. Implementiere Suchlogik:
```javascript
document.getElementById('opponent-search-input')?.addEventListener('input', async (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (searchTerm.length < 2) return;

    const usersRef = collection(db, 'users');
    let q = query(usersRef, where('role', '==', 'player'));

    const snapshot = await getDocs(q);
    let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Filter: name match, privacy
    players = players.filter(p =>
        p.id !== currentUser.uid && // Nicht sich selbst
        (p.firstName?.toLowerCase().includes(searchTerm) ||
         p.lastName?.toLowerCase().includes(searchTerm)) &&
        // Privacy check
        (p.clubId === currentUserData.clubId || // Gleicher Verein
         p.privacySettings?.searchable === 'global') // Oder global
    );

    displayOpponentResults(players);
});
```

---

## 📋 Testing Checklist

### Registrierung
- [ ] Registrierung ohne Code funktioniert
- [ ] Onboarding zeigt Club-Auswahl Dialog
- [ ] "Ja" → Club-Dropdown lädt Vereine (ohne Test-Clubs)
- [ ] Beitrittsanfrage wird korrekt erstellt
- [ ] "Nein" → Spieler landet auf Dashboard ohne Club

### Coach Interface
- [ ] Coach sieht Beitrittsanfragen
- [ ] Genehmigen funktioniert → Spieler bekommt `clubId`
- [ ] Ablehnen funktioniert
- [ ] Austrittsanfragen werden angezeigt
- [ ] Genehmigen → Spieler verliert `clubId`, `points = 0`

### Dashboard (Spieler ohne Verein)
- [ ] Challenges blockiert mit Hinweis
- [ ] Anwesenheit blockiert
- [ ] Untergruppen blockiert
- [ ] Ranglisten: "Mein Verein" ausgeblendet oder mit Hinweis
- [ ] Wettkämpfe funktionieren (nur gegen global sichtbare Spieler)
- [ ] Übungskatalog funktioniert
- [ ] FAQ funktioniert

### Einstellungen
- [ ] Privatsphäre: Global/Nur Verein umschalten
- [ ] Vereinssuche findet Vereine (ohne Test-Clubs)
- [ ] Beitrittsanfrage senden
- [ ] Austrittsanfrage senden (wenn in Verein)
- [ ] Pending Request Status wird angezeigt

### Ranglisten
- [ ] Global Switch funktioniert
- [ ] Privacy-Filter korrekt (nur global sichtbare + eigener Verein)
- [ ] "Mein Verein" zeigt Hinweis wenn kein Verein

---

## 🔧 Deployment

1. **Firestore Rules deployen:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Cloud Functions deployen:**
   ```bash
   firebase deploy --only functions
   ```

3. **Test-Club Flag setzen:**
   - In Firebase Console → Firestore
   - Gehe zu `clubs/{testClubId}`
   - Füge Feld hinzu: `isTestClub: true`

---

## 💡 Nächste Schritte

1. ✅ Implementiere Coach Approval Interface (Integration in coach.html/coach.js)
2. ✅ Implementiere Vereinsverwaltung in Einstellungen
3. ✅ Implementiere Privatsphäre-Einstellungen
4. ✅ Passe Dashboard Features an
5. ✅ Passe Ranglisten an
6. ✅ Passe Wettkampf-Gegnerwahl an
7. ✅ Teste alles gründlich
8. ✅ Deploy zu Production
