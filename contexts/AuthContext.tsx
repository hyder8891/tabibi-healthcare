import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { apiRequest } from "@/lib/query-client";
import { setAuthTokenGetter } from "@/lib/query-client";
import {
  auth,
  onAuthStateChanged,
  firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  googleProvider,
  type FirebaseUser,
  type ConfirmationResult,
} from "@/lib/firebase";
import { Platform } from "react-native";

const AUTH_USER_KEY = "tabibi_auth_user";

interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  photoUrl: string | null;
  authProvider: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  sendPhoneOTP: (phoneNumber: string) => Promise<void>;
  verifyPhoneOTP: (code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const firebaseUserRef = useRef<FirebaseUser | null>(null);

  const persistUser = async (userData: AuthUser | null) => {
    try {
      if (userData) {
        await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(userData));
      } else {
        await SecureStore.deleteItemAsync(AUTH_USER_KEY);
      }
    } catch {}
  };

  const syncWithBackend = async (firebaseUser: FirebaseUser): Promise<AuthUser> => {
    const res = await apiRequest("POST", "/api/auth/firebase");
    const data = await res.json();
    return data as AuthUser;
  };

  useEffect(() => {
    setAuthTokenGetter(async () => {
      let fbUser = firebaseUserRef.current;
      if (!fbUser) {
        fbUser = auth.currentUser;
        if (fbUser) firebaseUserRef.current = fbUser;
      }
      if (!fbUser) return null;
      try {
        return await fbUser.getIdToken(true);
      } catch {
        try {
          const refreshed = auth.currentUser;
          if (refreshed) {
            firebaseUserRef.current = refreshed;
            return await refreshed.getIdToken(true);
          }
        } catch {}
        return null;
      }
    });
    return () => setAuthTokenGetter(async () => null);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadCached = async () => {
      try {
        const stored = await SecureStore.getItemAsync(AUTH_USER_KEY);
        if (stored && mounted) {
          setUser(JSON.parse(stored));
        }
      } catch {}
    };
    loadCached();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;

      if (firebaseUser) {
        firebaseUserRef.current = firebaseUser;
        try {
          const backendUser = await syncWithBackend(firebaseUser);
          if (mounted) {
            setUser(backendUser);
            await persistUser(backendUser);
          }
        } catch (err) {
          console.error("Backend sync failed:", err);
        }
      } else {
        firebaseUserRef.current = null;
        if (mounted) {
          setUser(null);
          await persistUser(null);
        }
      }
      if (mounted) setIsLoading(false);
    });

    const timeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    firebaseUserRef.current = cred.user;
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
  }, []);

  const signupWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUserRef.current = cred.user;
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const cred = await signInWithPopup(auth, googleProvider);
      firebaseUserRef.current = cred.user;
      const backendUser = await syncWithBackend(cred.user);
      setUser(backendUser);
      await persistUser(backendUser);
    } else {
      throw new Error("Google sign-in on native requires additional setup");
    }
  }, []);

  const sendPhoneOTP = useCallback(async (phoneNumber: string) => {
    if (Platform.OS === "web") {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
      confirmationResultRef.current = confirmation;
    } else {
      throw new Error("Phone auth on native requires additional setup");
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (code: string) => {
    if (!confirmationResultRef.current) {
      throw new Error("No pending phone verification. Please request a code first.");
    }
    const cred = await confirmationResultRef.current.confirm(code);
    firebaseUserRef.current = cred.user;
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
    confirmationResultRef.current = null;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    firebaseUserRef.current = null;
    setUser(null);
    await persistUser(null);
    confirmationResultRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, loginWithEmail, signupWithEmail, loginWithGoogle, sendPhoneOTP, verifyPhoneOTP, resetPassword, logout }),
    [user, isLoading, loginWithEmail, signupWithEmail, loginWithGoogle, sendPhoneOTP, verifyPhoneOTP, resetPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
