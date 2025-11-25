# Cache-Probleme beheben

Wenn du den Fehler `[Error] SyntaxError: Importing binding name 'calculateHandicap' is not found.` siehst, liegt das an gecachten Dateien.

## Komplette Cache-Bereinigung

### Option 1: Chrome DevTools (Empfohlen)

1. **DevTools öffnen**: `F12` oder `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
2. **Application Tab** öffnen
3. **Service Workers** im linken Menü
4. Klicke auf **"Unregister"** neben jedem Service Worker
5. **Storage** im linken Menü
6. Klicke auf **"Clear site data"**
7. Stelle sicher, dass folgende Optionen aktiviert sind:
   - ✅ Local and session storage
   - ✅ IndexedDB
   - ✅ Web SQL
   - ✅ Cookies
   - ✅ Cache storage
8. Klicke **"Clear site data"**
9. **Hard Refresh**: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+F5` (Windows)

### Option 2: Inkognito-Modus

Öffne die App im Inkognito-/Private-Modus:
- Chrome/Edge: `Cmd+Shift+N` (Mac) / `Ctrl+Shift+N` (Windows)
- Firefox: `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows)
- Safari: `Cmd+Shift+N`

### Option 3: Lokalen Server neu starten

Falls du lokal entwickelst:

```bash
# Server stoppen (Ctrl+C)
# Dann neu starten:
firebase serve
# oder
firebase emulators:start
```

### Option 4: Browser komplett neu starten

1. Schließe **alle** Browser-Fenster
2. Öffne den Browser neu
3. Gehe direkt zur App (nicht über History/Cache)
4. Hard Refresh: `Cmd+Shift+R` / `Ctrl+Shift+F5`

## Warum passiert das?

- Firebase hat einen **Service Worker** (`firebase-messaging-sw.js`)
- Dieser cacht JavaScript-Dateien für Offline-Funktionalität
- Nach dem Refactoring hat der Browser noch die alte `matches.js` im Cache
- Die alte Version hatte `calculateHandicap` als lokale Funktion
- Die neue Version importiert sie aus `validation-utils.js`

## Nach dem Cache-Leeren

Der Fehler sollte verschwinden und die App sollte mit den neuen Utility-Modulen funktionieren!
