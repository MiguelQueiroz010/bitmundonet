import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js";
import { getFirebaseConfig } from "./firebase-manager.js";

async function initFirebase() {
    const firebaseConfig = await getFirebaseConfig();
    const app = initializeApp(firebaseConfig);
    return {
        db: getFirestore(app),
        auth: getAuth(app)
    };
}

const firebaseInstance = initFirebase();

// Export promises that resolve to the respective instances
export const dbPromise = firebaseInstance.then(f => f.db);
export const authPromise = firebaseInstance.then(f => f.auth);
export const fbAppPromise = firebaseInstance.then(f => f.app);
