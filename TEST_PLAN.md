# Test Plan für SPA-Konvertierung

## Branch: `claude/convert-to-spa-011CV5tesKKnwW8kh7jNmjSh`

## Überblick

Diese Checkliste testet alle Funktionalitäten der Single Page Application, insbesondere die Fixes für:

- ✅ Registrierungsflow mit Einladungscodes
- ✅ Login und Post-Login Redirects
- ✅ Navigation zwischen Seiten
- ✅ Logout-Sicherheit (NEU!)
- ✅ Winner-Anzeige im Coach-View
- ✅ Rolle-basierte Dashboards

---

## 🔐 1. Authentifizierung & Registrierung

### 1.1 Registrierung mit Einladungscode (KRITISCH)

- [ ] Öffne `/index.html`
- [ ] Gib einen gültigen Einladungscode ein
- [ ] **Erwartung**: "Code erfolgreich validiert" Meldung
- [ ] Navigation zur Registrierungsseite erfolgt
- [ ] **Erwartung**: Registrierungsformular (E-Mail & Passwort) wird angezeigt
- [ ] **NICHT**: "Einladung erforderlich" Fehlermeldung
- [ ] Console öffnen und prüfen: `tokenId` oder `code` sollte NICHT `null` sein
- [ ] Fülle das Registrierungsformular aus und sende es ab
- [ ] **Erwartung**: Erfolgreiche Registrierung und Weiterleitung zum Onboarding

### 1.2 Login-Flow

- [ ] Auf `/index.html` mit E-Mail & Passwort einloggen
- [ ] **Erwartung**: Nach Login erfolgt automatische Weiterleitung
  - Spieler → `/dashboard.html`
  - Coach → `/coach.html`
  - Admin → `/admin.html`
- [ ] **Erwartung**: KEINE weiße leere Seite
- [ ] Dashboard lädt vollständig mit allen Daten

### 1.3 Onboarding

- [ ] Neuer Benutzer nach Registrierung
- [ ] Onboarding-Formular ausfüllen (Name, Verein, etc.)
- [ ] Formular absenden
- [ ] **Erwartung**: Weiterleitung zum rollenspezifischen Dashboard
- [ ] **Erwartung**: KEINE weiße leere Seite
- [ ] Dashboard lädt vollständig

---

## 🧭 2. SPA-Navigation

### 2.1 Navigation von Index/Dashboard zu anderen Seiten

- [ ] Von Dashboard zu Settings navigieren
- [ ] **Erwartung**: Settings-Seite lädt ohne vollständiges Page-Reload (SPA)
- [ ] Von Dashboard zu FAQ navigieren
- [ ] **Erwartung**: FAQ-Seite lädt ohne vollständiges Page-Reload (SPA)
- [ ] Prüfe Browser-URL: ändert sich korrekt

### 2.2 Zurück-Navigation zu Dashboards (KRITISCH)

**Als Spieler:**

- [ ] Login als Spieler → auf `/dashboard.html`
- [ ] Navigiere zu Settings
- [ ] Klicke Browser-Zurück-Button oder Link zurück zu Dashboard
- [ ] **Erwartung**: Dashboard lädt vollständig (mit vollem Page-Reload)
- [ ] **NICHT**: Weiße leere Seite

**Als Coach:**

- [ ] Login als Coach → auf `/coach.html`
- [ ] Navigiere zu FAQ
- [ ] Klicke Browser-Zurück-Button zurück zu Coach-Dashboard
- [ ] **Erwartung**: Coach-Dashboard lädt vollständig (mit vollem Page-Reload)
- [ ] **NICHT**: Weiße leere Seite

**Als Admin:**

- [ ] Login als Admin → auf `/admin.html`
- [ ] Navigiere zu Settings
- [ ] Klicke Browser-Zurück-Button zurück zu Admin-Dashboard
- [ ] **Erwartung**: Admin-Dashboard lädt vollständig (mit vollem Page-Reload)
- [ ] **NICHT**: Weiße leere Seite

### 2.3 Navigation auf Index (nicht angemeldet)

- [ ] Öffne `/index.html` (abgemeldet)
- [ ] Navigiere zu FAQ
- [ ] Klicke zurück zu Index
- [ ] **Erwartung**: Index lädt korrekt
- [ ] **Erwartung**: Funktioniert problemlos (Index ist nicht betroffen vom Dashboard-Bug)

---

## 🔒 3. Logout-Sicherheit (KRITISCH - NEU GEFIXT!)

### 3.1 Logout als Spieler

- [ ] Login als Spieler
- [ ] Auf Dashboard navigiere zu verschiedenen Seiten (Settings, FAQ)
- [ ] Klicke auf Logout-Button
- [ ] **Erwartung**: Weiterleitung zu `/index.html`
- [ ] Klicke Browser-Zurück-Button (Alt + Pfeil links)
- [ ] **Erwartung**: Du bleibst auf `/index.html` oder wirst sofort zurückgeleitet
- [ ] **NICHT**: Du siehst das Dashboard wieder als angemeldet
- [ ] Versuche manuell `/dashboard.html` aufzurufen
- [ ] **Erwartung**: Automatische Weiterleitung zu `/index.html`

### 3.2 Logout als Coach

- [ ] Login als Coach
- [ ] Navigiere zu Settings oder FAQ
- [ ] Klicke auf Logout-Button
- [ ] **Erwartung**: Weiterleitung zu `/index.html`
- [ ] Klicke Browser-Zurück-Button mehrmals
- [ ] **Erwartung**: Du kannst NICHT zum Coach-Dashboard zurückkehren
- [ ] Versuche manuell `/coach.html` aufzurufen
- [ ] **Erwartung**: Automatische Weiterleitung zu `/index.html`

### 3.3 Logout als Admin

- [ ] Login als Admin
- [ ] Navigiere durch verschiedene Seiten
- [ ] Klicke auf Logout-Button
- [ ] Klicke Browser-Zurück-Button
- [ ] **Erwartung**: Kein Zugriff auf Admin-Seiten
- [ ] Versuche manuell `/admin.html` aufzurufen
- [ ] **Erwartung**: Automatische Weiterleitung zu `/index.html`

### 3.4 Error-Logout-Button (Coach & Admin)

- [ ] Teste auch die "error-logout-button" (falls Auth-Error auftritt)
- [ ] **Erwartung**: Gleiche Sicherheit wie normaler Logout

---

## 🏆 4. Match-Funktionalität (Coach-View)

### 4.1 Winner-Anzeige für Best of 3 (KRITISCH - GEFIXT)

- [ ] Login als Spieler A
- [ ] Erstelle ein Match (Best of 3) mit Spieler B
- [ ] Gib Ergebnis ein: z.B. 2:1 in Sätzen (Spieler A gewinnt)
- [ ] Match zur Freigabe senden
- [ ] Login als Coach
- [ ] Öffne Match-Freigabe-Ansicht
- [ ] **Erwartung**: Gewinner zeigt "Spieler A" (oder Vorname)
- [ ] **NICHT**: "Unbekannt"

### 4.2 Winner-Anzeige für Best of 5

- [ ] Erstelle Best of 5 Match
- [ ] Gib Ergebnis ein: z.B. 3:2 in Sätzen
- [ ] Sende zur Freigabe
- [ ] Coach-Ansicht öffnen
- [ ] **Erwartung**: Korrekter Gewinnername angezeigt
- [ ] **NICHT**: "Unbekannt"

### 4.3 Winner-Anzeige für Best of 7

- [ ] Erstelle Best of 7 Match
- [ ] Gib Ergebnis ein: z.B. 4:3 in Sätzen
- [ ] **Erwartung**: Korrekter Gewinnername im Coach-View

### 4.4 Winner-Anzeige für Einzelsatz

- [ ] Erstelle Einzelsatz-Match
- [ ] Gib Ergebnis ein: z.B. 11:9
- [ ] **Erwartung**: Korrekter Gewinnername im Coach-View

---

## 🎯 5. Rolle-spezifische Funktionalität

### 5.1 Spieler-Dashboard

- [ ] Login als Spieler
- [ ] Dashboard lädt mit Leaderboard
- [ ] Match-Historie wird angezeigt
- [ ] Match-Vorschläge werden geladen
- [ ] Neues Match kann erstellt werden
- [ ] Navigation zu allen Unterseiten funktioniert

### 5.2 Coach-Dashboard

- [ ] Login als Coach
- [ ] Spielerliste wird angezeigt
- [ ] Match-Freigaben werden geladen
- [ ] Training-Kalender funktioniert
- [ ] Übungen können verwaltet werden

### 5.3 Admin-Dashboard

- [ ] Login als Admin
- [ ] Coach-Einladungen können erstellt werden
- [ ] Übungen können erstellt/bearbeitet werden
- [ ] Alle Admin-Funktionen sind verfügbar

---

## 🐛 6. Browser-Kompatibilität

### 6.1 Chrome/Edge

- [ ] Alle oben genannten Tests durchführen
- [ ] Keine Console-Fehler
- [ ] SPA-Navigation funktioniert flüssig

### 6.2 Firefox

- [ ] Alle oben genannten Tests durchführen
- [ ] Keine Console-Fehler
- [ ] SPA-Navigation funktioniert

### 6.3 Safari (falls verfügbar)

- [ ] Grundlegende Tests durchführen
- [ ] SPA-Navigation funktioniert

---

## 🔍 7. Console-Überprüfung

### Während der Tests auf folgendes achten:

- [ ] **KEINE** JavaScript-Fehler in der Console
- [ ] **KEINE** 404-Fehler beim Laden von Ressourcen
- [ ] **KEINE** Firebase-Authentifizierungsfehler
- [ ] SPA-Logs (z.B. "[SPA] Navigating to...") erscheinen bei Navigation
- [ ] Bei Registrierung: `tokenId` oder `code` sind NICHT `null`

---

## ✅ 8. Performance & UX

### 8.1 Page-Load-Performance

- [ ] SPA-Navigation ist spürbar schneller als Full-Page-Reload
- [ ] Keine merkliche Verzögerung bei Navigation zwischen Seiten
- [ ] Dashboards laden nach Login in angemessener Zeit

### 8.2 User Experience

- [ ] Keine Flicker/Blinken beim Seitenwechsel
- [ ] Browser-URL aktualisiert sich korrekt
- [ ] Zurück-Button funktioniert wie erwartet
- [ ] Vor-Button funktioniert (nach Zurück-Navigation)

---

## 🚨 Kritische Probleme (sofort melden!)

Falls einer dieser Tests fehlschlägt, NICHT ins Main pushen:

1. ❌ Registrierung zeigt "Einladung erforderlich" trotz gültigem Code
2. ❌ Weiße leere Seite nach Login oder Onboarding
3. ❌ Weiße leere Seite bei Zurück-Navigation zu Dashboards
4. ❌ Nach Logout kann man mit Zurück-Button wieder angemeldet sein
5. ❌ Winner zeigt "Unbekannt" im Coach-View

---

## 📋 Code-Änderungen Zusammenfassung

### Dateien geändert:

```
public/js/spa-enhancer.js        - Core SPA-Logik (Query-Parameter, noInterceptPages)
public/js/register.js            - SPA-kompatible Initialisierung
public/js/index.js               - Hybrid Navigation (SPA + Full Reload)
public/js/onboarding.js          - Full Reload nach Onboarding
public/js/dashboard.js           - Logout-Sicherheit + Replace-Navigation
public/js/coach.js               - Logout-Sicherheit + Replace-Navigation
public/js/admin.js               - Logout-Sicherheit + Replace-Navigation
public/js/matches.js             - Winner-Anzeige Fix (alle Match-Modi)

public/*.html                    - SPA-Enhancer-Script hinzugefügt
```

### Wichtigste Fixes:

1. **Query-Parameter-Preservation**: URLs behalten Parameter bei SPA-Navigation
2. **Dashboard-Reload**: Role-Dashboards verwenden Full-Reload für korrekte State-Init
3. **Logout-Sicherheit**: `window.location.replace()` + SPA-Cache-Clearing
4. **Winner-Detection**: Flexible Logik für alle Match-Modi (Best of 3/5/7, Single)
5. **Event-Lifecycle**: SPA-kompatible Initialisierung (keine load-Events)

---

## 📝 Test-Ergebnisse

**Getestet von**: **\*\***\_**\*\***
**Datum**: **\*\***\_**\*\***
**Browser**: **\*\***\_**\*\***
**Alle Tests bestanden**: ☐ Ja ☐ Nein

### Test-Statistik:

- Anzahl Tests: 50+
- Kritische Tests: 11
- Erfolgreich: \_\_\_\_
- Fehlgeschlagen: \_\_\_\_

**Notizen/Probleme**:

```
(Hier eventuelle Probleme oder Anmerkungen eintragen)
```

---

## 🎯 Deployment-Hinweise

**Wichtig**: Diese Branch enthält nur Frontend-Änderungen!

```bash
# Nach Merge in Main:
firebase deploy --only hosting
```

Kein Deployment von:

- ❌ Firestore Rules (nicht geändert)
- ❌ Cloud Functions (nicht geändert)

---

**Erstellt:** 2025-11-13
**Branch:** `claude/convert-to-spa-011CV5tesKKnwW8kh7jNmjSh`
**Commits:** 6
