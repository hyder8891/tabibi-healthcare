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
  type Auth,
  type Persistence,
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

interface ReactNativeAsyncStorageInterface {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

function createAuth(): Auth {
  if (Platform.OS === "web") {
    return getAuth(app);
  }
  try {
    const firebaseAuthModule = require("@firebase/auth") as {
      getReactNativePersistence: (storage: ReactNativeAsyncStorageInterface) => Persistence;
    };
    const asyncStorageModule = require("@react-native-async-storage/async-storage") as {
      default: ReactNativeAsyncStorageInterface;
    };
    return initializeAuth(app, {
      persistence: firebaseAuthModule.getReactNativePersistence(asyncStorageModule.default),
    });
  } catch (e: unknown) {
    if (e !== null && typeof e === "object" && "code" in e && (e as { code: string }).code === "auth/already-initialized") {
      return getAuth(app);
    }
    throw e;
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
