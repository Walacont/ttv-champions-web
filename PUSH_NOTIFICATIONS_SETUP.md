# 🔔 Push Notifications Setup Guide

## Überblick

Web Push Notifications für TTV Champions - Benachrichtigungen auch wenn der Browser geschlossen ist!

**Features:**
- ✅ Match-Genehmigungen
- ✅ Neue Match-Anfragen
- ✅ Training-Erinnerungen (täglich um 17:00)
- ✅ Rang-Aufstiege
- ✅ Test-Notifications
- ✅ Anpassbare Präferenzen

---

## 🚀 Setup (WICHTIG - Bitte befolgen!)

### Schritt 1: VAPID Key erstellen

**VAPID Keys** sind erforderlich für Web Push Notifications!

1. **Öffne Firebase Console:**
   ```
   https://console.firebase.com
   ```

2. **Gehe zu deinem Projekt:**
   - Project: `ttv-champions-prod`

3. **Navigiere zu Cloud Messaging:**
   ```
   Project Settings → Cloud Messaging → Web configuration
   ```

4. **Generiere Web Push Zertifikate:**
   - Scrolle zu "Web Push certificates"
   - Klicke "Generate key pair"
   - **Kopiere den generierten Key** (sieht aus wie: `BGtY-abc123...`)

5. **Füge den VAPID Key ein:**
   - Öffne: `public/js/fcm-manager.js`
   - Finde Zeile ~15: `this.vapidKey = 'YOUR_VAPID_KEY_HERE';`
   - Ersetze mit: `this.vapidKey = 'DEIN-GENERIERTER-KEY';`

### Schritt 2: Service Worker registrieren

**Bereits erledigt!** ✅

Der Service Worker liegt hier: `public/firebase-messaging-sw.js`

### Schritt 3: Icons erstellen (Optional)

Erstelle Icons für die Notifications:

```bash
# Erstelle Icons-Ordner
mkdir -p public/icons

# Icons sollten folgende Größen haben:
# - icon-192x192.png (für Notifications)
# - badge-72x72.png (für Badge auf Android)
```

**Falls keine Icons:**
- Notifications nutzen Browser-Standard-Icon
- Funktioniert trotzdem!

### Schritt 4: Cloud Functions deployen

```bash
# Installiere Firebase CLI (falls nicht vorhanden)
npm install -g firebase-tools

# Login zu Firebase
firebase login

# Deploy Functions
firebase deploy --only functions
```

**Wichtige Functions:**
- `sendMatchApprovedNotification` - Bei Match-Genehmigung
- `sendMatchRequestNotification` - Bei neuer Match-Anfrage
- `sendRankUpNotification` - Bei Rang-Aufstieg
- `sendTrainingReminders` - Täglich um 17:00
- `sendTestNotification` - Test-Function

### Schritt 5: Firestore Security Rules

Füge zu `firestore.rules` hinzu (falls nicht vorhanden):

```javascript
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  // Allow FCM token updates
  allow update: if request.auth != null
    && request.auth.uid == userId
    && request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['fcmToken', 'fcmTokenUpdatedAt', 'notificationsEnabled', 'notificationPreferences']);
}
```

### Schritt 6: Integration in deine App

**Option A: Auto-Prompt beim Login (Empfohlen)**

In `dashboard.js`, `coach.js`, `admin.js`:

```javascript
import { initPushNotifications } from './init-notifications.js';
import { firebaseApp } from './firebase-init.js'; // Deine Firebase App
import { db, auth } from './firebase-init.js';

// Nach User-Login
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ... existing code ...

    // Init Push Notifications (zeigt Dialog nach 3 Sekunden)
    await initPushNotifications(firebaseApp, db, auth, {
      autoPrompt: true,     // Automatisch fragen
      promptDelay: 3000,    // Nach 3 Sekunden
      showOnlyOnce: true    // Nur einmal pro Session
    });
  }
});
```

**Option B: Manueller Button in Settings**

In `settings.html` - Button hinzufügen:

```html
<button id="enable-notifications-btn">
  🔔 Benachrichtigungen aktivieren
</button>
```

In `settings.js`:

```javascript
import { requestNotificationPermission, getNotificationStatus } from './init-notifications.js';

document.getElementById('enable-notifications-btn').addEventListener('click', async () => {
  const result = await requestNotificationPermission();

  if (result.success) {
    window.notifications.success('Benachrichtigungen aktiviert! 🔔');
  } else {
    window.notifications.error('Benachrichtigungen konnten nicht aktiviert werden');
  }
});

// Check current status
const status = getNotificationStatus();
console.log('Notifications supported:', status.supported);
console.log('Permission:', status.permission);
```

---

## 📱 Wie es für User funktioniert

### 1. Erster Besuch

```
User öffnet Dashboard
  ↓
Nach 3 Sekunden: Schönes Modal erscheint
  ↓
"Benachrichtigungen aktivieren?"
  ✓ Match-Genehmigungen
  ✓ Training-Erinnerungen
  ✓ Neue Challenges
  ✓ Rang-Updates
  ↓
User klickt "Aktivieren"
  ↓
Browser fragt: "ttv-champions.de möchte Benachrichtigungen senden"
  ↓
User klickt "Erlauben"
  ↓
✅ FCM Token wird in Firestore gespeichert
```

### 2. Benachrichtigungen erhalten

```
Coach genehmigt Match
  ↓
Cloud Function triggered
  ↓
FCM sendet Push Notification
  ↓
📲 Notification erscheint auf Handy/Desktop:
"🏓 Match genehmigt!"
"Dein Match gegen Max wurde genehmigt."
  ↓
User klickt drauf
  ↓
Browser öffnet ttv-champions.de/dashboard.html
```

---

## 🎯 Notification Types

### 1. Match genehmigt
```javascript
// Automatisch bei Match-Genehmigung
Titel: "🏓 Match genehmigt!"
Text: "Dein Match gegen [Name] wurde genehmigt."
```

### 2. Neue Match-Anfrage
```javascript
// Automatisch bei neuer Anfrage
Titel: "🏓 Neue Match-Anfrage"
Text: "[Name] möchte ein Match gegen dich spielen."
```

### 3. Rang-Aufstieg
```javascript
// Automatisch bei Rang-Änderung
Titel: "🎉 Silber erreicht!"
Text: "Glückwunsch! Du bist zu Silber aufgestiegen!"
```

### 4. Training-Erinnerung
```javascript
// Täglich um 17:00 wenn Training morgen ist
Titel: "🏓 Training morgen!"
Text: "Erinnerung: Training morgen um 18:00 Uhr"
```

### 5. Test-Notification
```javascript
// Manuell trigger via Cloud Function
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const sendTest = httpsCallable(functions, 'sendTestNotification');

await sendTest();
// → User bekommt Test-Notification
```

---

## ⚙️ Notification Preferences

### User kann wählen welche Notifications:

```javascript
import { updateNotificationPreferences } from './init-notifications.js';

const preferences = {
  matchApproved: true,      // Match-Genehmigungen
  matchRequest: true,       // Neue Match-Anfragen
  trainingReminder: true,   // Training-Erinnerungen
  challengeAvailable: false, // Neue Challenges (deaktiviert)
  rankUp: true,             // Rang-Aufstiege
  matchSuggestion: false    // Match-Vorschläge (deaktiviert)
};

await updateNotificationPreferences(preferences);
```

### In Firestore gespeichert:

```javascript
users/{userId} {
  fcmToken: "encrypted-token-abc123...",
  notificationsEnabled: true,
  notificationPreferences: {
    matchApproved: true,
    matchRequest: true,
    trainingReminder: true,
    challengeAvailable: false,
    rankUp: true,
    matchSuggestion: false
  }
}
```

---

## 🔧 Troubleshooting

### Problem: "VAPID key not found"

**Lösung:**
```javascript
// In fcm-manager.js
this.vapidKey = 'DEIN-RICHTIGER-VAPID-KEY';  // ← Hier einfügen!
```

Hole den Key aus Firebase Console → Cloud Messaging → Web Push certificates

### Problem: Service Worker lädt nicht

**Lösung:**
```bash
# Check ob Datei existiert
ls public/firebase-messaging-sw.js

# Öffne in Browser:
https://deine-domain.de/firebase-messaging-sw.js
# Sollte JavaScript-Code zeigen, nicht 404
```

### Problem: Notifications werden nicht empfangen

**Debug-Schritte:**

1. **Check Browser Console:**
   ```
   F12 → Console
   ```
   Suche nach `[FCM]` logs

2. **Check FCM Token:**
   ```javascript
   // In Browser Console
   const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
   console.log('FCM Token:', userDoc.data().fcmToken);
   console.log('Enabled:', userDoc.data().notificationsEnabled);
   ```

3. **Test Manual Notification:**
   ```javascript
   import { getFunctions, httpsCallable } from 'firebase/functions';

   const functions = getFunctions();
   const sendTest = httpsCallable(functions, 'sendTestNotification');

   await sendTest();
   ```

4. **Check Cloud Function Logs:**
   ```bash
   firebase functions:log

   # Oder in Firebase Console:
   # Functions → Logs
   ```

### Problem: "Permission denied"

User hat im Browser Notifications blockiert.

**Lösung:**
```
Chrome: Einstellungen → Datenschutz → Website-Einstellungen → Benachrichtigungen
Firefox: Einstellungen → Datenschutz → Berechtigungen → Benachrichtigungen
Safari: Einstellungen → Websites → Benachrichtigungen
```

User muss Website zu "Erlaubt" ändern.

### Problem: iOS Safari funktioniert nicht

iOS Safari unterstützt Web Push erst ab **iOS 16.4** (März 2023).

**Check:**
- iOS Version: Einstellungen → Allgemein → Info → Version
- Muss mindestens 16.4 sein

---

## 📊 Browser Support

| Browser | Push Notifications | Marktanteil |
|---------|-------------------|-------------|
| Chrome (Desktop) | ✅ | ~65% |
| Chrome (Android) | ✅ | ~65% |
| Firefox | ✅ | ~3% |
| Edge | ✅ | ~5% |
| Safari (macOS) | ✅ | ~20% |
| Safari (iOS) | ⚠️ Ab iOS 16.4 | ~20% |
| Opera | ✅ | ~2% |

**Insgesamt: ~90%+ User können es nutzen!**

---

## 💰 Kosten

### Firebase Cloud Messaging:
```
✅ KOSTENLOS bis 10 Millionen Messages/Monat
```

**Für deine App:**
- 100 User
- 10 Notifications/Tag/User
- = 1.000 Notifications/Tag
- = 30.000 Notifications/Monat

**→ Weit unter dem Limit! Komplett kostenlos!** 🎉

---

## 🔒 Datenschutz / DSGVO

### Was gespeichert wird:

```javascript
users/{userId} {
  fcmToken: "encrypted-token",  // Verschlüsselt von Firebase
  fcmTokenUpdatedAt: Timestamp,
  notificationsEnabled: true,
  notificationPreferences: { ... }
}
```

### DSGVO-konform:

- ✅ User muss explizit "Erlauben" klicken
- ✅ User kann jederzeit deaktivieren (in Settings)
- ✅ Token wird nur für Notifications genutzt
- ✅ Keine persönlichen Daten in Notifications
- ✅ Token wird gelöscht bei Account-Löschung
- ✅ User kann Präferenzen anpassen

### Datenschutzerklärung-Text:

```
Push-Benachrichtigungen

Wir verwenden Firebase Cloud Messaging (FCM) von Google, um dir wichtige
Updates zu senden. Dabei wird ein verschlüsseltes Token auf deinem Gerät
gespeichert. Du kannst Benachrichtigungen jederzeit in den Einstellungen
deaktivieren. Mehr Infos: https://firebase.google.com/support/privacy
```

---

## 🎓 Best Practices

### ✅ DO:

- Benachrichtigungen nur für wichtige Events senden
- User kann Präferenzen anpassen
- Clear, kurze Notification-Texte
- Relevante Links in Notifications
- Test-Function nutzen vor Production

### ❌ DON'T:

- Zu viele Notifications senden (nervt User)
- Werbung in Notifications
- Notifications ohne User-Permission
- Zu lange Notification-Texte
- Notifications für unwichtige Events

---

## 🚀 Deployment Checklist

Vor dem Live-Gehen:

- [ ] VAPID Key in `fcm-manager.js` eingetragen
- [ ] Icons erstellt (optional aber empfohlen)
- [ ] Cloud Functions deployed
- [ ] Firestore Rules aktualisiert
- [ ] Test-Notification erfolgreich gesendet
- [ ] Auf mehreren Geräten getestet
- [ ] Datenschutzerklärung aktualisiert

---

## 📝 Zusammenfassung

**Du hast jetzt:**
- ✅ Service Worker für Background Notifications
- ✅ FCM Token Management
- ✅ Schönen Permission Dialog
- ✅ Cloud Functions für verschiedene Events
- ✅ Anpassbare User-Präferenzen
- ✅ Test-Function zum Debuggen

**Was noch fehlt:**
- ⚠️ VAPID Key muss eingetragen werden!
- ⚠️ Cloud Functions müssen deployed werden
- ⚠️ Icons erstellen (optional)

**Deployment:**
```bash
# 1. VAPID Key eintragen (siehe Schritt 1)
# 2. Functions deployen
firebase deploy --only functions

# 3. Hosting deployen
firebase deploy --only hosting

# 4. Testen!
```

---

## 📞 Support

Bei Problemen:
1. Check Troubleshooting Section oben
2. Check Firebase Console → Functions → Logs
3. Check Browser Console (F12)
4. Check Service Worker Status:
   - Chrome: `chrome://serviceworker-internals`
   - Firefox: `about:debugging#/runtime/this-firefox`

---

Viel Erfolg mit den Push Notifications! 🎉🔔
