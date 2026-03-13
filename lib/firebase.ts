import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
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
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let auth: ReturnType<typeof getAuth>;
if (Platform.OS === "web") {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (e: any) {
    if (e?.code === "auth/already-initialized") {
      auth = getAuth(app);
    } else {
      throw e;
    }
  }
}

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
