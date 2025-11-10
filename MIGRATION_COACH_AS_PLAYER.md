# Migration: Coach als Spieler Feature

## Übersicht

Diese Migration ermöglicht es Coaches, auch als Spieler in der Rangliste teilzunehmen und Matches zu spielen. Das System wurde von einem Single-Role-Model (`role: 'player' | 'coach' | 'admin'`) auf ein Multi-Role-Model (`roles: ['player', 'coach']`) erweitert.

## ✨ Neue Features

### 1. **Multi-Role System**
- User können jetzt mehrere Rollen gleichzeitig haben
- Backward-kompatibel: Altes `role`-Feld wird weiterhin unterstützt
- Neues `roles`-Array für flexible Rollenzuweisung

### 2. **Differenzierte Genehmigungslogik**

#### **Player vs Player** (wie bisher)
```
Player A → erstellt Match
         ↓
PlayerB bestätigt → Status: pending_coach
         ↓
Coach genehmigt → Status: approved → Elo-Berechnung
```

#### **Player vs Coach** (NEU - vereinfachter Flow)
```
Player A → erstellt Match gegen Coach
         ↓
Coach bestätigt → Status: approved → Elo-Berechnung
(Kein zusätzlicher Coach nötig!)
```

#### **Coach vs Player/Coach** (NEU - strengerer Flow)
```
Coach A → erstellt eigenes Match
         ↓
PlayerB bestätigt → Status: pending_other_coach
         ↓
Anderer Coach genehmigt → Status: approved → Elo-Berechnung
(Verhindert Selbst-Manipulation)
```

### 3. **UI-Verbesserungen**
- 👨‍🏫 Coach-Badge in Ranglisten und Gegnerauswahl
- Status-Badge "Wartet auf anderen Coach" für Coach-Matches
- Coaches erscheinen in Elo/XP-Ranglisten mit Badge

### 4. **Sicherheitsmaßnahmen**
- Coaches können NICHT ihre eigenen Player-Daten ändern (Elo, XP, Points)
- Coaches können NICHT ihre eigenen Matches selbst genehmigen
- Firestore Rules verhindern Selbst-Manipulation
- `pending_other_coach` Status erfordert externen Coach

## 📝 Datenmodell-Änderungen

### User Document (NEU)
```javascript
{
  id: string,
  email: string,
  firstName: string,
  lastName: string,

  // ALT: Single role (deprecated, aber weiterhin unterstützt)
  role: 'player' | 'coach' | 'admin',

  // NEU: Multi-role array
  roles: ['player', 'coach'], // Optional

  // Player-Felder (wenn 'player' in roles)
  eloRating: number,
  xp: number,
  points: number,
  grundlagenCompleted: number,

  // Standard-Felder
  clubId: string,
  subgroupIDs: string[],
  createdAt: timestamp
}
```

### Match Request Document (ERWEITERT)
```javascript
{
  // Bestehende Felder...
  playerAId: string,
  playerBId: string,
  winnerId: string,
  loserId: string,
  clubId: string,
  sets: Array,

  // NEU: Match Type Tracking
  matchType: 'player_vs_player' | 'player_vs_coach' | 'coach_vs_player' | 'coach_vs_coach',

  // Status-Optionen erweitert
  status: 'pending_player' | 'pending_coach' | 'pending_other_coach' | 'approved' | 'rejected',

  // Approval-Struktur (dynamisch je nach matchType)
  approvals: {
    playerB: { status: boolean|null, timestamp: timestamp },
    coach: { status: boolean|null, timestamp: timestamp }, // nur bei player_vs_player
    otherCoach: { status: boolean|null, timestamp: timestamp } // nur bei coach-matches
  }
}
```

## 🔐 Firestore Rules Änderungen

### Neue Helper-Funktionen
```javascript
function hasRole(role) {
  let userData = getUserData();
  return (userData.roles != null && role in userData.roles) || userData.role == role;
}

function isPlayer() {
  return isAuthenticated() && hasRole('player');
}

function playerHasRole(playerId, role) {
  let playerData = get(/databases/$(database)/documents/users/$(playerId)).data;
  return (playerData.roles != null && role in playerData.roles) || playerData.role == role;
}
```

### Wichtigste Regel-Änderungen
1. **Selbst-Manipulations-Schutz**: Coaches können nicht ihre eigenen Player-Daten ändern
2. **Match Request Creation**: Erlaubt Coaches mit Player-Role Match-Anfragen zu erstellen
3. **Approval Logic**: Neue Regel für `pending_other_coach` Status

## 🔄 Code-Änderungen

### Geänderte Dateien

#### **1. firestore.rules**
- Multi-Role Helper-Funktionen hinzugefügt
- Selbst-Manipulations-Schutz implementiert
- `pending_other_coach` Approval-Regel hinzugefügt

#### **2. public/js/player-matches.js**
- Opponent-Filter: Coaches mit Player-Role werden angezeigt (mit 👨‍🏫 Badge)
- Match-Type-Erkennung bei Submission
- Differenzierte Approval-Struktur je nach Match-Type
- `approveMatchRequest()` erweitert für `otherCoach` Role
- Status-Badge für `pending_other_coach` hinzugefügt

#### **3. public/js/leaderboard.js**
- Alle Queries entfernen `where('role', '==', 'player')`
- Filter in JavaScript nach `(roles.includes('player') || role === 'player')`
- Coach-Badge (👨‍🏫) in `renderSkillRow()` und `renderEffortRow()`

#### **4. public/js/profile.js**
- Rival-Data-Queries aktualisiert für Multi-Role Support
- Coaches mit Player-Role werden in Rival-Vergleichen angezeigt

#### **5. public/js/match-suggestions.js**
- Eligible-Players-Filter aktualisiert
- Match-Suggestions berücksichtigen Coaches mit Player-Role

## 📋 Migration-Schritte

### Für bestehende Coaches, die spielen möchten:

**Option 1: Manuell über Admin-Panel**
```javascript
// Im Admin-Dashboard oder Firebase Console
db.collection('users').doc(coachId).update({
  roles: ['coach', 'player'],
  eloRating: 800, // Startwert
  xp: 0,
  points: 0,
  grundlagenCompleted: 5, // Match-ready
  highestElo: 800
});
```

**Option 2: Cloud Function (empfohlen)**
```javascript
// Migration Script (für Batch-Updates)
async function migrateCoachToPlayer(coachId) {
  const coachRef = db.collection('users').doc(coachId);
  const coachDoc = await coachRef.get();
  const data = coachDoc.data();

  await coachRef.update({
    roles: ['coach', 'player'],
    eloRating: data.eloRating || 800,
    xp: data.xp || 0,
    points: data.points || 0,
    grundlagenCompleted: data.grundlagenCompleted || 5,
    highestElo: data.highestElo || 800
  });
}
```

### Für neue Users:
- Keine Änderungen nötig - System ist abwärtskompatibel
- Neue Coaches können bei Erstellung direkt beide Rollen bekommen

## ⚠️ Wichtige Hinweise

### Backward Compatibility
- ✅ Alle bestehenden Users funktionieren ohne Migration
- ✅ `role`-Feld wird weiterhin unterstützt
- ✅ Alte Match-Requests funktionieren weiterhin
- ✅ Queries checken beide: `role === 'player'` UND `roles.includes('player')`

### Bekannte Einschränkungen
1. **Firestore Indexes**: Die Queries ohne `where('role', '==', 'player')` holen mehr Daten und filtern dann in JavaScript. Bei sehr großen Datenmengen (>1000 Users) könnte dies Performance-Probleme verursachen.

   **Lösung**: Optional ein `canPlayMatches: boolean`-Feld hinzufügen für indexierte Queries.

2. **Coach-Dashboard**: Die Coach-Ansicht hat aktuell keine UI für eigene Match-Anfragen. Coaches müssen das Player-Dashboard nutzen um eigene Matches einzugeben.

3. **Anderer Coach nicht verfügbar**: Wenn kein anderer Coach im Verein ist, kann ein Coach-Match nicht genehmigt werden.

   **Mögliche zukünftige Lösung**: Admin-Eskalation oder Peer-Review-System.

## 🧪 Testing

### Test-Szenarien

1. **Coach erstellt Match gegen Spieler**
   - ✅ Spieler sieht Anfrage
   - ✅ Nach Spieler-Bestätigung: Status = `pending_other_coach`
   - ✅ Anderer Coach kann genehmigen
   - ✅ Coach selbst KANN NICHT genehmigen

2. **Spieler erstellt Match gegen Coach**
   - ✅ Coach sieht Anfrage
   - ✅ Nach Coach-Bestätigung: Status = `approved` (direkt!)
   - ✅ Elo-Berechnung läuft

3. **Coach erscheint in Rangliste**
   - ✅ Mit 👨‍🏫 Badge
   - ✅ Elo und XP werden korrekt angezeigt
   - ✅ Kann von anderen Spielern als Gegner ausgewählt werden

4. **Selbst-Manipulations-Schutz**
   - ✅ Coach kann NICHT seine eigenen Player-Werte ändern
   - ✅ Firestore Rules blockieren Update
   - ✅ Andere Coaches können weiterhin Werte ändern

## 📊 Monitoring

### Zu überwachen:
1. Anzahl der `pending_other_coach` Anfragen (sollte nicht zu hoch werden)
2. Abgelehnte Firestore-Anfragen (bei falscher Permission)
3. Performance der Leaderboard-Queries (mit Client-Side-Filtering)

## 🚀 Deployment

### Reihenfolge:
1. ✅ Firestore Rules deployen (abwärtskompatibel)
2. ✅ Frontend-Code deployen
3. Optional: Migration-Script für bestehende Coaches ausführen

### Rollback:
- System ist abwärtskompatibel
- Rollback auf alte Version ist problemlos möglich
- `roles`-Feld wird einfach ignoriert bei alten Versionen

## 📚 Weitere Dokumentation

- **Firestore Rules**: `/firestore.rules`
- **Match-Flow**: `/public/js/player-matches.js` (Zeile 1113-1165)
- **Approval-Logic**: `/public/js/player-matches.js` (Zeile 781-835)
- **Leaderboard-Rendering**: `/public/js/leaderboard.js` (Zeile 489-548)

---

**Stand**: 2025-01-10
**Version**: 1.0.0
**Autor**: Claude Assistant
