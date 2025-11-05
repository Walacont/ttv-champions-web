#!/bin/bash

# Deployment Script für Firestore Rules
# Führe dieses Script aus, um die Firestore Rules zu deployen

echo "🚀 Deploying Firestore Rules to Production..."
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI nicht gefunden!"
    echo ""
    echo "Bitte installiere Firebase CLI:"
    echo "  npm install -g firebase-tools"
    echo ""
    echo "Oder nutze npx (ohne Installation):"
    echo "  npx firebase-tools deploy --only firestore:rules"
    echo ""
    exit 1
fi

# Check if logged in
echo "📝 Prüfe Firebase Login..."
if ! firebase projects:list &> /dev/null; then
    echo "⚠️  Nicht bei Firebase eingeloggt!"
    echo ""
    echo "Bitte logge dich ein:"
    echo "  firebase login"
    echo ""
    exit 1
fi

# Show current project
echo "📦 Aktuelles Projekt: $(firebase use)"
echo ""

# Confirm deployment
read -p "Möchtest du die Firestore Rules nach Production deployen? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment abgebrochen"
    exit 1
fi

# Deploy rules
echo ""
echo "🔄 Deploying..."
firebase deploy --only firestore:rules

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Firestore Rules erfolgreich deployed!"
    echo ""
    echo "Die folgenden Permissions wurden hinzugefügt/aktualisiert:"
    echo "  - completedChallenges Subcollection für Spieler"
    echo "  - Alle anderen Rules wurden beibehalten"
    echo ""
    echo "Du kannst jetzt die App testen!"
else
    echo ""
    echo "❌ Deployment fehlgeschlagen!"
    echo "Bitte prüfe die Fehlermeldung oben."
fi
