# SC Champions - Bachelorarbeit Dokumentation

**Titel:** Steigerung der Trainingsmotivation in Tischtennisvereinen durch Gamification
**Autor:** Tommy Wang
**Datum:** Dezember 2025

---

## Inhaltsverzeichnis

1. [Einleitung](#1-einleitung)
2. [Theoretische Grundlagen](#2-theoretische-grundlagen)
3. [Konzeption und Methodik](#3-konzeption-und-methodik)
4. [Implementierung](#4-implementierung)
5. [Anforderungskatalog](#5-anforderungskatalog)
6. [Evaluation](#6-evaluation)
7. [Anhang](#7-anhang)

---

## 1. Einleitung

### 1.1 Problemstellung

Viele Tischtennisvereine kämpfen mit wiederkehrenden Herausforderungen:

| Problem | Auswirkung |
|---------|------------|
| Sinkende Trainingsmotivation | Geringere Teilnahmezahlen |
| Unregelmäßige Anwesenheit | Erschwertes Trainingsmanagement |
| Mangelnde Sichtbarkeit des Fortschritts | Frustration bei Spielern |
| Fehlende Struktur außerhalb von Wettkämpfen | Engagement beschränkt auf Spieltage |

### 1.2 Zielsetzung

Entwicklung einer webbasierten Gamification-Plattform, die:
- Trainingsmotivation durch Spielmechaniken steigert
- Fortschritt sichtbar und messbar macht
- Soziale Interaktion im Verein fördert
- Coaches bei der Trainingsorganisation unterstützt

### 1.3 Nutzergruppen

| Rolle | Beschreibung | Kernfunktionen |
|-------|--------------|----------------|
| **Spieler** | Aktive Vereinsmitglieder | Matches eintragen, Fortschritt verfolgen, Challenges absolvieren |
| **Coach** | Trainer und Übungsleiter | Match-Freigaben, Anwesenheit erfassen, Trainingsplanung |
| **Admin** | Vereinsadministrator | Benutzerverwaltung, Club-Einstellungen, Subgruppen |

---

## 2. Theoretische Grundlagen

### 2.1 Gamification Definition

> **Gamification** ist die Verwendung von Spielelementen und Game-Design-Techniken in spielfremden Kontexten (Deterding et al., 2011).

### 2.2 Self-Determination Theory (SDT)

Nach Ryan & Deci (2000) basiert intrinsische Motivation auf drei Grundbedürfnissen:

| Bedürfnis | Definition | Umsetzung in SC Champions |
|-----------|------------|---------------------------|
| **Autonomie** | Selbstbestimmtes Handeln | Spieler wählen Gegner, Challenges, Trainings selbst |
| **Kompetenz** | Wirksamkeitserleben | Elo-Rating zeigt Spielstärke, XP zeigt Engagement |
| **Soziale Eingebundenheit** | Zugehörigkeitsgefühl | Ranglisten, Partner-System, Vereins-Community |

### 2.3 Verwendete Gamification-Elemente

| Element | Typ | Funktion |
|---------|-----|----------|
| **XP (Experience Points)** | Punkte | Permanenter Fortschrittsindikator |
| **Season Points** | Punkte | Temporärer 6-Wochen-Wettbewerb |
| **Elo-Rating** | Skill-System | Objektive Spielstärkemessung |
| **Ränge** | Status | Bronze → Grandmaster Hierarchie |
| **Leaderboards** | Ranglisten | Sozialer Vergleich |
| **Challenges** | Quests | Zielgerichtete Aufgaben |
| **Streaks** | Belohnungssystem | Kontinuitätsanreiz |

---

## 3. Konzeption und Methodik

### 3.1 Anforderungsanalyse

#### 3.1.1 Erhebungsmethoden
- Interviews mit Trainern und Spielern
- Beobachtung des Trainingsalltags
- Analyse bestehender Systeme (myTischtennis, click-TT)

#### 3.1.2 Identifizierte Kernprobleme

```
Spieler-Perspektive:
├── "Ich weiß nicht, ob ich besser werde"
├── "Training fühlt sich monoton an"
└── "Keine Motivation außerhalb von Mannschaftsspielen"

Coach-Perspektive:
├── "Anwesenheitslisten sind umständlich"
├── "Schwer, Spieler zu aktivieren"
└── "Kein Überblick über Spielerentwicklung"
```

### 3.2 Interaktionskonzept

#### 3.2.1 Elo als Kern-Feedback-Schleife

Das Elo-System bildet das Herzstück der Gamification:

```
┌──────────────────────────────────────────────────────────────────┐
│                    ELO FEEDBACK LOOP                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Match spielen ──→ Ergebnis eintragen ──→ Coach genehmigt      │
│         ↑                                          │             │
│         │                                          ↓             │
│         │                                  Elo + XP Update       │
│         │                                          │             │
│         │                                          ↓             │
│    Motivation ←────── Rangliste ←───── Sichtbarer Fortschritt   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Eigenschaften des Elo-Systems:**
- **Unmittelbares Feedback**: Elo-Änderung sofort nach Genehmigung sichtbar
- **Faire Bewertung**: Sieg gegen stärkeren Gegner = mehr Elo-Gewinn
- **A-Faktor**: Neue Spieler haben höheren Multiplikator (32→24→16)
- **Jugend-Faktor**: U21-Spieler behalten erhöhten Faktor (20)
- **Rating Floor**: Minimum bei 400 Elo (kein negatives Erlebnis)

#### 3.2.2 Der Coach als "Gamemaster"

Ein zentraler **Erkenntnispivot** während der Entwicklung:

| Traditionelle Rolle | Gamification-Rolle |
|---------------------|-------------------|
| Trainingsleitung | **Match-Validator**: Qualitätssicherung der Ergebnisse |
| Anwesenheitskontrolle | **XP-Verwalter**: Anwesenheit = Punkte |
| Trainer | **Challenge-Designer**: Erstellt motivierende Aufgaben |
| Mentor | **Feedback-Geber**: Genehmigt/Ablehnt mit Begründung |

**Warum der Coach unverzichtbar ist:**
1. **Verhindert Manipulation** - Spieler können nicht selbst Punkte vergeben
2. **Schafft Anerkennung** - Coach-Genehmigung = offizielle Bestätigung
3. **Qualitätssicherung** - Nur valide Matches fließen ins Elo ein
4. **Bindeglied** - Verbindet digitales System mit realem Training

### 3.3 Technisches Design

#### 3.3.1 Architekturentscheidung: Custom SPA vs. Framework

**Entscheidung:** Custom SPA-Enhancer statt React/Vue/Angular

| Kriterium | Custom SPA | React/Vue |
|-----------|------------|-----------|
| Bundle-Größe | ~15 KB | ~150+ KB |
| Initiale Ladezeit | < 2s | 3-5s |
| Progressive Enhancement | ✅ Ja | ❌ Nein |
| SEO | ✅ Server-HTML | ⚠️ Hydration nötig |
| Lernkurve | Gering | Hoch |

**SPA-Enhancer Architektur:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPA-ENHANCER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │     Router      │  │     Cache     │  │  History API     │  │
│  │  (Link-Click    │  │  (Page HTML   │  │  (Back/Forward   │  │
│  │   Intercept)    │  │   Caching)    │  │   Support)       │  │
│  └─────────────────┘  └───────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Features                                 ││
│  │  • Toast Notifications    • Page Transitions               ││
│  │  • Loading Indicator      • Prefetching                    ││
│  │  • Offline Detection      • Analytics Events               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 Backend: Supabase (PostgreSQL)

**Datenmodell (Haupt-Tabellen):**

```sql
-- Benutzerprofile
profiles (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE,
    display_name TEXT,
    elo_rating INTEGER DEFAULT 800,
    xp INTEGER DEFAULT 0,
    season_points INTEGER DEFAULT 0,
    singles_matches_played INTEGER DEFAULT 0,
    club_id UUID REFERENCES clubs(id),
    role TEXT CHECK (role IN ('player', 'coach', 'admin')),
    birthdate TEXT,  -- Für Jugend-Faktor
    created_at TIMESTAMPTZ
)

-- Matches
matches (
    id UUID PRIMARY KEY,
    player_a_id UUID REFERENCES profiles(id),
    player_b_id UUID REFERENCES profiles(id),
    winner_id UUID REFERENCES profiles(id),
    score TEXT,  -- "3:1"
    sets JSONB,  -- [{p1: 11, p2: 9}, ...]
    status TEXT,  -- 'pending', 'approved', 'rejected'
    elo_change_a INTEGER,
    elo_change_b INTEGER,
    handicap_used BOOLEAN DEFAULT false,
    processed BOOLEAN DEFAULT false
)

-- Training Sessions (Multi-Session System)
training_sessions (
    id UUID PRIMARY KEY,
    date DATE,
    start_time TIME,
    end_time TIME,
    subgroup_id UUID REFERENCES subgroups(id),
    club_id UUID REFERENCES clubs(id),
    recurring_template_id UUID,  -- NULL bei spontanen Sessions
    cancelled BOOLEAN DEFAULT false
)

-- Anwesenheit (pro Session)
attendance (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES training_sessions(id),
    date DATE,
    present_player_ids UUID[],
    created_at TIMESTAMPTZ
)
```

**Row Level Security (RLS):**

```sql
-- Spieler: Nur eigene Daten bearbeiten
CREATE POLICY "users_own_profile" ON profiles
FOR UPDATE USING (auth.uid() = id);

-- Coach: Match-Genehmigung im eigenen Club
CREATE POLICY "coaches_approve_matches" ON matches
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('coach', 'admin')
        AND club_id = matches.club_id
    )
);
```

### 3.4 Methodik der Evaluation

#### 3.4.1 Studiendesign

**Typ:** 6-wöchige Feldstudie (entspricht einer "Season")

**Phasen:**
| Phase | Zeitraum | Aktivität |
|-------|----------|-----------|
| Baseline | Woche 0 | Messung vor System-Einführung |
| Intervention | Woche 1-6 | Aktive Nutzung mit Datenerhebung |
| Post-Test | Woche 6 | Abschluss-Evaluation |

#### 3.4.2 Stichprobe

| Gruppe | n | Charakteristik |
|--------|---|----------------|
| Jugendliche (U18) | ~15 | Start-Elo: 800 |
| Erwachsene (Ü18) | ~25 | Start-Elo: 1000 |
| Coaches | 3-5 | Freigabe-Berechtigung |
| **Gesamt** | **~45** | Ein Verein |

#### 3.4.3 Erhebungsinstrumente

**Quantitative Daten (System-Logs):**
- Trainingsteilnahme pro Woche
- Match-Frequenz pro Spieler
- XP-Progression
- Challenge-Completion-Rate
- Session Duration

**Qualitative Daten (Umfrage):**

| Konstrukt | Instrument | Items |
|-----------|------------|-------|
| **Usability** | System Usability Scale (SUS) | 10 Items, 5-Punkt-Likert |
| **Akzeptanz** | Technology Acceptance Model (TAM) | 6 Items |
| **Motivation** | Intrinsic Motivation Inventory (IMI) | 8 Items |
| **Zufriedenheit** | Eigenentwicklung | 5 Items |

**Beispiel-Fragen:**

*SUS (Usability):*
- "Ich fand das System unnötig komplex." (1=stimme nicht zu, 5=stimme zu)
- "Ich konnte das System ohne technische Hilfe nutzen."

*TAM (Akzeptanz):*
- "Das Elo-System motiviert mich, gegen stärkere Gegner zu spielen."
- "Die Rangliste spornt mich zu mehr Training an."

*IMI (Motivation):*
- "Ich trainiere häufiger, seit ich SC Champions nutze."
- "Ich fühle mich durch das System unter Druck gesetzt." (negativ)

---

## 4. Implementierung

### 4.1 Highlight 1: SPA-Enhancer mit Progressive Enhancement

#### Problem
Traditionelle SPAs (React, Angular) erfordern JavaScript für Grundfunktionalität, was zu schlechter SEO und langen Ladezeiten führt.

#### Lösung

```javascript
// spa-enhancer.js - Kernprinzip
class SPAEnhancer {
    constructor() {
        this.cache = new Map();
    }

    // Link-Klicks abfangen
    interceptLinks() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.isInternalLink(link)) {
                e.preventDefault();
                this.navigate(link.href);
            }
        });
    }

    // SPA-Navigation mit Fallback
    async navigate(url) {
        try {
            this.showLoader();
            const html = await this.fetchWithCache(url);
            this.updateDOM(html);
            history.pushState({}, '', url);
        } catch (error) {
            // Fallback: Normale Navigation
            window.location.href = url;
        } finally {
            this.hideLoader();
        }
    }

    // Caching mit TTL
    async fetchWithCache(url) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.time < 300000) {
            return cached.html;
        }
        const html = await fetch(url).then(r => r.text());
        this.cache.set(url, { html, time: Date.now() });
        return html;
    }
}
```

**Ergebnis:**
- ✅ Navigation ohne Page-Reload (< 500ms)
- ✅ SEO-freundlich (Server liefert HTML)
- ✅ Fallback bei JS-Fehler
- ✅ Browser Back/Forward funktioniert

### 4.2 Highlight 2: Toast Notification System

#### Problem
Browser `alert()` blockiert die UI und bietet schlechte UX.

#### Lösung

```javascript
// Verwendung
window.notifications.success('Match gespeichert!');
window.notifications.error('Fehler beim Speichern');

// Loading-Toast mit Update
const loader = window.notifications.loading('Speichere...');
try {
    await saveMatch(data);
    loader.success('Gespeichert!');
} catch (e) {
    loader.error(e.message);
}
```

**Features:**
- Nicht-blockierend
- Automatisches Timeout
- Verschiedene Typen (success, error, warning, info)
- Loading-Toast mit Zustandsänderung
- Mobile-responsive
- Stack-Management (mehrere gleichzeitig)

### 4.3 Highlight 3: Multi-Session Training System

#### Problem
Traditionelle Systeme unterstützen nur "ein Training pro Tag", aber Vereine haben oft:
- 16:00-17:00 Anfänger-Training
- 17:00-19:00 Leistungstraining

#### Lösung: Session-basierte Architektur

```
┌─────────────────────┐     ┌───────────────────┐     ┌────────────────┐
│ Recurring Template  │ ──→ │ Training Session  │ ←── │   Attendance   │
├─────────────────────┤     ├───────────────────┤     ├────────────────┤
│ dayOfWeek: 1        │     │ date: 2025-01-06  │     │ sessionId: xyz │
│ startTime: 16:00    │     │ startTime: 16:00  │     │ playerIds: []  │
│ endTime: 17:00      │     │ subgroupId: abc   │     └────────────────┘
│ subgroupId: abc     │     │ templateId: ...   │
└─────────────────────┘     └───────────────────┘
```

**Auto-Generierung (Edge Function):**

```javascript
// Läuft täglich um 00:00 Uhr
async function autoGenerateSessions() {
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

**UI-Verhalten:**
- Kalender zeigt Punkte pro Tag (🔵 = 1 Session, 🔵🔵 = 2 Sessions)
- Klick auf Tag mit mehreren Sessions → Modal zur Auswahl
- Anwesenheit wird pro Session erfasst
- XP für jede besuchte Session

### 4.4 Highlight 4: Advanced Elo-System

#### Implementierung (PostgreSQL Function)

```sql
CREATE OR REPLACE FUNCTION calculate_elo_advanced(
    p_winner_id UUID,
    p_loser_id UUID,
    p_winner_elo INTEGER,
    p_loser_elo INTEGER,
    p_handicap_used BOOLEAN DEFAULT FALSE
) RETURNS TABLE(winner_change INT, loser_change INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_expected_winner FLOAT;
    v_k_winner INTEGER;
    v_k_loser INTEGER;
BEGIN
    -- A-Faktoren holen (individuell pro Spieler)
    v_k_winner := get_a_factor(p_winner_id);
    v_k_loser := get_a_factor(p_loser_id);

    IF p_handicap_used THEN
        -- Fixe ±8 Punkte bei Handicap
        RETURN QUERY SELECT 8, -8;
    ELSE
        -- Standard Elo-Formel
        v_expected_winner := 1.0 / (1.0 + POWER(10, (p_loser_elo - p_winner_elo) / 400.0));

        winner_change := ROUND(v_k_winner * (1 - v_expected_winner));
        loser_change := ROUND(v_k_loser * (0 - (1 - v_expected_winner)));

        -- Rating Floor bei 400
        IF p_loser_elo + loser_change < 400 THEN
            loser_change := 400 - p_loser_elo;
        END IF;

        RETURN QUERY SELECT winner_change, loser_change;
    END IF;
END;
$$;
```

**A-Faktor Logik:**
| Matches gespielt | A-Faktor | Phase |
|------------------|----------|-------|
| 0-9 | 32 | Initialisierung |
| 10-19 | 24 | Stabilisierung |
| 20+ | 16 | Etabliert |
| U21 Spieler | 20 | Jugend (permanent) |

### 4.5 Test-Strategie

#### End-to-End Tests

| Test | Schritte | Erwartung |
|------|----------|-----------|
| Recurring Template | Coach erstellt Template | Sessions für 14 Tage generiert |
| Overlap Prevention | Überlappende Zeiten eingeben | Fehlermeldung |
| Multi-Session | 2 Sessions am gleichen Tag | Kalender zeigt 2 Punkte |
| Match Approval | Coach genehmigt Match | Elo + XP aktualisiert |

#### Security Tests (RLS)

```javascript
test('player cannot create session', async () => {
    await supabase.auth.signInWithPassword({
        email: 'player@test.de',
        password: '...'
    });

    const { error } = await supabase
        .from('training_sessions')
        .insert({ date: '2025-01-01', club_id: 'xyz' });

    expect(error.code).toBe('42501'); // Permission denied
});
```

---

## 5. Anforderungskatalog

### 5.1 Funktionale Anforderungen

#### FA-1: Authentifizierung & Benutzerverwaltung

| ID | Anforderung | Priorität |
|----|-------------|-----------|
| FA-1.1 | E-Mail/Passwort Registrierung | Must |
| FA-1.2 | Drei Rollen: Spieler, Coach, Admin | Must |
| FA-1.3 | Profil mit Statistiken (Elo, XP, Rang) | Must |
| FA-1.4 | Registrierung ohne Club möglich | Should |
| FA-1.5 | DSGVO-konformes Löschen | Should |

#### FA-2: Gamification-Mechaniken

| ID | Anforderung | Priorität |
|----|-------------|-----------|
| FA-2.1 | XP-System (permanent) | Must |
| FA-2.2 | Season Points (6-Wochen-Reset) | Must |
| FA-2.3 | Elo-Rating mit A-Faktor | Must |
| FA-2.4 | Ränge (Bronze → Grandmaster) | Must |
| FA-2.5 | Drei Leaderboards (XP, Season, Elo) | Must |
| FA-2.6 | Doppel-Rangliste | Should |
| FA-2.7 | Challenge-System mit Milestones | Should |
| FA-2.8 | Anwesenheits-Streaks | Should |

#### FA-3: Match-Verwaltung

| ID | Anforderung | Priorität |
|----|-------------|-----------|
| FA-3.1 | Einzel-Match eintragen | Must |
| FA-3.2 | Doppel-Match eintragen | Must |
| FA-3.3 | Coach-Genehmigung erforderlich | Must |
| FA-3.4 | Match-Validierung (Satzergebnis) | Must |
| FA-3.5 | Automatische Elo/XP-Vergabe | Must |
| FA-3.6 | Handicap-System bei großem Elo-Unterschied | Should |
| FA-3.7 | Match-Medien (Fotos/Videos) | Nice |

#### FA-4: Training & Anwesenheit

| ID | Anforderung | Priorität |
|----|-------------|-----------|
| FA-4.1 | Wiederkehrende Trainings (Templates) | Must |
| FA-4.2 | Mehrere Sessions pro Tag | Must |
| FA-4.3 | Automatische Session-Generierung | Must |
| FA-4.4 | Anwesenheit pro Session | Must |
| FA-4.5 | Spontane Trainings erstellen | Should |
| FA-4.6 | Session absagen (Soft Delete) | Should |

### 5.2 Nicht-funktionale Anforderungen

#### NFA-1: Performance

| ID | Anforderung | Zielwert |
|----|-------------|----------|
| NFA-1.1 | Initiale Ladezeit | < 3 Sekunden |
| NFA-1.2 | SPA-Navigation | < 500ms |
| NFA-1.3 | Leaderboard (100+ Spieler) | < 2 Sekunden |

#### NFA-2: Usability

| ID | Anforderung | Zielwert |
|----|-------------|----------|
| NFA-2.1 | Klicks zu Hauptfunktion | ≤ 3 |
| NFA-2.2 | SUS-Score | ≥ 68 |
| NFA-2.3 | Mobile-Responsive | Ja |

#### NFA-3: Sicherheit

| ID | Anforderung | Umsetzung |
|----|-------------|-----------|
| NFA-3.1 | Authentifizierung | Supabase Auth |
| NFA-3.2 | Autorisierung | Row Level Security |
| NFA-3.3 | Verschlüsselung | HTTPS |

#### NFA-4: SEO & Accessibility

| ID | Anforderung | Umsetzung |
|----|-------------|-----------|
| NFA-4.1 | Progressive Enhancement | Server-HTML + JS-Enhancement |
| NFA-4.2 | Semantisches HTML | Korrekte Überschriften-Hierarchie |
| NFA-4.3 | Reduced Motion | CSS `prefers-reduced-motion` |

---

## 6. Evaluation

### 6.1 Quantitative Metriken

| Metrik | Baseline | Ziel (6 Wochen) | Steigerung |
|--------|----------|-----------------|------------|
| Trainingsteilnahme/Woche | 60% | 75% | +25% |
| Matches/Spieler/Woche | 2.0 | 3.0 | +50% |
| Spieler ohne Match/Monat | 30% | 15% | -50% |
| App-Öffnungen/Woche | - | ≥ 3 | - |

### 6.2 Qualitative Metriken

| Metrik | Instrument | Zielwert |
|--------|------------|----------|
| **SUS-Score** | System Usability Scale | ≥ 68 (überdurchschnittlich) |
| **Akzeptanz** | TAM-Fragen | ≥ 4.0/5.0 |
| **Motivation** | IMI-Fragen | ≥ 70% positiv |
| **NPS** | Net Promoter Score | > 30 |

### 6.3 Hypothesen

| H# | Hypothese |
|----|-----------|
| H1 | Die Nutzung von SC Champions führt zu einer signifikanten Steigerung der Trainingsteilnahme. |
| H2 | Das Elo-System wird als fair und motivierend wahrgenommen. |
| H3 | Die Rolle des Coaches als "Gamemaster" erhöht die wahrgenommene Legitimität des Systems. |
| H4 | Season Points führen zu höherem kurzfristigem Engagement als permanente XP. |

---

## 7. Anhang

### A.1 Technologie-Stack

**Frontend:**
- HTML5, CSS3 (Tailwind CSS)
- JavaScript ES6+ (Module)
- Custom SPA-Enhancer
- PWA (Service Worker)

**Backend:**
- Supabase (PostgreSQL)
- Supabase Auth
- Supabase Edge Functions (Deno)
- Supabase Storage

**DevOps:**
- GitHub Actions (CI/CD)
- Vercel Hosting

### A.2 Projektstruktur

```
sc-champions/
├── public/
│   ├── js/
│   │   ├── spa-enhancer.js      # SPA-Kern
│   │   ├── notifications.js     # Toast-System
│   │   ├── supabase-config.js   # DB-Verbindung
│   │   ├── dashboard-supabase.js
│   │   ├── leaderboard.js
│   │   ├── matches-supabase.js
│   │   └── attendance.js
│   ├── css/
│   │   └── spa-enhancements.css
│   └── *.html                   # Seiten
├── supabase/
│   ├── schema.sql               # Haupt-Schema
│   ├── elo-system-v2.sql        # Elo-Berechnung
│   ├── rpc-functions.sql        # Server-Funktionen
│   └── *.sql                    # Migrations
└── docs/
    ├── SPA_README.md
    ├── MULTI_SESSION_TRAINING.md
    └── TESTING_GUIDE.md
```

### A.3 Glossar

| Begriff | Definition |
|---------|------------|
| **Elo-Rating** | Skill-basiertes Ranking (Standard: 1000 Erwachsene, 800 Jugend) |
| **XP** | Experience Points - permanente Fortschrittspunkte |
| **Season Points** | Temporäre Punkte (Reset alle 6 Wochen) |
| **A-Faktor** | Multiplikator für Elo-Änderung (32/24/16/20) |
| **RLS** | Row Level Security - Datenbankzugriffskontrolle |
| **SPA** | Single Page Application |
| **Progressive Enhancement** | Basis-Funktionalität ohne JS, erweitert mit JS |

### A.4 Literaturverzeichnis

1. Brooke, J. (1996). SUS: A Quick and Dirty Usability Scale. *Usability Evaluation in Industry*.

2. Deci, E. L., & Ryan, R. M. (2000). The "What" and "Why" of Goal Pursuits: Human Needs and the Self-Determination of Behavior. *Psychological Inquiry, 11*(4), 227-268.

3. Deterding, S., Dixon, D., Khaled, R., & Nacke, L. (2011). From Game Design Elements to Gamefulness: Defining Gamification. *Proceedings of MindTrek '11*.

4. Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does Gamification Work? A Literature Review of Empirical Studies on Gamification. *HICSS '14*.

5. Sailer, M., Hense, J. U., Mayr, S. K., & Mandl, H. (2017). How Gamification Motivates: An Experimental Study of the Effects of Specific Game Design Elements on Psychological Need Satisfaction. *Computers in Human Behavior, 69*, 371-380.

---

**Dokumenten-Version:** 3.0
**Erstellt:** November 2025
**Aktualisiert:** Dezember 2025
**Autor:** Tommy Wang
**Status:** Finalisiert für Bachelorarbeit
