# Multi-Session Training System - Testing Guide

## Übersicht

Dieses Dokument beschreibt alle Tests und Validierungen für das Multi-Session Training System. Es stellt sicher, dass alle Features korrekt funktionieren und Edge Cases behandelt werden.

## Pre-Testing Setup

### 1. Deployment Checklist

- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] Firestore Rules deployed (`firebase deploy --only firestore:rules`)
- [ ] Frontend Code committed and pushed
- [ ] Firestore Indices erstellt (siehe unten)

### 2. Required Firestore Indices

Erstelle folgende Indices in Firebase Console unter **Firestore Database → Indexes**:

```
Collection: trainingSessions
Fields:
- clubId (Ascending)
- date (Ascending)
- cancelled (Ascending)

Collection: trainingSessions
Fields:
- clubId (Ascending)
- date (Ascending)
- startTime (Ascending)
- subgroupId (Ascending)

Collection: recurringTrainingTemplates
Fields:
- clubId (Ascending)
- active (Ascending)
- dayOfWeek (Ascending)

Collection: attendance
Fields:
- sessionId (Ascending)
```

### 3. Test Data Setup

Erstelle folgende Test-Daten:

- Mindestens 2 Untergruppen ("Basic", "Leistung")
- Mindestens 10 Test-Spieler (5 pro Untergruppe)
- Test-Spieler sollten verschiedene Elo-Ratings haben (1000-1500)

## End-to-End Test Scenarios

### Test 1: Recurring Training Template erstellen

**Ziel**: Überprüfen, dass wiederkehrende Trainings korrekt erstellt werden

**Schritte**:

1. Als Coach einloggen
2. Zum Tab "📅 Trainingsplan" navigieren
3. Klick auf "Neues Training"
4. Formular ausfüllen:
   - Wochentag: Montag
   - Startzeit: 16:00
   - Endzeit: 17:00
   - Untergruppe: Basic
   - Gültig ab: Heutiges Datum
   - Gültig bis: (leer lassen für unbegrenzt)
5. Klick auf "Erstellen"

**Erwartetes Ergebnis**:

- ✅ Training erscheint in der Liste unter "Montag"
- ✅ Training zeigt korrekte Zeiten (16:00-17:00)
- ✅ Untergruppe "Basic" wird angezeigt
- ✅ Sessions für nächste 14 Tage werden automatisch generiert

**Validierung**:

```javascript
// In Browser Console
const db = firebase.firestore();
const templates = await db
  .collection('recurringTrainingTemplates')
  .where('clubId', '==', 'YOUR_CLUB_ID')
  .get();
console.log(
  'Templates:',
  templates.docs.map(d => d.data())
);

const sessions = await db
  .collection('trainingSessions')
  .where('clubId', '==', 'YOUR_CLUB_ID')
  .where('date', '>=', 'YYYY-MM-DD')
  .get();
console.log(
  'Auto-generated Sessions:',
  sessions.docs.map(d => d.data())
);
```

### Test 2: Überlappende Templates verhindern

**Ziel**: Validierung verhindert überlappende Trainings

**Schritte**:

1. Erstelle Template: Montag 16:00-18:00, Untergruppe "Basic"
2. Versuche Template zu erstellen: Montag 17:00-19:00, Untergruppe "Basic"

**Erwartetes Ergebnis**:

- ❌ Fehlermeldung: "Ein wiederkehrendes Training mit überschneidenden Zeiten existiert bereits"
- ✅ Template wird NICHT erstellt

### Test 3: Spontanes Training erstellen

**Ziel**: Coach kann spontane Trainings anlegen

**Schritte**:

1. Zum Tab "Kalender & Anwesenheit" navigieren
2. Klick auf einen Tag OHNE Sessions (z.B. Sonntag)
3. Klick auf "Spontanes Training hinzufügen"
4. Formular ausfüllen:
   - Datum: (vorausgefüllt)
   - Startzeit: 10:00
   - Endzeit: 12:00
   - Untergruppe: Leistung
5. Klick auf "Erstellen"

**Erwartetes Ergebnis**:

- ✅ Session wird erstellt
- ✅ Kalender zeigt blauen Punkt auf dem Tag
- ✅ Klick auf Tag öffnet direkt Anwesenheitsmodal

### Test 4: Mehrere Sessions pro Tag

**Ziel**: Mehrere Trainings am gleichen Tag funktionieren

**Schritte**:

1. Erstelle Template: Dienstag 16:00-17:00, Untergruppe "Basic"
2. Erstelle Template: Dienstag 17:00-19:00, Untergruppe "Leistung"
3. Warte auf Auto-Generation (oder triggere manuell)
4. Navigiere zum nächsten Dienstag im Kalender

**Erwartetes Ergebnis**:

- ✅ Kalender zeigt 2 blaue Punkte (🔵🔵) am Dienstag
- ✅ Klick auf Tag öffnet Session-Auswahl Modal
- ✅ Modal zeigt beide Sessions:
  - "16:00-17:00 • Basic"
  - "17:00-19:00 • Leistung"

### Test 5: Anwesenheit pro Session erfassen

**Ziel**: Anwesenheit wird korrekt pro Session gespeichert

**Schritte**:

1. Wähle einen Tag mit 2 Sessions (aus Test 4)
2. Klick auf "Anwesenheit erfassen" für erste Session (16:00-17:00)
3. Markiere 5 Spieler aus "Basic" Untergruppe
4. Klick auf "Speichern"
5. Schließe Modal
6. Klick erneut auf Tag → Session 2 wählen (17:00-19:00)
7. Markiere 5 andere Spieler aus "Leistung" Untergruppe
8. Klick auf "Speichern"

**Erwartetes Ergebnis**:

- ✅ Beide Attendance-Dokumente werden erstellt
- ✅ Jedes hat unterschiedliche `sessionId`
- ✅ Jedes hat korrekte `subgroupId`

**Validierung**:

```javascript
const attendance = await db
  .collection('attendance')
  .where('date', '==', 'YYYY-MM-DD')
  .where('clubId', '==', 'YOUR_CLUB_ID')
  .get();
console.log(
  'Attendance records:',
  attendance.docs.map(d => ({
    sessionId: d.data().sessionId,
    subgroupId: d.data().subgroupId,
    playerCount: d.data().presentPlayerIds.length,
  }))
);
// Erwartung: 2 Dokumente mit verschiedenen sessionIds
```

### Test 6: Match-Paarungen pro Session

**Ziel**: Paarungen werden pro Session gespeichert und angezeigt

**Schritte**:

1. Öffne Anwesenheit für eine Session mit ≥2 match-ready Spielern
2. Markiere Spieler als anwesend
3. Klick auf "Paarungen erstellen"
4. Überprüfe generierte Paarungen im Modal
5. Klick auf "Paarungen speichern"
6. Gehe zu Dashboard als Spieler
7. Überprüfe "Heutige Trainings" Bereich

**Erwartetes Ergebnis**:

- ✅ Paarungen werden im Modal angezeigt
- ✅ "Paarungen speichern" Button erscheint
- ✅ Nach Speichern: Button zeigt "Gespeichert!" (grün)
- ✅ Spieler Dashboard zeigt:
  - Session mit Zeit (16:00-17:00)
  - Untergruppe (Basic)
  - Liste der Paarungen
  - Eigene Paarung ist highlighted

**Validierung**:

```javascript
const pairings = await db.collection('trainingMatches').doc('SESSION_ID').get();
console.log('Pairings:', pairings.data());
// Erwartung: Dokument mit sessionId, groups, leftoverPlayer
```

### Test 7: Spieler können an mehreren Sessions teilnehmen

**Ziel**: Spieler in mehreren Untergruppen sehen alle Sessions

**Setup**: Spieler "Test Max" hat subgroupIDs: ["basic_id", "leistung_id"]

**Schritte**:

1. Erstelle 2 Sessions am gleichen Tag (Basic & Leistung)
2. Login als "Test Max"
3. Gehe zum Dashboard

**Erwartetes Ergebnis**:

- ✅ Kalender zeigt 2 Punkte am Tag
- ✅ "Heutige Trainings" zeigt beide Sessions
- ✅ Paarungen für beide Sessions werden angezeigt

### Test 8: Training absagen

**Ziel**: Coach kann Sessions absagen (soft delete)

**Schritte**:

1. Klick auf Tag mit Session
2. Wähle Session aus
3. Klick auf "Absagen" Button
4. Bestätige Absage

**Erwartetes Ergebnis**:

- ✅ Session verschwindet aus Kalender
- ✅ Session wird NICHT gelöscht (nur `cancelled: true`)
- ✅ Spieler sehen Session nicht mehr

**Validierung**:

```javascript
const session = await db.collection('trainingSessions').doc('SESSION_ID').get();
console.log('Cancelled:', session.data().cancelled); // true
```

### Test 9: Migration bestehender Attendance

**Ziel**: Alte Attendance-Daten bekommen sessionId

**Voraussetzung**: Alte Attendance ohne `sessionId` existiert

**Schritte**:

1. Öffne Browser Console als Admin
2. Führe aus:

```javascript
const functions = firebase.functions('europe-west3');
const migrate = functions.httpsCallable('migrateAttendanceToSessions');
const result = await migrate();
console.log(result.data);
```

**Erwartetes Ergebnis**:

```json
{
  "success": true,
  "migrated": 15,
  "skipped": 5,
  "total": 20
}
```

- ✅ Alte Attendance haben jetzt `sessionId`
- ✅ Generische Sessions (18:00-20:00) wurden erstellt

### Test 10: Auto-Generation läuft täglich

**Ziel**: Cloud Function generiert Sessions automatisch

**Schritte**:

1. Überprüfe Cloud Function Logs:

```bash
firebase functions:log --only autoGenerateTrainingSessions --limit 5
```

2. Erwartete Logs:

```
Auto-generating training sessions...
Created X sessions for next 14 days
```

**Oder manuell testen**:

1. Erstelle Template für morgen
2. Warte bis 00:00 Uhr (oder triggere Cloud Function manuell)
3. Überprüfe Firestore:

```javascript
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dateStr = tomorrow.toISOString().split('T')[0];

const sessions = await db.collection('trainingSessions').where('date', '==', dateStr).get();
console.log(
  'Sessions for tomorrow:',
  sessions.docs.map(d => d.data())
);
```

**Erwartetes Ergebnis**:

- ✅ Sessions für die nächsten 14 Tage existieren
- ✅ Keine Duplikate

## Edge Cases & Error Handling

### Edge Case 1: Gleiche Spieler in mehreren Sessions

**Szenario**: Spieler ist in 2 Untergruppen, beide trainieren gleichzeitig

**Erwartung**:

- Spieler kann nur an EINER der Sessions teilnehmen (physisch unmöglich gleichzeitig da zu sein)
- Coach muss entscheiden, welche Session der Spieler besucht

**Test**:

1. Erstelle 2 Sessions: Montag 16:00-17:00 Basic UND Leistung
2. Spieler "Max" ist in beiden Untergruppen
3. Coach öffnet Anwesenheit für Basic Session
4. Markiert Max als anwesend → Speichern
5. Coach öffnet Anwesenheit für Leistung Session
6. Markiert Max als anwesend → Speichern

**Erwartetes Ergebnis**:

- ✅ Max erscheint in beiden Attendance-Listen
- ⚠️ Coach muss selbst darauf achten (keine automatische Validierung)

**Empfehlung**: Feature für spätere Version - Warnung wenn Spieler in überlappenden Sessions markiert wird

### Edge Case 2: Session ohne Spieler

**Szenario**: Kein Spieler ist anwesend

**Test**: Speichere Anwesenheit mit 0 Spielern

**Erwartetes Ergebnis**:

- ✅ Attendance wird mit `presentPlayerIds: []` gespeichert
- ✅ Kein Fehler

### Edge Case 3: Template mit Enddatum

**Szenario**: Template gültig bis 31.12.2024

**Test**:

1. Erstelle Template mit `endDate: 2024-12-31`
2. Auto-Generation läuft am 30.12.2024
3. Auto-Generation läuft am 01.01.2025

**Erwartetes Ergebnis**:

- ✅ Am 30.12: Session wird erstellt
- ✅ Am 01.01: Keine Session (außerhalb endDate)

### Edge Case 4: Midnight-Bug (Zeitzone)

**Szenario**: Auto-Generation um 00:00 Europe/Berlin

**Test**: Überprüfe Logs um Mitternacht

**Erwartetes Ergebnis**:

- ✅ Function läuft genau um 00:00 Berlin Zeit
- ✅ Keine doppelten Ausführungen

### Edge Case 5: Zu viele Sessions (Performance)

**Szenario**: Club hat 10 Untergruppen × 7 Tage = 70 Sessions/Woche

**Test**:

1. Erstelle 10 Untergruppen
2. Erstelle Templates für jeden Tag
3. Warte auf Auto-Generation

**Erwartetes Ergebnis**:

- ✅ Alle Sessions werden erstellt (70 × 2 Wochen = 140)
- ✅ Batch-Processing verhindert Timeout
- ✅ Kalender lädt schnell (< 1s)

## Performance Tests

### Test P1: Kalender lädt schnell

**Metriken**:

- Lade-Zeit für Monat mit 30 Sessions: < 500ms
- Lade-Zeit für Monat mit 100 Sessions: < 1s

**Messung**:

```javascript
console.time('renderCalendar');
await renderCalendar(new Date(), db, userData);
console.timeEnd('renderCalendar');
```

### Test P2: Auto-Generation Batch-Processing

**Metriken**:

- 500 Sessions in < 10s
- Keine Firestore-Quota Fehler

**Validierung**: Cloud Function Logs prüfen

## Security Tests

### Test S1: Firestore Rules - Nicht-Coach kann keine Session erstellen

**Test**:

```javascript
// Als Spieler einloggen
const sessionRef = db.collection('trainingSessions').doc();
try {
  await sessionRef.set({
    date: '2024-12-01',
    startTime: '16:00',
    endTime: '17:00',
    clubId: 'test_club',
    subgroupId: 'test_subgroup',
    cancelled: false,
  });
  console.error('FEHLER: Spieler konnte Session erstellen!');
} catch (error) {
  console.log('OK: Permission denied', error.code);
}
```

**Erwartetes Ergebnis**: `PERMISSION_DENIED`

### Test S2: Spieler kann nur eigene Club-Sessions sehen

**Test**:

1. Login als Spieler von Club A
2. Versuche Sessions von Club B zu laden

**Erwartetes Ergebnis**: Leere Ergebnis (keine Permission Fehler, nur gefiltert)

## Regression Tests

### Test R1: Streaks funktionieren weiterhin

**Ziel**: Tag-basierte Streaks bleiben intakt

**Test**:

1. Spieler nimmt an Session 1 teil (16:00-17:00)
2. Spieler nimmt an Session 2 teil (17:00-19:00) - GLEICHER TAG
3. Überprüfe Streak

**Erwartetes Ergebnis**:

- ✅ Streak erhöht sich um 1 (nicht um 2!)
- ✅ Tag wird nur EINMAL gezählt

### Test R2: XP/Punkte System funktioniert

**Test**: Spieler nimmt an 2 Sessions teil

**Erwartetes Ergebnis**:

- ✅ XP wird für BEIDE Sessions gutgeschrieben
- ✅ Streak-Bonus nur 1x pro Tag

### Test R3: Alte Paarungen (ohne Session) funktionieren

**Szenario**: Alte `trainingMatches` mit `{clubId}_{date}` ID

**Test**: Alte Matches werden weiterhin angezeigt

**Erwartetes Ergebnis**:

- ✅ Alte Paarungen bleiben sichtbar
- ⚠️ Neue Paarungen haben sessionId als Dokument-ID

## User Acceptance Tests

### UAT 1: Coach Workflow - Wöchentliches Training

**User Story**: "Als Coach möchte ich jeden Montag 16-17 Uhr Basic-Training haben"

**Schritte**:

1. Template erstellen (1x)
2. Jeden Montag: Klick auf Kalender → Session auswählen → Anwesenheit
3. Paarungen erstellen (optional)

**Erfolg**: ✅ Coach spart Zeit (kein manuelles Erstellen jede Woche)

### UAT 2: Spieler Workflow - Heutige Trainings sehen

**User Story**: "Als Spieler möchte ich sehen, welche Trainings heute stattfinden und gegen wen ich spiele"

**Schritte**:

1. Login als Spieler
2. Dashboard öffnen

**Erfolg**:

- ✅ Heutige Sessions werden angezeigt
- ✅ Zeiten sind klar ersichtlich
- ✅ Eigene Paarungen sind highlighted

### UAT 3: Coach Workflow - Spontanes Training

**User Story**: "Als Coach möchte ich spontan ein Training anlegen können (z.B. Ersatztraining)"

**Schritte**:

1. Klick auf Tag ohne Session
2. "Spontanes Training" → Formular ausfüllen
3. Anwesenheit erfassen

**Erfolg**: ✅ Training wird in < 30 Sekunden erstellt

## Deployment Checkliste

Vor dem Live-Deployment:

- [ ] Alle End-to-End Tests bestanden
- [ ] Alle Edge Cases getestet
- [ ] Performance Tests OK (< 1s Ladezeit)
- [ ] Security Tests bestanden
- [ ] UAT mit echtem Coach durchgeführt
- [ ] Migration auf Staging-Daten getestet
- [ ] Firestore Indices erstellt
- [ ] Cloud Functions deployed
- [ ] Firestore Rules deployed
- [ ] Backup der Produktionsdatenbank erstellt
- [ ] Rollback-Plan vorhanden

## Troubleshooting Guide

### Problem: Sessions werden nicht generiert

**Diagnose**:

1. Prüfe Cloud Function Logs:
   ```bash
   firebase functions:log --only autoGenerateTrainingSessions
   ```
2. Prüfe Template `active: true`
3. Prüfe Template `startDate <= heute`

**Lösung**:

- Template aktivieren
- Manuell Sessions erstellen
- Function neu deployen

### Problem: Kalender zeigt keine Punkte

**Diagnose**:

1. Browser Console öffnen
2. Prüfe auf JavaScript Fehler
3. Prüfe Firestore Query (Network Tab)

**Lösung**:

- Cache leeren
- Session-Query Indices prüfen

### Problem: Paarungen werden nicht gespeichert

**Diagnose**:

1. Browser Console: Fehler?
2. Firestore Rules: Permission denied?

**Lösung**:

- Firestore Rules prüfen (Coach/Admin?)
- sessionId vorhanden beim Speichern?

## Support & Weitere Tests

Für weitere Fragen:

1. Prüfe Cloud Function Logs
2. Prüfe Browser Console (F12)
3. Prüfe Firestore Dokumente direkt
4. Prüfe `MULTI_SESSION_TRAINING.md` Dokumentation

## Changelog

- **v1.0**: Initiale Testing Guide für Multi-Session Training System
