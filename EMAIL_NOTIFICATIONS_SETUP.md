# Email-Benachrichtigungen für Coaches

Die TTV Champions App sendet automatisch Email-Benachrichtigungen an Coaches, wenn neue Match-Anfragen zur Genehmigung vorliegen.

## 📧 Funktionsweise

- **Trigger:** Wenn ein Spieler eine Match-Anfrage erstellt und der Gegner zustimmt, ändert sich der Status zu `pending_coach`
- **Empfänger:** Alle Coaches und Admins im jeweiligen Club
- **Inhalt:** Spielernamen, Ergebnis, Gewinner, Handicap-Info

## ⚙️ Email-Provider Konfiguration

Die App verwendet **flexible SMTP-Konfiguration** (nicht Gmail-spezifisch). Du kannst jeden Email-Provider verwenden.

### Empfohlene Email-Provider

#### 1. **SendGrid** (Empfohlen)
- ✅ Kostenloses Tier: 100 Emails/Tag
- ✅ Einfache Einrichtung
- ✅ Hohe Zustellrate

**Konfiguration:**
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
```

[SendGrid API Key erstellen](https://app.sendgrid.com/settings/api_keys)

#### 2. **Mailgun**
- ✅ Kostenloses Tier: 1.000 Emails/Monat
- ✅ Gute Dokumentation

**Konfiguration:**
```bash
SMTP_HOST=smtp.eu.mailgun.org  # oder smtp.mailgun.org (US)
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@<your-domain>.mailgun.org
SMTP_PASS=<your-mailgun-password>
```

#### 3. **Brevo (ehemals Sendinblue)**
- ✅ Kostenloses Tier: 300 Emails/Tag

**Konfiguration:**
```bash
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your-email>
SMTP_PASS=<your-smtp-key>
```

#### 4. **Eigener SMTP-Server**
Falls du einen eigenen Mailserver hast:

**Konfiguration:**
```bash
SMTP_HOST=smtp.deine-domain.de
SMTP_PORT=587  # oder 465 für SSL
SMTP_SECURE=false  # true für Port 465
SMTP_USER=deine-email@deine-domain.de
SMTP_PASS=<dein-passwort>
```

## 🚀 Einrichtung in Firebase

### Schritt 1: Environment Variables setzen

**Lokale Entwicklung** (`.env` Datei in `functions/`):
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.xxx...  # Dein API Key
APP_URL=http://localhost:5000  # Deine App URL
```

**Production** (Firebase Functions Config):
```bash
# Cloud Functions (empfohlen für Secrets)
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS

# Oder mit environment config
firebase functions:config:set smtp.host="smtp.sendgrid.net"
firebase functions:config:set smtp.port="587"
firebase functions:config:set smtp.secure="false"
firebase functions:config:set smtp.user="apikey"
firebase functions:config:set smtp.pass="SG.xxx..."
firebase functions:config:set app.url="https://ttv-champions.web.app"
```

### Schritt 2: Functions deployen

```bash
cd functions
npm install
cd ..
firebase deploy --only functions:notifyCoachesSinglesRequest
```

## 📝 Email-Template

Die Email enthält:
- Begrüßung mit Coach-Namen
- Match-Details (Spieler, Ergebnis, Gewinner)
- Handicap-Hinweis (falls verwendet)
- **Direkter Link zur Coach-App** zum Genehmigen
- Automatisch generierte Signatur

## 🧪 Testen

1. Erstelle eine Test-Match-Anfrage als Spieler
2. Lass den Gegner zustimmen
3. Prüfe die Firebase Functions Logs:
   ```bash
   firebase functions:log --only notifyCoachesSinglesRequest
   ```
4. Coach sollte eine Email erhalten

## 🔍 Troubleshooting

### Keine Email erhalten?

**1. Prüfe die Logs:**
```bash
firebase functions:log --only notifyCoachesSinglesRequest
```

**2. Prüfe SMTP-Konfiguration:**
```bash
firebase functions:config:get
```

**3. Stelle sicher, dass Coach eine Email-Adresse hat:**
- In Firestore `users/{coachId}` muss das Feld `email` gesetzt sein

**4. Spam-Ordner prüfen:**
- Erste Emails von neuen Sendern landen oft im Spam

**5. SMTP-Provider Limits:**
- SendGrid: Max 100 Emails/Tag (Free Tier)
- Mailgun: Max 1.000 Emails/Monat (Free Tier)

### "SMTP not configured" Warning?

Die Umgebungsvariablen sind nicht gesetzt. Führe Schritt 1 aus.

### "Failed to send email" Error?

- **Falsches Passwort/API Key:** Überprüfe Credentials
- **Port blockiert:** Manche Netzwerke blockieren Port 587/465
- **Firewall:** Firebase benötigt ausgehende Verbindungen auf SMTP-Ports

## 🔐 Sicherheit

- ✅ **Niemals** SMTP-Passwörter im Code committen
- ✅ Verwende Firebase Secrets für sensible Daten
- ✅ Nutze API Keys statt echter Passwörter (z.B. SendGrid API Key)
- ✅ Aktiviere 2FA bei deinem Email-Provider

## 📊 Monitoring

Prüfe regelmäßig:
```bash
# Anzahl gesendeter Emails
firebase functions:log --only notifyCoachesSinglesRequest | grep "Email sent"

# Fehlerrate
firebase functions:log --only notifyCoachesSinglesRequest | grep "Failed to send"
```

## 💡 Tipps

1. **SendGrid empfohlen:** Bestes Preis-Leistungs-Verhältnis für kleine Apps
2. **Verwende Secrets:** Nicht `functions:config`, sondern `secrets:set` für Passwörter
3. **Teste zuerst lokal:** Mit Firebase Emulator Suite
4. **Whitelist Email:** Füge `noreply@ttv-champions.web.app` zu Kontakten hinzu

## 🎯 Next Steps

Erweitere die Email-Benachrichtigungen auf:
- ✉️ Coach genehmigt/lehnt ab → Benachrichtige beide Spieler
- ✉️ Spieler B lehnt ab → Benachrichtige Spieler A
- ✉️ Tägliche Zusammenfassung für Coaches

Diese Features sind bereits als TODO markiert in `functions/index.js`.
