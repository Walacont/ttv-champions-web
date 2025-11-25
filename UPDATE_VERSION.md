# Version Update Anleitung

## Wie funktioniert das automatische Update-System?

Das System besteht aus 3 Teilen:

1. **Cache-Control Headers** in `firebase.json`
    - JS/CSS Dateien werden 1 Stunde gecacht
    - HTML Dateien werden nicht gecacht
    - `version.json` wird nie gecacht

2. **version.json** Datei
    - Enthält die aktuelle App-Version
    - Wird alle 5 Minuten von Nutzern geprüft

3. **update-checker.js** Script
    - Läuft auf allen wichtigen Seiten
    - Prüft automatisch nach Updates
    - Zeigt Banner wenn neue Version verfügbar

## Vor jedem Firebase Deploy:

### Schritt 1: Version erhöhen

Öffne `public/version.json` und erhöhe die Version:

```json
{
    "version": "1.0.1", // ← Erhöhe diese Nummer
    "timestamp": "2024-01-15T10:30:00Z", // ← Aktualisiere auf jetzt
    "message": "Neue Funktionen verfügbar!" // ← Optional: Eigene Nachricht
}
```

**Versionsschema:**

- `1.0.0` → `1.0.1` = Bugfixes
- `1.0.0` → `1.1.0` = Neue Features
- `1.0.0` → `2.0.0` = Große Änderungen

### Schritt 2: Firebase Deploy

```bash
firebase deploy
```

## Was passiert danach?

1. Nutzer sehen beim nächsten Seitenaufruf (nach max. 5 Min) ein Banner
2. Banner sagt: "Neue Version verfügbar!"
3. Nutzer klickt auf "Jetzt aktualisieren"
4. App lädt neu und verwendet die neue Version

## Vorteile:

✅ Keine manuellen Cache-Löschungen mehr nötig
✅ Nutzer werden automatisch informiert
✅ Nutzer können selbst entscheiden wann sie updaten
✅ Sanftes Update ohne Zwang

## Optional: Version automatisch setzen

Du kannst auch ein Script erstellen, das die Version automatisch erhöht:

```bash
#!/bin/bash
# In update-version.sh

# Aktuelle Version aus version.json auslesen
CURRENT=$(jq -r '.version' public/version.json)

# Version erhöhen (Patch-Version)
NEW=$(echo $CURRENT | awk -F. '{$NF = $NF + 1;} 1' | sed 's/ /./g')

# Neue version.json schreiben
cat > public/version.json << EOF
{
  "version": "$NEW",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "message": "Neue Version verfügbar!"
}
EOF

echo "Version updated: $CURRENT → $NEW"
```

Dann vor jedem Deploy einfach:

```bash
./update-version.sh
firebase deploy
```
