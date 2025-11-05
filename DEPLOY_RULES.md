# Firestore Rules Deployment Anleitung

Die Firestore Security Rules müssen deployed werden, damit die App funktioniert.

## 🚨 WICHTIG: Rules MÜSSEN deployed werden!

Ohne Deployment der Rules erhalten alle Benutzer (Spieler & Coaches) Permission-Fehler:
- ❌ "Missing or insufficient permissions"
- ❌ Spieler können sich nicht anmelden
- ❌ Coaches können keine Daten sehen

---

## Option 1: Mit Firebase CLI (Empfohlen)

### Schritt 1: Firebase CLI installieren

```bash
# Global installation
npm install -g firebase-tools

# ODER mit npx (keine Installation nötig)
npx firebase-tools --version
```

### Schritt 2: Bei Firebase einloggen

```bash
firebase login
```

### Schritt 3: Projekt verifizieren

```bash
firebase use
# Sollte zeigen: ttv-champions-prod
```

### Schritt 4: Rules deployen

**Variante A: Mit Script**
```bash
./deploy-rules.sh
```

**Variante B: Manuell**
```bash
firebase deploy --only firestore:rules
```

**Variante C: Mit npx (ohne Installation)**
```bash
npx firebase-tools deploy --only firestore:rules
```

### Erwartete Ausgabe:

```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/ttv-champions-prod/overview
```

---

## Option 2: Über Firebase Console (Web Interface)

Wenn Firebase CLI nicht verfügbar ist, kannst du die Rules manuell über die Web-Console deployen:

### Schritt 1: Firebase Console öffnen

1. Gehe zu: https://console.firebase.google.com/
2. Wähle das Projekt: **ttv-champions-prod**

### Schritt 2: Firestore Rules öffnen

1. Im linken Menü: **Firestore Database**
2. Tab: **Rules** (oben)

### Schritt 3: Rules einfügen

1. Lösche den aktuellen Inhalt im Editor
2. Kopiere den GESAMTEN Inhalt aus der Datei `firestore.rules`
3. Klicke auf **Veröffentlichen** (Publish)

⚠️ **WICHTIG**: Kopiere die KOMPLETTE Datei, nicht nur einzelne Zeilen!

### Schritt 4: Verifizieren

Nach dem Deployment solltest du sehen:
```
✓ Rules deployed successfully
Last deployed: [aktuelles Datum]
```

---

## ✅ Deployment Verifizieren

Nach dem Deployment:

1. **App neu laden** (Hard Refresh: Ctrl+Shift+R / Cmd+Shift+R)
2. **Als Spieler einloggen** → Sollte ohne Fehler funktionieren
3. **Als Coach einloggen** → Sollte Daten sehen können

### Erwartetes Ergebnis:

**Keine** dieser Fehler sollten mehr auftreten:
- ❌ `Missing or insufficient permissions`
- ❌ `permission-denied`
- ❌ `Error loading subgroup`
- ❌ `Could not load completed challenges`

---

## 🔧 Troubleshooting

### Problem: "Firebase CLI not found"

**Lösung 1**: CLI installieren
```bash
npm install -g firebase-tools
```

**Lösung 2**: npx verwenden
```bash
npx firebase-tools deploy --only firestore:rules
```

**Lösung 3**: Manuelle Deployment über Console (siehe Option 2)

---

### Problem: "Not authorized"

**Lösung**: Bei Firebase einloggen
```bash
firebase login
```

---

### Problem: Fehler bleiben nach Deployment

**Lösung**:
1. Browser-Cache leeren (Hard Refresh: Ctrl+Shift+R)
2. Browser DevTools → Application → Clear Storage
3. Neu einloggen
4. Falls immer noch Fehler: Firebase Console → Firestore → Rules → Verifizieren dass die Rules korrekt sind

---

## 📋 Zusammenfassung der Änderungen

Die folgenden Security Rules wurden hinzugefügt/aktualisiert:

### Neue Subcollection: `completedChallenges`
```javascript
match /completedChallenges/{challengeId} {
  // Spieler können ihre eigenen completed challenges lesen/schreiben
  allow read, write: if isOwner(userId);

  // Coaches können completed challenges ihrer Spieler lesen
  allow read: if isCoachOrAdmin();
}
```

**Warum wichtig?**: Spieler müssen tracken können, welche Challenges sie bereits abgeschlossen haben.

---

## 🚀 Quick Start

**Schnellster Weg:**
```bash
# Mit Firebase CLI
firebase deploy --only firestore:rules

# ODER mit npx
npx firebase-tools deploy --only firestore:rules

# ODER mit Script
./deploy-rules.sh
```

**Dauert ca. 10-30 Sekunden.**

Nach dem Deployment: **App neu laden** und testen!
