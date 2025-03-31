// index.js
import { doc, setDoc, updateDoc, increment,onSnapshot } from "firebase/firestore";
import { db } from "./firebaseConfig.js";

// Reference to Firestore document
const treesRef = doc(db, "globalCounters", "treesCounter");

// Initialize document if not exist
async function initDoc() {
    try {
        await setDoc(treesRef, { trees: 0 }, { merge: true });
    } catch (error) {
        console.error("Error initializing document:", error);
    }
}

initDoc();

// Increment trees function
async function incrementTrees() {
    try {
        await updateDoc(treesRef, {
            trees: increment(1) // Ensure atomic increment
        });
        console.log("Incremented successfully!");
    } catch (error) {
        console.error("Error incrementing trees:", error);
    }
}

function listenToTreesCount() {
    onSnapshot(treesRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            document.getElementById('treesValue').innerText = data.trees;
        } else {
            document.getElementById('treesValue').innerText = "0";
        }
    }, (error) => {
        console.error("Error fetching trees count:", error);
    });
}

listenToTreesCount();

// Button event listener
document.getElementById('incrementTrees').addEventListener('click', incrementTrees);