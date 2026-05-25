import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// Your authentic web app's Firebase configuration pulled directly from the SDK console
const firebaseConfig = {
  apiKey: "AIzaSyBu5whtaH1etp7Pf--P3CZ7_t89CxK8IVc",
  authDomain: "ca-tracker-e31fe.firebaseapp.com",
  projectId: "ca-tracker-e31fe",
  storageBucket: "ca-tracker-e31fe.firebasestorage.app",
  messagingSenderId: "39816912890",
  appId: "1:39816912890:web:adab8a43de9c4783f60e43",
  measurementId: "G-FF3CVP0RYD"
};

// Initialize Firebase Core Engine instance
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Helper function to upload study maps to the cloud database
export const saveUserDataToCloud = async (userId, dataPayload) => {
  try {
    await setDoc(doc(db, "users", userId), dataPayload, { merge: true });
  } catch (error) {
    console.error("Cloud backup sync error:", error);
  }
};

// Helper function to pull down matching tracker data rows from the cloud
export const fetchUserDataFromCloud = async (userId) => {
  try {
    const docSnap = await getDoc(doc(db, "users", userId));
    return docSnap.exists() ? docSnap.data() : null;
  } catch (error) {
    console.error("Cloud retrieval error:", error);
    return null;
  }
};
