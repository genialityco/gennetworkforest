// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAe-z1T2gjCeT5FP0JY_rdt4kkv9m49tGc",
  authDomain: "sured-883e9.firebaseapp.com",
  projectId: "sured-883e9",
  storageBucket: "sured-883e9.firebasestorage.app",
  messagingSenderId: "702599304678",
  appId: "1:702599304678:web:e6974c1f7784aed1fe3227",
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Helper: garantiza que haya usuario anónimo y lo devuelve
export function ensureAnonymousUser() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsub();
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          unsub();
          resolve(cred.user);
        } catch (err) {
          unsub();
          reject(err);
        }
      }
    });
  });
}
