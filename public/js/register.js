// ===== IMPORTS =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  updateDoc,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";
import { isCodeExpired, validateCodeFormat } from "./invitation-code-utils.js";

// ===== INITIALISIERUNG =====
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "europe-west3");

// Emulator-Block
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Register.js: Verbinde mit lokalen Firebase Emulatoren...");
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
}


// ===== UI ELEMENTE =====
const loader = document.getElementById("loader");
const registrationFormContainer = document.getElementById("registration-form-container");
const registrationForm = document.getElementById("registration-form");
const errorMessage = document.getElementById("error-message");
const formSubtitle = document.getElementById("form-subtitle");
const submitButton = document.getElementById("submit-button");
const tokenRequiredMessageContainer = document.getElementById("token-required-message");

let tokenId = null;
let invitationCode = null;
let invitationCodeData = null;
let registrationType = null; // 'token' or 'code'

// ===== TOKEN ODER CODE BEIM SEITENLADEN PRÜFEN (ANGEPASSTE LOGIK) =====
window.addEventListener("load", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  tokenId = urlParams.get("token");
  invitationCode = urlParams.get("code");

  console.log("Register.js loaded - tokenId:", tokenId, "code:", invitationCode);

  // 1. Prüfe ob Token ODER Code vorhanden
  if (!tokenId && !invitationCode) {
    // KEIN Token/Code: Tu nichts. Die register.html zeigt bereits
    // die Standard-Nachricht (#token-required-message) an.
    console.log("Kein Token/Code gefunden. Standardseite wird angezeigt.");
    return;
  }

  // 2. Token/Code GEFUNDEN: Standardnachricht verstecken, Loader anzeigen
  if (tokenRequiredMessageContainer) {
    tokenRequiredMessageContainer.classList.add("hidden");
  }
  loader.classList.remove("hidden"); // Loader jetzt sichtbar machen

  try {
    // ===== CODE-FLOW =====
    if (invitationCode) {
      console.log("Code-Flow starting with code:", invitationCode);
      registrationType = 'code';
      invitationCode = invitationCode.trim().toUpperCase();

      // Validiere Format
      if (!validateCodeFormat(invitationCode)) {
        console.error("Invalid code format:", invitationCode);
        return displayError("Ungültiges Code-Format."); // Nutzt neue displayError
      }

      console.log("Code format valid, searching in Firestore...");

      // Suche Code in Firestore
      const q = query(
        collection(db, 'invitationCodes'),
        where('code', '==', invitationCode)
      );
      const snapshot = await getDocs(q);

      console.log("Firestore query complete, empty:", snapshot.empty);

      if (snapshot.empty) {
        return displayError("Dieser Code existiert nicht.");
      }

      invitationCodeData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      console.log("Code data loaded:", invitationCodeData);

      // Prüfe ob Code bereits verwendet wurde
      if (invitationCodeData.used) {
        return displayError("Dieser Code wurde bereits verwendet.");
      }

      // Prüfe ob Code abgelaufen ist
      if (isCodeExpired(invitationCodeData.expiresAt)) {
        return displayError("Dieser Code ist abgelaufen.");
      }

      // Code gültig - Zeige Formular mit vorausgefüllten Daten
      const welcomeName = invitationCodeData.firstName ? invitationCodeData.firstName : 'Coach';
      formSubtitle.textContent = `Willkommen ${welcomeName}! Vervollständige deine Registrierung.`;
      loader.classList.add("hidden");
      registrationFormContainer.classList.remove("hidden");

    }
    // ===== TOKEN-FLOW (Bisheriger Flow) =====
    else if (tokenId) {
      registrationType = 'token';
      const tokenDocRef = doc(db, "invitationTokens", tokenId);
      const tokenDocSnap = await getDoc(tokenDocRef);

      if (tokenDocSnap.exists() && !tokenDocSnap.data().isUsed) {
        const tokenData = tokenDocSnap.data();
        formSubtitle.textContent = `Willkommen im Verein ${tokenData.clubId}!`;
        loader.classList.add("hidden");
        registrationFormContainer.classList.remove("hidden");
      } else {
        displayError("Dieser Einladungslink ist ungültig oder wurde bereits verwendet.");
      }
    }

  } catch (error) {
    console.error("Token/Code validation error:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    displayError("Fehler beim Überprüfen der Einladung: " + error.message);
  }
});

// ===== REGISTRIERUNG (MIT NEUER CHECKBOX-VALIDIERUNG) =====
registrationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMessage.textContent = "";

  // Formulardaten abrufen
  const email = document.getElementById("email-address").value;
  const password = document.getElementById("password").value;
  const passwordConfirm = document.getElementById("password-confirm").value;

  // NEU: Die Checkboxen abrufen
  const consentStudy = document.getElementById("consent-study").checked;
  const consentPrivacy = document.getElementById("consent-privacy").checked;

  // Passwort-Prüfung
  if (password !== passwordConfirm) {
    errorMessage.textContent = "Die Passwörter stimmen nicht überein.";
    return;
  }

  // NEU: Die Checkboxen-Prüfung
  if (!consentStudy || !consentPrivacy) {
    errorMessage.textContent = "Du musst der Studie und der Datenschutzerklärung zustimmen.";
    return; // Bricht die Funktion hier ab
  }

  // Ab hier geht der Code normal weiter...
  submitButton.disabled = true;
  submitButton.textContent = "Registriere...";

  try {
    // 1️⃣ Firebase User erstellen
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log("✅ Neuer Benutzer erstellt:", user.uid);

    // 2️⃣ Kurz warten, bis Auth-State vollständig aktiv ist
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 3️⃣ Sicherheitshalber frisches Auth-Token abrufen
    await user.getIdToken(true);

    // ===== CODE-FLOW =====
    if (registrationType === 'code') {
      // 4️⃣ Callable Cloud Function aufrufen für Code-basierte Registrierung
      const claimInvitationCode = httpsCallable(functions, "claimInvitationCode");
      const result = await claimInvitationCode({
        code: invitationCode,
        codeId: invitationCodeData.id
      });

      if (result.data.success) {
        console.log("✅ Code erfolgreich eingelöst");
        // 5️⃣ Weiterleitung zum Onboarding
        // Use SPA navigation if available
        if (window.spaNavigate) {
            window.spaNavigate("/onboarding.html");
        } else {
            window.location.href = "/onboarding.html";
        }
      } else {
        throw new Error("Ein unbekannter Fehler ist aufgetreten.");
      }
    }
    // ===== TOKEN-FLOW (Bisheriger Flow) =====
    else if (registrationType === 'token') {
      // 4️⃣ Callable Cloud Function aufrufen
      const claimInvitationToken = httpsCallable(functions, "claimInvitationToken");
      const result = await claimInvitationToken({ tokenId });

      if (result.data.success) {
        console.log("✅ Token erfolgreich eingelöst");
        // 5️⃣ Weiterleitung zum Onboarding
        // Use SPA navigation if available
        if (window.spaNavigate) {
            window.spaNavigate("/onboarding.html");
        } else {
            window.location.href = "/onboarding.html";
        }
      } else {
        throw new Error("Ein unbekannter Fehler ist aufgetreten.");
      }
    }

  } catch (error) {
    console.error("❌ Fehler bei der Registrierung:", error);

    let displayMsg = error.message;
    if (error.code === "auth/email-already-in-use") {
      displayMsg = "Diese E-Mail-Adresse wird bereits verwendet.";
    } else if (error.code === "auth/invalid-email") {
      displayMsg = "Ungültige E-Mail-Adresse.";
    } else if (error.code === "auth/weak-password") {
      displayMsg = "Das Passwort ist zu schwach.";
    } else if (error.code === "functions/unauthenticated") {
      displayMsg = "Deine Sitzung ist abgelaufen. Bitte versuche es erneut.";
    } else if (error.code === "functions/internal") {
      displayMsg = "Ein interner Serverfehler ist aufgetreten.";
    } else if (error.message.includes("PERMISSION_DENIED")) {
      displayMsg = "Zugriff verweigert – bitte versuche es erneut.";
    }

    errorMessage.textContent = "Fehler bei der Registrierung: " + displayMsg;
    submitButton.disabled = false;
    submitButton.textContent = "Registrieren";
  }
});

// ===== FEHLERANZEIGE (NICHT-ZERSTÖRERISCHE VERSION) =====
function displayError(message) {
  // 1. Verstecke alle Haupt-Container
  loader.classList.add("hidden");
  registrationFormContainer.classList.add("hidden");

  // 2. Finde den Nachrichten-Container aus der HTML
  // (tokenRequiredMessageContainer ist bereits global definiert)

  if (tokenRequiredMessageContainer) {
    // 3. Passe den Inhalt des bestehenden Containers an
    
    // Icon ändern
    const icon = tokenRequiredMessageContainer.querySelector("i");
    if (icon) {
      icon.className = "fas fa-exclamation-triangle text-4xl text-red-600"; // Rotes Fehler-Icon
    }
    
    // Titel ändern
    const title = tokenRequiredMessageContainer.querySelector("h1");
    if (title) {
      title.textContent = "Ein Fehler ist aufgetreten";
      title.classList.remove("text-gray-900");
      title.classList.add("text-red-600");
    }
    
    // Alle Paragraphen finden
    const paragraphs = tokenRequiredMessageContainer.querySelectorAll("p");
    
    // Ersten Paragraph für die Fehlermeldung nutzen
    if (paragraphs[0]) {
      paragraphs[0].textContent = message;
      paragraphs[0].classList.remove("text-gray-600");
      paragraphs[0].classList.add("text-gray-800", "font-medium"); // Deutlicher hervorheben
    }
    
    // Alle weiteren Paragraphen und den Trenner verstecken
    if (paragraphs[1]) paragraphs[1].classList.add("hidden");
    const divider = tokenRequiredMessageContainer.querySelector("div.border-t");
    if (divider) divider.classList.add("hidden");

    // "Zur Startseite" Button sichtbar lassen, falls er da ist
    const homeLink = tokenRequiredMessageContainer.querySelector("a");
    if (homeLink) {
        homeLink.href = "/"; // Sicherstellen, dass es zur Startseite geht
    }
    
    // 4. Stelle sicher, dass der Container sichtbar ist
    tokenRequiredMessageContainer.classList.remove("hidden");

  } else {
    // Fallback, falls der Container nicht gefunden wird (alte Methode)
    console.error("Kritischer Fehler: #token-required-message Container nicht im DOM gefunden.");
    document.body.innerHTML = `
      <div class="w-full max-w-md p-8 bg-white rounded-xl shadow-lg text-center mx-auto mt-10">
        <h2 class="text-2xl font-bold text-red-600">Fehler</h2>
        <p class="text-gray-700 mt-2">${message}</p>
        <a href="/" class="inline-block mt-6 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">
          Zur Startseite
        </a>
      </div>`;
  }
}