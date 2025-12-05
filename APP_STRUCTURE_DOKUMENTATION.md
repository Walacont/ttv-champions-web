# TTV Champions Web - Vollständige App-Struktur Dokumentation

**Erstellt am:** 2025-12-05
**Zweck:** Dokumentation aller Funktionen, Tabs und Seiten für das neue Layout-Design

---

## 📋 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Design & Technologie](#design--technologie)
3. [Player Dashboard](#player-dashboard-spieler-ansicht)
4. [Coach Dashboard](#coach-dashboard-trainer-ansicht)
5. [Admin Dashboard](#admin-dashboard-administrator-ansicht)
6. [Weitere Seiten](#weitere-seiten)
7. [Gemeinsame UI-Komponenten](#gemeinsame-ui-komponenten)
8. [Funktionsübersicht](#funktionsübersicht)

---

## Übersicht

**TTV Champions** ist eine Gamification-Plattform für Tischtennisvere mit drei verschiedenen Benutzerrollen:
- **Spieler (Player)**: Tracking von Matches, Übungen, XP und Elo
- **Trainer (Coach)**: Verwaltung von Spielern, Matches, Challenges und Anwesenheit
- **Administrator (Admin)**: Plattform-weite Verwaltung, Vereine, Übungen

---

## Design & Technologie

### Tech-Stack
- **Framework**: Vanilla JavaScript (kein Framework) - Single Page Application
- **Styling**: TailwindCSS
- **Backend**: Firebase (Firestore Database, Authentication, Storage)
- **Charts**: Chart.js
- **Excel Export**: ExcelJS
- **Mobile**: Capacitor (iOS & Android)
- **Icons**: Font Awesome 6.4.0
- **Font**: Inter (Google Fonts)

### Farb-Palette
- **Primary**: Indigo-600 (#4f46e5)
- **Secondary**: Purple, Teal, Blue
- **Success**: Green (#10b981)
- **Warning**: Amber (#f59e0b)
- **Danger**: Red (#ef4444)
- **Background**: Gray-100 (#f3f4f6)

### Design-Pattern
- **Responsive**: Mobile-First Design
- **Cards**: Weiße Karten mit Schatten (`rounded-xl shadow-md`)
- **Buttons**: Abgerundete Buttons mit Hover-Effekten
- **Tabs**: Unterstrichene Tab-Navigation
- **Modals**: Vollbildschirm-Overlays mit zentrierten Karten

---

## Player Dashboard (Spieler-Ansicht)

**Route**: `/dashboard.html`
**Zugriff**: Alle registrierten Spieler

### Header

#### Header-Layout
```
[Profilbild] [Titel + Willkommensnachricht + Vereinsname] [Coach-Switch-Button] [Einstellungen] [Logout]
```

**Elemente:**
- **Profilbild**: Rund, 56x56px (h-14 w-14), Border Indigo
- **Titel**: "Mein Dashboard"
- **Willkommensnachricht**: "Willkommen zurück, {Name}!"
- **Vereinsname**: Zeigt aktuellen Verein mit Icon
- **Coach-Switch-Button**: Nur sichtbar für Benutzer mit Coach-Rolle (Purple Button → `/coach.html`)
- **Einstellungen-Icon**: Zahnrad-SVG → `/settings.html`
- **Logout-Button**: Roter Button

#### Filter-Bereich (Second Row)
- **Ansichts-Dropdown**:
  - 🏠 Mein Verein
  - 🌍 Global
  - Dynamische Subgruppen (z.B. "U12", "Jugend", "Erwachsene")
- **Geschlechts-Filter**:
  - Alle
  - Jungen/Herren
  - Mädchen/Damen

#### Info-Box (für Spieler ohne Verein)
- Blaue Info-Box mit Hinweis
- Link zu Einstellungen
- Schließen-Button

### Tabs (5 Haupt-Tabs)

#### 1️⃣ Tab: Übersicht (overview)

**Widgets (anpassbar):**

##### Info-Banner
- **Hintergrund**: Gradient Indigo-Purple
- **Inhalt**: Erklärt die 3 Systeme
  - XP (Permanenter Fleiß)
  - Elo (Wettkampf-Spielstärke)
  - Saisonpunkte (6-Wochen-Wettbewerb)

##### Statistiken-Karte (3 Spalten)
1. **XP (Erfahrung)** - Purple
   - Großer Zahlenwert
   - Tooltip: "Permanente Punkte für Fleiß"
   - Icon: 💪

2. **Elo (Spielstärke)** - Blue
   - Großer Zahlenwert
   - Tooltip: "Misst echte Spielstärke, Gates verhindern Absturz"
   - Icon: ⚡

3. **Saisonpunkte** - Yellow
   - Großer Zahlenwert
   - Tooltip: "Temporäre Punkte für aktuellen Wettbewerb"
   - Icon: 🏆

##### Saison-Countdown
- Gradient Yellow-Orange
- Zeigt verbleibende Zeit bis Saisonende
- Timer mit großer Schrift

##### Wettkampf-Anfragen
- Gradient Indigo-Blue
- Badge mit Anzahl ausstehender Anfragen
- Liste von:
  - Gesendete Anfragen (Spieler wartet auf Bestätigung)
  - Empfangene Anfragen (Spieler muss bestätigen/ablehnen)

##### Rang-Widget
- Zeigt aktuellen Rang (z.B. "Rekrut", "Challenger", "Champion")
- Fortschrittsbalken zum nächsten Rang
- XP-Anzeige

##### Skill-Rivale (Elo)
- Zeigt nächsten Spieler in Elo-Rangliste
- Elo-Differenz
- Quick-Match-Button

##### Fleiß-Rivale (XP)
- Zeigt nächsten Spieler in XP-Rangliste
- XP-Differenz

##### Punkte-Historie
- Scrollbare Liste
- Zeigt letzte 10-20 Punkt-Ereignisse:
  - Match-Gewinne/Verluste
  - Übungs-Abschlüsse
  - Challenge-Erfolge
  - Anwesenheits-Streaks

##### Aktive Challenges
- Grid (3 Spalten auf Desktop)
- Challenge-Karten mit:
  - Titel
  - Beschreibung
  - Fortschritt (wenn vorhanden)
  - Ablaufdatum
  - Punkte-Belohnung

##### "Startseite bearbeiten" Button
- Unten zentriert
- Öffnet Modal zum An/Ausschalten von Widgets

#### 2️⃣ Tab: Ranglisten (leaderboard)

**Ranglisten-Einstellungen (ausklappbar)**:
- Checkboxen für:
  - ✅ 💪 Fleiß (XP)
  - ✅ ⭐ Season (Punkte)
  - ✅ ⚡ Skill (Elo)
  - ✅ 🏆 Ränge (Level)
  - ✅ 🎾 Doppel (Teams)

**Ranglisten-Anzeige**:
Jede aktivierte Rangliste zeigt:
- Top 10 Spieler
- Eigene Position (highlighted)
- Platzierung, Name, Wert
- Profilbilder

**Filterung**:
- Wird durch globalen Header-Filter gesteuert (Verein/Global, Subgruppe, Geschlecht)

#### 3️⃣ Tab: Wettkampf (matches)

**Match-Vorschläge (ausklappbar)**:
- Liste von Spielern, gegen die noch nie oder lange nicht gespielt wurde
- "Anfrage senden" Button pro Spieler

**Wettkampf melden (Formular)**:

##### Match-Typ Toggle
- **Einzel** / **Doppel** (Button-Toggle)

##### Spielmodus Dropdown
- 1 Satz
- Best of 3
- Best of 5 (Standard)
- Best of 7

##### Einzel-Modus:
**Gegner-Suche**:
- Text-Input mit Echtzeit-Suche
- Dropdown mit Ergebnissen (Name, Elo)
- Ausgewählter Gegner wird angezeigt

##### Doppel-Modus:
**Dein Team**:
- Partner-Suche (grüner Bereich)
- Text-Input mit Echtzeit-Suche

**Gegnerisches Team**:
- Gegner 1 Suche (oranger Bereich)
- Gegner 2 Suche
- Text-Inputs mit Echtzeit-Suche

##### Spielergebnis:
- Dynamische Satz-Inputs (je nach Modus)
- Format: "Spieler A - Spieler B"
- Mindestens 3 Sätze bei Best of 5

##### Handicap-Info (wenn anwendbar)
- Blaue Info-Box
- Zeigt Handicap-Vorschlag
- Checkbox: "Handicap wurde verwendet"

##### Match-Winner Display
- Grüne Box
- Zeigt Gewinner nach Eingabe

##### Submit-Button
- "Anfrage senden"
- Schickt Match zur Coach-Freigabe

**Wettkampf-Historie**:
- Liste aller gespielten Matches
- Pro Match:
  - Datum
  - Gegner
  - Ergebnis (Sets)
  - Elo-Änderung (+/- Wert)
  - Indikator: Sieg (grün) / Niederlage (rot)

**Ausstehende Anfragen**:
- Matches, die auf Coach-Freigabe warten
- Status-Anzeige

**Anfragen-Historie**:
- Alle abgeschlossenen Anfragen
- Akzeptiert / Abgelehnt

#### 4️⃣ Tab: Übungskatalog (exercises)

**Tag-Filter (ausklappbar)**:
- Suchfeld für Tags
- Tag-Buttons (z.B. "Aufschlag", "Beinarbeit", "Koordination")
- Multi-Select

**Übungen-Grid**:
- 3 Spalten auf Desktop
- Pro Übung:
  - Thumbnail-Bild
  - Titel
  - Tags (Badges)
  - Punkte-Anzeige
  - Klick öffnet Detail-Modal

**Übungs-Detail-Modal**:
- Großes Bild
- Vollständige Beschreibung
- Tags
- Abkürzungen-Legende (ausklappbar)
  - VH = Vorhand, RH = Rückhand, etc.
- Meilensteine (falls vorhanden)
  - Zeigt wiederholbare Ziele
- Punkte-Badge
- Schließen-Button (X oben rechts)

#### 5️⃣ Tab: Anwesenheit (profile)

**Monatsübersicht**:

##### Kalender-Header
- Monat & Jahr
- Vorheriger/Nächster Monat Buttons

##### Kalender-Grid (7x5/6)
- Wochentage: Mo-So
- Tage mit Farb-Codierung:
  - **Grün**: Anwesend (training-day-present)
  - **Orange**: Streak-Tag (besondere Hervorhebung)
  - **Rot**: Verpasst (nach Streak-Unterbrechung)
  - **Grau**: Kein Training / Zukunft
- Klick auf Tag öffnet Detail-Modal

##### Statistiken (unter Kalender)
**Linke Spalte**:
- Trainingstage im Monat (Zahl, groß)

**Rechte Spalte**:
- Deine Streaks:
  - Aktueller Streak
  - Längster Streak

**Training-Tag-Detail-Modal**:
- Zeigt alle Trainings an diesem Tag
- Pro Training:
  - Uhrzeit
  - Typ
  - Anwesenheits-Status

**Erfolge-Sektion**:
- Placeholder für zukünftige Badges/Achievements

#### FAQ & Regeln (Link, kein Tab)
- Navigiert zu `/faq.html`

---

## Coach Dashboard (Trainer-Ansicht)

**Route**: `/coach.html`
**Zugriff**: Benutzer mit Coach-Rolle

### Header

#### Header-Layout
```
[Profilbild] [Coach Dashboard + Willkommen + Vereinsname] [Player-Switch-Button] [Einstellungen] [Logout]
```

**Elemente:**
- Ähnlich wie Player Dashboard
- **Player-Switch-Button**: Indigo Button → `/dashboard.html`
- Titel: "Coach Dashboard"

#### Filter-Bereich
- **Ansichts-Dropdown**:
  - Alle (Gesamtverein)
  - Dynamische Subgruppen
- **Geschlechts-Filter**: Alle / Jungen/Herren / Mädchen/Damen

### Quick-Action-Buttons (3 Spalten)
1. **Spieler verwalten** (Blue) - Öffnet Spieler-Modal
2. **Offline-Spieler erstellen** (Green) - Für Spieler ohne Account
3. **Codes verwalten** (Indigo) - Einladungscodes

### Tabs (8 Haupt-Tabs)

#### 1️⃣ Tab: Statistik (statistics)

**Übersichts-Karten (Grid)**:
- **Gesamt-Spieler**: Anzahl aktiver Spieler
- **Trainingstage (Monat)**: Summe aller Anwesenheiten
- **Durchschn. Anwesenheit**: Prozentsatz
- **Aktive Challenges**: Anzahl laufender Challenges

**Charts**:
1. **Anwesenheits-Trend** (Linien-Chart)
   - Zeigt Anwesenheit über letzte 6 Monate

2. **Wettkampf-Aktivität** (Bar-Chart)
   - Filter: Woche / Monat / Jahr
   - Filter: Alle / Nur Einzel / Nur Doppel
   - Zeigt Match-Anzahl über Zeit

3. **Geschlechterverteilung** (Pie-Chart)
   - Männlich / Weiblich / Divers

4. **Altersverteilung** (Bar-Chart)
   - Gruppiert nach Altersklassen

**Competition Statistics**:
- Gesamt-Wettkämpfe (12 Monate)
- Ø pro Monat
- Aktivster Monat
- Trend (Veränderung zum Vormonat)

#### 2️⃣ Tab: Rangliste (dashboard)

**Inhalt**:
- Identisch mit Player-Leaderboard
- Zusätzlich: Klick auf Spieler zeigt Detailansicht

#### 3️⃣ Tab: Kalender & Anwesenheit (attendance)

**Monatskalender**:
- Vorheriger/Nächster Monat Navigation
- Kalender-Grid (7x5/6)
- **Klickbare Tage**: Öffnet Anwesenheits-Modal

**Export-Buttons**:
- **Als Excel exportieren** (Grün)
  - Exportiert komplette Anwesenheitsliste
  - Mit Spielernamen, Datum, Status
- **Zusammenfassung** (Blau)
  - Exportiert aggregierte Statistiken

**Anwesenheits-Modal** (bei Tag-Klick):
- **Datum anzeigen**
- **Spieler-Liste** (Checkboxen):
  - Alle Spieler des Vereins
  - Checkbox: Anwesend/Abwesend
  - Speichern-Button
- **Training hinzufügen** (wenn noch kein Training):
  - Zeit-Eingabe
  - Trainingstyp (optional)
  - Erstellen-Button

#### 4️⃣ Tab: Wettkampf (matches)

**Gespeicherte Paarungen**:
- Liste aller Paarungen aus Trainings
- Pro Paarung:
  - Spieler A vs Spieler B (oder Teams bei Doppel)
  - Datum gespeichert
  - Aktionen:
    - **Ergebnis eingeben** → Öffnet Formular
    - **Verwerfen** → Löscht Paarung

**Wettkampf-Match melden (Coach)**:
- **Match-Typ Toggle**: Einzel / Doppel
- **Spielmodus Dropdown**: 1 Satz / Best of 3/5/7

##### Einzel-Modus:
- **Spieler A Dropdown**: Alle Spieler
- **Spieler B Dropdown**: Alle Spieler
- **Sätze eingeben**: Dynamische Inputs

##### Doppel-Modus:
- **Team A**:
  - Spieler 1 Dropdown
  - Spieler 2 Dropdown
- **Team B**:
  - Spieler 1 Dropdown
  - Spieler 2 Dropdown
- **Sätze eingeben**: Dynamische Inputs

**Handicap-System**:
- Automatische Berechnung bei großer Elo-Differenz
- Vorschlag-Anzeige (z.B. "+3 Punkte pro Satz für schwächeren Spieler")
- Checkbox: "Handicap verwendet"

**Match-Winner Anzeige**:
- Grüne Box zeigt Gewinner
- Berechnet Winner automatisch

**Submit-Button**:
- "Match speichern"
- Speichert direkt (keine Freigabe nötig)

**Ausstehende Spieler-Anfragen**:
- Liste aller Match-Anfragen von Spielern
- Pro Anfrage:
  - Spieler-Namen
  - Match-Details (Typ, Modus, Ergebnis)
  - Datum
  - Aktionen:
    - **Genehmigen** (Grün)
    - **Ablehnen** (Rot)
    - **Details ansehen** (Blau)

**Match-Historie**:
- Filter: Alle / Nur Einzel / Nur Doppel
- Liste aller genehmigten Matches
- Pro Match:
  - Datum
  - Spieler
  - Ergebnis
  - Elo-Änderungen
  - Status (Approved/Rejected)

**Pairing-Generator**:
- **Einstellungen**:
  - Anzahl Runden
  - Match-Modus
  - Subgruppen-Filter
  - Elo-Balance aktivieren
- **Generieren-Button**
  - Erstellt automatische Paarungen
  - Berücksichtigt:
    - Elo-Balance (ähnliche Stärken)
    - Vergangene Begegnungen
    - Randomisierung
- **Generierte Paarungen**:
  - Liste aller Paarungen
  - **Als Training speichern** Button
    - Speichert Paarungen für spätere Ergebnis-Eingabe

#### 5️⃣ Tab: Punkte vergeben (points)

**Spieler-Auswahl**:
- Dropdown oder Suche
- Zeigt alle Spieler

**Punktevergabe-Formular**:
- **Grund/Kategorie Dropdown**:
  - Training
  - Übung
  - Challenge
  - Sonstiges
- **Punkte-Anzahl**: Number Input
- **Beschreibung**: Textarea (optional)
- **Vergeben-Button**

**Punkte-Historie**:
- Liste aller vergebenen Punkte
- Filter: Alle Spieler / Einzelner Spieler
- Pro Eintrag:
  - Datum
  - Spieler
  - Punkte
  - Grund
  - Coach (wer vergeben hat)

**Meilensteine**:
- Liste von Spielern mit erreichten Meilensteinen
- Benachrichtigung bei neuen Meilensteinen

#### 6️⃣ Tab: Challenges (challenges)

**Aktive Challenges**:
- Grid-Ansicht
- Pro Challenge:
  - Titel
  - Beschreibung
  - Ablaufdatum
  - Punkte
  - Aktionen:
    - **Beenden**
    - **Verlängern**
    - **Bearbeiten**

**Challenge erstellen**:
- **Formular**:
  - Titel (Text)
  - Beschreibung (Textarea)
  - Punkte (Number)
  - Dauer:
    - Täglich (Endet um Mitternacht)
    - Wöchentlich (Endet nach 7 Tagen)
    - Custom (Datum-Picker)
  - Zielgruppe:
    - Alle
    - Subgruppe auswählen
  - Wiederholbar (Checkbox)
  - Meilensteine (Optional):
    - Mehrere Meilensteine hinzufügen
    - Pro Meilenstein: Anzahl, Punkte

**Challenge-Teilnahme**:
- Zeigt welche Spieler teilgenommen haben
- Fortschritt pro Spieler (bei wiederholbaren Challenges)

**Challenge-Statistiken**:
- Teilnahme-Rate
- Abschluss-Rate
- Durchschnittliche Completion-Zeit

#### 7️⃣ Tab: Übungen (exercises)

**Übungs-Liste**:
- Grid-Ansicht (3 Spalten)
- Pro Übung:
  - Bild
  - Titel
  - Tags
  - Punkte
  - Aktionen:
    - **Bearbeiten** (Blau)
    - **Löschen** (Rot)
    - **Ansehen** (Detail-Modal)

**Übung erstellen/bearbeiten**:
- **Formular**:
  - Titel (Text)
  - Beschreibung (Textarea oder Rich-Text-Editor)
    - Toggle: Tabellen-Editor (für formatierte Übungsbeschreibungen)
  - Bild Upload
  - Tags (Komma-getrennt)
  - Punkte-System:
    - **Einfach**: Gesamtpunkte (Number)
    - **Abgestuft** (Checkbox aktivieren):
      - Meilensteine hinzufügen
      - Pro Meilenstein: Anzahl, Punkte
      - Max. erreichbare Punkte werden berechnet

**Tag-Verwaltung**:
- Zeigt alle verwendeten Tags
- Tags können umbenannt/gelöscht werden

**Übungs-Statistiken**:
- Beliebteste Übungen
- Completion-Rate pro Übung
- Durchschnittliche Punkte pro Übung

#### 8️⃣ Tab: Gruppen (subgroups)

**Gruppen-Liste**:
- Liste aller Subgruppen
- Pro Gruppe:
  - Name
  - Beschreibung
  - Anzahl Spieler
  - Aktionen:
    - **Bearbeiten**
    - **Löschen**
    - **Spieler verwalten**

**Gruppe erstellen**:
- **Formular**:
  - Name (Text)
  - Beschreibung (Textarea)
  - Farbe (Color-Picker, optional)
  - Icon (Emoji-Picker, optional)

**Spieler-Zuweisung**:
- Liste aller Spieler
- Multi-Select oder Drag & Drop
- Spieler können mehreren Gruppen angehören

**Gruppen-Verwendung**:
- Filter in allen Tabs
- Challenge-Targeting
- Training-Planung
- Statistik-Segmentierung

---

## Admin Dashboard (Administrator-Ansicht)

**Route**: `/admin.html`
**Zugriff**: Nur Admins

### Header

**Layout**:
```
[Admin Dashboard] [Willkommen, Admin] [Einstellungen] [Logout]
```

### Main Content

#### Statistik-Übersicht (4 Karten)
1. **Gesamte Nutzer** (Indigo Icon)
   - Anzahl aller registrierten Benutzer

2. **Vereine** (Teal Icon)
   - Anzahl aller Vereine

3. **Vergebene Punkte** (Amber Icon)
   - Summe aller XP/Saisonpunkte

4. **Anwesenheiten** (Rose Icon)
   - Summe aller Anwesenheits-Einträge

#### Charts (2 Charts)
1. **Geschlechterverteilung** (Pie-Chart)
   - Männlich / Weiblich / Divers

2. **Anwesenheit pro Monat** (Line-Chart)
   - Zeigt Trend über 12 Monate

#### Globale Competition-Aktivität

**Statistik-Karten (4 Spalten)**:
- **Gesamt (12 Monate)**: Anzahl aller Wettkämpfe
- **Ø pro Monat**: Durchschnitt
- **Aktivster Monat**: Monat mit meisten Matches (+ Anzahl)
- **Trend**: Veränderung (Pfeil hoch/runter)

**Filter-Buttons**:
- **Zeitraum**: Woche / Monat / Jahr
- **Ansicht**: Alle / Nur Einzel / Nur Doppel

**Chart**:
- Aktivitäts-Übersicht (Bar/Line Chart)
- Zeigt Matches über gewählten Zeitraum

#### Management-Bereich (2 Spalten)

**Linke Spalte**:

##### Neuen Coach einladen
- **Formular**:
  - Vereins-ID (Text Input)
  - "Einladungscode generieren" Button
- **Generierter Code-Anzeige**:
  - Readonly Text-Input (großer Font, Monospace)
  - "Code kopieren" Button
  - Info-Text: "Coach kann sich mit diesem Code registrieren"

##### Übung erstellen (Admin)
- Identisch mit Coach-Übungs-Formular
- Übungen werden global für alle Vereine verfügbar

**Rechte Spalte**:

##### Vereinsübersicht
- Liste aller Vereine
- Pro Verein:
  - Name
  - Vereins-ID
  - Coach-Name
  - Anzahl Spieler
  - Status (Aktiv/Inaktiv)
  - Aktionen:
    - **Spieler ansehen** (Modal)
    - **Deaktivieren** (falls nötig)

**Spieler-Modal** (bei Klick):
- Zeigt alle Spieler eines Vereins
- Liste mit:
  - Name
  - Email
  - XP
  - Elo
  - Beitrittsdatum

##### Übungskatalog (Admin-Ansicht)
- Grid (2 Spalten)
- Identisch mit Player-Übungskatalog
- Zusätzlich:
  - **Bearbeiten** Button
  - **Löschen** Button

#### Daten-Migrationen Sektion

**Migration-Tools**:
- **Doppel-Paarungen: Namen hinzufügen**
  - Beschreibung: Fügt fehlende Spielernamen zu Doppel-Paarungen hinzu
  - "Migration starten" Button
  - Status-Anzeige (Loading/Success/Error)

*(Weitere Migrations-Tools können hinzugefügt werden)*

---

## Weitere Seiten

### Einstellungen (`/settings.html`)

**Sections**:

#### Profil bearbeiten
- **Formular**:
  - Vorname (Text)
  - Nachname (Text)
  - Email (readonly, kann nicht geändert werden)
  - Geburtsdatum (Date-Picker)
  - Geschlecht (Dropdown: Männlich/Weiblich/Divers)
  - Profilbild Upload
    - Aktuelles Bild-Vorschau
    - "Neues Bild hochladen" Button
  - Speichern-Button

#### Passwort ändern
- **Formular**:
  - Aktuelles Passwort
  - Neues Passwort
  - Passwort bestätigen
  - Ändern-Button

#### Vereinsverwaltung (nur für Spieler ohne Verein)
- **Verein beitreten**:
  - Verein-Suche (Text-Input)
  - Liste von Vereinen
  - "Beitrittsanfrage senden" Button
- **Status**:
  - Zeigt Status der Anfrage (Ausstehend/Akzeptiert/Abgelehnt)

#### Rollenwechsel (nur für Coaches)
- Info-Text: "Du bist auch Coach"
- "Zur Coach-Ansicht" Button (→ `/coach.html`)

#### Tutorial
- "Tutorial neu starten" Button
- Setzt Tutorial-Progress zurück

#### Account löschen
- Warnung (Rot)
- "Account unwiderruflich löschen" Button
- Bestätigungs-Modal

### Registrierung (`/register.html`)

**Layout**:
- Zentrierte Karte
- SC Champions Logo

**Formular**:
- Email (Text)
- Passwort (Password)
- Passwort bestätigen (Password)
- Vorname (Text)
- Nachname (Text)
- Geburtsdatum (Date)
- Geschlecht (Dropdown)
- **Einladungscode** (Text, optional)
  - Für Vereins-Beitritt
  - Oder Coach-Registrierung
- "Registrieren" Button
- Link: "Bereits registriert? Zum Login"

### Onboarding (`/onboarding.html`)

**Schritte** (Wizard-Style):

#### Schritt 1: Willkommen
- Begrüßungstext
- Erklärung der App
- "Weiter" Button

#### Schritt 2: Profil vervollständigen
- Profilbild hochladen (optional)
- Vereins-ID (falls nicht mit Code registriert)
- "Weiter" Button

#### Schritt 3: Tutorial
- Kurze Einführung
- Interaktive Tour durch Dashboard
- "Fertig" Button → Weiterleitung zu `/dashboard.html`

### FAQ (`/faq.html`)

**Layout**:
- Accordion-Style (ausklappbare Sections)

**Kategorien**:
1. **Allgemeine Fragen**
   - Was ist SC Champions?
   - Wie funktioniert das System?
   - etc.

2. **XP & Elo**
   - Wie sammle ich XP?
   - Wie funktioniert das Elo-System?
   - Was sind Elo-Gates?

3. **Matches**
   - Wie melde ich ein Match?
   - Wie funktioniert das Handicap-System?
   - Einzel vs Doppel

4. **Challenges & Übungen**
   - Wie funktionieren Challenges?
   - Wie schließe ich Übungen ab?
   - Wiederholbare Übungen

5. **Regeln**
   - Fairplay-Richtlinien
   - Reporting von Problemen
   - Datenschutz

**Footer**:
- Kontakt: support@sc-champions.de
- Links: Impressum, Datenschutz

### Landing Page (`/index.html`)

**Sections**:

#### Hero
- Großer Titel: "SC Champions"
- Untertitel: "Gamification für Tischtennis-Vereine"
- "Jetzt registrieren" Button
- "Login" Button

#### Features (3 Spalten)
1. **Match-Tracking**
   - Icon
   - Beschreibung

2. **Elo & XP System**
   - Icon
   - Beschreibung

3. **Challenges & Übungen**
   - Icon
   - Beschreibung

#### CTA (Call-to-Action)
- "Bereit loszulegen?"
- "Registriere dich jetzt" Button

#### Footer
- Impressum
- Datenschutz
- Copyright

**Login-Modal**:
- Overlay
- Zentrierte Karte
- **Formular**:
  - Email
  - Passwort
  - "Login" Button
  - "Passwort vergessen?" Link
- "Noch kein Account? Registrieren" Link

---

## Gemeinsame UI-Komponenten

### Modals

#### Exercise-Modal (Spieler + Coach)
- **Header**:
  - Titel
  - X-Button (oben rechts, floating)
- **Body**:
  - Großes Bild (full-width)
  - Tags (Badges)
  - Beschreibung (pre-wrap)
  - Abkürzungen (ausklappbar)
  - Meilensteine (falls vorhanden)
- **Footer**:
  - Punkte-Badge
  - (Coach) Bearbeiten + Löschen Buttons

#### Challenge-Modal
- Ähnlich wie Exercise-Modal
- Zeigt Challenge-Details
- Ablaufdatum prominent

#### Training-Day-Modal (Spieler)
- **Header**: Datum
- **Body**:
  - Liste aller Trainings an diesem Tag
  - Pro Training:
    - Zeit
    - Typ
    - Anwesenheits-Status (✓/✗)

#### Training-Day-Modal (Coach)
- **Header**: Datum
- **Body**:
  - Spieler-Liste mit Checkboxen
  - "Alle auswählen" / "Alle abwählen" Toggle
  - Speichern-Button
- Alternativ (wenn kein Training):
  - "Training hinzufügen" Formular

#### Player-Management-Modal (Coach)
- **Tabs**:
  - Spieler-Liste
  - Offline-Spieler
  - Einladungen

**Spieler-Liste**:
- Searchable Liste
- Pro Spieler:
  - Name
  - Email
  - XP, Elo
  - Status (Aktiv/Inaktiv)
  - Aktionen:
    - Bearbeiten
    - Deaktivieren/Aktivieren
    - Löschen (mit Bestätigung)

**Offline-Spieler**:
- Spieler ohne eigenen Account
- Können nur vom Coach gemanagt werden
- Teilnahme an Matches, aber keine Login-Möglichkeit

**Einladungen**:
- Offene Beitrittsanfragen
- Akzeptieren/Ablehnen

#### Invitation-Codes-Modal (Coach)
- **Liste aller Codes**:
  - Code (Monospace, großer Font)
  - Erstellt am
  - Verwendet (Ja/Nein)
  - Verwendet von (Name, falls verwendet)
  - Aktionen:
    - Code kopieren
    - Code löschen
- **Neuen Code erstellen**:
  - "Neuer Code" Button
  - Generiert zufälligen 8-stelligen Code

#### Widget-Settings-Modal (Spieler)
- **Header**: "Startseite anpassen"
- **Body**:
  - Liste aller verfügbaren Widgets
  - Pro Widget:
    - Name
    - Kurzbeschreibung
    - Toggle-Switch (An/Aus)
- **Footer**:
  - "Auf Standard zurücksetzen" Button
  - "Abbrechen" Button
  - "Speichern" Button

### Buttons

#### Primär-Button
- Farbe: Indigo-600
- Hover: Indigo-700
- Schatten, abgerundet
- Hover-Scale-Effekt (105%)

#### Sekundär-Button
- Farbe: Gray-200
- Hover: Gray-300
- Weniger prominent

#### Danger-Button
- Farbe: Red-500
- Hover: Red-600
- Für Löschen-Aktionen

#### Success-Button
- Farbe: Green-600
- Hover: Green-700
- Für Bestätigungen

### Tabs

**Tab-Navigation**:
- Unterstrichene Tabs
- Aktiver Tab:
  - Border-Bottom: Indigo-600
  - Text: Indigo-600
  - Background: Indigo-50

**Tab-Content**:
- Display: None (standardmäßig)
- Aktiver Tab: Display: Block

### Cards

**Standard-Card**:
- Background: Weiß
- Padding: 1.5rem (p-6)
- Border-Radius: 0.75rem (rounded-xl)
- Box-Shadow: Medium (shadow-md)

### Forms

**Input-Felder**:
- Border: Gray-300
- Focus: Ring Indigo-500
- Padding: px-3 py-2
- Rounded-md

**Dropdowns/Select**:
- Identisch mit Inputs
- Pfeil-Icon rechts

**Textareas**:
- Min-Height: 3 Rows
- Resizable

**Checkboxes/Radio**:
- Farbe: Indigo-600
- Größe: h-4 w-4 oder h-5 w-5

### Badges

**Tag-Badge**:
- Small font (text-xs)
- Padding: px-2 py-1
- Rounded-full
- Background: Indigo-100
- Text: Indigo-800

**Points-Badge**:
- Font: Bold
- Größer (text-md)
- Indigo-Background

### Toasts/Notifications

**Success-Toast**:
- Background: Green-50
- Border: Green-200
- Text: Green-800
- Icon: Checkmark (Green)

**Error-Toast**:
- Background: Red-50
- Border: Red-200
- Text: Red-800
- Icon: X-Circle (Red)

**Info-Toast**:
- Background: Blue-50
- Border: Blue-200
- Text: Blue-800
- Icon: Info-Circle (Blue)

### Loading States

**Page-Loader**:
- Fullscreen Overlay
- Centered Spinner (Indigo)
- "Lade Daten..." Text

**Inline-Spinner**:
- Font-Awesome: `fa-spinner fa-spin`
- Kleine Größe für Buttons

### Empty States

**Keine Daten**:
- Zentrierter Text (Gray-500)
- Icon (Gray-300, groß)
- Hilfreicher Text (z.B. "Noch keine Matches gespielt")

---

## Funktionsübersicht

### Authentifizierung & Autorisierung
- **Firebase Authentication**
- Email/Passwort Login
- Passwort-Reset
- Rollen-basierter Zugriff (Player, Coach, Admin)
- Session-Management
- Auto-Logout bei Token-Ablauf

### Spieler-Features
1. **Match-System**:
   - Match-Anfragen erstellen
   - Einzel- und Doppel-Matches
   - Handicap-System
   - Elo-Berechnung
   - Match-Historie
   - Head-to-Head-Statistiken

2. **Progression**:
   - XP sammeln (permanent)
   - Elo-Rating (kompetitiv)
   - Saisonpunkte (temporär, 6 Wochen)
   - Rang-System (Rekrut → Champion)
   - Elo-Gates (verhindert Absturz)

3. **Training**:
   - Übungskatalog
   - Übungen abschließen
   - Meilenstein-System (wiederholbar)
   - Anwesenheits-Tracking
   - Streak-System

4. **Challenges**:
   - Aktive Challenges ansehen
   - Challenges abschließen
   - Fortschritt tracken
   - Belohnungen erhalten

5. **Sozial**:
   - Ranglisten (mehrere)
   - Rivalen-System
   - Match-Vorschläge
   - Profil-Ansicht

### Coach-Features
1. **Spieler-Management**:
   - Spieler einladen (Codes)
   - Spieler bearbeiten/löschen
   - Offline-Spieler erstellen
   - Beitrittsanfragen verwalten
   - Subgruppen erstellen & zuweisen

2. **Anwesenheits-Management**:
   - Kalender-Ansicht
   - Anwesenheit markieren
   - Trainings erstellen
   - Excel-Export
   - Statistiken ansehen

3. **Match-Management**:
   - Matches genehmigen/ablehnen
   - Eigene Matches erstellen
   - Pairing-Generator
   - Handicap-Vorschläge
   - Match-Historie

4. **Progression-Management**:
   - Manuelle Punkte vergeben
   - Challenges erstellen & verwalten
   - Übungen erstellen & verwalten
   - Meilensteine tracken

5. **Statistiken & Analytics**:
   - Anwesenheits-Trends
   - Wettkampf-Aktivität
   - Spieler-Performance
   - Alters-/Geschlechterverteilung

### Admin-Features
1. **Plattform-Verwaltung**:
   - Globale Statistiken
   - Vereine verwalten
   - Coaches einladen
   - Übungen (global) erstellen

2. **Daten-Management**:
   - Migrationen durchführen
   - Daten-Bereinigung
   - Backup/Restore (zukünftig)

3. **Monitoring**:
   - Aktivitäts-Übersicht
   - Benutzer-Statistiken
   - Fehler-Logs (zukünftig)

### Gamification-Elemente
1. **Punkte-Systeme**:
   - **XP (Erfahrung)**: Permanent, nie verlieren
   - **Elo**: Kompetitiv, steigt/sinkt bei Matches
   - **Saisonpunkte**: Temporär, Reset alle 6 Wochen

2. **Progression**:
   - Rang-Aufstieg (basierend auf XP)
   - Elo-Gates (Schutz vor Abstieg)
   - Meilensteine (wiederholbare Ziele)

3. **Motivations-Features**:
   - Challenges (täglich/wöchentlich)
   - Streaks (Anwesenheits-Belohnung)
   - Rivalen-System
   - Ranglisten (mehrere Kategorien)

4. **Fairplay**:
   - Handicap-System (automatisch)
   - Skill-basiertes Matching
   - Coach-Genehmigung für Matches

### Technische Features
1. **PWA (Progressive Web App)**:
   - Offline-Fähigkeit (limitiert)
   - Install-Prompt
   - Service-Worker
   - Update-Checker

2. **Responsive Design**:
   - Mobile-First
   - Tablet-optimiert
   - Desktop-Layouts

3. **Real-Time**:
   - Firestore-Listener
   - Live-Updates
   - Push-Notifications (via Capacitor)

4. **Export-Funktionen**:
   - Excel-Export (Anwesenheit)
   - PDF-Export (zukünftig)

5. **Internationalisierung**:
   - Aktuell: Deutsch
   - Vorbereitet für: Englisch, etc.

---

## Hinweise für das neue Layout-Design

### Design-Prinzipien
1. **Konsistenz**: Einheitliche Farben, Abstände, Schatten
2. **Klarheit**: Große, lesbare Schrift, ausreichend Whitespace
3. **Feedback**: Immer visuelles Feedback bei Aktionen
4. **Responsiveness**: Mobile-First Approach
5. **Zugänglichkeit**: Gute Kontraste, klare Labels

### Verbesserungs-Vorschläge
1. **Navigation**:
   - Sidebar-Navigation statt Tabs (Desktop)
   - Bottom-Navigation (Mobile)
   - Breadcrumbs für tiefe Hierarchien

2. **Dashboard**:
   - Drag & Drop für Widgets
   - Mehr Visualisierungen (Charts)
   - Quick-Actions prominent platzieren

3. **Datenvisualisierung**:
   - Mehr interaktive Charts
   - Trendlinien
   - Vergleichs-Ansichten

4. **Onboarding**:
   - Interaktive Tutorials
   - Tooltips bei ersten Besuchen
   - Progressive Disclosure

5. **Mobile**:
   - Swipe-Gesten
   - Native-App-Feel
   - Optimierte Touch-Targets

### Aktuelle Schwachstellen
1. **Überladen**: Viele Informationen auf einmal
2. **Navigation**: Viele horizontale Tabs (scrollbar bei mobile)
3. **Modals**: Teilweise sehr groß, viel Inhalt
4. **Filters**: Könnten prominenter sein
5. **Empty States**: Könnten hilfreicher sein

---

**Ende der Dokumentation**

*Diese Dokumentation beschreibt den aktuellen Stand (Stand: 2025-12-05) der TTV Champions Web-App und dient als Grundlage für das neue Layout-Design.*