# Firebase → Supabase Migration - Vollständige Analyse

## 📊 Schema-Analyse: Fehlende Felder

### **matches** Tabelle - Fehlende Felder:

```sql
-- Diese Felder werden in der App verwendet, fehlen aber im Schema:
winner_elo_change INTEGER,
loser_elo_change INTEGER,
season_points_awarded INTEGER DEFAULT 0,
match_mode TEXT, -- 'single-set', 'best-of-3', 'best-of-5', 'best-of-7', 'pro-set', 'timed', 'fast4'
handicap_used BOOLEAN DEFAULT false,
handicap JSONB, -- {"player": {"id": "...", "name": "..."}, "points": 5}
```

### **doubles_matches** Tabelle - Fehlende Felder:

```sql
match_mode TEXT,
handicap_used BOOLEAN DEFAULT false,
handicap JSONB,
winner_team TEXT, -- sollte 'winning_team' heißen (bereits im Schema)
```

### **profiles** Tabelle - Mapping-Probleme:

```sql
-- Im Schema vorhanden, aber Migration nutzt falsche Feldnamen:
display_name TEXT, -- Migration: baut aus firstName + lastName, sollte aber direkt von displayName/name kommen
first_name TEXT,   -- Firebase: firstName
last_name TEXT,    -- Firebase: lastName
```

---

## 🔍 Firebase → Supabase Feld-Mapping

### **users** (Firebase) → **profiles** (Supabase)

| Firebase Field | Supabase Field | Type | NOT NULL | Migration ✓/✗ |
|---------------|----------------|------|----------|---------------|
| email | email | TEXT | ❌ | ✓ |
| firstName | first_name | TEXT | ❌ | **✗** (fehlt) |
| lastName | last_name | TEXT | ❌ | **✗** (fehlt) |
| displayName | display_name | TEXT | ❌ | **~** (nur Fallback) |
| name | display_name | TEXT | ❌ | **~** (nur Fallback) |
| avatarUrl | avatar_url | TEXT | ❌ | ✓ |
| photoURL | avatar_url | TEXT | ❌ | ✓ |
| role | role | ENUM | ❌ | ✓ |
| clubId | club_id | UUID | ❌ | ✓ |
| xp | xp | INTEGER | ❌ | ✓ |
| points | points | INTEGER | ❌ | ✓ |
| eloRating | elo_rating | INTEGER | ❌ | ✓ |
| elo | elo_rating | INTEGER | ❌ | ✓ |
| highestElo | highest_elo | INTEGER | ❌ | ✓ |
| qttrPoints | qttr_points | INTEGER | ❌ | ✓ |
| grundlagenCompleted | grundlagen_completed | INTEGER | ❌ | ✓ |
| isOffline | is_offline | BOOLEAN | ❌ | ✓ |
| onboardingComplete | onboarding_complete | BOOLEAN | ❌ | ✓ |
| privacySettings | privacy_settings | JSONB | ❌ | ✓ |
| createdAt | created_at | TIMESTAMPTZ | ❌ | ✓ |

**Problem:** `first_name` und `last_name` werden nicht migriert!

### **matches** (Firebase) → **matches** (Supabase)

| Firebase Field | Supabase Field | Type | NOT NULL | Migration ✓/✗ |
|---------------|----------------|------|----------|---------------|
| clubId | club_id | UUID | ✅ | ✓ |
| playerAId | player_a_id | UUID | ✅ | ✓ |
| playerBId | player_b_id | UUID | ✅ | ✓ |
| winnerId | winner_id | UUID | ❌ | ✓ |
| loserId | loser_id | UUID | ❌ | ✓ |
| sets | sets | JSONB | ❌ | ✓ |
| playerASetsWon | player_a_sets_won | INTEGER | ❌ | ✓ |
| playerBSetsWon | player_b_sets_won | INTEGER | ❌ | ✓ |
| eloChange | elo_change | INTEGER | ❌ | ✓ |
| playerAEloBefore | player_a_elo_before | INTEGER | ❌ | ✓ |
| playerBEloBefore | player_b_elo_before | INTEGER | ❌ | ✓ |
| playerAEloAfter | player_a_elo_after | INTEGER | ❌ | ✓ |
| playerBEloAfter | player_b_elo_after | INTEGER | ❌ | ✓ |
| winnerEloChange | winner_elo_change | INTEGER | ❌ | **✗ (fehlt im Schema!)** |
| loserEloChange | loser_elo_change | INTEGER | ❌ | **✗ (fehlt im Schema!)** |
| seasonPointsAwarded | season_points_awarded | INTEGER | ❌ | **✗ (fehlt im Schema!)** |
| matchMode | match_mode | TEXT | ❌ | **✗ (fehlt im Schema!)** |
| handicapUsed | handicap_used | BOOLEAN | ❌ | **✗ (fehlt im Schema!)** |
| handicap | handicap | JSONB | ❌ | **✗ (fehlt im Schema!)** |
| playedAt | played_at | TIMESTAMPTZ | ❌ | ✓ |
| createdBy | created_by | UUID | ❌ | ✓ |
| createdAt | created_at | TIMESTAMPTZ | ❌ | ✓ |

**Probleme:**
1. Fehlende Felder im Schema: `winner_elo_change`, `loser_elo_change`, `season_points_awarded`, `match_mode`, `handicap_used`, `handicap`
2. Diese Felder werden im Migrations-Skript NICHT gemappt

### **doublesMatches** (Firebase) → **doubles_matches** (Supabase)

| Firebase Field | Supabase Field | Type | NOT NULL | Migration ✓/✗ |
|---------------|----------------|------|----------|---------------|
| clubId | club_id | UUID | ❌ | ✓ |
| teamA.player1Id | team_a_player1_id | UUID | ✅ | ✓ |
| teamA.player2Id | team_a_player2_id | UUID | ✅ | ✓ |
| teamB.player1Id | team_b_player1_id | UUID | ✅ | ✓ |
| teamB.player2Id | team_b_player2_id | UUID | ✅ | ✓ |
| winningTeam | winning_team | TEXT | ❌ | ✓ |
| sets | sets | JSONB | ❌ | ✓ |
| teamASetsWon | team_a_sets_won | INTEGER | ❌ | ✓ |
| teamBSetsWon | team_b_sets_won | INTEGER | ❌ | ✓ |
| isCrossClub | is_cross_club | BOOLEAN | ❌ | ✓ |
| matchMode | match_mode | TEXT | ❌ | **✗ (fehlt im Schema!)** |
| handicapUsed | handicap_used | BOOLEAN | ❌ | **✗ (fehlt im Schema!)** |
| handicap | handicap | JSONB | ❌ | **✗ (fehlt im Schema!)** |
| playedAt | played_at | TIMESTAMPTZ | ❌ | ✓ |
| createdBy | created_by | UUID | ❌ | ✓ |
| createdAt | created_at | TIMESTAMPTZ | ❌ | ✓ |

---

## ✅ Pflichtfelder (NOT NULL) - Checkliste

### **clubs** ✓
- ✅ name (migriert)

### **profiles** ⚠️
- ✅ id (UUID von auth.users)
- ⚠️ `display_name` sollte korrekt aus Firebase gemappt werden
- ⚠️ `first_name`, `last_name` fehlen im Migrations-Skript

### **subgroups** ✓
- ✅ club_id (migriert)
- ✅ name (migriert)

### **matches** ⚠️
- ✅ club_id (migriert)
- ✅ player_a_id (migriert)
- ✅ player_b_id (migriert)
- ⚠️ Fehlende Felder im Schema (siehe oben)

### **doubles_matches** ⚠️
- ✅ team_a_player1_id (migriert)
- ✅ team_a_player2_id (migriert)
- ✅ team_b_player1_id (migriert)
- ✅ team_b_player2_id (migriert)
- ⚠️ Fehlende Felder im Schema (siehe oben)

### **attendance** ✓
- ✅ club_id (migriert)
- ✅ user_id (migriert)
- ✅ date (migriert)

### **challenges** ✓
- ✅ club_id (migriert)
- ✅ title (migriert)
- ✅ date (migriert)

### **exercises** ✓
- ✅ name (migriert)

### **points_history** ✓
- ✅ user_id (migriert)
- ✅ points (migriert)

### **xp_history** ✓
- ✅ user_id (migriert)
- ✅ xp (migriert)

### **invitation_codes** ✓
- ✅ code (migriert)
- ✅ club_id (migriert)

### **doubles_pairings** ✓
- ✅ player1_id (migriert)
- ✅ player2_id (migriert)

---

## 🔧 Benötigte Fixes

### 1. **Schema erweitern** (matches + doubles_matches)
```sql
-- Siehe: scripts/fix-matches-schema.sql
ALTER TABLE matches ADD COLUMN winner_elo_change INTEGER;
ALTER TABLE matches ADD COLUMN loser_elo_change INTEGER;
ALTER TABLE matches ADD COLUMN season_points_awarded INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN match_mode TEXT;
ALTER TABLE matches ADD COLUMN handicap_used BOOLEAN DEFAULT false;
ALTER TABLE matches ADD COLUMN handicap JSONB;

ALTER TABLE doubles_matches ADD COLUMN match_mode TEXT;
ALTER TABLE doubles_matches ADD COLUMN handicap_used BOOLEAN DEFAULT false;
ALTER TABLE doubles_matches ADD COLUMN handicap JSONB;
```

### 2. **Migrations-Skript updaten** (profiles)
```javascript
// first_name und last_name separat speichern
profiles.push({
    // ...
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    display_name: data.displayName || data.name ||
                  (data.firstName && data.lastName ?
                   `${data.firstName} ${data.lastName}` : null),
    // ...
});
```

### 3. **Migrations-Skript updaten** (matches)
```javascript
// Neue Felder hinzufügen
match.winner_elo_change = data.winnerEloChange || null;
match.loser_elo_change = data.loserEloChange || null;
match.season_points_awarded = data.seasonPointsAwarded || 0;
match.match_mode = data.matchMode || null;
match.handicap_used = data.handicapUsed || false;
match.handicap = data.handicap || null;
```

### 4. **Migrations-Skript updaten** (doubles_matches)
```javascript
// Neue Felder hinzufügen
match.match_mode = data.matchMode || null;
match.handicap_used = data.handicapUsed || false;
match.handicap = data.handicap || null;
```

---

## 📋 Zusammenfassung

### ✅ Bereits korrekt migriert:
- Clubs
- Subgroups (Basis)
- Users → Profiles (Basis-Felder)
- Matches (Basis-Felder)
- Doubles Matches (Basis-Felder)
- Doubles Pairings
- Attendance
- Training Sessions
- Challenges
- Exercises
- Invitation Codes
- Points History
- XP History
- Config

### ✅ Fixes angewendet (2025-12-13):
1. ✅ **Profiles Migration** - `first_name`, `last_name` werden jetzt separat gespeichert
2. ✅ **Matches Migration** - alle 6 fehlenden Felder hinzugefügt (winner_elo_change, loser_elo_change, season_points_awarded, match_mode, handicap_used, handicap)
3. ✅ **Doubles Matches Migration** - alle 6 fehlenden Felder hinzugefügt
4. ✅ **Training Sessions Migration** - sport_id und updated_at hinzugefügt

### ⚠️ Noch zu tun:
1. **Schema erweitern** - SQL-Skript `supabase/fix-matches-schema.sql` auf Datenbank anwenden

### ❓ Zu klären:
- Gibt es in Firebase noch weitere Collections die nicht im Skript sind?
- Head-to-Head Statistiken - existieren diese in Firebase oder werden sie berechnet?
- Rangliste - wird dynamisch generiert oder gespeichert?
