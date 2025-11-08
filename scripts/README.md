# Migration Scripts

## ELO Migration (0 → 800)

### Overview
Das neue Punktesystem startet bei **800 ELO** statt 0. Dieses Script migriert alle bestehenden Benutzer zum neuen System.

### Vorbereitung

1. **Service Account Key erstellen:**
   - Gehe zu Firebase Console → Project Settings → Service Accounts
   - Klicke "Generate New Private Key"
   - Speichere die JSON-Datei als `serviceAccountKey.json` im Projekt-Root (neben `package.json`)
   - ⚠️ **WICHTIG:** Füge diese Datei zu `.gitignore` hinzu!

2. **Dependencies installieren:**
```bash
npm install firebase-admin
```

### Migration ausführen

```bash
node scripts/migrate-elo-to-800.js
```

### Was passiert?

- **Alle Benutzer:** `eloRating` wird um 800 erhöht
- **Alle Benutzer:** `highestElo` wird um 800 erhöht
- **Bereits migrierte Benutzer** (ELO ≥ 800) werden übersprungen

### Beispiel

```
Vorher:
- eloRating: 0
- highestElo: 0

Nachher:
- eloRating: 800
- highestElo: 800
```

```
Vorher:
- eloRating: 150
- highestElo: 200

Nachher:
- eloRating: 950
- highestElo: 1000
```

### Sicherheit

- ✅ **Idempotent:** Kann mehrfach ausgeführt werden (überspringt bereits migrierte Benutzer)
- ✅ **Batch-Processing:** Verarbeitet bis zu 500 Benutzer pro Batch
- ✅ **Error Handling:** Fehler bei einzelnen Benutzern stoppen nicht die gesamte Migration
- ⚠️ **Backup empfohlen:** Erstelle ein Firestore-Backup vor der Migration!

### Nach der Migration

1. **Verifizieren:** Prüfe einige Benutzer-Profile im Dashboard
2. **Cloud Functions deployen:** `firebase deploy --only functions`
3. **Frontend deployen:** `firebase deploy --only hosting`

---

## Weitere Migrationen

### Season-System (zukünftig)

Wenn das Saison-System implementiert wird, wird ein weiteres Script benötigt:

```bash
node scripts/init-season-system.js
```

Dieses Script wird:
- Eine `seasons` Collection erstellen
- Die erste Saison initialisieren
- Alle Benutzer der ersten Saison zuweisen
