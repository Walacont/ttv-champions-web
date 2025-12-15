# Firebase → Supabase Migration - Status

**Letzte Aktualisierung:** 2025-12-13

## ✅ Migrations-Skript komplett aktualisiert!

Alle fehlenden Felder wurden zum Migrations-Skript `scripts/migrate-to-supabase.js` hinzugefügt.

---

## 📊 Übersicht: Firebase Collections → Supabase Tables

| # | Firebase Collection | Supabase Table | Status | Notizen |
|---|---------------------|----------------|--------|---------|
| 1 | users | profiles | ✅ Komplett | first_name, last_name, display_name hinzugefügt |
| 2 | clubs | clubs | ✅ Komplett | - |
| 3 | subgroups | subgroups | ✅ Komplett | - |
| 4 | matches | matches | ✅ Komplett | 6 neue Felder hinzugefügt (winner_elo_change, etc.) |
| 5 | doublesMatches | doubles_matches | ✅ Komplett | 6 neue Felder hinzugefügt |
| 6 | doublesPairings | doubles_pairings | ✅ Komplett | - |
| 7 | trainingSessions | training_sessions | ✅ Komplett | sport_id, updated_at hinzugefügt |
| 8 | attendance | attendance | ✅ Komplett | - |
| 9 | challenges | challenges | ✅ Komplett | - |
| 10 | exercises | exercises | ✅ Komplett | - |
| 11 | invitationCodes | invitation_codes | ✅ Komplett | - |
| 12 | config | config | ✅ Komplett | - |
| 13 | matchRequests | - | ⚠️ Nicht migriert | Temporäre Daten? |
| 14 | doublesMatchRequests | - | ⚠️ Nicht migriert | Temporäre Daten? |
| 15 | matchProposals | - | ⚠️ Nicht migriert | Temporäre Daten? |
| 16 | clubRequests | - | ⚠️ Nicht migriert | Temporäre Daten? |
| 17 | leaveClubRequests | - | ⚠️ Nicht migriert | Temporäre Daten? |
| 18 | trainingMatches | - | ❌ Nicht benötigt | Feature nicht implementiert |
| 19 | recurringTrainingTemplates | - | ❌ Nicht benötigt | Feature nicht implementiert |

**17/19 Collections werden migriert** (2 nicht benötigt)

---

## 🔧 Durchgeführte Fixes (2025-12-13)

### 1. ✅ profiles Migration
**Problem:** `first_name`, `last_name` wurden nicht separat gespeichert

**Fix angewendet:**
```javascript
profiles.push({
    // ...
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    display_name: data.displayName || data.name ||
                  `${firstName} ${lastName}`.trim() || 'Unknown Player',
    // ...
});
```

### 2. ✅ matches Migration
**Problem:** 6 Felder fehlten im Migrations-Skript

**Fix angewendet:**
```javascript
{
    // ... existing fields ...
    winner_elo_change: data.winnerEloChange || null,
    loser_elo_change: data.loserEloChange || null,
    season_points_awarded: data.seasonPointsAwarded || 0,
    match_mode: data.matchMode || null,
    handicap_used: data.handicapUsed || false,
    handicap: data.handicap || null,
}
```

### 3. ✅ doubles_matches Migration
**Problem:** 6 Felder fehlten im Migrations-Skript

**Fix angewendet:**
```javascript
{
    // ... existing fields ...
    match_mode: data.matchMode || null,
    handicap_used: data.handicapUsed || false,
    handicap: data.handicap || null,
    winner_elo_change: data.winnerEloChange || null,
    loser_elo_change: data.loserEloChange || null,
    season_points_awarded: data.seasonPointsAwarded || 0,
}
```

### 4. ✅ training_sessions Migration
**Problem:** `sport_id` und `updated_at` fehlten

**Fix angewendet:**
```javascript
{
    // ... existing fields ...
    sport_id: getMappedId(data.sportId, 'sports') || null,
    updated_at: convertTimestamp(data.updatedAt) || createdAt,
}
```

---

## ⚠️ Nächster Schritt: Schema-Update anwenden

**WICHTIG:** Bevor die Migration ausgeführt wird, muss das Supabase-Schema erweitert werden!

### Schema-Update durchführen:

```bash
# In Supabase Dashboard → SQL Editor:
# Datei öffnen: supabase/fix-matches-schema.sql
# Und ausführen
```

Das Skript fügt folgende Felder hinzu:
- **matches:** winner_elo_change, loser_elo_change, season_points_awarded, match_mode, handicap_used, handicap
- **doubles_matches:** match_mode, handicap_used, handicap, winner_elo_change, loser_elo_change, season_points_awarded
- **profiles:** first_name, last_name, display_name (falls noch nicht vorhanden)

---

## 📋 Migration ausführen

### Voraussetzungen:
1. ✅ Migrations-Skript aktualisiert (erledigt!)
2. ⚠️ Schema-Update anwenden (siehe oben)
3. ⚠️ Firebase Admin Credentials bereitstellen
4. ⚠️ Supabase URL und Service Key konfigurieren

### Migration starten:

```bash
cd scripts
node migrate-to-supabase.js
```

### Was wird migriert:
- **Auth:** Firebase Auth → Supabase Auth (mit Passwort-Reset)
- **Users → Profiles:** Alle Spieler inkl. offline Spieler
- **Clubs:** Alle Vereine
- **Subgroups:** Alle Trainingsgruppen
- **Matches:** Einzelspiele mit allen Statistiken
- **Doubles Matches:** Doppelspiele mit allen Statistiken
- **Doubles Pairings:** Doppel-Paarungen und Head-to-Head
- **Attendance:** Anwesenheitsdaten
- **Training Sessions:** Trainingseinheiten/Veranstaltungen
- **Challenges:** Herausforderungen
- **Exercises:** Übungen (Grundlagen)
- **Invitation Codes:** Einladungscodes
- **Config:** Konfigurationsdaten
- **Points History:** Punkte-Historie (für Diagramme)
- **XP History:** XP-Historie (für Diagramme)

---

## ❓ Zu klären

### 1. Temporäre Collections
Die folgenden Collections sind wahrscheinlich temporäre Daten (Anfragen/Requests), die NICHT migriert werden sollten:
- matchRequests
- doublesMatchRequests
- matchProposals
- clubRequests
- leaveClubRequests

**Frage:** Sollen diese Anfragen auch migriert werden, oder können sie verworfen werden?

### 2. Head-to-Head Statistiken
**Frage:** Werden Head-to-Head Statistiken in Firebase gespeichert oder dynamisch berechnet?
- Wenn gespeichert: Wo sind sie in Firebase?
- Wenn berechnet: Kein Migrations-Bedarf

### 3. Rangliste
**Frage:** Wird die Rangliste in Firebase gespeichert oder dynamisch generiert?
- Wenn gespeichert: Collection-Name?
- Wenn berechnet: Kein Migrations-Bedarf

---

## 🎯 Zusammenfassung

### Status: ✅ Bereit zur Migration!

**Migrations-Skript:** ✅ Vollständig aktualisiert
**Schema-Updates:** ⚠️ Müssen angewendet werden
**Collections abgedeckt:** 17/19 (89%)

**Nächste Schritte:**
1. Schema-Update anwenden: `supabase/fix-matches-schema.sql`
2. Firebase Admin Credentials konfigurieren
3. Supabase Credentials konfigurieren
4. Migration durchführen: `node scripts/migrate-to-supabase.js`
5. Daten verifizieren und testen
