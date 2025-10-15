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
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

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

// ===== TOKEN BEIM SEITENLADEN PRÜFEN =====
window.addEventListener("load", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  tokenId = urlParams.get("token");

  if (!tokenId) {
    return displayError("Kein Einladungstoken gefunden.");
  }

  try {
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
  } catch (error) {
    console.error("Token validation error:", error);
    displayError("Fehler beim Überprüfen des Tokens.");
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