# SC Champions Mobile App Setup

Diese Anleitung erklärt, wie du die SC Champions App für Android und iOS bauen kannst.

## Voraussetzungen

### Allgemein
- Node.js 18+ installiert
- npm installiert

### Für Android
- [Android Studio](https://developer.android.com/studio) installiert
- Android SDK (min. API 22 / Android 5.1)
- Java 17+ (wird mit Android Studio installiert)

### Für iOS (nur auf Mac)
- [Xcode](https://apps.apple.com/app/xcode/id497799835) 14+ installiert
- CocoaPods: `sudo gem install cocoapods`
- Apple Developer Account (für App Store Veröffentlichung)

## Schnellstart

### Web-Assets kopieren und sync
```bash
npm run cap:sync
```

### Android App öffnen
```bash
npm run android
# oder
npx cap open android
```

### iOS App öffnen (nur Mac)
```bash
npm run ios
# oder
npx cap open ios
```

## Entwicklungs-Workflow

1. **Web-Änderungen testen**: Öffne `public/` im Browser
2. **Sync nach Änderungen**: `npm run cap:sync`
3. **Native Projekte öffnen**: `npm run android` oder `npm run ios`
4. **In Emulator/Simulator testen**

## Android Build (Release APK)

```bash
# Sync und Release APK bauen
npm run cap:build:android

# APK findest du unter:
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### Signiertes APK für Play Store

1. Erstelle einen Keystore:
```bash
keytool -genkey -v -keystore sc-champions.keystore -alias sc-champions -keyalg RSA -keysize 2048 -validity 10000
```

2. Erstelle `android/keystore.properties`:
```properties
storePassword=dein_passwort
keyPassword=dein_passwort
keyAlias=sc-champions
storeFile=../sc-champions.keystore
```

3. In Android Studio: Build → Generate Signed Bundle/APK

## iOS Build

1. Öffne das iOS-Projekt: `npm run ios`
2. In Xcode: Wähle dein Team unter "Signing & Capabilities"
3. Wähle dein Zielgerät oder Simulator
4. Product → Build (⌘B)

### App Store Veröffentlichung
1. Product → Archive
2. Window → Organizer
3. "Distribute App" → App Store Connect

## App Icons

Die App-Icons müssen in verschiedenen Größen bereitgestellt werden.

### Icon-Dateien erstellen

Erstelle ein quadratisches PNG (1024x1024px) und generiere die benötigten Größen:

**Android** (`android/app/src/main/res/`):
- `mipmap-mdpi/ic_launcher.png` - 48x48
- `mipmap-hdpi/ic_launcher.png` - 72x72
- `mipmap-xhdpi/ic_launcher.png` - 96x96
- `mipmap-xxhdpi/ic_launcher.png` - 144x144
- `mipmap-xxxhdpi/ic_launcher.png` - 192x192

**iOS** (`ios/App/App/Assets.xcassets/AppIcon.appiconset/`):
- Diverse Größen (20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024)

**Tipp**: Nutze [capacitor-assets](https://github.com/ionic-team/capacitor-assets):
```bash
npm install -g @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#1e3a5f'
```

## Splash Screen

Der Splash Screen wird in `capacitor.config.ts` konfiguriert.

**Android**: Erstelle `android/app/src/main/res/drawable/splash.png`
**iOS**: Konfiguriere in Xcode unter "LaunchScreen.storyboard"

## Push Notifications

### Firebase Cloud Messaging (FCM) Setup

1. Erstelle ein Firebase-Projekt (falls nicht vorhanden)
2. Füge Android/iOS App in Firebase Console hinzu
3. Lade `google-services.json` (Android) bzw. `GoogleService-Info.plist` (iOS) herunter

**Android**:
```bash
# Kopiere google-services.json nach:
android/app/google-services.json
```

**iOS**:
```bash
# Kopiere GoogleService-Info.plist nach:
ios/App/App/GoogleService-Info.plist
```

## Bekannte Probleme

### iOS: Pod Install Fehler
```bash
cd ios/App
pod install --repo-update
```

### Android: Gradle Sync Fehler
- File → Sync Project with Gradle Files
- File → Invalidate Caches / Restart

## Nützliche Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `npm run cap:sync` | Sync Web-Assets und Plugins |
| `npm run cap:copy` | Nur Web-Assets kopieren |
| `npm run android` | Android Studio öffnen |
| `npm run ios` | Xcode öffnen |
| `npx cap doctor` | Capacitor-Setup prüfen |

## Ressourcen

- [Capacitor Dokumentation](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/guide)
- [Apple Developer Documentation](https://developer.apple.com/documentation)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
