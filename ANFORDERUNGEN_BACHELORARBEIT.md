# Anforderungsanalyse - TTV Champions

**Bachelorarbeit:** Steigerung der Motivation in Tischtennisvereinen durch Gamification
**Projekt:** TTV Champions Web-Anwendung
**Datum:** November 2025

---

## Inhaltsverzeichnis

1. [Einleitung](#einleitung)
2. [Funktionale Anforderungen](#funktionale-anforderungen)
3. [Nicht-funktionale Anforderungen](#nicht-funktionale-anforderungen)
4. [Gamification-spezifische Anforderungen](#gamification-spezifische-anforderungen)
5. [Use Cases](#use-cases)
6. [Metriken und Erfolgskriterien](#metriken-und-erfolgskriterien)

---

## Einleitung

Diese Anforderungsanalyse beschreibt die funktionalen und nicht-funktionalen Anforderungen an die TTV Champions Webplattform. Das System soll durch den Einsatz von Gamification-Elementen die Motivation und das Engagement von Tischtennisspielern in Vereinen nachhaltig steigern.

**Zielgruppe:**
- Aktive Tischtennisspieler (primär)
- Trainer und Übungsleiter (sekundär)
- Vereinsadministratoren (tertiär)

**Problemstellung:**
Viele Tischtennisvereine kämpfen mit sinkender Trainingsmotivation, unregelmäßiger Teilnahme und fehlendem Engagement außerhalb von Wettkämpfen.

**Lösungsansatz:**
Eine webbasierte Plattform, die durch Gamification-Mechanismen (Punktesysteme, Ranglisten, Challenges, Erfolge) intrinsische und extrinsische Motivation fördert.

---

## Funktionale Anforderungen

### FA-1: Benutzerverwaltung

#### FA-1.1: Benutzerregistrierung und -authentifizierung
**Must-Have**
- **FA-1.1.1** Das System muss eine sichere Registrierung über E-Mail und Passwort ermöglichen
- **FA-1.1.2** Das System muss Firebase Authentication zur Benutzerauthentifizierung verwenden
- **FA-1.1.3** Das System muss drei Benutzerrollen unterscheiden: Spieler, Trainer, Admin
- **FA-1.1.4** Das System muss beim Onboarding-Prozess Benutzerdaten erfassen (Vor-/Nachname, Vereinszugehörigkeit)

#### FA-1.2: Profilverwaltung
**Must-Have**
- **FA-1.2.1** Spieler müssen ihr Profil bearbeiten können (Name, Avatar, etc.)
- **FA-1.2.2** Das System muss die Profil-Übersicht mit Statistiken anzeigen (Rang, XP, Season Points, Elo-Rating)
- **FA-1.2.3** Das System muss eine Match-Historie im Profil anzeigen

**Should-Have**
- **FA-1.2.4** Spieler sollten ihre Datenschutz-Einstellungen verwalten können
- **FA-1.2.5** Spieler sollten ihr Profil löschen können (DSGVO-konform)

---

### FA-2: Gamification-Kern-Mechaniken

#### FA-2.1: Punktesystem
**Must-Have**
- **FA-2.1.1** Das System muss zwei getrennte Punktesysteme implementieren:
  - **XP (Experience Points):** Permanente Fortschrittspunkte, die niemals zurückgesetzt werden
  - **Season Points:** Temporäre Punkte für 6-Wochen-Saisons

- **FA-2.1.2** Das System muss XP für folgende Aktivitäten vergeben:
  - Trainingsanwesenheit: 10 XP (Basis)
  - Anwesenheits-Streak (3+ Tage): +5 XP Bonus
  - Anwesenheits-Streak (5+ Tage): +10 XP Bonus
  - Match-Teilnahme: 10 XP
  - Match-Sieg: +25 XP Bonus
  - Übungen: 30 XP (Durchschnitt, variabel je nach Übung)
  - Challenges: 5-100 XP (je nach Schwierigkeit)

- **FA-2.1.3** Das System muss Season Points parallel zu XP vergeben (identische Werte)
- **FA-2.1.4** Das System muss Season Points alle 6 Wochen automatisch zurücksetzen
- **FA-2.1.5** Das System muss eine Punktehistorie für Spieler speichern

**Should-Have**
- **FA-2.1.6** Das System sollte eine grafische Darstellung des Punkteverlaufs anzeigen

#### FA-2.2: Rangsystem (Ranks)
**Must-Have**
- **FA-2.2.1** Das System muss basierend auf XP automatisch Ränge vergeben
- **FA-2.2.2** Das System muss folgende Rang-Hierarchie implementieren:
  1. Bronze (Einsteiger)
  2. Silber
  3. Gold
  4. Platin
  5. Diamant
  6. Master
  7. Grandmaster (Elite)

- **FA-2.2.3** Jeder Rang muss 3 Stufen haben (Bronze I, Bronze II, Bronze III)
- **FA-2.2.4** Das System muss den aktuellen Rang prominent im Profil anzeigen
- **FA-2.2.5** Das System muss visuelle Rang-Icons/Badges bereitstellen

**Should-Have**
- **FA-2.2.6** Das System sollte Rang-Aufstiegs-Benachrichtigungen senden
- **FA-2.2.7** Das System sollte eine Rang-Verteilungsstatistik anzeigen (wie viele Spieler in jedem Rang)

#### FA-2.3: Elo-Rating-System
**Must-Have**
- **FA-2.3.1** Das System muss ein Elo-Rating für jeden Spieler berechnen (Spielstärke-Indikator)
- **FA-2.3.2** Das System muss das Elo-Rating nach jedem gewerteten Match aktualisieren
- **FA-2.3.3** Das System muss Elo-Änderungen basierend auf dem Rating-Unterschied der Gegner berechnen

**Should-Have**
- **FA-2.3.4** Das System sollte eine Elo-Historie anzeigen (Graph)

#### FA-2.4: Leaderboards (Ranglisten)
**Must-Have**
- **FA-2.4.1** Das System muss drei Haupt-Ranglisten implementieren:
  1. **Fleiß-Rangliste (XP):** Sortiert nach permanenten Erfahrungspunkten
  2. **Season-Rangliste:** Sortiert nach aktuellen Saisonpunkten
  3. **Skill-Rangliste (Elo):** Sortiert nach Elo-Rating

- **FA-2.4.2** Das System muss eine Rang-Verteilungs-Ansicht bereitstellen
- **FA-2.4.3** Das System muss eine Doppel-Rangliste für Team-Paarungen anzeigen
- **FA-2.4.4** Das System muss zwischen Club-Rangliste (vereinsintern) und Global-Rangliste (vereinsübergreifend) umschalten können
- **FA-2.4.5** Das System muss die Top 15 Spieler standardmäßig anzeigen
- **FA-2.4.6** Das System muss eine "Alle anzeigen"-Funktion für vollständige Ranglisten bieten

**Should-Have**
- **FA-2.4.7** Das System sollte Subgruppen-Filter ermöglichen (z.B. nur Jugendliche)
- **FA-2.4.8** Das System sollte die eigene Position in der Rangliste hervorheben
- **FA-2.4.9** Das System sollte Auf-/Abstiegs-Indikatoren anzeigen (↑↓)

**Nice-to-Have**
- **FA-2.4.10** Das System könnte eine Hall of Fame für Season-Gewinner anzeigen

---

### FA-3: Challenges und Erfolge

#### FA-3.1: Challenge-System
**Must-Have**
- **FA-3.1.1** Trainer müssen Challenges erstellen können mit:
  - Titel und Beschreibung
  - Challenge-Typ (z.B. "10 Matches gewinnen", "100 Bälle trainieren")
  - Punktewert (5-100 Punkte)
  - Zielgruppe (Club/Subgruppe)

- **FA-3.1.2** Das System muss wiederholbare Challenges unterstützen (können mehrfach abgeschlossen werden)
- **FA-3.1.3** Das System muss Milestone-Challenges mit Zwischenzielen ermöglichen:
  - Beispiel: "10 Matches → 25 Punkte, 25 Matches → 50 Punkte, 50 Matches → 100 Punkte"

- **FA-3.1.4** Das System muss ein Partner-System für Challenges bieten:
  - Spieler können Partner nominieren
  - Partner erhält prozentualen Anteil der Punkte (konfigurierbar: 10-50%)

- **FA-3.1.5** Spieler müssen aktive Challenges in ihrem Dashboard sehen
- **FA-3.1.6** Spieler müssen Challenges als "abgeschlossen" markieren können
- **FA-3.1.7** Trainer müssen Challenge-Abschlüsse genehmigen/ablehnen können
- **FA-3.1.8** Das System muss Challenges nach 14 Tagen Inaktivität deaktivieren
- **FA-3.1.9** Trainer müssen Challenges reaktivieren können

**Should-Have**
- **FA-3.1.10** Das System sollte einen Fortschrittsbalken für Challenges anzeigen
- **FA-3.1.11** Das System sollte Benachrichtigungen bei neuen Challenges senden
- **FA-3.1.12** Das System sollte eine Challenge-Historie speichern

**Nice-to-Have**
- **FA-3.1.13** Das System könnte Community-Challenges anbieten (alle Spieler zusammen erreichen ein Ziel)
- **FA-3.1.14** Das System könnte zeitlich begrenzte Challenges unterstützen (z.B. "nur diese Woche")

#### FA-3.2: Achievements (Erfolge)
**Should-Have**
- **FA-3.2.1** Das System sollte automatische Erfolge für Meilensteine vergeben:
  - Erste Match-Teilnahme
  - 10/25/50/100 Matches gespielt
  - 10/25/50/100 Matches gewonnen
  - 7/30/100 Tage Anwesenheits-Streak
  - Rang-Aufstiege

- **FA-3.2.2** Achievements sollten im Profil angezeigt werden
- **FA-3.2.3** Das System sollte Achievement-Benachrichtigungen senden

---

### FA-4: Match-Verwaltung

#### FA-4.1: Match-Erstellung und -Freigabe
**Must-Have**
- **FA-4.1.1** Spieler müssen Einzel-Match-Anfragen erstellen können mit:
  - Gegner-Auswahl
  - Ergebnis (Best-of-3 oder Best-of-5)
  - Satz-Details

- **FA-4.1.2** Spieler müssen Doppel-Match-Anfragen erstellen können mit:
  - Partner-Auswahl
  - Gegner-Paar-Auswahl
  - Ergebnis

- **FA-4.1.3** Das System muss Match-Anfragen zur Trainer-Genehmigung weiterleiten
- **FA-4.1.4** Trainer müssen Match-Anfragen genehmigen oder ablehnen können
- **FA-4.1.5** Das System muss bei Genehmigung automatisch:
  - Punkte vergeben (XP + Season Points)
  - Elo-Rating aktualisieren
  - Match in Historie speichern

- **FA-4.1.6** Das System muss ungültige Matches erkennen (z.B. falsches Satzergebnis)
- **FA-4.1.7** Das System muss verhindern, dass Spieler gegen sich selbst spielen

**Should-Have**
- **FA-4.1.8** Das System sollte Match-Vorschläge basierend auf ähnlichem Elo-Rating anzeigen
- **FA-4.1.9** Spieler sollten Match-Anfragen vor Trainer-Review zurückziehen können
- **FA-4.1.10** Das System sollte Rematch-Funktion anbieten (gegen gleichen Gegner)

#### FA-4.2: Match-Historie
**Must-Have**
- **FA-4.2.1** Das System muss eine vollständige Match-Historie pro Spieler speichern
- **FA-4.2.2** Das System muss Match-Details anzeigen (Gegner, Ergebnis, Datum, Punkte erhalten)
- **FA-4.2.3** Das System muss Matches nach Datum sortieren (neueste zuerst)

**Should-Have**
- **FA-4.2.4** Das System sollte Filter für Match-Historie bieten (Zeitraum, Gegner, Gewonnen/Verloren)
- **FA-4.2.5** Das System sollte Head-to-Head-Statistik zwischen zwei Spielern anzeigen

---

### FA-5: Training und Anwesenheit

#### FA-5.1: Anwesenheits-Tracking
**Must-Have**
- **FA-5.1.1** Trainer müssen Trainingseinheiten planen können mit:
  - Datum und Uhrzeit
  - Subgruppe (z.B. Jugend, Erwachsene)
  - Kapazität (max. Teilnehmer)

- **FA-5.1.2** Spieler müssen sich für Trainingseinheiten an-/abmelden können
- **FA-5.1.3** Trainer müssen Anwesenheit während/nach Training bestätigen
- **FA-5.1.4** Das System muss Anwesenheits-Punkte (XP) automatisch vergeben
- **FA-5.1.5** Das System muss Anwesenheits-Streaks berechnen:
  - 3+ aufeinanderfolgende Tage: +5 XP Bonus
  - 5+ aufeinanderfolgende Tage: +10 XP Bonus

- **FA-5.1.6** Das System muss einen Trainingskalender anzeigen

**Should-Have**
- **FA-5.1.7** Das System sollte Wartelisten für überbuchte Trainings verwalten
- **FA-5.1.8** Das System sollte Anwesenheitsstatistiken anzeigen (Teilnahmerate pro Spieler)
- **FA-5.1.9** Das System sollte Excel-Export für Anwesenheitslisten ermöglichen

**Nice-to-Have**
- **FA-5.1.10** Das System könnte Push-Benachrichtigungen vor Trainings senden
- **FA-5.1.11** Das System könnte automatische Abmeldung bei Fernbleiben implementieren

#### FA-5.2: Übungen (Exercises)
**Should-Have**
- **FA-5.2.1** Das System sollte eine Übungsbibliothek bereitstellen
- **FA-5.2.2** Trainer sollten Übungen mit Punktewerten erstellen können
- **FA-5.2.3** Spieler sollten abgeschlossene Übungen eintragen können
- **FA-5.2.4** Trainer sollten Übungs-Abschlüsse genehmigen müssen
- **FA-5.2.5** Das System sollte XP für abgeschlossene Übungen vergeben

---

### FA-6: Statistiken und Dashboards

#### FA-6.1: Spieler-Dashboard
**Must-Have**
- **FA-6.1.1** Das Dashboard muss folgende Widgets anzeigen:
  - Aktuelle Rangliste (eigene Position + Top 5)
  - Eigene Statistiken (XP, Season Points, Elo, Rang)
  - Aktive Challenges
  - Nächste Trainingseinheiten
  - Letzte Matches
  - Season-Countdown (verbleibende Tage bis Saison-Reset)

- **FA-6.1.2** Das Dashboard muss anpassbar sein (Widgets ein-/ausblenden)
- **FA-6.1.3** Das Dashboard muss Echtzeit-Updates unterstützen (Firebase Realtime)

**Should-Have**
- **FA-6.1.4** Das Dashboard sollte Rival-Tracking anzeigen (Vergleich mit ausgewähltem Spieler)
- **FA-6.1.5** Das Dashboard sollte "Heute's Matches" hervorheben
- **FA-6.1.6** Das Dashboard sollte motivierende Nachrichten/Tipps anzeigen

#### FA-6.2: Trainer-Dashboard
**Must-Have**
- **FA-6.2.1** Trainer müssen ausstehende Match-Anfragen sehen und bearbeiten können
- **FA-6.2.2** Trainer müssen anstehende Trainings verwalten können
- **FA-6.2.3** Trainer müssen Spielerstatistiken einsehen können
- **FA-6.2.4** Trainer müssen Challenge-Verwaltung zugreifen können

**Should-Have**
- **FA-6.2.5** Trainer sollten Club-Statistiken sehen (durchschnittliche Teilnahme, aktivste Spieler, etc.)
- **FA-6.2.6** Trainer sollten Export-Funktionen für Reports nutzen können

#### FA-6.3: Admin-Dashboard
**Must-Have**
- **FA-6.3.1** Admins müssen neue Spieler einladen/registrieren können
- **FA-6.3.2** Admins müssen Benutzerrollen verwalten können (Spieler → Trainer upgrade)
- **FA-6.3.3** Admins müssen Club-Einstellungen konfigurieren können
- **FA-6.3.4** Admins müssen Subgruppen erstellen/verwalten können

**Should-Have**
- **FA-6.3.5** Admins sollten System-Logs einsehen können
- **FA-6.3.6** Admins sollten Backup-/Restore-Funktionen nutzen können

---

### FA-7: Benachrichtigungen

#### FA-7.1: Push-Benachrichtigungen
**Should-Have**
- **FA-7.1.1** Das System sollte Push-Benachrichtigungen für folgende Events senden:
  - Neue Challenge verfügbar
  - Match-Anfrage genehmigt/abgelehnt
  - Rang-Aufstieg
  - Anstehende Trainingseinheit (1 Stunde vorher)
  - Challenge abgeschlossen (Partner-Benachrichtigung)

- **FA-7.1.2** Spieler sollten Benachrichtigungs-Präferenzen verwalten können

#### FA-7.2: E-Mail-Benachrichtigungen
**Should-Have**
- **FA-7.2.1** Das System sollte E-Mail-Benachrichtigungen für wichtige Events senden:
  - Willkommens-E-Mail bei Registrierung
  - Wöchentliche Zusammenfassung (Fortschritt, neue Challenges)
  - Season-Ende-Report

**Nice-to-Have**
- **FA-7.2.2** Das System könnte Digest-E-Mails anbieten (zusammengefasst statt einzeln)

---

### FA-8: Social Features

#### FA-8.1: Rival-System
**Should-Have**
- **FA-8.1.1** Spieler sollten Rivalen auswählen können (andere Spieler zum Vergleich)
- **FA-8.1.2** Das Dashboard sollte Rival-Vergleich anzeigen (XP, Season Points, Match-Bilanz)

**Nice-to-Have**
- **FA-8.1.3** Das System könnte Rival-Challenges anbieten (direkter Wettkampf)

#### FA-8.2: Partner-System
**Must-Have (bereits implementiert)**
- **FA-8.2.1** Spieler können Partner für Challenges nominieren
- **FA-8.2.2** Partner erhalten konfigurierbaren Prozentsatz der Challenge-Punkte

---

### FA-9: Tutorial und Onboarding

#### FA-9.1: Interaktives Tutorial
**Should-Have**
- **FA-9.1.1** Das System sollte ein interaktives Tutorial für neue Spieler anbieten
- **FA-9.1.2** Das Tutorial sollte Hauptfeatures erklären (Matches erstellen, Challenges, Rangliste)
- **FA-9.1.3** Das Tutorial sollte überspringbar sein
- **FA-9.1.4** Das System sollte Tutorial-Fortschritt speichern

**Nice-to-Have**
- **FA-9.1.5** Das System könnte separate Tutorials für Trainer/Admins anbieten

---

## Nicht-funktionale Anforderungen

### NFA-1: Usability (Benutzerfreundlichkeit)

#### NFA-1.1: Bedienbarkeit
**Must-Have**
- **NFA-1.1.1** Die Hauptfunktionen müssen mit maximal 3 Klicks erreichbar sein
- **NFA-1.1.2** Die Benutzeroberfläche muss intuitiv ohne Anleitung bedienbar sein
- **NFA-1.1.3** Das System muss Toast-Benachrichtigungen für Benutzer-Feedback verwenden (statt Alerts)
- **NFA-1.1.4** Formulare müssen Client-seitige Validierung mit klaren Fehlermeldungen bieten
- **NFA-1.1.5** Die Navigation muss konsistent auf allen Seiten sein

**Should-Have**
- **NFA-1.1.6** Das System sollte Tooltips für komplexe Funktionen anbieten
- **NFA-1.1.7** Das System sollte Keyboard-Navigation unterstützen
- **NFA-1.1.8** Das System sollte Undo-Funktionen für kritische Aktionen anbieten

#### NFA-1.2: Responsive Design
**Must-Have**
- **NFA-1.2.1** Die Anwendung muss auf folgenden Geräten vollständig funktionsfähig sein:
  - Desktop (1920x1080 und höher)
  - Tablet (768x1024)
  - Smartphone (375x667 und höher)

- **NFA-1.2.2** Touch-Interaktionen müssen auf mobilen Geräten optimiert sein
- **NFA-1.2.3** Schriftgrößen müssen auf allen Geräten lesbar sein (min. 14px auf Mobile)

#### NFA-1.3: Barrierefreiheit
**Should-Have**
- **NFA-1.3.1** Das System sollte WCAG 2.1 Level AA erfüllen
- **NFA-1.3.2** Farbkontraste sollten mindestens 4.5:1 betragen
- **NFA-1.3.3** Alternative Texte für Bilder sollten vorhanden sein
- **NFA-1.3.4** Das System sollte mit Screen-Readern kompatibel sein

---

### NFA-2: Performance (Leistung)

#### NFA-2.1: Ladezeiten
**Must-Have**
- **NFA-2.1.1** Initiale Seitenladezeit muss unter 3 Sekunden liegen (3G-Verbindung)
- **NFA-2.1.2** Seitenwechsel im SPA-Modus müssen unter 500ms erfolgen
- **NFA-2.1.3** Leaderboard-Laden für 100+ Spieler muss unter 2 Sekunden erfolgen
- **NFA-2.1.4** Match-Erstellung muss innerhalb 1 Sekunde abgeschlossen sein

**Should-Have**
- **NFA-2.1.5** First Contentful Paint (FCP) sollte unter 1.5 Sekunden liegen
- **NFA-2.1.6** Time to Interactive (TTI) sollte unter 3.5 Sekunden liegen

#### NFA-2.2: Echtzeit-Updates
**Must-Have**
- **NFA-2.2.1** Leaderboard-Updates müssen in Echtzeit erfolgen (Firebase Realtime Listeners)
- **NFA-2.2.2** Dashboard-Widgets müssen sich automatisch aktualisieren
- **NFA-2.2.3** Match-Anfragen-Status muss in Echtzeit aktualisiert werden

#### NFA-2.3: Caching und Optimierung
**Should-Have**
- **NFA-2.3.1** Statische Assets sollten im Browser gecacht werden (1 Jahr)
- **NFA-2.3.2** Das System sollte SPA-Page-Caching nutzen (bereits implementiert)
- **NFA-2.3.3** Bilder sollten lazy-loaded werden
- **NFA-2.3.4** Firebase Firestore sollte Offline-Persistence nutzen

---

### NFA-3: Skalierbarkeit

#### NFA-3.1: Benutzerlast
**Must-Have**
- **NFA-3.1.1** Das System muss mindestens 200 aktive Benutzer gleichzeitig unterstützen
- **NFA-3.1.2** Das System muss mindestens 500 registrierte Benutzer verwalten können
- **NFA-3.1.3** Die Datenbank muss mindestens 10.000 Matches speichern können

**Should-Have**
- **NFA-3.1.4** Das System sollte auf 1.000+ Benutzer skalierbar sein (Firebase Spark → Blaze Plan)

#### NFA-3.2: Datenbankdesign
**Must-Have**
- **NFA-3.2.1** Firestore Queries müssen indexiert sein für Performance
- **NFA-3.2.2** Leaderboard-Queries müssen paginiert sein (nicht alle Daten auf einmal laden)
- **NFA-3.2.3** Das System muss denormalisierte Daten für häufige Queries nutzen (z.B. Player Stats im User-Dokument)

---

### NFA-4: Sicherheit

#### NFA-4.1: Authentifizierung und Autorisierung
**Must-Have**
- **NFA-4.1.1** Das System muss Firebase Authentication verwenden
- **NFA-4.1.2** Passwörter müssen mindestens 8 Zeichen lang sein
- **NFA-4.1.3** Sessions müssen nach 30 Tagen Inaktivität ablaufen
- **NFA-4.1.4** Firestore Security Rules müssen rollenbasierte Zugriffskontrolle implementieren:
  - Spieler können nur eigene Daten bearbeiten
  - Trainer können Matches genehmigen und Challenges verwalten
  - Admins haben vollen Zugriff auf Club-Daten

**Should-Have**
- **NFA-4.1.5** Das System sollte 2-Faktor-Authentifizierung unterstützen
- **NFA-4.1.6** Das System sollte Passwort-Zurücksetzen via E-Mail ermöglichen

#### NFA-4.2: Datensicherheit
**Must-Have**
- **NFA-4.2.1** Alle Verbindungen müssen HTTPS verwenden
- **NFA-4.2.2** Sensible Daten (E-Mail) dürfen nicht in Logs erscheinen
- **NFA-4.2.3** Firebase Security Rules müssen verhindern, dass Benutzer fremde Daten lesen/schreiben

**Should-Have**
- **NFA-4.2.4** Das System sollte Rate-Limiting für API-Calls implementieren (gegen Missbrauch)
- **NFA-4.2.5** Das System sollte verdächtige Aktivitäten loggen (z.B. viele fehlgeschlagene Logins)

#### NFA-4.3: Input-Validierung
**Must-Have**
- **NFA-4.3.1** Alle Benutzereingaben müssen validiert werden (Client + Server)
- **NFA-4.3.2** Das System muss gegen XSS-Angriffe geschützt sein
- **NFA-4.3.3** Das System muss gegen SQL-Injection geschützt sein (nicht relevant bei NoSQL, aber API-Injection)

---

### NFA-5: Zuverlässigkeit (Reliability)

#### NFA-5.1: Verfügbarkeit
**Must-Have**
- **NFA-5.1.1** Das System muss eine Verfügbarkeit von mindestens 99% haben
- **NFA-5.1.2** Geplante Wartungen müssen außerhalb der Stoßzeiten (18-22 Uhr) erfolgen
- **NFA-5.1.3** Das System muss einen Offline-Indicator anzeigen bei fehlender Internetverbindung

**Should-Have**
- **NFA-5.1.4** Das System sollte Offline-Funktionalität für Lese-Zugriffe bieten (Firebase Offline Persistence)

#### NFA-5.2: Fehlerbehandlung
**Must-Have**
- **NFA-5.2.1** Fehler müssen nutzerfreundlich angezeigt werden (keine technischen Fehlermeldungen)
- **NFA-5.2.2** Kritische Fehler müssen geloggt werden (Firebase Crashlytics oder ähnlich)
- **NFA-5.2.3** Das System muss graceful degradation bieten (Fallback bei Fehlern)

**Should-Have**
- **NFA-5.2.4** Das System sollte automatische Error-Reporting implementieren

#### NFA-5.3: Datenintegrität
**Must-Have**
- **NFA-5.3.1** Firestore Transactions müssen für kritische Operationen verwendet werden (z.B. Punktevergabe)
- **NFA-5.3.2** Daten müssen konsistent sein (kein Datenverlust bei Race Conditions)
- **NFA-5.3.3** Das System muss Timestamps für alle Datensätze speichern (createdAt, updatedAt)

---

### NFA-6: Wartbarkeit (Maintainability)

#### NFA-6.1: Code-Qualität
**Must-Have**
- **NFA-6.1.1** Code muss modular strukturiert sein (ES6 Modules)
- **NFA-6.1.2** Funktionen müssen klar benannt sein (selbst-dokumentierend)
- **NFA-6.1.3** Komplexe Logik muss kommentiert sein

**Should-Have**
- **NFA-6.1.4** Code sollte JSDoc-Kommentare für Funktionen enthalten
- **NFA-6.1.5** Code sollte einem Style Guide folgen (z.B. Prettier-Formatierung)
- **NFA-6.1.6** Code sollte Linting-Regeln erfüllen (ESLint)

#### NFA-6.2: Testbarkeit
**Should-Have**
- **NFA-6.2.1** Kritische Funktionen sollten Unit-Tests haben (Vitest)
- **NFA-6.2.2** Das System sollte eine Test-Coverage von mindestens 60% erreichen
- **NFA-6.2.3** Integration-Tests sollten für Haupt-Workflows existieren

**Nice-to-Have**
- **NFA-6.2.4** E2E-Tests könnten für kritische User-Journeys implementiert werden

#### NFA-6.3: Dokumentation
**Must-Have**
- **NFA-6.3.1** README-Dateien müssen Setup-Anleitung enthalten
- **NFA-6.3.2** Deployment-Prozess muss dokumentiert sein
- **NFA-6.3.3** API-Endpoints (Firebase Functions) müssen dokumentiert sein

**Should-Have**
- **NFA-6.3.4** Architektur-Diagramme sollten vorhanden sein
- **NFA-6.3.5** Firestore-Datenmodell sollte dokumentiert sein

#### NFA-6.4: Versionskontrolle
**Must-Have**
- **NFA-6.4.1** Git muss für Versionskontrolle verwendet werden
- **NFA-6.4.2** Commits müssen aussagekräftige Nachrichten haben
- **NFA-6.4.3** Branches müssen für Features/Fixes verwendet werden

**Should-Have**
- **NFA-6.4.4** Semantic Versioning sollte für Releases verwendet werden

---

### NFA-7: Kompatibilität

#### NFA-7.1: Browser-Unterstützung
**Must-Have**
- **NFA-7.1.1** Das System muss folgende Browser unterstützen:
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

- **NFA-7.1.2** ES6+ Features müssen verwendet werden (keine IE11-Unterstützung nötig)

**Should-Have**
- **NFA-7.1.3** Das System sollte Progressive Web App (PWA) Features bieten

#### NFA-7.2: Geräte-Kompatibilität
**Must-Have**
- **NFA-7.2.1** Touch-Events müssen auf mobilen Geräten funktionieren
- **NFA-7.2.2** Die Anwendung muss auf iOS 13+ und Android 8+ laufen

---

### NFA-8: Datenschutz (Privacy)

#### NFA-8.1: DSGVO-Konformität
**Must-Have**
- **NFA-8.1.1** Das System muss DSGVO-konform sein
- **NFA-8.1.2** Benutzer müssen Datenschutzerklärung akzeptieren
- **NFA-8.1.3** Benutzer müssen ihre Daten einsehen können (Auskunftsrecht)
- **NFA-8.1.4** Benutzer müssen ihre Daten löschen können (Recht auf Vergessenwerden)
- **NFA-8.1.5** Datenerhebung muss auf das Notwendigste beschränkt sein

**Should-Have**
- **NFA-8.1.6** Das System sollte Cookie-Banner implementieren (falls Cookies verwendet werden)
- **NFA-8.1.7** Das System sollte Daten-Export ermöglichen (Datenportabilität)

#### NFA-8.2: Datenminimierung
**Must-Have**
- **NFA-8.2.1** Nur notwendige Daten dürfen erhoben werden
- **NFA-8.2.2** Spieler-Profile dürfen keine sensiblen Daten enthalten (keine Geburtsdaten, Adressen, etc.)

---

### NFA-9: Betrieb (Operations)

#### NFA-9.1: Deployment
**Must-Have**
- **NFA-9.1.1** Das System muss über Firebase Hosting deployed werden
- **NFA-9.1.2** Deployments müssen über CI/CD automatisiert sein (GitHub Actions)
- **NFA-9.1.3** Rollback-Funktion muss verfügbar sein

**Should-Have**
- **NFA-9.1.4** Staging-Environment sollte für Tests vor Production-Deployment existieren

#### NFA-9.2: Monitoring
**Should-Have**
- **NFA-9.2.1** Firebase Analytics sollte für Nutzungsstatistiken verwendet werden
- **NFA-9.2.2** Performance-Metriken sollten getrackt werden (Core Web Vitals)
- **NFA-9.2.3** Error-Logs sollten zentral gesammelt werden

**Nice-to-Have**
- **NFA-9.2.4** Uptime-Monitoring könnte implementiert werden (z.B. UptimeRobot)

---

## Gamification-spezifische Anforderungen

### GFA-1: Motivationspsychologie

#### GFA-1.1: Intrinsische Motivation
**Must-Have**
- **GFA-1.1.1** Das System muss Autonomie fördern:
  - Spieler wählen selbst, gegen wen sie spielen
  - Spieler wählen selbst, welche Challenges sie annehmen
  - Spieler können eigene Ziele setzen (Rival-Tracking)

- **GFA-1.1.2** Das System muss Kompetenzerleben ermöglichen:
  - Klare Fortschrittsanzeige (XP-Balken, Rang-Aufstieg)
  - Erreichbare Zwischen-Ziele (Milestones)
  - Skill-basiertes Matching (ähnliches Elo-Rating)

- **GFA-1.1.3** Das System muss soziale Eingebundenheit fördern:
  - Leaderboards für sozialen Vergleich
  - Partner-System für gemeinsame Ziele
  - Trainer-Feedback (Match-Genehmigung)

#### GFA-1.2: Extrinsische Motivation
**Must-Have**
- **GFA-1.2.1** Das System muss klare Belohnungen bieten:
  - Punkte (XP, Season Points)
  - Ränge (Bronze → Grandmaster)
  - Leaderboard-Platzierungen

- **GFA-1.2.2** Belohnungen müssen unmittelbar erfolgen:
  - Sofortige XP-Vergabe nach Match-Genehmigung
  - Toast-Benachrichtigungen bei Punkten/Rang-Aufstiegen

- **GFA-1.2.3** Belohnungen müssen variabel sein:
  - Mehr Punkte für schwierigere Challenges
  - Elo-basierte Match-Punkte (Sieg gegen stärkeren Gegner = mehr Elo)

---

### GFA-2: Spielmechaniken

#### GFA-2.1: Progression-Systeme
**Must-Have**
- **GFA-2.1.1** Das System muss mehrere Progression-Pfade bieten:
  - **XP-Progression:** Permanenter Fortschritt (kein Reset)
  - **Season-Progression:** Temporärer Wettbewerb (6 Wochen)
  - **Elo-Progression:** Skill-basierter Fortschritt
  - **Rang-Progression:** Status-Symbol

- **GFA-2.1.2** Progression muss sichtbar und nachvollziehbar sein:
  - XP bis zum nächsten Rang anzeigen
  - Season Points im Countdown-Kontext zeigen
  - Elo-Änderungen nach jedem Match anzeigen

#### GFA-2.2: Feedback-Loops
**Must-Have**
- **GFA-2.2.1** Das System muss kurze Feedback-Loops bieten:
  - Match erstellen → Trainer-Genehmigung → Punkte erhalten (innerhalb Stunden)
  - Training besuchen → Anwesenheit bestätigen → XP erhalten (sofort)

- **GFA-2.2.2** Das System muss lange Feedback-Loops bieten:
  - Season-Wettbewerb (6 Wochen)
  - Rang-Aufstieg (mehrere Wochen/Monate)

#### GFA-2.3: Flow-Zustand
**Should-Have**
- **GFA-2.3.1** Das System sollte Herausforderungen an Spielerstärke anpassen:
  - Match-Vorschläge basierend auf ähnlichem Elo
  - Challenges mit variablen Schwierigkeitsgraden

- **GFA-2.3.2** Das System sollte weder Überforderung noch Unterforderung zulassen:
  - Einsteiger-Tutorial für neue Spieler
  - Grandmaster-Challenges für Fortgeschrittene

---

### GFA-3: Engagement-Mechanismen

#### GFA-3.1: Retention (Nutzerbindung)
**Must-Have**
- **GFA-3.1.1** Das System muss tägliche Anreize bieten:
  - Anwesenheits-Streaks mit Boni
  - Tägliche Challenges
  - Leaderboard-Updates in Echtzeit

- **GFA-3.1.2** Das System muss wöchentliche Anreize bieten:
  - Wöchentliche Challenge-Rotation
  - Trainingsplan-Updates

**Should-Have**
- **GFA-3.1.3** Das System sollte monatliche/saisonale Anreize bieten:
  - Season-Resets alle 6 Wochen
  - Hall of Fame für Season-Gewinner
  - Monatliche Top-Performer-Auszeichnungen

#### GFA-3.2: Re-Engagement
**Should-Have**
- **GFA-3.2.1** Das System sollte inaktive Spieler reaktivieren:
  - E-Mail-Benachrichtigungen bei neuen Challenges
  - Push-Benachrichtigungen bei Rival-Aktivität

**Nice-to-Have**
- **GFA-3.2.2** Das System könnte Comeback-Boni bieten (XP-Boost nach 7+ Tagen Inaktivität)

---

### GFA-4: Soziale Dynamiken

#### GFA-4.1: Wettbewerb (Competition)
**Must-Have**
- **GFA-4.1.1** Das System muss Wettbewerb fördern:
  - Leaderboards mit Rankings
  - Season-Wettbewerb (Wer wird Season-Champion?)
  - Elo-basiertes Matching (Spieler wollen Elo steigern)

**Should-Have**
- **GFA-4.1.2** Wettbewerb sollte fair sein:
  - Subgruppen-Filter (Jugend vs. Jugend, nicht vs. Erwachsene)
  - Elo-System verhindert unfaire Matches

#### GFA-4.2: Kooperation (Cooperation)
**Must-Have**
- **GFA-4.2.1** Das System muss Kooperation fördern:
  - Partner-System für Challenges (gemeinsame Punkte)
  - Doppel-Matches (Team-Play)

**Nice-to-Have**
- **GFA-4.2.2** Community-Challenges könnten implementiert werden (ganzer Club arbeitet an einem Ziel)

#### GFA-4.3: Sozialer Vergleich
**Must-Have**
- **GFA-4.3.1** Das System muss sozialen Vergleich ermöglichen:
  - Leaderboards zeigen relative Position
  - Rival-Tracking für direkten Vergleich
  - Elo-Unterschied zu anderen Spielern

**Should-Have**
- **GFA-4.3.2** Sozialer Vergleich sollte motivierend sein (nicht demotivierend):
  - "Nächste 3 Spieler" anzeigen (erreichbare Ziele)
  - Eigene Position hervorheben
  - Aufstiegschancen verdeutlichen

---

### GFA-5: Balancing und Fairness

#### GFA-5.1: Punktebalancing
**Must-Have**
- **GFA-5.1.1** XP-Werte müssen ausgewogen sein:
  - Anwesenheit (10 XP) sollte niedrig-effort/hohe-Frequenz sein
  - Matches (10-35 XP) sollten mittel-effort/mittlere-Frequenz sein
  - Challenges (5-100 XP) sollten hoch-effort/niedrige-Frequenz sein

- **GFA-5.1.2** Das System muss "Grinden" verhindern:
  - Kein XP-Farming durch Endlos-Matches gegen schwache Gegner
  - Elo-System belohnt ausgeglichene Matches mehr

**Should-Have**
- **GFA-5.1.3** Das System sollte regelmäßig neu balanciert werden:
  - Punktewerte anhand Nutzungsdaten anpassen
  - Community-Feedback einbeziehen

#### GFA-5.2: Rang-Balance
**Must-Have**
- **GFA-5.2.1** Ränge müssen erreichbar aber herausfordernd sein:
  - Bronze-Silber: Schnell erreichbar (Einsteiger-Motivation)
  - Gold-Platin: Mittlere Progression
  - Diamant-Master-Grandmaster: Langzeit-Ziele (Elite-Status)

**Should-Have**
- **GFA-5.2.2** Rang-Verteilung sollte einer Pyramide entsprechen:
  - Viele Spieler in Bronze-Gold
  - Wenige Spieler in Diamant-Master
  - Sehr wenige Grandmaster (Exklusivität)

---

## Use Cases

### UC-1: Spieler erstellt Match-Anfrage

**Primärer Akteur:** Spieler
**Vorbedingungen:**
- Spieler ist angemeldet
- Spieler hat mindestens ein Match gespielt (oder ist im Onboarding)

**Hauptszenario:**
1. Spieler navigiert zum Dashboard
2. Spieler klickt auf "Match eintragen"
3. System zeigt Match-Formular
4. Spieler wählt Gegner aus Dropdown (sortiert nach ähnlichem Elo)
5. Spieler gibt Ergebnis ein (Best-of-3 oder Best-of-5)
6. Spieler gibt Satz-Details ein (z.B. 11:9, 11:7, 9:11)
7. System validiert Eingaben (korrektes Format, kein Spiel gegen sich selbst)
8. Spieler klickt "Match einreichen"
9. System erstellt Match-Anfrage mit Status "pending"
10. System sendet Benachrichtigung an Trainer
11. System zeigt Toast: "Match-Anfrage erfolgreich eingereicht"

**Postconditions:**
- Match-Anfrage ist in Firestore gespeichert
- Trainer sieht Anfrage im Dashboard
- Spieler sieht Anfrage mit Status "Warte auf Freigabe"

**Alternative Szenarien:**
- **3a:** Gegner nicht in Liste → Spieler kann Admin kontaktieren
- **7a:** Validierung fehlgeschlagen → System zeigt Fehlermeldung
- **9a:** Network Error → System zeigt Retry-Option

**Relevante Anforderungen:** FA-4.1.1, FA-4.1.3, FA-4.1.6, FA-4.1.7, NFA-2.1.4

---

### UC-2: Trainer genehmigt Match-Anfrage

**Primärer Akteur:** Trainer
**Vorbedingungen:**
- Trainer ist angemeldet
- Mindestens eine Match-Anfrage existiert mit Status "pending"

**Hauptszenario:**
1. Trainer öffnet Trainer-Dashboard
2. System zeigt Liste der ausstehenden Match-Anfragen
3. Trainer klickt auf Match-Details
4. System zeigt vollständige Match-Informationen (Spieler, Gegner, Ergebnis, Sätze)
5. Trainer prüft Plausibilität
6. Trainer klickt "Genehmigen"
7. System aktualisiert Match-Status auf "approved"
8. System vergibt XP und Season Points an beide Spieler
9. System aktualisiert Elo-Rating beider Spieler
10. System speichert Match in Historie
11. System sendet Push-Benachrichtigung an beide Spieler
12. System zeigt Toast: "Match erfolgreich genehmigt"

**Postconditions:**
- Match ist genehmigt
- Spieler haben Punkte erhalten
- Elo-Ratings sind aktualisiert
- Leaderboards sind aktualisiert

**Alternative Szenarien:**
- **6a:** Trainer klickt "Ablehnen" → System markiert Match als "rejected", sendet Benachrichtigung an Spieler
- **6b:** Match-Daten sind unplausibel (z.B. 15:13 statt 11:9) → Trainer kann Korrektur anfordern

**Relevante Anforderungen:** FA-4.1.4, FA-4.1.5, FA-2.1.2, NFA-2.2.1

---

### UC-3: Spieler schließt Challenge ab

**Primärer Akteur:** Spieler
**Vorbedingungen:**
- Spieler ist angemeldet
- Mindestens eine aktive Challenge existiert

**Hauptszenario:**
1. Spieler sieht aktive Challenges im Dashboard
2. Spieler klickt auf Challenge "10 Matches gewinnen"
3. System zeigt Challenge-Details und Fortschritt (7/10 Matches gewonnen)
4. Spieler spielt und gewinnt 3 weitere Matches (über UC-1, UC-2)
5. System erkennt automatisch Challenge-Erfüllung (10/10)
6. System markiert Challenge als "bereit zum Einreichen"
7. Spieler klickt "Challenge abschließen"
8. System erstellt Challenge-Abschluss mit Status "pending approval"
9. System sendet Benachrichtigung an Trainer
10. System zeigt Toast: "Challenge zur Freigabe eingereicht"

**Trainer-Genehmigung:**
11. Trainer genehmigt Challenge
12. System vergibt Challenge-Punkte (50 XP + 50 Season Points)
13. System markiert Challenge als "completed"
14. System sendet Push-Benachrichtigung an Spieler: "Challenge abgeschlossen! +50 XP"
15. Falls wiederholbar: System reaktiviert Challenge (Fortschritt auf 0 zurücksetzen)

**Postconditions:**
- Challenge ist abgeschlossen
- Spieler hat Punkte erhalten
- Falls Partner nominiert: Partner hat anteilige Punkte erhalten
- Leaderboards sind aktualisiert

**Alternative Szenarien:**
- **7a:** Challenge hat Milestones → Spieler kann Teil-Abschluss einreichen (z.B. 10/50 Matches für 25 Punkte)
- **11a:** Trainer lehnt ab → Spieler erhält Benachrichtigung mit Begründung

**Relevante Anforderungen:** FA-3.1.5, FA-3.1.6, FA-3.1.7, GFA-2.2.1

---

### UC-4: Spieler meldet sich für Training an

**Primärer Akteur:** Spieler
**Vorbedingungen:**
- Spieler ist angemeldet
- Trainer hat Trainingseinheiten geplant

**Hauptszenario:**
1. Spieler öffnet Dashboard
2. System zeigt Kalender mit nächsten Trainingseinheiten
3. Spieler klickt auf Training "Dienstag 18:00 - Jugend"
4. System zeigt Training-Details (Trainer, Kapazität: 8/12, Teilnehmer-Liste)
5. Spieler klickt "Anmelden"
6. System fügt Spieler zur Teilnehmerliste hinzu
7. System zeigt Toast: "Erfolgreich angemeldet"
8. System sendet Erinnerungs-Push-Benachrichtigung 1 Stunde vor Training

**Training-Tag:**
9. Spieler nimmt am Training teil
10. Trainer bestätigt Anwesenheit im System
11. System vergibt Anwesenheits-XP (10 XP Basis)
12. System prüft Anwesenheits-Streak:
    - Falls 3+ Tage: +5 XP Bonus
    - Falls 5+ Tage: +10 XP Bonus (insgesamt)
13. System aktualisiert Streak-Counter
14. System zeigt Toast: "Anwesenheit bestätigt! +15 XP (Streak-Bonus)"

**Postconditions:**
- Spieler ist für Training angemeldet
- Anwesenheit ist bestätigt
- XP ist vergeben
- Streak ist aktualisiert

**Alternative Szenarien:**
- **5a:** Training ist voll (12/12) → System fügt Spieler auf Warteliste
- **5b:** Spieler kann nicht teilnehmen → Spieler klickt "Abmelden"

**Relevante Anforderungen:** FA-5.1.1, FA-5.1.2, FA-5.1.3, FA-5.1.5, GFA-3.1.1

---

### UC-5: Trainer erstellt neue Challenge

**Primärer Akteur:** Trainer
**Vorbedingungen:**
- Trainer ist angemeldet
- Trainer hat Berechtigung, Challenges zu erstellen

**Hauptszenario:**
1. Trainer öffnet Trainer-Dashboard
2. Trainer navigiert zu "Challenges verwalten"
3. Trainer klickt "Neue Challenge erstellen"
4. System zeigt Challenge-Formular
5. Trainer füllt Formular aus:
   - Titel: "Sommer-Challenge: 50 Matches spielen"
   - Typ: "Match-Teilnahme"
   - Beschreibung: "Spiele 50 Matches bis Ende August"
   - Zielgruppe: "Alle Spieler (Club)"
   - Wiederholbar: Nein
6. Trainer aktiviert Milestones:
   - 10 Matches → 20 Punkte
   - 25 Matches → 50 Punkte
   - 50 Matches → 100 Punkte
7. Trainer aktiviert Partner-System (30% Anteil)
8. Trainer klickt "Challenge erstellen"
9. System validiert Eingaben
10. System speichert Challenge in Firestore
11. System sendet Push-Benachrichtigung an alle Spieler: "Neue Challenge verfügbar!"
12. System zeigt Toast: "Challenge erfolgreich erstellt"

**Postconditions:**
- Challenge ist aktiv
- Alle Spieler sehen Challenge im Dashboard
- Challenge erscheint in Statistiken

**Alternative Szenarien:**
- **9a:** Validierung fehlgeschlagen (z.B. keine Milestones angegeben) → System zeigt Fehlermeldung
- **6a:** Trainer nutzt einfaches Punktesystem (kein Milestone) → Trainer gibt fixe Punkte ein (z.B. 50)

**Relevante Anforderungen:** FA-3.1.1, FA-3.1.2, FA-3.1.3, FA-3.1.4

---

## Metriken und Erfolgskriterien

### Quantitative Metriken

#### Aktivitäts-Metriken
- **Daily Active Users (DAU):** Anzahl täglicher aktiver Benutzer
  - **Ziel:** Steigerung um 30% innerhalb 3 Monate nach Launch

- **Weekly Active Users (WAU):** Anzahl wöchentlicher aktiver Benutzer
  - **Ziel:** Mindestens 70% der registrierten Benutzer pro Woche

- **Retention Rate:** Prozentsatz der Benutzer, die nach X Tagen zurückkehren
  - **Ziel:** 60% nach 7 Tagen, 40% nach 30 Tagen

- **Session Length:** Durchschnittliche Nutzungsdauer pro Session
  - **Ziel:** Mindestens 5 Minuten pro Session

- **Sessions per User:** Anzahl Sessions pro Benutzer pro Woche
  - **Ziel:** Mindestens 3 Sessions pro Woche

#### Gamification-Metriken
- **Match-Frequenz:** Durchschnittliche Anzahl Matches pro Spieler pro Woche
  - **Baseline:** Vor System-Einführung messen
  - **Ziel:** Steigerung um 50% innerhalb 6 Monate

- **Trainings-Teilnahme:** Durchschnittliche Anwesenheitsrate
  - **Baseline:** Vor System-Einführung messen
  - **Ziel:** Steigerung um 25% innerhalb 3 Monate

- **Challenge-Completion-Rate:** Prozentsatz abgeschlossener Challenges
  - **Ziel:** Mindestens 40% aller gestarteten Challenges werden abgeschlossen

- **Streak-Engagement:** Prozentsatz der Spieler mit aktiven Streaks (3+ Tage)
  - **Ziel:** Mindestens 30% der aktiven Spieler

- **Leaderboard-Interaction:** Anzahl Leaderboard-Aufrufe pro Woche
  - **Ziel:** Jeder Spieler schaut mindestens 2x pro Woche auf Leaderboard

#### System-Metriken
- **Page Load Time:** Durchschnittliche Ladezeit der Startseite
  - **Ziel:** < 2 Sekunden (50. Perzentil), < 4 Sekunden (95. Perzentil)

- **Error Rate:** Prozentsatz fehlgeschlagener Requests
  - **Ziel:** < 1% Error Rate

- **Uptime:** Verfügbarkeit des Systems
  - **Ziel:** 99%+ Uptime

---

### Qualitative Metriken

#### Motivations-Indikatoren
- **User Satisfaction Score (CSAT):** Zufriedenheit mit der Plattform
  - **Messung:** Umfrage nach 2 Wochen Nutzung (1-5 Sterne)
  - **Ziel:** Durchschnitt 4.0+

- **Net Promoter Score (NPS):** Weiterempfehlungsbereitschaft
  - **Messung:** "Würdest du TTV Champions Freunden empfehlen?" (0-10)
  - **Ziel:** NPS > 30

- **Feature-Zufriedenheit:** Bewertung einzelner Gamification-Features
  - **Messung:** "Wie motivierend findest du Leaderboards/Challenges/Streaks?" (1-5)
  - **Ziel:** Durchschnitt 4.0+ pro Feature

#### Motivations-Interviews (Qualitativ)
- **Motivation-Steigerung:** "Hat die App deine Trainingsmotivation gesteigert?"
  - **Messung:** Semi-strukturierte Interviews mit 10-15 Spielern
  - **Ziel:** Mindestens 70% berichten von Motivationssteigerung

- **Lieblings-Feature:** "Welches Gamification-Element motiviert dich am meisten?"
  - **Auswertung:** Ranking der Features nach Nennung

- **Verbesserungsvorschläge:** Offenes Feedback zu Schwachstellen
  - **Nutzung:** Für iterative Verbesserungen

---

### Vergleich: Vor/Nach System-Einführung

| Metrik | Vor System | Nach 3 Monaten (Ziel) | Nach 6 Monaten (Ziel) |
|--------|------------|------------------------|------------------------|
| Durchschnittliche Trainings-Teilnahme/Woche | 60% | 75% (+25%) | 80% (+33%) |
| Durchschnittliche Matches/Spieler/Woche | 2.0 | 2.5 (+25%) | 3.0 (+50%) |
| Spieler mit 0 Matches/Monat | 30% | 15% (-50%) | 10% (-67%) |
| Neue Spieler-Retention (30 Tage) | 20% | 30% (+50%) | 40% (+100%) |
| Vereins-Engagement-Score (subjektiv, 1-10) | 5.0 | 6.5 | 7.5 |

---

### A/B-Testing-Möglichkeiten

**Für zukünftige Optimierungen:**

1. **XP-Werte-Balancing:**
   - Gruppe A: Anwesenheit 10 XP, Match 25 XP
   - Gruppe B: Anwesenheit 15 XP, Match 20 XP
   - **Messen:** Welche Gruppe hat höhere Trainings-Teilnahme vs. Match-Frequenz?

2. **Leaderboard-Anzeige:**
   - Gruppe A: Zeige nur Top 10
   - Gruppe B: Zeige "Deine Umgebung" (3 vor dir, 3 nach dir)
   - **Messen:** Welche Gruppe hat höheres Engagement?

3. **Challenge-Notification-Timing:**
   - Gruppe A: Benachrichtigung sofort bei neuer Challenge
   - Gruppe B: Benachrichtigung am Abend vor Training
   - **Messen:** Welche Gruppe hat höhere Challenge-Completion-Rate?

4. **Season-Länge:**
   - Gruppe A: 6-Wochen-Saisons
   - Gruppe B: 4-Wochen-Saisons
   - **Messen:** Welche Gruppe hat höhere Retention über 6 Monate?

---

## Anhang

### Glossar

- **XP (Experience Points):** Permanente Fortschrittspunkte, die niemals zurückgesetzt werden
- **Season Points:** Temporäre Punkte für 6-Wochen-Wettbewerb, werden nach Saison-Ende zurückgesetzt
- **Elo-Rating:** Skill-basiertes Ranking-System für Spielstärke
- **Rang (Rank):** Status-Level basierend auf XP (Bronze → Grandmaster)
- **Streak:** Serie von aufeinanderfolgenden Trainingsbesuchen
- **Challenge:** Zeitlich unbegrenzte Aufgabe mit Punktebelohnung
- **Milestone:** Zwischenziel innerhalb einer Challenge
- **Match-Request:** Spieler-erstellte Anfrage zur Erfassung eines gespielten Matches
- **Subgruppe:** Untergruppe innerhalb eines Clubs (z.B. Jugend, Erwachsene)
- **Partner-System:** Mechanik, bei der nominierte Partner anteilige Challenge-Punkte erhalten

---

### Literaturverweise (Beispiele für Bachelorarbeit)

1. **Deterding, S. et al. (2011):** "From Game Design Elements to Gamefulness: Defining Gamification"
2. **Hamari, J. & Koivisto, J. (2015):** "Why do people use gamification services?"
3. **Ryan, R. M. & Deci, E. L. (2000):** "Self-Determination Theory and the Facilitation of Intrinsic Motivation"
4. **Werbach, K. & Hunter, D. (2012):** "For the Win: How Game Thinking Can Revolutionize Your Business"
5. **Zichermann, G. & Cunningham, C. (2011):** "Gamification by Design"

---

### Technologie-Stack

**Frontend:**
- HTML5, CSS3 (Tailwind CSS)
- JavaScript (ES6+ Modules)
- Firebase SDK 9.x

**Backend:**
- Firebase Firestore (NoSQL Database)
- Firebase Authentication
- Firebase Cloud Functions (Serverless)
- Firebase Hosting
- Firebase Cloud Messaging (Push Notifications)

**Development:**
- Git (Versionskontrolle)
- Vitest (Unit Testing)
- Prettier (Code Formatting)
- GitHub Actions (CI/CD)

---

**Dokumenten-Version:** 1.0
**Erstellt am:** 2025-11-26
**Autor:** TTV Champions Team
**Status:** ✅ Finalisiert für Bachelorarbeit
