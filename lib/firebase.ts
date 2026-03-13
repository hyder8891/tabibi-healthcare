import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithCredential,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
  type ConfirmationResult,
} from "firebase/auth";
import { Platform } from "react-native";

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

function createAuth() {
  if (Platform.OS === "web") {
    return getAuth(app);
  }
  try {
    const firebaseAuth = require("@firebase/auth") as {
      getReactNativePersistence: (storage: any) => any;
    };
    const { getReactNativePersistence } = firebaseAuth;
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: unknown) {
    const error = e as { code?: string };
    if (error?.code === "auth/already-initialized") {
      return getAuth(app);
    }
    return getAuth(app);
  }
}

const auth = createAuth();

const googleProvider = new GoogleAuthProvider();

export {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  GoogleAuthProvider,
  EmailAuthProvider,
  googleProvider,
  signInWithPopup,
  signInWithCredential,
  linkWithCredential,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  firebaseSignOut,
  onAuthStateChanged,
};
export type { FirebaseUser, ConfirmationResult };
