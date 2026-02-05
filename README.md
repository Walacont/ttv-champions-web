# TTV Champions - Gamification Prototyp

Minimaler Prototyp für die Bachelorarbeit: **Gamification im Tischtennisverein**

## Struktur

```
prototype/
├── supabase/
│   └── schema.sql          # Datenbankschema (PostgreSQL)
├── js/
│   ├── supabase-client.js  # Supabase-Initialisierung
│   ├── ranks.js            # Rang-System
│   ├── elo.js              # Elo-System + Handicap
│   ├── points.js           # XP & Season Points
│   ├── streaks.js          # Streak-System
│   ├── matches.js          # Match-Workflow
│   ├── exercises.js        # Übungen
│   ├── challenges.js       # Challenges
│   ├── leaderboards.js     # Ranglisten
│   ├── feed.js             # Aktivitätsfeed
│   ├── notifications.js    # Benachrichtigungen
│   └── app.js              # Hauptanwendung
├── css/
│   └── style.css           # Custom Styles
└── *.html                  # UI-Seiten
```

## Setup

### 1. Supabase-Projekt erstellen

1. Gehe zu [supabase.com/dashboard](https://supabase.com/dashboard)
2. Erstelle ein neues Projekt
3. Gehe zu **SQL Editor** → **New Query**
4. Kopiere den Inhalt von `prototype/supabase/schema.sql` und führe ihn aus

### 2. Credentials eintragen

Öffne `prototype/js/supabase-client.js` und ersetze:

```javascript
const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_ANON_KEY = 'dein-anon-key';
```

Die Werte findest du unter: **Settings** → **API**

### 3. Starten

Öffne `prototype/index.html` im Browser oder starte einen lokalen Server:

```bash
# Mit Python
python -m http.server 8000

# Mit Node.js (npx)
npx serve prototype
```

## Implementierte Features

| Feature | Beschreibung |
|---------|--------------|
| **Ränge** | Rekrut → Bronze → Silber → Gold → Platin → Champion |
| **Elo-System** | QTTR-basiert mit A-Faktor (32/24/16 oder 20 für Jugendliche) |
| **Doppel-Elo** | Separates Rating pro Paarung |
| **XP** | Dauerhafte Experience Points |
| **Season Points** | Saisonpunkte (resetbar durch Trainer) |
| **Streaks** | 3/5/6 Punkte je nach Streak-Länge |
| **Handicap** | Elo-basiert (ab 40 Diff.) + Bilanz-basiert |
| **Übungen** | Einzel, Paar (aktiv/passiv), Meilensteine |
| **Challenges** | Vom Trainer für den Verein erstellt |
| **5 Ranglisten** | Skill, Fleiß, Saison, Ränge, Doppel |

## Rang-Schwellenwerte

| Rang | Min. XP | Min. Elo |
|------|---------|----------|
| Rekrut | 0 | 800 |
| Bronze | 50 | 850 |
| Silber | 200 | 900 |
| Gold | 500 | 1000 |
| Platin | 1000 | 1100 |
| Champion | 1800 | 1300 |

---

*Prototyp für Bachelorarbeit*
