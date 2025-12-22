# Anforderungsanalyse & Konzeption - SC Champions

**Bachelorarbeit:** Steigerung der Motivation in Tischtennisvereinen durch Gamification
**Projekt:** SC Champions Web-Anwendung
**Datum:** Dezember 2025
**Version:** 2.0

---

## Inhaltsverzeichnis

1. [Einleitung](#1-einleitung)
2. [Funktionale Anforderungen](#2-funktionale-anforderungen)
3. [Nicht-funktionale Anforderungen](#3-nicht-funktionale-anforderungen)
4. [Gamification-spezifische Anforderungen](#4-gamification-spezifische-anforderungen)
5. [Konzeption und Methodik](#5-konzeption-und-methodik)
6. [Implementierung](#6-implementierung)
7. [Use Cases](#7-use-cases)
8. [Metriken und Erfolgskriterien](#8-metriken-und-erfolgskriterien)

---

## 1. Einleitung

Diese Anforderungsanalyse beschreibt die funktionalen und nicht-funktionalen Anforderungen an die SC Champions Webplattform. Das System soll durch den Einsatz von Gamification-Elementen die Motivation und das Engagement von Tischtennisspielern in Vereinen nachhaltig steigern.

### 1.1 Zielgruppe (Nutzergruppen)

| Rolle | Beschreibung | Hauptfunktionen |
|-------|--------------|-----------------|
| **Spieler** (primär) | Aktive Tischtennisspieler im Verein | Matches eintragen, Ranglisten ansehen, Challenges absolvieren, Trainingsanmeldung |
| **Coach/Trainer** (sekundär) | Trainer und Übungsleiter | Match-Freigaben, Anwesenheit erfassen, Challenges erstellen, Trainingsplanung |
| **Admin** (tertiär) | Vereinsadministratoren | Benutzerverwaltung, Club-Einstellungen, Subgruppen-Management |

### 1.2 Problemstellung

Viele Tischtennisvereine kämpfen mit:
- Sinkender Trainingsmotivation
- Unregelmäßiger Teilnahme
- Fehlendem Engagement außerhalb von Wettkämpfen
- Mangelnder Sichtbarkeit des eigenen Fortschritts

### 1.3 Lösungsansatz

Eine webbasierte Plattform, die durch Gamification-Mechanismen (Punktesysteme, Ranglisten, Challenges, Erfolge) intrinsische und extrinsische Motivation fördert.

---

## 2. Funktionale Anforderungen

### FA-1: Benutzerverwaltung

#### FA-1.1: Benutzerregistrierung und -authentifizierung
**Must-Have**
- **FA-1.1.1** Das System muss eine sichere Registrierung über E-Mail und Passwort ermöglichen
- **FA-1.1.2** Das System muss Supabase Authentication zur Benutzerauthentifizierung verwenden
- **FA-1.1.3** Das System muss drei Benutzerrollen unterscheiden: Spieler, Trainer, Admin
- **FA-1.1.4** Das System muss beim Onboarding-Prozess Benutzerdaten erfassen (Vor-/Nachname, Vereinszugehörigkeit)
- **FA-1.1.5** Spieler können sich auch ohne Vereinszugehörigkeit registrieren

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

#### FA-2.3: Elo-Rating-System
**Must-Have**
- **FA-2.3.1** Das System muss ein Elo-Rating für jeden Spieler berechnen (Spielstärke-Indikator)
- **FA-2.3.2** Das System muss das Elo-Rating nach jedem gewerteten Match aktualisieren
- **FA-2.3.3** Das System muss Elo-Änderungen basierend auf dem Rating-Unterschied der Gegner berechnen
- **FA-2.3.4** Erwachsene (Ü18) starten mit 1000 Elo, Jugendliche mit 800 Elo
- **FA-2.3.5** Neue Spieler haben einen höheren A-Faktor für schnelleres Einpendeln
- **FA-2.3.6** Das System bietet automatische Handicap-Vorschläge bei großen Elo-Unterschieden

**Should-Have**
- **FA-2.3.7** Das System sollte eine Elo-Historie anzeigen (Graph)

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

---

### FA-3: Challenges und Erfolge

#### FA-3.1: Challenge-System
**Must-Have**
- **FA-3.1.1** Trainer müssen Challenges erstellen können mit:
  - Titel und Beschreibung
  - Challenge-Typ (z.B. "10 Matches gewinnen", "100 Bälle trainieren")
  - Punktewert (5-100 Punkte)
  - Zielgruppe (Club/Subgruppe)

- **FA-3.1.2** Das System muss wiederholbare Challenges unterstützen
- **FA-3.1.3** Das System muss Milestone-Challenges mit Zwischenzielen ermöglichen
- **FA-3.1.4** Das System muss ein Partner-System für Challenges bieten
- **FA-3.1.5** Spieler müssen aktive Challenges in ihrem Dashboard sehen
- **FA-3.1.6** Spieler müssen Challenges als "abgeschlossen" markieren können
- **FA-3.1.7** Trainer müssen Challenge-Abschlüsse genehmigen/ablehnen können

---

### FA-4: Match-Verwaltung

#### FA-4.1: Match-Erstellung und -Freigabe
**Must-Have**
- **FA-4.1.1** Spieler müssen Einzel-Match-Anfragen erstellen können
- **FA-4.1.2** Spieler müssen Doppel-Match-Anfragen erstellen können
- **FA-4.1.3** Das System muss Match-Anfragen zur Trainer-Genehmigung weiterleiten
- **FA-4.1.4** Trainer müssen Match-Anfragen genehmigen oder ablehnen können
- **FA-4.1.5** Das System muss bei Genehmigung automatisch Punkte vergeben und Elo aktualisieren
- **FA-4.1.6** Das System muss Match-Validierung durchführen (korrektes Satzergebnis)
- **FA-4.1.7** Das System muss verhindern, dass Spieler gegen sich selbst spielen

---

### FA-5: Training und Anwesenheit (Multi-Session Training System)

#### FA-5.1: Wiederkehrende Trainings (Recurring Training Templates)
**Must-Have**
- **FA-5.1.1** Trainer müssen wiederkehrende Trainings planen können mit:
  - Wochentag (Montag-Sonntag)
  - Start- und Endzeit
  - Subgruppe (z.B. Jugend, Erwachsene)
  - Gültigkeitszeitraum (Start-/Enddatum)

- **FA-5.1.2** Das System muss Training Sessions automatisch generieren (Cloud Function)
- **FA-5.1.3** Das System muss Sessions für die nächsten 14 Tage vorausplanen
- **FA-5.1.4** Das System muss überlappende Templates verhindern

#### FA-5.2: Training Sessions
**Must-Have**
- **FA-5.2.1** Trainer müssen spontane Trainings jederzeit erstellen können
- **FA-5.2.2** Jede Session hat Start- und Endzeit sowie Subgruppen-Zuordnung
- **FA-5.2.3** Sessions können abgesagt werden (soft delete via `cancelled` flag)
- **FA-5.2.4** Mehrere Sessions pro Tag sind möglich (z.B. 16-17 Uhr Basic, 17-19 Uhr Leistung)

#### FA-5.3: Session-basierte Anwesenheit
**Must-Have**
- **FA-5.3.1** Anwesenheit wird pro Session erfasst (nicht nur pro Tag)
- **FA-5.3.2** Spieler können am selben Tag an mehreren Sessions teilnehmen
- **FA-5.3.3** Streak-Berechnung basiert auf Tagen (nicht Sessions)
- **FA-5.3.4** XP wird für jede besuchte Session vergeben

#### FA-5.4: Calendar UI
**Must-Have**
- **FA-5.4.1** Visuelle Indikatoren zeigen Sessions pro Tag (bis zu 3 Punkte)
- **FA-5.4.2** Klick auf Tag mit mehreren Sessions öffnet Auswahlmodal
- **FA-5.4.3** Klick auf Tag ohne Session bietet Option zum spontanen Training

---

### FA-6: Statistiken und Dashboards

#### FA-6.1: Spieler-Dashboard
**Must-Have**
- **FA-6.1.1** Das Dashboard zeigt: Rangliste, Statistiken, aktive Challenges, nächste Trainings, letzte Matches
- **FA-6.1.2** Heutige Trainings mit Session-Details und Paarungen werden angezeigt
- **FA-6.1.3** Eigene Paarungen werden hervorgehoben

#### FA-6.2: Trainer-Dashboard
**Must-Have**
- **FA-6.2.1** Trainer sehen ausstehende Match-Anfragen
- **FA-6.2.2** Trainer können Trainingsplan verwalten
- **FA-6.2.3** Trainer können Anwesenheit pro Session erfassen
- **FA-6.2.4** Trainer können Match-Paarungen erstellen und speichern

---

## 3. Nicht-funktionale Anforderungen

### NFA-1: Usability (Benutzerfreundlichkeit)

#### NFA-1.1: Bedienbarkeit
**Must-Have**
- **NFA-1.1.1** Die Hauptfunktionen müssen mit maximal 3 Klicks erreichbar sein
- **NFA-1.1.2** Die Benutzeroberfläche muss intuitiv ohne Anleitung bedienbar sein
- **NFA-1.1.3** Das System muss Toast-Benachrichtigungen für Benutzer-Feedback verwenden
- **NFA-1.1.4** Formulare müssen Client-seitige Validierung mit klaren Fehlermeldungen bieten

#### NFA-1.2: Responsive Design
**Must-Have**
- **NFA-1.2.1** Die Anwendung muss auf Desktop, Tablet und Smartphone funktionieren
- **NFA-1.2.2** Touch-Interaktionen müssen auf mobilen Geräten optimiert sein

---

### NFA-2: Performance (Leistung)

#### NFA-2.1: Ladezeiten
**Must-Have**
- **NFA-2.1.1** Initiale Seitenladezeit muss unter 3 Sekunden liegen
- **NFA-2.1.2** SPA-Seitenwechsel müssen unter 500ms erfolgen
- **NFA-2.1.3** Leaderboard-Laden für 100+ Spieler muss unter 2 Sekunden erfolgen

#### NFA-2.2: Caching und Optimierung
**Must-Have**
- **NFA-2.2.1** Das System muss SPA-Page-Caching nutzen
- **NFA-2.2.2** Statische Assets müssen im Browser gecacht werden
- **NFA-2.2.3** Das System muss Prefetching für häufig besuchte Seiten bieten

---

### NFA-3: SEO-Freundlichkeit

**Must-Have**
- **NFA-3.1** Das System muss auch ohne JavaScript grundlegend navigierbar sein (Progressive Enhancement)
- **NFA-3.2** HTML-Seiten müssen semantisch korrekt strukturiert sein
- **NFA-3.3** Meta-Tags müssen für wichtige Seiten vorhanden sein

---

### NFA-4: Sicherheit

**Must-Have**
- **NFA-4.1** Das System muss Supabase Row Level Security (RLS) implementieren
- **NFA-4.2** Alle Verbindungen müssen HTTPS verwenden
- **NFA-4.3** Rollenbasierte Zugriffskontrolle muss implementiert sein

---

## 4. Gamification-spezifische Anforderungen

### GFA-1: Motivationspsychologie

#### GFA-1.1: Intrinsische Motivation
**Must-Have**
- **GFA-1.1.1** Autonomie: Spieler wählen selbst Gegner und Challenges
- **GFA-1.1.2** Kompetenzerleben: Klare Fortschrittsanzeige (XP-Balken, Rang-Aufstieg)
- **GFA-1.1.3** Soziale Eingebundenheit: Leaderboards, Partner-System, Trainer-Feedback

#### GFA-1.2: Extrinsische Motivation
**Must-Have**
- **GFA-1.2.1** Klare Belohnungen: Punkte, Ränge, Leaderboard-Platzierungen
- **GFA-1.2.2** Unmittelbares Feedback: Sofortige XP-Vergabe nach Match-Genehmigung
- **GFA-1.2.3** Variable Belohnungen: Mehr Punkte für schwierigere Challenges

---

### GFA-2: Feedback-Loops

**Must-Have**
- **GFA-2.1** Kurze Feedback-Loops: Match → Genehmigung → Punkte (Stunden)
- **GFA-2.2** Lange Feedback-Loops: Season-Wettbewerb (6 Wochen), Rang-Aufstieg (Monate)

---

## 5. Konzeption und Methodik

### 5.1 Anforderungsanalyse (Requirements Engineering)

#### 5.1.1 Nutzergruppen und ihre Bedürfnisse

| Nutzergruppe | Primäre Bedürfnisse | Sekundäre Bedürfnisse |
|--------------|---------------------|----------------------|
| **Spieler** | Motivation steigern, Fortschritt sehen, Vergleich mit anderen | Trainingsplanung, soziale Interaktion |
| **Coach** | Anwesenheit verwalten, Match-Qualität sichern, Engagement fördern | Statistiken einsehen, Challenges erstellen |
| **Admin** | Club verwalten, Benutzer administrieren | Reports exportieren, Einstellungen anpassen |

#### 5.1.2 Funktionale Anforderungen (Zusammenfassung)

**Kern-Features:**
- Multi-Session Training: Mehrere Trainings pro Tag mit individueller Anwesenheit
- Elo-Berechnung: Skill-basiertes Rating mit A-Faktor und Handicap-System
- Match-Validierung: Trainer-Genehmigung mit automatischer Punkt-/Elo-Vergabe
- Challenge-System: Milestone-basierte Ziele mit Partner-Option

#### 5.1.3 Nicht-funktionale Anforderungen (Zusammenfassung)

| Kategorie | Anforderung | Zielwert |
|-----------|-------------|----------|
| **Performance** | Initiale Ladezeit | < 3 Sekunden |
| **Performance** | SPA-Navigation | < 500ms |
| **SEO** | Progressive Enhancement | Grundfunktionen ohne JS |
| **Usability** | Klicks zu Hauptfunktion | ≤ 3 |
| **Sicherheit** | Authentifizierung | Supabase Auth + RLS |

---

### 5.2 Interaktionskonzept (Das "Wie")

#### 5.2.1 Umsetzung der Gamification-Elemente

**Elo als Kern-Feedback-Schleife:**

```
Match spielen → Ergebnis eintragen → Coach genehmigt → Elo + XP Update → Rangliste aktualisiert
     ↑                                                                           ↓
     └──────────────────── Motivation für nächstes Match ←───────────────────────┘
```

Das Elo-System bildet das Herzstück der Gamification:
- **Unmittelbares Feedback**: Nach jeder Match-Genehmigung sieht der Spieler seine Elo-Änderung
- **Faire Bewertung**: Sieg gegen stärkeren Gegner = mehr Elo-Gewinn
- **Kompetenzbasiert**: Zeigt tatsächliche Spielstärke (nicht nur Aktivität)

**XP und Ränge als Langzeit-Progression:**
- XP zeigt Gesamtengagement (wird nie zurückgesetzt)
- Ränge geben Status und Zielvorgaben (Bronze → Grandmaster)
- Season Points schaffen kurzfristigen Wettbewerb (6-Wochen-Zyklen)

#### 5.2.2 Die Rolle des Coaches als "Gamemaster"

Ein zentraler **Erkenntnispivot** während der Entwicklung war die Bedeutung des Coaches:

| Traditionelle Rolle | Gamification-Rolle als "Gamemaster" |
|---------------------|-------------------------------------|
| Trainingsleitung | **Match-Validierung**: Qualitätssicherung der Ergebnisse |
| Anwesenheitskontrolle | **Session-Management**: Anwesenheit = XP-Vergabe |
| Trainer | **Challenge-Designer**: Erstellt motivierende Aufgaben |
| Mentor | **Feedback-Geber**: Genehmigt/Ablehnt mit Kommentar |

**Warum ist der Coach so wichtig?**
1. **Verhindert Manipulation**: Spieler können nicht selbst Punkte vergeben
2. **Schafft soziale Anerkennung**: Coach-Genehmigung = offizielle Anerkennung
3. **Qualitätssicherung**: Nur valide Matches fließen in Elo ein
4. **Bindeglied**: Verbindet digitale Gamification mit realem Training

---

### 5.3 Technisches Design (Die Architektur)

#### 5.3.1 Frontend: Custom SPA-Ansatz (spa-enhancer.js)

**Warum kein React/Vue/Angular?**
- Geringere Bundle-Größe (Performance)
- Einfachere Wartung
- Progressive Enhancement möglich
- Schnellere initiale Ladezeit

**Architektur des SPA-Enhancers:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPA-Enhancer                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Router    │  │    Cache    │  │   History Management    │  │
│  │ (Link-      │  │ (Page-HTML  │  │ (Browser Back/Forward   │  │
│  │  Intercept) │  │  caching)   │  │  Support)               │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Event System                             ││
│  │  • navigationStart    • loadStart     • loadEnd             ││
│  │  • navigationEnd      • prefetch                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Progressive Enhancement:**
1. Server liefert vollständiges HTML (SEO-freundlich)
2. JavaScript aktiviert SPA-Features (bessere UX)
3. Bei JS-Fehler: Normale Navigation funktioniert weiterhin

#### 5.3.2 Backend: Datenmodell in Supabase (PostgreSQL)

**Haupt-Tabellen:**

```sql
-- Benutzerprofile
profiles (
    id UUID PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    elo_rating INTEGER DEFAULT 1000,
    xp INTEGER DEFAULT 0,
    season_points INTEGER DEFAULT 0,
    club_id UUID REFERENCES clubs(id),
    role TEXT CHECK (role IN ('player', 'coach', 'admin'))
)

-- Training Sessions
training_sessions (
    id UUID PRIMARY KEY,
    date DATE,
    start_time TIME,
    end_time TIME,
    subgroup_id UUID,
    club_id UUID,
    recurring_template_id UUID,  -- NULL bei spontanen Sessions
    cancelled BOOLEAN DEFAULT false
)

-- Anwesenheit
attendance (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES training_sessions(id),
    date DATE,
    club_id UUID,
    subgroup_id UUID,
    present_player_ids UUID[]
)

-- Matches
matches (
    id UUID PRIMARY KEY,
    player1_id UUID,
    player2_id UUID,
    winner_id UUID,
    score TEXT,  -- z.B. "3:1"
    sets JSONB,  -- z.B. [{"p1": 11, "p2": 9}, ...]
    status TEXT,  -- 'pending', 'approved', 'rejected'
    approved_by UUID,
    elo_change_p1 INTEGER,
    elo_change_p2 INTEGER
)
```

**Row Level Security (RLS):**
```sql
-- Spieler können nur eigene Daten bearbeiten
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Coaches können Matches ihres Clubs genehmigen
CREATE POLICY "Coaches can approve club matches"
ON matches FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('coach', 'admin')
        AND club_id = matches.club_id
    )
);
```

---

### 5.4 Methodik der Evaluation

#### 5.4.1 Studiendesign: 6-wöchige Feldstudie

**Zeitraum:** 6 Wochen (entspricht einer "Season")

**Phasen:**
1. **Woche 0**: Baseline-Messung (vor System-Einführung)
2. **Woche 1-6**: Aktive Nutzung mit Datenerhebung
3. **Woche 6**: Abschluss-Evaluation

#### 5.4.2 Stichprobe

| Gruppe | Anzahl | Charakteristik |
|--------|--------|----------------|
| **Jugendliche** (U18) | ~15 | Start-Elo: 800 |
| **Erwachsene** (Ü18) | ~25 | Start-Elo: 1000 |
| **Coaches** | 3-5 | Trainer mit Freigabe-Rechten |
| **Gesamt** | ~45 | Ein Verein (SC Harburg) |

#### 5.4.3 Datenerhebung

**Quantitative Erhebung:**

| Metrik | Quelle | Messzeitpunkt |
|--------|--------|---------------|
| Trainingsteilnahme | System-Logs | Kontinuierlich |
| Match-Frequenz | System-Logs | Kontinuierlich |
| XP-Progression | System-Logs | Kontinuierlich |
| Challenge-Completion | System-Logs | Kontinuierlich |

**Qualitative Erhebung - Umfrage:**

| Konstrukt | Instrument | Items |
|-----------|------------|-------|
| **Usability** | System Usability Scale (SUS) | 10 Items, 5-Punkt-Skala |
| **Akzeptanz** | Technology Acceptance Model (TAM) | 6 Items |
| **Motivation** | Intrinsic Motivation Inventory (IMI) | 8 Items |
| **Zufriedenheit** | Custom | 5 Items |

**Beispiel-Fragen:**

*Usability (SUS):*
- "Ich fand das System unnötig komplex." (1-5)
- "Ich konnte das System ohne technische Hilfe nutzen." (1-5)

*Akzeptanz:*
- "Das Elo-System motiviert mich, gegen stärkere Gegner zu spielen." (1-5)
- "Die Rangliste spornt mich zu mehr Training an." (1-5)

*Motivation:*
- "Ich trainiere häufiger, seit ich SC Champions nutze." (1-5)
- "Welches Feature motiviert dich am meisten?" (Auswahl)

---

## 6. Implementierung

### 6.1 Highlight 1: Der "SPA-Enhancer"

#### 6.1.1 Progressive Enhancement

**Problemstellung:**
- Traditionelle SPAs (React, Angular) erfordern JavaScript für Grundfunktionalität
- Schlechte SEO-Indizierung bei clientseitigem Rendering
- Lange initiale Ladezeiten durch große JavaScript-Bundles

**Lösung: Custom SPA-Enhancer**

```javascript
// spa-enhancer.js - Kernkonzept
class SPAEnhancer {
    constructor() {
        this.cache = new Map();
        this.listeners = new Map();
    }

    // Link-Klicks abfangen
    interceptLinks() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.shouldIntercept(link)) {
                e.preventDefault();
                this.navigate(link.href);
            }
        });
    }

    // SPA-Navigation
    async navigate(url) {
        this.emit('navigationStart', { url });
        this.showLoader();

        const html = await this.fetchPage(url);
        this.updateContent(html);
        history.pushState({}, '', url);

        this.hideLoader();
        this.emit('navigationEnd', { url });
    }
}
```

**Vorteile:**
- **Fallback**: Bei JavaScript-Fehler funktioniert normale Navigation
- **SEO**: Server liefert vollständiges HTML
- **Performance**: Seiten werden gecacht, spätere Aufrufe instant

#### 6.1.2 Caching-Strategie

```javascript
// Page-Caching mit TTL
async fetchPage(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 Min TTL
        return cached.html;
    }

    const response = await fetch(url);
    const html = await response.text();

    this.cache.set(url, { html, timestamp: Date.now() });
    return html;
}

// Prefetching für schnellere Navigation
prefetch(url) {
    if (!this.cache.has(url)) {
        this.fetchPage(url); // Im Hintergrund laden
    }
}
```

#### 6.1.3 History Management

```javascript
// Browser Back/Forward unterstützen
setupHistoryHandling() {
    window.addEventListener('popstate', () => {
        this.navigate(window.location.href, false); // false = kein pushState
    });
}
```

---

### 6.2 Highlight 2: Advanced UX-Features

#### 6.2.1 Toast Notifications

**Ersetzt traditionelle Alerts mit modernen, nicht-blockierenden Benachrichtigungen.**

```javascript
// Verwendung
window.notifications.success('Match erfolgreich erstellt!');
window.notifications.error('Fehler beim Speichern');
window.notifications.warning('Bitte alle Felder ausfüllen');

// Loading-Toast für längere Operationen
const loader = window.notifications.loading('Speichere Match...');
try {
    await saveMatch(data);
    loader.success('Match gespeichert!');
} catch (error) {
    loader.error('Fehler: ' + error.message);
}
```

**Technische Umsetzung:**
- CSS-Animationen für Ein-/Ausblenden
- Automatisches Timeout (konfigurierbar)
- Stack-Management (mehrere Toasts gleichzeitig)
- Mobile-responsive

#### 6.2.2 Page Transitions

```css
/* Fade-In Animation bei Seitenwechsel */
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

#main-content {
    animation: fadeIn 0.3s ease-in-out;
}

/* Accessibility: Respektiert Benutzer-Präferenzen */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
    }
}
```

#### 6.2.3 Loading Indicator

```javascript
// Automatisch bei SPA-Navigation
showLoader() {
    const bar = document.createElement('div');
    bar.className = 'spa-loading-bar';
    document.body.appendChild(bar);
}

hideLoader() {
    document.querySelector('.spa-loading-bar')?.remove();
}
```

```css
.spa-loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, #4f46e5, #7c3aed);
    animation: loadingProgress 1s ease-in-out infinite;
}
```

---

### 6.3 Highlight 3: Multi-Session Training System

#### 6.3.1 Problemstellung

Traditionelle Systeme unterstützen nur "ein Training pro Tag":
- 16:00-17:00 Basic-Training
- 17:00-19:00 Leistungstraining

→ Beide am selben Tag, aber unterschiedliche Gruppen und separate Anwesenheit nötig.

#### 6.3.2 Lösung: Session-basierte Architektur

**Datenmodell:**

```
recurringTrainingTemplates     trainingSessions          attendance
┌─────────────────────┐       ┌──────────────────┐      ┌─────────────────┐
│ dayOfWeek: 1        │ ───→  │ date: 2025-01-06 │ ←─── │ sessionId: xyz  │
│ startTime: 16:00    │       │ startTime: 16:00 │      │ playerIds: [...] │
│ endTime: 17:00      │       │ subgroupId: abc  │      │ date: 2025-01-06│
│ subgroupId: abc     │       │ templateId: ...  │      └─────────────────┘
└─────────────────────┘       └──────────────────┘
```

**Automatische Session-Generierung (Edge Function):**

```javascript
// Läuft täglich um 00:00 Uhr
async function autoGenerateTrainingSessions() {
    const templates = await getActiveTemplates();

    for (const template of templates) {
        for (let day = 0; day < 14; day++) {
            const date = addDays(today, day);

            if (getDayOfWeek(date) === template.dayOfWeek) {
                await createSessionIfNotExists(template, date);
            }
        }
    }
}
```

#### 6.3.3 UI-Integration

**Kalender zeigt Sessions visuell:**
- 🔵 = 1 Session
- 🔵🔵 = 2 Sessions
- 🔵🔵🔵 = 3+ Sessions

**Klick-Verhalten:**
- 0 Sessions → "Spontanes Training erstellen"
- 1 Session → Direkt Anwesenheit erfassen
- 2+ Sessions → Session-Auswahl Modal

---

### 6.4 Highlight 4: Test-Strategie

#### 6.4.1 End-to-End Test Szenarien

| Test | Beschreibung | Erwartetes Ergebnis |
|------|--------------|---------------------|
| **Recurring Template** | Coach erstellt wiederkehrendes Training | Sessions für 14 Tage werden generiert |
| **Overlap Prevention** | Template mit überlappenden Zeiten erstellen | Fehlermeldung, Template nicht erstellt |
| **Multi-Session Day** | 2 Sessions am gleichen Tag | Kalender zeigt 2 Punkte, Modal zur Auswahl |
| **Attendance per Session** | Anwesenheit für beide Sessions erfassen | Separate Attendance-Dokumente |
| **Match Pairings** | Paarungen für Session erstellen | Paarungen mit sessionId gespeichert |

#### 6.4.2 Security Tests (RLS)

```javascript
// Test: Spieler kann keine Session erstellen
test('player cannot create session', async () => {
    // Als Spieler einloggen
    await supabase.auth.signIn({ email: 'player@test.de', password: '...' });

    const { error } = await supabase
        .from('training_sessions')
        .insert({ date: '2025-01-01', club_id: 'xyz' });

    expect(error.code).toBe('42501'); // Permission denied
});

// Test: Coach kann nur eigenen Club verwalten
test('coach cannot modify other club', async () => {
    await supabase.auth.signIn({ email: 'coach@club-a.de', password: '...' });

    const { error } = await supabase
        .from('training_sessions')
        .insert({ date: '2025-01-01', club_id: 'club-b-id' });

    expect(error.code).toBe('42501');
});
```

#### 6.4.3 Firestore Security Rules (Legacy)

```javascript
// firestore.rules (vor Migration)
rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        // Trainings Sessions
        match /trainingSessions/{sessionId} {
            allow read: if request.auth != null;
            allow write: if isCoachOrAdmin();
        }

        function isCoachOrAdmin() {
            return get(/databases/$(database)/documents/users/$(request.auth.uid))
                .data.role in ['coach', 'admin'];
        }
    }
}
```

---

## 7. Use Cases

### UC-1: Spieler erstellt Match-Anfrage

**Primärer Akteur:** Spieler

**Hauptszenario:**
1. Spieler navigiert zum Dashboard
2. Spieler klickt auf "Match eintragen"
3. Spieler wählt Gegner aus Dropdown
4. Spieler gibt Ergebnis und Satz-Details ein
5. System validiert Eingaben
6. Spieler klickt "Match einreichen"
7. System zeigt Toast: "Match-Anfrage erfolgreich eingereicht"
8. Trainer erhält Benachrichtigung

**Relevante Anforderungen:** FA-4.1.1, FA-4.1.3, FA-4.1.6

---

### UC-2: Trainer genehmigt Match und erstellt Paarungen

**Primärer Akteur:** Trainer

**Hauptszenario:**
1. Trainer öffnet Trainer-Dashboard
2. Trainer sieht ausstehende Match-Anfragen
3. Trainer prüft Match-Details
4. Trainer klickt "Genehmigen"
5. System aktualisiert Elo-Rating und vergibt XP
6. Spieler erhalten Push-Benachrichtigung
7. Trainer öffnet Kalender → wählt heutige Session
8. Trainer erfasst Anwesenheit
9. Trainer klickt "Paarungen erstellen"
10. System generiert Elo-basierte Paarungen
11. Trainer klickt "Paarungen speichern"

**Relevante Anforderungen:** FA-4.1.4, FA-4.1.5, FA-5.3.1

---

### UC-3: Spieler sieht heutige Trainings und Paarungen

**Primärer Akteur:** Spieler

**Hauptszenario:**
1. Spieler öffnet Dashboard
2. Dashboard zeigt "Heutige Trainings" Widget
3. Widget zeigt Sessions mit Zeit und Untergruppe
4. Für jede Session werden Paarungen angezeigt
5. Eigene Paarung ist farblich hervorgehoben
6. Spieler sieht: "16:00-17:00 Basic • Du spielst gegen: Max Mustermann"

**Relevante Anforderungen:** FA-6.1.2, FA-6.1.3

---

## 8. Metriken und Erfolgskriterien

### 8.1 Quantitative Metriken

| Metrik | Baseline | Ziel nach 6 Wochen |
|--------|----------|-------------------|
| Trainingsteilnahme/Woche | 60% | 75% (+25%) |
| Matches/Spieler/Woche | 2.0 | 3.0 (+50%) |
| Spieler ohne Match/Monat | 30% | 15% (-50%) |
| App-Öffnungen/Spieler/Woche | - | ≥3 |

### 8.2 Qualitative Metriken

| Metrik | Instrument | Zielwert |
|--------|------------|----------|
| **SUS-Score** | System Usability Scale | ≥68 (überdurchschnittlich) |
| **Akzeptanz** | TAM-Fragen | ≥4.0/5.0 |
| **Motivation** | "Hat die App deine Trainingsmotivation gesteigert?" | ≥70% "Ja" |
| **NPS** | Net Promoter Score | >30 |

### 8.3 Vergleich Vor/Nach

| Dimension | Vorher | Nachher (Ziel) |
|-----------|--------|----------------|
| Trainingsmotivation (1-10) | 5.0 | 7.5 |
| Engagement außerhalb Training | Niedrig | Mittel-Hoch |
| Sichtbarkeit des Fortschritts | Keine | Klar (XP, Elo, Rang) |
| Soziale Interaktion | Begrenzt | Verstärkt (Ranglisten, Challenges) |

---

## Anhang

### A.1 Technologie-Stack

**Frontend:**
- HTML5, CSS3 (Tailwind CSS)
- JavaScript (ES6+ Modules)
- Custom SPA-Enhancer
- PWA-fähig (Service Worker)

**Backend:**
- Supabase (PostgreSQL + Auth + Storage)
- Supabase Edge Functions (Deno)
- Row Level Security (RLS)

**Deployment:**
- Vercel / Supabase Hosting
- GitHub Actions (CI/CD)

### A.2 Glossar

| Begriff | Definition |
|---------|------------|
| **Elo-Rating** | Skill-basiertes Ranking-System (1000 = Durchschnitt Erwachsene) |
| **XP** | Experience Points - permanente Fortschrittspunkte |
| **Season Points** | Temporäre Punkte für 6-Wochen-Wettbewerb |
| **A-Faktor** | Multiplikator für Elo-Änderungen (höher bei neuen Spielern) |
| **SPA-Enhancer** | Custom Single-Page-Application Framework |
| **RLS** | Row Level Security - Datenbankzugriffskontrolle |

### A.3 Literaturverweise

1. Deterding, S. et al. (2011): "From Game Design Elements to Gamefulness"
2. Ryan, R. M. & Deci, E. L. (2000): "Self-Determination Theory"
3. Hamari, J. & Koivisto, J. (2015): "Why do people use gamification services?"
4. Brooke, J. (1996): "SUS: A Quick and Dirty Usability Scale"

---

**Dokumenten-Version:** 2.0
**Erstellt:** November 2025
**Aktualisiert:** Dezember 2025
**Autor:** Tommy Wang
**Status:** Erweitert für Bachelorarbeit
