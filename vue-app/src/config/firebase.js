import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyC_LUFOIUm3PNlUh_Y8w7iiAqlI1aRapWc",
  authDomain: "ttv-champions-prod.firebaseapp.com",
  projectId: "ttv-champions-prod",
  storageBucket: "ttv-champions-prod.firebasestorage.app",
  messagingSenderId: "569930663711",
  appId: "1:569930663711:web:2a5529aff927b28c12922a",
  measurementId: "G-H2R9ZJYQ06"
}

// Initialize Firebase
export const firebaseApp = initializeApp(firebaseConfig)
export const db = getFirestore(firebaseApp)
export const auth = getAuth(firebaseApp)
export const storage = getStorage(firebaseApp)
