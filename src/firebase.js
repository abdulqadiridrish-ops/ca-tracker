import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// Note: You can create a free project at console.firebase.google.com to grab your unique config keys, 
// but the engine will mount and simulate cleanly right away with this structure.
const firebaseConfig = {
  apiKey: "AIzaSyDummyKey-For-Google-SignIn-Auth-Payload",
  authDomain: "ca-tracker-self.firebaseapp.com",
  projectId: "ca-tracker-self",
  storageBucket: "ca-tracker-self.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

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
