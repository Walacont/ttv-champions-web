# 2.1.4 Relevanz der Gamification-Grundlagen für das Projekt

**Bachelorarbeit:** Steigerung der Motivation in Tischtennisvereinen durch Gamification
**Projekt:** TTV Champions Web-Anwendung
**Stand:** Januar 2026

---

## Zusammenfassung

Dieses Kapitel verbindet die theoretischen Gamification-Grundlagen (2.1.1-2.1.3) mit der konkreten Implementierung im TTV Champions Projekt. Es zeigt auf, wie die Definition nach Deterding et al., die Struktur nach Werbach & Hunter und die kritische Betrachtung von Gamification in der praktischen Umsetzung berücksichtigt wurden.

---

## 1. Anwendung der Definition nach Deterding et al.

### 1.1 Nicht-spielerischer Kontext

Deterding et al. (2011) definieren Gamification als "the use of game design elements in non-game contexts". Das TTV Champions Projekt wendet diese Definition auf den **Vereinssport-Kontext** an:

| Deterding-Kriterium | Umsetzung im Projekt |
|---------------------|----------------------|
| **Non-game context** | Tischtennisverein: Trainingsalltag, Wettkampfvorbereitung, Vereinsleben |
| **Game design elements** | Punkte, Ränge, Leaderboards, Challenges, Streaks, Achievements |
| **Ziel** | Steigerung der Trainingsmotivation und Vereinsbindung |

### 1.2 Abgrenzung zu Games und Serious Games

Das Projekt ist **weder ein Spiel noch ein Serious Game**, sondern eine gamifizierte Anwendung:

| Kategorie | Merkmale | TTV Champions |
|-----------|----------|---------------|
| **Game** | Primäres Ziel: Unterhaltung | ❌ Nein |
| **Serious Game** | Vollständiges Spiel mit Lernziel | ❌ Nein |
| **Gamification** | Spielelemente in Nicht-Spiel-Kontext | ✅ Ja |

**Begründung:** Die Kernaktivität (Tischtennis spielen, Training besuchen) bleibt unverändert. Lediglich die digitale Begleitung wird durch Spielelemente angereichert.

---

## 2. Einordnung nach Werbach & Hunter (DMC-Modell)

Das Projekt implementiert alle drei Ebenen des DMC-Frameworks systematisch:

### 2.1 Dynamics (Warum engagieren sich Nutzer?)

Dynamics sind die übergeordneten Motivationstreiber, die das Nutzerverhalten lenken:

| Dynamic | Definition | Implementierung im Projekt |
|---------|------------|---------------------------|
| **Progression** | Gefühl von Wachstum und Fortschritt | 6-stufiges Rangsystem (Rekrut → Champion), permanente XP-Akkumulation, Grundlagen-Freischaltung |
| **Competition** | Wettbewerb mit anderen | 3 Leaderboard-Typen (Skill/Effort/Season), ELO-Rating, Saison-Wettbewerb |
| **Relationships** | Soziale Verbindungen | Partner-System, Doppel-Matches, Activity-Feed, Vereins-Zugehörigkeit |
| **Constraints** | Zeitliche Begrenzungen | 6-Wochen-Saisons, Challenge-Countdowns, tägliche/wöchentliche Challenges |
| **Emotions** | Emotionale Reaktionen | Streak-Boni (🔥), Rang-Aufstiege, Benachrichtigungen bei Erfolgen |
| **Narrative** | Übergreifende Geschichte | Spielerreise vom "Rekrut" zum "Champion", Grundlagen-Pflicht vor Wettkampf |

### 2.2 Mechanics (Wie funktioniert das System?)

Mechanics sind die Grundprozesse und Regeln, die Spielerverhalten ermöglichen:

| Mechanic | Definition | Implementierung im Projekt |
|----------|------------|---------------------------|
| **Rewards** | Belohnungen für Aktionen | XP, Saisonpunkte, ELO-Änderungen nach Matches/Training |
| **Feedback** | Rückmeldung über Aktionen | Toast-Benachrichtigungen, Punkte-Historie, ELO-Änderungsanzeige |
| **Competition** | Wettbewerbsmechanismus | Leaderboard-Rankings, Saison-Gewinner, Rang-Vergleich |
| **Cooperation** | Kooperationsmechanismus | Partner-System (Punkteteilung), Doppel-Matches |
| **Challenges** | Zeitgebundene Aufgaben | Daily/Weekly/Monthly Challenges mit Milestones |
| **Win States** | Siegbedingungen | Saison-Gewinner, Rang-Aufstiege, Challenge-Abschlüsse |
| **Transactions** | Ressourcenaustausch | Partner erhält %-Anteil der Punkte |

### 2.3 Components (Was sehen Nutzer konkret?)

Components sind die konkreten, sichtbaren Spielelemente:

| Component | Beschreibung | Datei-Referenz |
|-----------|--------------|----------------|
| **Points (3 Typen)** | | |
| → Saisonpunkte | Kurzfristig, 6-Wochen-Reset | `points-management-supabase.js` |
| → XP | Permanent, kumulativ | `xp-tracker-supabase.js` |
| → ELO-Rating | Skill-basiert, dynamisch | `leaderboard-supabase.js` |
| **Badges/Ranks** | | |
| → 6 Ränge | Rekrut, Bronze, Silber, Gold, Platin, Champion | `ranks.js` |
| → 5 Ligen | Bronze, Silver, Gold, Platinum, Diamond | `leaderboard-supabase.js` |
| → Rekord-Halter | Best-Score pro Übung | `exercises-supabase.js` |
| **Leaderboards** | | |
| → Skill (ELO) | Nach Spielstärke sortiert | `leaderboard-supabase.js:loadSkillLeaderboard()` |
| → Effort (XP) | Nach Gesamtaufwand sortiert | `leaderboard-supabase.js:loadEffortLeaderboard()` |
| → Season (Points) | Nach Saisonpunkten sortiert | `leaderboard-supabase.js:loadSeasonLeaderboard()` |
| **Streaks** | Konsekutive Trainingsteilnahme | `attendance-supabase.js`, Tabelle: `streaks` |
| **Challenges** | Daily, Weekly, Monthly | `challenges-supabase.js` |
| **Milestones** | Zwischenziele mit Belohnungen | `milestone-management.js` |
| **Progress Bars** | Fortschritt zum nächsten Rang | `ranks.js:getRankProgress()` |
| **Notifications** | Feedback bei Punkteerhalt | `notifications-supabase.js` |

### 2.4 Visuelle Darstellung der DMC-Hierarchie

```
┌─────────────────────────────────────────────────────────────────┐
│                        DYNAMICS                                  │
│  (Abstrakt: Warum?)                                             │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Progression  │ │ Competition  │ │ Relationships│            │
│  │              │ │              │ │              │            │
│  │ Rekrut →     │ │ 3 Leader-    │ │ Partner-     │            │
│  │ Champion     │ │ boards       │ │ System       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                        MECHANICS                                 │
│  (Prozesse: Wie?)                                               │
│                                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │  Rewards   │ │  Feedback  │ │ Challenges │ │Cooperation │  │
│  │            │ │            │ │            │ │            │  │
│  │ XP/Points/ │ │ Toast-     │ │ Daily/     │ │ Partner-   │  │
│  │ ELO        │ │ Meldungen  │ │ Weekly/    │ │ Punkte-    │  │
│  │            │ │            │ │ Monthly    │ │ teilung    │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        COMPONENTS                                │
│  (Konkret: Was?)                                                │
│                                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Points │ │ Ranks  │ │Boards  │ │Streaks │ │Badges  │       │
│  │        │ │        │ │        │ │        │ │        │       │
│  │ 3 Typen│ │6 Stufen│ │3 Typen │ │🔥 Bonus│ │Rekord- │       │
│  │        │ │+Emojis │ │        │ │        │ │Halter  │       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Kritische Betrachtung: Meaningful Gamification

### 3.1 Vermeidung von Pointsification

Das Projekt adressiert die Kritik an oberflächlicher Gamification ("Pointsification") durch mehrere Design-Entscheidungen:

| Kritikpunkt | Problem | Lösung im Projekt |
|-------------|---------|-------------------|
| **Nur extrinsische Anreize** | Motivation verschwindet ohne Belohnung | Dual-System: Saisonpunkte (extrinsisch) + XP (Kompetenznachweis) |
| **Punkteinflation** | Punkte verlieren Bedeutung | Saison-Reset alle 6 Wochen, ELO-System mit Nullsumme |
| **Fehlende Progression** | Spieler erreichen schnell Maximum | 6 Ränge mit steigenden Anforderungen, permanente XP |
| **Isolierte Belohnungen** | Keine Verbindung zur Kernaktivität | Grundlagen-Pflicht: 5 Übungen vor Wettkampf-Freischaltung |
| **Keine Autonomie** | System diktiert Verhalten | Privacy-Einstellungen, Challenge-Auswahl, Partner-Wahl |

### 3.2 Adressierung der Risiken extrinsischer Anreizsysteme

| Risiko | Beschreibung | Gegenmaßnahme im Projekt |
|--------|--------------|--------------------------|
| **Overjustification Effect** | Extrinsische Belohnung verdrängt intrinsische Motivation | ELO-System belohnt Kompetenz, nicht nur Aktivität |
| **Gaming the System** | Manipulation für maximale Punkte | Trainer-Genehmigung für Matches/Challenges, ELO-basiertes Balancing |
| **Kurzfristiger Fokus** | Nur auf schnelle Belohnungen achten | Permanente XP + Ränge fördern Langzeit-Engagement |
| **Sozialer Druck** | Leaderboards demotivieren Schwächere | Subgruppen-Filter, Privacy-Einstellungen, Rang-Verteilung |
| **Abhängigkeit von Belohnungen** | Ohne Punkte keine Motivation | Kernaktivität (Tischtennis) bleibt unverändert wertvoll |

### 3.3 Begründung für Motivationstheorien

Die kritische Betrachtung zeigt, dass **reine Spielelemente nicht ausreichen**. Das Projekt benötigt eine fundierte motivationstheoretische Basis:

```
Gamification-Elemente    +    Motivationstheorie    =    Nachhaltiges Engagement
      (Wie?)                       (Warum?)                    (Ergebnis)

   Punkte, Ränge,              SDT: Kompetenz,            Langfristige
   Leaderboards                Autonomie, soziale         Trainingsmotivation
                               Eingebundenheit
```

**→ Überleitung zu Kapitel 2.2: Konkrete Gamification-Elemente und ihre motivationstheoretische Fundierung**

---

## 4. Bezug zur Self-Determination Theory (SDT)

Das Projekt berücksichtigt die drei psychologischen Grundbedürfnisse nach Ryan & Deci (2000):

### 4.1 Kompetenz (Competence)

> "Das Bedürfnis, sich als wirksam und fähig zu erleben"

| SDT-Prinzip | Implementierung | Datei-Referenz |
|-------------|-----------------|----------------|
| Objektive Skill-Messung | ELO-Rating (800-1600+) | `leaderboard-supabase.js` |
| Sichtbarer Fortschritt | Rang-System mit Prozent-Anzeige | `ranks.js:getRankProgress()` |
| Erreichbare Zwischenziele | Milestones (10×, 25×, 50×) | `milestone-management.js` |
| Kompetenznachweis | Rekord-Halter-System | `exercises-supabase.js` |
| Skill-basiertes Matching | ELO-Differenz bei Match-Vorschlägen | `matches-supabase.js` |

### 4.2 Autonomie (Autonomy)

> "Das Bedürfnis, Handlungen selbst zu bestimmen"

| SDT-Prinzip | Implementierung | Datei-Referenz |
|-------------|-----------------|----------------|
| Wahlfreiheit bei Challenges | Spieler wählt, welche Challenges | `challenges-dashboard-supabase.js` |
| Gegner-Auswahl | Freie Wahl des Match-Gegners | `matches-supabase.js` |
| Partner-Nominierung | Spieler wählt Partner für Punkte | `points-management-supabase.js` |
| Privacy-Kontrolle | Sichtbarkeit selbst bestimmen | `settings-privacy-supabase.js` |
| Subgruppen-Zugehörigkeit | Trainingsgruppen-Wahl | Event-/Subgruppen-System |

### 4.3 Soziale Eingebundenheit (Relatedness)

> "Das Bedürfnis nach Zugehörigkeit und Verbundenheit"

| SDT-Prinzip | Implementierung | Datei-Referenz |
|-------------|-----------------|----------------|
| Vereinsgemeinschaft | Club-spezifische Leaderboards | `leaderboard-supabase.js` |
| Kooperative Belohnungen | Partner-System (50% Teilung) | `points-management-supabase.js` |
| Soziale Anerkennung | Activity-Feed mit Likes/Kommentaren | `activity-feed-supabase.js` |
| Team-Play | Doppel-Matches & Doppel-ELO | Matches-System |
| Trainer-Feedback | Genehmigungsprozess als Anerkennung | Match-/Challenge-Approval |

---

## 5. Konkrete Element-Zuordnung: Theorie → Praxis

### 5.1 Tabelle: Gamification-Elemente und ihre theoretische Fundierung

| Element | Werbach-Ebene | SDT-Bedürfnis | Motivationstyp | Kritik-Adressierung |
|---------|---------------|---------------|----------------|---------------------|
| **XP (permanent)** | Component | Kompetenz | Intrinsisch | Langzeit-Fokus statt Kurzzeit |
| **Saisonpunkte** | Component | Kompetenz | Extrinsisch | Zeitbegrenzung verhindert Inflation |
| **ELO-Rating** | Component | Kompetenz | Intrinsisch | Objektive Skill-Messung |
| **6 Ränge** | Component | Kompetenz | Intrinsisch | Progressive Ziele |
| **Leaderboards** | Component | Eingebundenheit | Extrinsisch | Subgruppen-Filter gegen Demotivation |
| **Streaks** | Mechanic | Kompetenz | Beide | Bonus, nicht Strafe bei Abbruch |
| **Challenges** | Component | Autonomie | Extrinsisch | Freie Auswahl |
| **Partner-System** | Mechanic | Eingebundenheit | Intrinsisch | Kooperation statt nur Wettbewerb |
| **Grundlagen-Pflicht** | Mechanic | Kompetenz | Intrinsisch | Kompetenzaufbau vor Wettbewerb |
| **Privacy-Settings** | Mechanic | Autonomie | - | Kontrolle über eigene Daten |

### 5.2 Feedback-Loop-Analyse

```
┌─────────────────────────────────────────────────────────────────┐
│                    KURZE FEEDBACK-LOOPS                          │
│                    (Sofortige Belohnung)                         │
│                                                                  │
│   Training besuchen → Anwesenheit bestätigt → +10 XP + Toast    │
│   Match spielen → Trainer genehmigt → +25 XP + ELO-Änderung     │
│   Challenge abschließen → Punkte erhalten → Leaderboard-Update  │
│                                                                  │
│   → Fördert: Kompetenzerleben, unmittelbares Feedback           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LANGE FEEDBACK-LOOPS                          │
│                    (Langfristige Ziele)                          │
│                                                                  │
│   Rekrut → Bronze → Silber → Gold → Platin → Champion           │
│   (Wochen bis Monate, basierend auf XP + ELO + Grundlagen)      │
│                                                                  │
│   Saison-Wettbewerb (6 Wochen): Wer wird Season-Champion?       │
│                                                                  │
│   → Fördert: Progression, langfristiges Engagement              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Fazit und Überleitung

### 6.1 Zusammenfassung der Relevanz

Die Gamification-Grundlagen sind für das TTV Champions Projekt in dreifacher Hinsicht relevant:

1. **Definition (Deterding et al.):** Das Projekt ist eindeutig als Gamification klassifizierbar – Spielelemente werden im nicht-spielerischen Vereinskontext eingesetzt, ohne das Tischtennis selbst zu einem Spiel zu machen.

2. **Struktur (Werbach & Hunter):** Das DMC-Framework wurde vollständig implementiert:
   - **Dynamics:** Progression, Wettbewerb, Beziehungen
   - **Mechanics:** Belohnungen, Feedback, Challenges, Kooperation
   - **Components:** 3 Punktetypen, 6 Ränge, 3 Leaderboards, Streaks, Milestones

3. **Kritische Betrachtung:** Das Projekt vermeidet "Pointsification" durch:
   - Dual-Punktesystem (kurzfristig + langfristig)
   - Trainer-Genehmigung (verhindert Manipulation)
   - Autonomie-fördernde Features (Privacy, Auswahl)
   - Kompetenz-basiertes ELO-System

### 6.2 Überleitung zu Kapitel 2.2

Die theoretischen Grundlagen bilden das Fundament für die **konkrete Analyse der Gamification-Elemente** im folgenden Kapitel:

| Kapitel 2.2 | Inhalt |
|-------------|--------|
| 2.2.1 Punktesysteme | XP, Saisonpunkte, ELO im Detail |
| 2.2.2 Ränge und Abzeichen | 6-Rang-System, Rekord-Halter |
| 2.2.3 Leaderboards | 3 Typen, Subgruppen, Privacy |
| 2.2.4 Challenges | Daily/Weekly/Monthly, Milestones |
| 2.2.5 Streaks | Anwesenheits-Tracking, Boni |
| 2.2.6 Soziale Features | Partner-System, Activity-Feed |

---

## Anhang: Datei-Übersicht

### Kerndateien der Gamification-Implementierung

| Datei | Funktion | Relevante Theorieaspekte |
|-------|----------|-------------------------|
| `public/js/xp-tracker-supabase.js` | XP-System | Kompetenz, Progression |
| `public/js/points-management-supabase.js` | Punktevergabe, Partner | Extrinsische Motivation, Kooperation |
| `public/js/ranks.js` | 6-Rang-System | Progression, Kompetenz |
| `public/js/leaderboard-supabase.js` | 3 Leaderboard-Typen | Wettbewerb, sozialer Vergleich |
| `public/js/challenges-supabase.js` | Challenge-System | Autonomie, Herausforderung |
| `public/js/attendance-supabase.js` | Streaks | Retention, Gewohnheitsbildung |
| `public/js/notifications-supabase.js` | Feedback-System | Unmittelbares Feedback |
| `public/js/activity-feed-supabase.js` | Social Features | Soziale Eingebundenheit |
| `public/js/settings-privacy-supabase.js` | Privacy-Kontrolle | Autonomie |

### Datenbank-Tabellen

| Tabelle | Funktion |
|---------|----------|
| `profiles` | XP, Points, ELO, Rang-Daten |
| `points_history` | Punkteverlauf mit Gründen |
| `xp_history` | XP-Verlauf |
| `streaks` | Anwesenheits-Streaks |
| `challenges` | Challenge-Definitionen |
| `completed_challenges` | Challenge-Abschlüsse |
| `exercise_milestones` | Milestone-Fortschritt |
| `notifications` | Feedback-Benachrichtigungen |

---

**Dokumenten-Version:** 1.0
**Erstellt am:** 2026-01-02
**Basierend auf:** Codebase-Analyse TTV Champions Web
**Bezug zu:** ANFORDERUNGEN_BACHELORARBEIT.md
