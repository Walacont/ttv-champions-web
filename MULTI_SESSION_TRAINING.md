# Multi-Session Training System

## Übersicht

Das Multi-Session Training System ermöglicht es, **mehrere Trainings pro Tag** zu planen und zu verwalten. Beispiel: 16-17 Uhr Basic, 17-19 Uhr Leistungstraining.

## Features

### ✅ Implementiert (100%)

#### 1. Wiederkehrende Trainings (Recurring Training Templates)

- **Wochentagbasierte Planung**: Definiere Trainings, die z.B. jeden Montag stattfinden
- **Zeiträume**: Setze Start- und Enddatum (optional unbegrenzt)
- **Untergruppen**: Jedes Training ist einer Untergruppe zugeordnet
- **Verwaltung**: Erstellen, Bearbeiten, Löschen und Deaktivieren von Templates

#### 2. Training Sessions

- **Manuelle Erstellung**: Spontane Trainings jederzeit hinzufügen
- **Auto-Generierung**: Cloud Function erstellt täglich Sessions für die nächsten 14 Tage
- **Zeitbasiert**: Jedes Training hat Start- und Endzeit
- **Absagen**: Sessions können abgesagt werden (soft delete via `cancelled` flag)

#### 3. Session-basierte Anwesenheit

- **Pro Session**: Anwesenheit wird für jede einzelne Session erfasst
- **Mehrfachteilnahme**: Spieler können am selben Tag an mehreren Sessions teilnehmen
- **Untergruppen-Check**: Spieler können nicht 2x an der gleichen Session teilnehmen
- **Streak-Berechnung**: Funktioniert weiterhin korrekt (basiert auf Tagen, nicht Sessions)

#### 4. Calendar UI

- **Visuelle Indikatoren**: Bis zu 3 Punkte pro Tag zeigen Sessions an
- **Session-Auswahl**: Klick auf Tag mit mehreren Sessions öffnet Auswahlmodal
- **Direktzugriff**: Klick auf Tag mit einer Session öffnet direkt Anwesenheit
- **Spontan-Training**: Klick auf Tag ohne Session bietet Option zum Erstellen

## Datenbank Schema

### Collections

#### `recurringTrainingTemplates`

```javascript
{
    dayOfWeek: number,              // 0=Sonntag, 1=Montag, ..., 6=Samstag
    startTime: "16:00",             // HH:MM Format
    endTime: "17:00",               // HH:MM Format
    subgroupId: string,             // Untergruppe (= Trainingstyp)
    clubId: string,
    active: boolean,                // Kann deaktiviert werden
    startDate: "YYYY-MM-DD",       // Ab wann gültig
    endDate: "YYYY-MM-DD" | null,  // Bis wann (null = unbegrenzt)
    createdAt: Timestamp,
    createdBy: string
}
```

#### `trainingSessions`

```javascript
{
    date: "YYYY-MM-DD",
    startTime: "16:00",
    endTime: "17:00",
    subgroupId: string,
    clubId: string,
    recurringTemplateId: string | null,  // null bei spontanen Sessions
    cancelled: boolean,
    createdAt: Timestamp,
    createdBy: string                    // User ID oder "system"
}
```

#### `attendance` (aktualisiert)

```javascript
{
    date: "YYYY-MM-DD",             // Bestehend
    clubId: string,                 // Bestehend
    subgroupId: string,             // Bestehend
    sessionId: string,              // NEU: Referenz zu trainingSessions
    presentPlayerIds: [string],     // Bestehend
    updatedAt: Timestamp           // Bestehend
}
```

### Firestore Rules

Neue Rules für `trainingSessions` und `recurringTrainingTemplates`:

- Read: Alle authentifizierten Nutzer
- Create/Update/Delete: Nur Coaches/Admins des gleichen Clubs

## Cloud Functions

### `autoGenerateTrainingSessions`

**Scheduled**: Täglich um 00:00 Uhr (Europe/Berlin)

**Funktion**:

- Lädt alle aktiven `recurringTrainingTemplates`
- Generiert Sessions für die nächsten 14 Tage
- Prüft bestehende Sessions (keine Duplikate)
- Berücksichtigt Template-Zeiträume (startDate/endDate)

**Batch-Processing**: 500 Operationen pro Batch (Firestore-Limit)

### `migrateAttendanceToSessions`

**Callable**: Einmalige Migration für bestehende Daten

**Funktion**:

- Findet alle `attendance` Docs ohne `sessionId`
- Erstellt generische Sessions (18:00-20:00) für alte Daten
- Verknüpft mit bestehenden Sessions falls verfügbar
- Aktualisiert `attendance` mit `sessionId`

**Aufruf**:

```javascript
const functions = getFunctions(app, 'europe-west3');
const migrate = httpsCallable(functions, 'migrateAttendanceToSessions');
const result = await migrate();
console.log(result.data); // { success: true, migrated: X, skipped: Y, total: Z }
```

## UI-Komponenten

### Coach Dashboard

#### Neuer Tab: "📅 Trainingsplan"

- Liste aller wiederkehrenden Trainings
- Gruppiert nach Wochentag
- Bearbeiten, Löschen, Erstellen

#### Kalender & Anwesenheit Tab (aktualisiert)

- Punkte zeigen Sessions an (🔵🔵🔵 = 3 Sessions)
- Klick auf Tag:
  - **0 Sessions**: Spontanes Training erstellen
  - **1 Session**: Anwesenheit direkt erfassen
  - **2+ Sessions**: Session-Auswahl Modal

#### Session-Auswahl Modal

- Liste aller Sessions am ausgewählten Tag
- Anzeige: Untergruppe, Zeitraum
- Aktionen: Anwesenheit erfassen, Training absagen

## Workflow

### Erstmalige Einrichtung

1. **Trainingsplan erstellen**:

   ```
   Coach Dashboard → Trainingsplan Tab → "Neues Training"
   → Wochentag: Montag
   → Zeit: 16:00-17:00
   → Untergruppe: Basic
   → Gültig ab: Heute
   ```

2. **Sessions generieren**:
   - Automatisch: Cloud Function läuft täglich
   - Manuell: Bei Template-Erstellung werden direkt 14 Tage generiert

3. **Migration ausführen** (nur bei bestehenden Daten):
   ```javascript
   // In Browser-Konsole als Admin
   const functions = getFunctions(getApp(), 'europe-west3');
   const migrate = httpsCallable(functions, 'migrateAttendanceToSessions');
   const result = await migrate();
   ```

### Täglicher Betrieb

1. **Anwesenheit erfassen**:

   ```
   Coach Dashboard → Kalender → Tag klicken
   → (Bei mehreren Sessions) Session auswählen
   → Spieler markieren → Speichern
   ```

2. **Spontanes Training**:

   ```
   Coach Dashboard → Kalender → Tag ohne Session klicken
   → "Spontanes Training hinzufügen"
   → Datum, Zeit, Untergruppe eingeben → Erstellen
   → Anwesenheit erfassen
   ```

3. **Training absagen**:
   ```
   Coach Dashboard → Kalender → Tag klicken
   → Session-Auswahl → "Absagen"
   ```

## Validierungen

### Backend (training-schedule.js)

- ✅ Zeitformat: HH:MM
- ✅ Start < End
- ✅ Keine überlappenden Sessions (gleiche Untergruppe)
- ✅ Keine überlappenden Templates

### Frontend (attendance.js)

- ✅ Spieler nur in Sessions ihrer Untergruppen
- ✅ Spieler kann nicht 2x an gleicher Session teilnehmen
- ✅ Streak-Berechnung: Basiert auf Tagen (nicht Sessions)

## Kompatibilität

### Rückwärtskompatibilität

- ✅ Bestehende `attendance` Docs ohne `sessionId` funktionieren
- ✅ Migrations-Funktion erstellt Sessions für alte Daten
- ✅ Streak-Berechnung bleibt gleich (tag-basiert)

### Forward Compatibility

- ✅ Neue `attendance` Docs haben immer `sessionId`
- ✅ Calendar zeigt sowohl alte (ohne Session) als auch neue Daten

## ✅ Vollständig Implementiert

### 1. Player Calendar View ✅

**Datei**: `public/js/calendar.js`

**Implementiert**:

- ✅ Session-Indikatoren (Punkte) auf Kalendertagen
- ✅ `loadTodaysMatches`: Zeigt Sessions mit Zeit und Untergruppe
- ✅ Session-basierte Paarungen werden angezeigt
- ✅ `loadPairingsForSession()`: Lädt und zeigt Paarungen pro Session
- ✅ Eigene Paarungen werden highlighted

### 2. Match-Paarungen pro Session ✅

**Datei**: `public/js/matches.js`

**Implementiert**:

- ✅ `setCurrentPairingsSession()`: Setzt aktuelle Session
- ✅ `handleGeneratePairings()` akzeptiert `sessionId` Parameter
- ✅ `savePairings()`: Speichert Paarungen mit sessionId
- ✅ `loadSessionPairings()`: Lädt Session-Paarungen
- ✅ `trainingMatches` Collection nutzt `sessionId` als Dokument-ID
- ✅ "Paarungen speichern" Button im Modal (nur bei session-based)

### 3. Coach Integration ✅

**Datei**: `public/js/coach.js`, `public/js/attendance.js`

**Implementiert**:

- ✅ `getCurrentSessionId()` Export von attendance.js
- ✅ Coach.js übergibt sessionId an handleGeneratePairings
- ✅ Session-basierter Pairing-Workflow vollständig integriert

### 4. Testing & Dokumentation ✅

**Datei**: `TESTING_GUIDE.md`

**Implementiert**:

- ✅ 10 End-to-End Test Szenarien
- ✅ 5 Edge Case Tests
- ✅ Performance Tests
- ✅ Security Tests
- ✅ User Acceptance Tests
- ✅ Deployment Checkliste
- ✅ Troubleshooting Guide

## Firestore Indices (benötigt)

```
Collection: trainingSessions
- clubId ASC, date ASC, cancelled ASC

Collection: recurringTrainingTemplates
- clubId ASC, active ASC, dayOfWeek ASC

Collection: attendance
- sessionId ASC (für schnelle Suche)
```

Erstellen in Firebase Console oder via `firestore.indexes.json`

## Performance

### Queries

- ✅ Monatliche Sessions: 1 Query (clubId + date range)
- ✅ Sessions pro Tag: Im Cache (aus monatlichem Query)
- ✅ Attendance pro Session: 1 Query (sessionId)

### Batch Operations

- ✅ Cloud Functions nutzen Batching (500 ops/batch)
- ✅ Attendance Save: 1 Batch für alle Spieler

## Deployment

### Functions deployen

```bash
cd functions
npm install
firebase deploy --only functions:autoGenerateTrainingSessions,functions:migrateAttendanceToSessions
```

### Rules deployen

```bash
firebase deploy --only firestore:rules
```

## Troubleshooting

### Problem: Sessions werden nicht generiert

**Lösung**:

1. Prüfe Cloud Function Logs: `firebase functions:log`
2. Prüfe Template `active: true`
3. Prüfe `startDate` <= heute
4. Manuell triggern: Cloud Function neu deployen

### Problem: Alte Attendance ohne Session

**Lösung**:

```javascript
// Migration erneut ausführen
const result = await migrate();
console.log(result.data.migrated); // Sollte > 0 sein
```

### Problem: Duplikate Sessions

**Lösung**:

- Ist normal - Auto-Generation prüft auf Duplikate
- Query nach `date + startTime + subgroupId` findet Duplikate
- Manuell löschen falls nötig

## Wichtige Hinweise

1. **Streak-Berechnung**: Basiert auf **Tagen**, nicht Sessions
   - Spieler kann mehrmals pro Tag trainieren
   - Streak +1 nur wenn an Tag X teilgenommen (egal wie viele Sessions)

2. **Subgroup = Trainingstyp**:
   - Untergruppen definieren Trainingsarten (Basic, Leistung, etc.)
   - Jede Session gehört zu einer Untergruppe
   - Spieler sehen nur Sessions ihrer Untergruppen

3. **Auto-Generation**:
   - Läuft täglich → immer 14 Tage im Voraus
   - Idempotent → mehrfaches Ausführen sicher
   - Erstellt nur Sessions aus **aktiven** Templates

## Support

Bei Fragen oder Problemen:

1. Check Firebase Console → Functions → Logs
2. Check Browser Console (F12)
3. Prüfe Firestore Rules
4. Prüfe Template-Konfiguration
