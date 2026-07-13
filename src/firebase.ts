import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';

/**
 * Firebase configuration object.
 * You can set these values in your environment variables (.env file) with VITE_ prefixed keys,
 * or paste your Firebase configuration keys directly into this object.
 */
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyChTt0Wp-EqDNltxlJ2i5k7j-xaQ6lJowM",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "dersayar.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "dersayar",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "dersayar.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "357435001791",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:357435001791:web:1fb65e9c7edad5966bef0a",
  measurementId: (import.meta as any).env.VITE_FIREBASE_MEASUREMENT_ID || "G-KY81WENG90"
};

/**
 * Checks whether Firebase is configured with real credentials or placeholders
 */
export const isFirebaseConfigured = (): boolean => {
  return (
    !!firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE" &&
    firebaseConfig.apiKey !== "" &&
    !!firebaseConfig.projectId &&
    firebaseConfig.projectId !== "PASTE_YOUR_PROJECT_ID_HERE" &&
    firebaseConfig.projectId !== ""
  );
};

let app;
let db: Firestore | null = null;
let auth: Auth | null = null;
let appCheck: AppCheck | null = null;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase initialized successfully.");

    // Initialize Firebase App Check
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const isDev = (
        hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.includes('run.app') || 
        hostname.includes('webcontainer-api.io')
      );

      if (isDev) {
        // Enable App Check Debug Token in local development or preview environments.
        // The Firebase SDK will automatically use a Debug provider instead of reCAPTCHA.
        (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }

      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LfmCVItAAAAAOxwbkoo_cTFwNnxXfBEIayW1REu'),
        isTokenAutoRefreshEnabled: true
      });
      console.log(`Firebase App Check initialized successfully (isDev: ${isDev}).`);
    }
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn(
    "Firebase is not configured yet. The application is running in local storage fallback mode.\n" +
    "Please add your Firebase credentials to your environment variables or directly inside 'src/firebase.ts'."
  );
}

export { app, db, auth, appCheck };
