// ===== IMPORTS =====
// NEU: Zusätzliche Imports für die Emulatoren
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

// NEU: Der Emulator-Block
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Register.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);

    // Functions Emulator
    connectFunctionsEmulator(functions, "localhost", 5001);
}


// ===== UI ELEMENTE =====
const loader = document.getElementById("loader");
const registrationFormContainer = document.getElementById("registration-form-container");
const registrationForm = document.getElementById("registration-form");
const errorMessage = document.getElementById("error-message");
const formSubtitle = document.getElementById("form-subtitle");
const submitButton = document.getElementById("submit-button");

let tokenId = null;
let invitationCode = null;
let invitationCodeData = null;
let registrationType = null; // 'token' or 'code'

// ===== TOKEN ODER CODE BEIM SEITENLADEN PRÜFEN =====
window.addEventListener("load", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  tokenId = urlParams.get("token");
  invitationCode = urlParams.get("code");

  console.log("Register.js loaded - tokenId:", tokenId, "code:", invitationCode);

  // Prüfe ob Token ODER Code vorhanden
  if (!tokenId && !invitationCode) {
    return displayError("Kein Einladungstoken oder -code gefunden.");
  }

  try {
    // ===== CODE-FLOW =====
    if (invitationCode) {
      console.log("Code-Flow starting with code:", invitationCode);
      registrationType = 'code';
      invitationCode = invitationCode.trim().toUpperCase();

      // Validiere Format
      if (!validateCodeFormat(invitationCode)) {
        console.error("Invalid code format:", invitationCode);
        return displayError("Ungültiges Code-Format.");
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

// ===== REGISTRIERUNG =====
registrationForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMessage.textContent = "";

  const email = document.getElementById("email-address").value;
  const password = document.getElementById("password").value;
  const passwordConfirm = document.getElementById("password-confirm").value;

  if (password !== passwordConfirm) {
    errorMessage.textContent = "Die Passwörter stimmen nicht überein.";
    return;
  }

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
        window.location.href = "/onboarding.html";
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
        window.location.href = "/onboarding.html";
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

// ===== FEHLERANZEIGE =====
function displayError(message) {
  loader.classList.add("hidden");
  registrationFormContainer.classList.add("hidden");
  document.body.innerHTML = `
    <div class="w-full max-w-md p-8 bg-white rounded-xl shadow-lg text-center mx-auto mt-10">
      <h2 class="text-2xl font-bold text-red-600">Fehler</h2>
      <p class="text-gray-700 mt-2">${message}</p>
      <a href="/index.html" class="inline-block mt-6 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">
        Zurück zum Login
      </a>
    </div>`;
}