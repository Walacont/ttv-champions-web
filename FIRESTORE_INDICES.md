# Firestore Indices für Multi-Session Training System

## Benötigte Indices

Das Multi-Session Training System benötigt folgende zusammengesetzte Firestore-Indices:

### 1. trainingSessions - Basis Index (für Kalender)

**Collection**: `trainingSessions`

**Felder**:

1. `clubId` - Ascending
2. `date` - Ascending
3. `cancelled` - Ascending

**Query Type**: Collection

---

### 2. trainingSessions - Mit Subgroup Filter

**Collection**: `trainingSessions`

**Felder**:

1. `clubId` - Ascending
2. `subgroupId` - Ascending
3. `date` - Ascending
4. `cancelled` - Ascending

**Query Type**: Collection

---

### 3. trainingSessions - Für "Heutige Trainings" (Spieler Dashboard)

**Collection**: `trainingSessions`

**Felder**:

1. `clubId` - Ascending
2. `date` - Ascending
3. `cancelled` - Ascending
4. `startTime` - Ascending

**Query Type**: Collection

---

### 4. recurringTrainingTemplates - Aktive Templates

**Collection**: `recurringTrainingTemplates`

**Felder**:

1. `clubId` - Ascending
2. `active` - Ascending
3. `dayOfWeek` - Ascending

**Query Type**: Collection

---

## Automatische Index-Erstellung

### Option 1: Über Firebase Console (Empfohlen für erste Erstellung)

1. Versuche dich als Coach einzuloggen
2. Öffne die Browser-Konsole (F12)
3. Firebase zeigt einen Link mit dem Fehler an, z.B.:
    ```
    FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/...
    ```
4. **Klicke auf den Link** - Firebase schlägt automatisch den richtigen Index vor
5. Klicke auf "Create Index"
6. Warte 1-2 Minuten bis Index erstellt ist
7. **Wiederhole** für alle fehlenden Indices (jede neue Query triggert einen neuen Link)

### Option 2: Manuell in Firebase Console erstellen

1. Gehe zu [Firebase Console](https://console.firebase.google.com)
2. Wähle dein Projekt aus (z.B. `ttv-champions-prod`)
3. Navigiere zu **Firestore Database** → **Indexes** → **Composite**
4. Klicke auf **"Create Index"**
5. Gebe die Felder aus der Liste oben ein
6. Klicke auf **"Create"**
7. Wiederhole für alle 4 Indices

### Option 3: Via `firestore.indexes.json` deployen

Erstelle eine Datei `firestore.indexes.json`:

```json
{
    "indexes": [
        {
            "collectionGroup": "trainingSessions",
            "queryScope": "COLLECTION",
            "fields": [
                { "fieldPath": "clubId", "order": "ASCENDING" },
                { "fieldPath": "date", "order": "ASCENDING" },
                { "fieldPath": "cancelled", "order": "ASCENDING" }
            ]
        },
        {
            "collectionGroup": "trainingSessions",
            "queryScope": "COLLECTION",
            "fields": [
                { "fieldPath": "clubId", "order": "ASCENDING" },
                { "fieldPath": "subgroupId", "order": "ASCENDING" },
                { "fieldPath": "date", "order": "ASCENDING" },
                { "fieldPath": "cancelled", "order": "ASCENDING" }
            ]
        },
        {
            "collectionGroup": "trainingSessions",
            "queryScope": "COLLECTION",
            "fields": [
                { "fieldPath": "clubId", "order": "ASCENDING" },
                { "fieldPath": "date", "order": "ASCENDING" },
                { "fieldPath": "cancelled", "order": "ASCENDING" },
                { "fieldPath": "startTime", "order": "ASCENDING" }
            ]
        },
        {
            "collectionGroup": "recurringTrainingTemplates",
            "queryScope": "COLLECTION",
            "fields": [
                { "fieldPath": "clubId", "order": "ASCENDING" },
                { "fieldPath": "active", "order": "ASCENDING" },
                { "fieldPath": "dayOfWeek", "order": "ASCENDING" }
            ]
        }
    ],
    "fieldOverrides": []
}
```

Dann deployen:

```bash
firebase deploy --only firestore:indexes
```

**Hinweis**: Indices können 1-5 Minuten dauern, bis sie aktiv sind!

---

## Troubleshooting

### Fehler: "The query requires an index"

**Lösung**:

1. Kopiere den Link aus der Browser-Konsole
2. Öffne den Link in neuem Tab
3. Firebase schlägt automatisch den Index vor
4. Klicke "Create Index"

### Fehler: Index bereits vorhanden

**Lösung**: Index existiert bereits, ignoriere den Fehler

### Index dauert zu lange

**Normal**: Firestore Indices können 1-5 Minuten zur Erstellung benötigen
**Bei großen Datenmengen**: Kann bis zu 30 Minuten dauern

### "Index is being built"

Warte 1-2 Minuten und lade die Seite neu.

---

## Prüfen ob Indices aktiv sind

1. Gehe zu Firebase Console
2. **Firestore Database** → **Indexes** → **Composite**
3. Status sollte **"Enabled"** (grün) sein, nicht "Building" (orange)

---

## Warum werden Indices benötigt?

Firebase Firestore benötigt **zusammengesetzte Indices** für Queries mit:

- Mehreren WHERE-Klauseln auf verschiedenen Feldern
- Kombination von WHERE und ORDER BY
- Range-Queries (>=, <=) auf verschiedenen Feldern

Unser Multi-Session System nutzt solche Queries für:

- Laden von Sessions eines Monats (date range + clubId + cancelled)
- Filtern nach Untergruppen
- Sortieren nach Startzeit
