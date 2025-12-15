# Migration Script Updates

## Updates für: scripts/migrate-to-supabase.js

### 1. Update `migrateUsers()` Funktion

**PROBLEM:** `first_name`, `last_name` werden nicht migriert

**FIX:** Zeile 238-263 ersetzen mit:

```javascript
// Build names properly
const firstName = data.firstName || null;
const lastName = data.lastName || null;

// Build display name: prefer displayName/name, fallback to firstName + lastName
let displayName = data.displayName || data.name;
if (!displayName && (firstName || lastName)) {
    displayName = `${firstName || ''} ${lastName || ''}`.trim();
}
if (!displayName) {
    displayName = 'Unknown Player';
}

profiles.push({
    id: newUserId,
    email: data.email || null,
    first_name: firstName,  // NEU!
    last_name: lastName,    // NEU!
    display_name: displayName,
    avatar_url: data.avatarUrl || data.photoURL || null,
    role: data.role || 'player',
    club_id: mappedClubId,
    xp: data.xp || 0,
    points: data.points || 0,
    elo_rating: data.eloRating || data.elo || 1000,
    highest_elo: data.highestElo || data.eloRating || 1000,
    qttr_points: data.qttrPoints || null,
    grundlagen_completed: data.grundlagenCompleted || 0,
    is_offline: data.isOffline || false,
    onboarding_complete: data.onboardingComplete || false,
    privacy_settings: data.privacySettings || { searchable: true, showElo: true },
    created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
});
```

---

### 2. Update `migrateMatches()` Funktion

**PROBLEM:** Fehlende Felder: `winner_elo_change`, `loser_elo_change`, `season_points_awarded`, `match_mode`, `handicap_used`, `handicap`

**FIX:** Zeile 348-366 ersetzen mit:

```javascript
const match = {
    id: newId,
    club_id: clubId,
    player_a_id: playerAId,
    player_b_id: playerBId,
    winner_id: getMappedId(data.winnerId, 'users'),
    loser_id: getMappedId(data.loserId, 'users'),
    sets: data.sets || null,
    player_a_sets_won: data.playerASetsWon || 0,
    player_b_sets_won: data.playerBSetsWon || 0,
    elo_change: data.eloChange || null,
    player_a_elo_before: data.playerAEloBefore || null,
    player_b_elo_before: data.playerBEloBefore || null,
    player_a_elo_after: data.playerAEloAfter || null,
    player_b_elo_after: data.playerBEloAfter || null,
    winner_elo_change: data.winnerEloChange || null,  // NEU!
    loser_elo_change: data.loserEloChange || null,    // NEU!
    season_points_awarded: data.seasonPointsAwarded || 0,  // NEU!
    match_mode: data.matchMode || null,  // NEU!
    handicap_used: data.handicapUsed || false,  // NEU!
    handicap: data.handicap || null,  // NEU!
    played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
    created_by: getMappedId(data.createdBy, 'users'),
    created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
};
```

---

### 3. Update `migrateDoublesMatches()` Funktion

**PROBLEM:** Fehlende Felder: `match_mode`, `handicap_used`, `handicap`

**FIX:** Zeile 608-623 ersetzen mit:

```javascript
matches.push({
    id: newId,
    club_id: getMappedId(data.clubId, 'clubs'),
    team_a_player1_id: getMappedId(data.teamA?.player1Id, 'users'),
    team_a_player2_id: getMappedId(data.teamA?.player2Id, 'users'),
    team_b_player1_id: getMappedId(data.teamB?.player1Id, 'users'),
    team_b_player2_id: getMappedId(data.teamB?.player2Id, 'users'),
    winning_team: data.winningTeam || null,
    sets: data.sets || null,
    team_a_sets_won: data.teamASetsWon || 0,
    team_b_sets_won: data.teamBSetsWon || 0,
    is_cross_club: data.isCrossClub || false,
    match_mode: data.matchMode || null,  // NEU!
    handicap_used: data.handicapUsed || false,  // NEU!
    handicap: data.handicap || null,  // NEU!
    winner_elo_change: data.winnerEloChange || null,  // NEU (optional)
    loser_elo_change: data.loserEloChange || null,    // NEU (optional)
    season_points_awarded: data.seasonPointsAwarded || 0,  // NEU (optional)
    played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
    created_by: getMappedId(data.createdBy, 'users'),
    created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
});
```

---

## Anwendung der Updates

### Option 1: Manuelle Anpassung
1. Öffne `scripts/migrate-to-supabase.js`
2. Suche die entsprechenden Funktionen
3. Ersetze die Zeilen wie oben beschrieben

### Option 2: Automatisches Patch (empfohlen)
```bash
cd scripts
# Wende das Patch an (wird noch erstellt)
node apply-migration-patch.js
```

### Option 3: Neues Skript verwenden
```bash
# Verwende das aktualisierte Skript
node scripts/migrate-to-supabase-fixed.js
```
