// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyAlfYkY3-jNjG3ndKXaRce-ng6oPBm8XL0",
    authDomain: "genforestnetwork.firebaseapp.com",
    projectId: "genforestnetwork",
    storageBucket: "genforestnetwork.firebasestorage.app",
    messagingSenderId: "422663794232",
    appId: "1:422663794232:web:4a75bfab15724c827f40cd",
    measurementId: "G-9XV3SM1K0M"
  };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };