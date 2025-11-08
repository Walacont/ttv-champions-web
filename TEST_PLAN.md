# Test Plan - Match Request Feature & Fixes

## Branch: `claude/add-player-competition-tab-011CUtdpMAM38n45Bkc6DsSL`

## 📋 Übersicht aller Änderungen

### 1. **Set-by-Set Eingabe mit offiziellen Tischtennis-Regeln**
- **Dateien:** `public/js/player-matches.js`, `public/js/matches.js`, `public/coach.html`
- **Was:** Beide (Coach + Spieler) können jetzt Satz-Ergebnisse eingeben
- **Validierung:** Offizielle Tischtennis-Regeln werden erzwungen

### 2. **Auto-Add 4./5. Satz**
- **Dateien:** `public/js/player-matches.js`
- **Was:** Automatisches Hinzufügen von Satz-Feldern bei 2:1 oder 2:2

### 3. **Auto-Reset nach Submission**
- **Dateien:** `public/js/player-matches.js`, `public/js/matches.js`
- **Was:** Formular wird automatisch auf 3 Sätze zurückgesetzt

### 4. **Handicap-Match Elo-Fix**
- **Dateien:** `functions/index.js`
- **Was:** Handicap = Fixed ±8 Elo, kein XP | Standard = Dynamic Elo + XP

### 5. **Coach-Name auf verarbeiteten Anfragen**
- **Dateien:** `public/js/matches.js`, `public/js/player-matches.js`
- **Was:** Zeigt welcher Coach die Anfrage genehmigt/abgelehnt hat

### 6. **Challenge-Punkte Permission-Fix**
- **Dateien:** `firestore.rules`
- **Was:** Coaches können jetzt Challenge-Punkte vergeben

### 7. **Untergruppen-Filter für Punktevergabe**
- **Dateien:** `public/js/player-management.js`, `public/js/coach.js`
- **Was:** Punktevergabe-Dropdown zeigt nur Spieler der ausgewählten Untergruppe

### 8. **Challenge-Untergruppen-Validierung**
- **Dateien:** `public/js/points-management.js`, `public/js/challenges.js`
- **Was:** Verhindert Punktevergabe an Spieler außerhalb der Challenge-Untergruppe

### 9. **Spieler zu Coach befördern Fix**
- **Dateien:** `firestore.rules`
- **Was:** Coaches können Spieler zu Coaches befördern

---

## 🧪 Testplan

### TEST 1: Set-Validierung (Coach & Spieler)

#### Test 1.1: Gültige Set-Ergebnisse
**Schritte:**
1. Als Coach/Spieler: Öffne Wettkampf-Tab
2. Trage folgende Sets ein und speichere:
   - Satz 1: 11:9 ✓
   - Satz 2: 12:10 ✓
   - Satz 3: 14:12 ✓

**Erwartetes Ergebnis:**
- ✅ Formular wird akzeptiert
- ✅ Match/Anfrage wird gespeichert
- ✅ Keine Fehlermeldung

#### Test 1.2: Ungültige Set-Ergebnisse
**Schritte:**
1. Trage ein: Satz 1: 11:10
2. Versuche zu speichern

**Erwartetes Ergebnis:**
- ❌ Fehlermeldung: "Satz 1: Ab 10:10 muss eine Seite 2 Punkte Vorsprung haben (z.B. 12:10, 14:12)."
- ❌ Formular wird nicht gespeichert

#### Test 1.3: Zu wenige Punkte
**Schritte:**
1. Trage ein: Satz 1: 10:9
2. Versuche zu speichern

**Erwartetes Ergebnis:**
- ❌ Fehlermeldung: "Satz 1: Mindestens eine Seite muss 11 Punkte haben."

#### Test 1.4: Deuce-Regel
**Schritte:**
1. Trage folgende Sets ein:
   - Satz 1: 13:11 ✓
   - Satz 2: 15:13 ✓
   - Satz 3: 11:9 ✓

**Erwartetes Ergebnis:**
- ✅ Alle Sets werden akzeptiert (2-Punkte-Regel erfüllt)

---

### TEST 2: Auto-Add 4./5. Satz

#### Test 2.1: Auto-Add bei 2:1
**Schritte:**
1. Trage ein:
   - Satz 1: 11:9 (Spieler A gewinnt)
   - Satz 2: 11:7 (Spieler A gewinnt)
   - Satz 3: 9:11 (Spieler B gewinnt)
2. Warte 1 Sekunde

**Erwartetes Ergebnis:**
- ✅ 4. Satz-Feld erscheint automatisch

#### Test 2.2: Auto-Add bei 2:2
**Schritte:**
1. Trage ein:
   - Satz 1: 11:9
   - Satz 2: 9:11
   - Satz 3: 11:7
   - Satz 4: 8:11

**Erwartetes Ergebnis:**
- ✅ 5. Satz-Feld erscheint automatisch

---

### TEST 3: Auto-Reset nach Submission

#### Test 3.1: Coach Match-Formular
**Schritte:**
1. Als Coach: Trage ein 5-Satz-Match ein
2. Speichere das Match
3. Beobachte das Formular

**Erwartetes Ergebnis:**
- ✅ Formular wird zurückgesetzt
- ✅ Nur 3 leere Satz-Felder sichtbar
- ✅ Keine manuelle Aktualisierung nötig

#### Test 3.2: Spieler Match-Request
**Schritte:**
1. Als Spieler: Erstelle Match-Anfrage mit 5 Sätzen
2. Sende die Anfrage
3. Beobachte das Formular

**Erwartetes Ergebnis:**
- ✅ Formular wird zurückgesetzt
- ✅ Nur 3 leere Satz-Felder sichtbar

---

### TEST 4: Handicap-Match Elo (Cloud Function)

#### Test 4.1: Handicap-Match mit Gewinner
**Vorbereitung:**
- Spieler A: 1000 Elo
- Spieler B: 1100 Elo (sollte Handicap bekommen)

**Schritte:**
1. Als Coach: Erstelle Match mit Handicap
2. Spieler A gewinnt
3. Warte auf Verarbeitung
4. Prüfe Spieler-Historie

**Erwartetes Ergebnis:**
- ✅ Gewinner (A): +8 Punkte, +8 Elo, 0 XP
- ✅ Verlierer (B): -8 Punkte, -8 Elo, 0 XP
- ✅ Historie zeigt: "+8 Pkt • -8 Elo" (kein XP)

#### Test 4.2: Standard-Match ohne Handicap
**Schritte:**
1. Als Coach: Erstelle Match ohne Handicap
2. Spieler mit niedrigerem Elo gewinnt
3. Prüfe Historie

**Erwartetes Ergebnis:**
- ✅ Gewinner: +X Punkte, +X Elo, +X XP (dynamisch berechnet)
- ✅ Verlierer: -X Punkte, -X Elo, 0 XP
- ✅ Historie zeigt: "+X Pkt • +X XP • +X Elo"

---

### TEST 5: Coach-Name auf Anfragen

#### Test 5.1: Genehmigte Anfrage
**Schritte:**
1. Als Spieler A: Erstelle Match-Anfrage an Spieler B
2. Als Spieler B: Genehmige die Anfrage
3. Als Coach "Max Mustermann": Genehmige die Anfrage
4. Als Spieler A: Öffne "Meine Anfragen"

**Erwartetes Ergebnis:**
- ✅ Status zeigt: "✓ Genehmigt von Max"

#### Test 5.2: Abgelehnte Anfrage
**Schritte:**
1. Erstelle Anfrage
2. Spieler B genehmigt
3. Coach "Anna Schmidt" lehnt ab
4. Prüfe Status

**Erwartetes Ergebnis:**
- ✅ Status zeigt: "✗ Abgelehnt von Anna"

---

### TEST 6: Challenge-Punkte Permission

#### Test 6.1: Challenge-Punkte vergeben
**Schritte:**
1. Als Coach: Öffne Punkte-Tab
2. Wähle Spieler
3. Wähle "Challenge" als Grund
4. Wähle eine aktive Challenge
5. Speichern

**Erwartetes Ergebnis:**
- ✅ Keine Permission-Error (403)
- ✅ Punkte werden erfolgreich vergeben
- ✅ Challenge wird als abgeschlossen markiert
- ✅ Erfolgs-Meldung erscheint

---

### TEST 7: Untergruppen-Filter Punktevergabe

#### Test 7.1: Filter auf spezifische Untergruppe
**Vorbereitung:**
- Untergruppe "Jugend" mit Spielern: Max, Lisa
- Untergruppe "Erwachsene" mit Spielern: Tom, Sarah

**Schritte:**
1. Als Coach: Setze Untergruppen-Filter auf "Jugend"
2. Öffne Punkte-Tab
3. Prüfe Spieler-Dropdown

**Erwartetes Ergebnis:**
- ✅ Dropdown zeigt nur: Max, Lisa
- ❌ Tom und Sarah sind NICHT sichtbar

#### Test 7.2: Filter auf "Alle"
**Schritte:**
1. Setze Filter auf "Alle (Gesamtverein)"
2. Prüfe Spieler-Dropdown

**Erwartetes Ergebnis:**
- ✅ Dropdown zeigt alle Spieler: Max, Lisa, Tom, Sarah

#### Test 7.3: Filter-Wechsel
**Schritte:**
1. Filter auf "Jugend" → nur Max, Lisa sichtbar
2. Wechsel zu "Erwachsene"
3. Prüfe Dropdown

**Erwartetes Ergebnis:**
- ✅ Dropdown aktualisiert sich sofort
- ✅ Zeigt jetzt nur: Tom, Sarah

---

### TEST 8: Challenge-Untergruppen-Validierung

#### Test 8.1: Spieler in falscher Untergruppe
**Vorbereitung:**
- Challenge "Offizieller Sieg" für Untergruppe "Jugend"
- Spieler "Tom" ist nur in "Erwachsene"

**Schritte:**
1. Setze Filter auf "Alle" (damit Tom sichtbar ist)
2. Wähle Spieler: Tom
3. Wähle Challenge: "Offizieller Sieg"
4. Versuche zu speichern

**Erwartetes Ergebnis:**
- ❌ Fehlermeldung: "Tom Müller gehört nicht der Untergruppe an, für die diese Challenge erstellt wurde. Bitte füge die Person in die Untergruppe 'Jugend' ein, um ihr diese Challenge zuzuweisen."
- ❌ Punkte werden NICHT vergeben

#### Test 8.2: Spieler in korrekter Untergruppe
**Vorbereitung:**
- Challenge "Offizieller Sieg" für "Jugend"
- Spieler "Max" ist in "Jugend"

**Schritte:**
1. Wähle Spieler: Max
2. Wähle Challenge: "Offizieller Sieg"
3. Speichern

**Erwartetes Ergebnis:**
- ✅ Keine Fehlermeldung
- ✅ Punkte werden erfolgreich vergeben

#### Test 8.3: Challenge für "Alle"
**Vorbereitung:**
- Challenge "Allgemeine Challenge" für "Alle"

**Schritte:**
1. Wähle beliebigen Spieler (egal welche Untergruppe)
2. Wähle Challenge: "Allgemeine Challenge"
3. Speichern

**Erwartetes Ergebnis:**
- ✅ Funktioniert für JEDEN Spieler
- ✅ Keine Untergruppen-Validierung

---

### TEST 9: Spieler zu Coach befördern

#### Test 9.1: Beförderung
**Schritte:**
1. Als Coach: Öffne Spieler-Modal
2. Wähle einen Spieler
3. Klicke "Zu Coach befördern"
4. Bestätige

**Erwartetes Ergebnis:**
- ✅ Keine Permission-Error
- ✅ Spieler wird erfolgreich zu Coach
- ✅ Rolle ändert sich in Datenbank

---

## 🔥 Kritische Tests (vor Deployment PFLICHT!)

### 🚨 KRITISCH 1: Firestore Rules Deploy
**Warum:** Permission-Fixes funktionieren nur nach Deployment

**Test:**
```bash
firebase deploy --only firestore:rules
```

**Erwartetes Ergebnis:**
- ✅ Deployment erfolgreich
- ✅ Keine Syntax-Fehler in Rules

### 🚨 KRITISCH 2: Cloud Functions Deploy
**Warum:** Handicap-Elo-Fix ist in Cloud Function

**Test:**
```bash
firebase deploy --only functions
```

**Erwartetes Ergebnis:**
- ✅ Deployment erfolgreich
- ✅ onMatchCreated Function aktualisiert

### 🚨 KRITISCH 3: End-to-End Test im Production-Modus
**Schritte:**
1. Nach allen Deployments
2. Führe alle Tests 1-9 durch
3. Prüfe Browser-Konsole auf Fehler

---

## ✅ Checkliste vor Merge in Main

- [ ] Alle JavaScript-Dateien: Syntax OK
- [ ] Firestore Rules: Syntax OK
- [ ] Cloud Functions: Syntax OK
- [ ] TEST 1: Set-Validierung funktioniert
- [ ] TEST 2: Auto-Add funktioniert
- [ ] TEST 3: Auto-Reset funktioniert
- [ ] TEST 4: Handicap-Elo korrekt
- [ ] TEST 5: Coach-Name wird angezeigt
- [ ] TEST 6: Challenge-Punkte funktionieren (nach Rules-Deploy)
- [ ] TEST 7: Untergruppen-Filter funktioniert
- [ ] TEST 8: Challenge-Validierung funktioniert
- [ ] TEST 9: Beförderung funktioniert (nach Rules-Deploy)
- [ ] Firestore Rules deployed
- [ ] Cloud Functions deployed
- [ ] Browser-Konsole: Keine Fehler
- [ ] Performance: Keine Verzögerungen

---

## 📊 Geänderte Dateien

```
firestore.rules                  - Permissions für completedChallenges & Beförderung
functions/index.js               - Handicap-Elo-Logik
public/coach.html                - Set-Score Container
public/js/challenges.js          - SubgroupId im Dataset
public/js/coach.js               - Import & Aufruf updatePointsPlayerDropdown
public/js/matches.js             - Coach Set-Score + Coach-Name speichern
public/js/player-management.js   - updatePointsPlayerDropdown Funktion
public/js/player-matches.js      - Set-Validierung + Auto-Add + Reset
public/js/points-management.js   - Challenge-Untergruppen-Validierung
```

---

## 🎯 Deployment-Reihenfolge

1. **Code auf Main mergen**
2. **Firestore Rules deployen:**
   ```bash
   firebase deploy --only firestore:rules
   ```
3. **Cloud Functions deployen:**
   ```bash
   firebase deploy --only functions
   ```
4. **Hosting deployen (Frontend):**
   ```bash
   firebase deploy --only hosting
   ```
5. **Finale Tests durchführen**

---

## 🐛 Bekannte Einschränkungen

Keine bekannten Bugs oder Einschränkungen zum aktuellen Zeitpunkt.

---

**Erstellt:** 2025-11-08
**Branch:** `claude/add-player-competition-tab-011CUtdpMAM38n45Bkc6DsSL`
**Commits:** 10 (7e6269d..16f8fa4)
