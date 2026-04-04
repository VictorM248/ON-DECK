import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, OAuthProvider } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const auth = getAuth(app);
export const functions = getFunctions(app);
export const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({
  tenant: import.meta.env.VITE_MICROSOFT_TENANT_ID as string,
  prompt: "select_account",
});

