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
  sendEmailVerification,
  signInWithPopup,
  signInWithPhoneNumber,
  signInWithCredential,
  linkWithCredential,
  updateProfile as firebaseUpdateProfile,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  RecaptchaVerifier,
  GoogleAuthProvider,
  EmailAuthProvider,
  googleProvider,
  type FirebaseUser,
  type ConfirmationResult,
} from "@/lib/firebase";
import { Platform } from "react-native";

let GoogleSignin: any = null;
if (Platform.OS !== "web") {
  try {
    const gsModule = require("@react-native-google-signin/google-signin");
    GoogleSignin = gsModule.GoogleSignin;
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
      offlineAccess: false,
    });
  } catch (e) {
  }
}

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
  isEmailVerified: boolean;
  needsEmailVerification: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken?: string) => Promise<void>;
  sendPhoneOTP: (phoneNumber: string, appVerifier?: any) => Promise<void>;
  verifyPhoneOTP: (code: string, displayName?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  linkEmailToPhone: (email: string, password: string) => Promise<void>;
  linkPhoneToEmail: (phoneNumber: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const firebaseUserRef = useRef<FirebaseUser | null>(null);

  const isPasswordProvider = (fbUser: FirebaseUser | null): boolean => {
    if (!fbUser) return false;
    return fbUser.providerData.some(p => p.providerId === "password");
  };

  const persistUser = async (userData: AuthUser | null) => {
    try {
      if (userData) {
        await SecureStore.setItemAsync(AUTH_USER_KEY, JSON.stringify(userData));
      } else {
        await SecureStore.deleteItemAsync(AUTH_USER_KEY);
      }
    } catch (e) {
      console.warn("Failed to persist user to SecureStore:", e);
    }
  };

  const syncWithBackend = async (_firebaseUser?: FirebaseUser): Promise<AuthUser> => {
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
        const needsVerify = isPasswordProvider(firebaseUser) && !firebaseUser.emailVerified;
        if (mounted) {
          setIsEmailVerified(!needsVerify);
          setNeedsEmailVerification(needsVerify);
        }
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
          setIsEmailVerified(true);
          setNeedsEmailVerification(false);
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
    if (isPasswordProvider(cred.user) && !cred.user.emailVerified) {
      setNeedsEmailVerification(true);
      setIsEmailVerified(false);
    }
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
  }, []);

  const signupWithEmail = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUserRef.current = cred.user;
    await sendEmailVerification(cred.user);
    setNeedsEmailVerification(true);
    setIsEmailVerified(false);
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
  }, []);

  const loginWithGoogle = useCallback(async (externalIdToken?: string) => {
    if (externalIdToken) {
      const credential = GoogleAuthProvider.credential(externalIdToken);
      const cred = await signInWithCredential(auth, credential);
      firebaseUserRef.current = cred.user;
      const backendUser = await syncWithBackend(cred.user);
      setUser(backendUser);
      await persistUser(backendUser);
      return;
    }
    if (Platform.OS === "web") {
      const cred = await signInWithPopup(auth, googleProvider);
      firebaseUserRef.current = cred.user;
      const backendUser = await syncWithBackend(cred.user);
      setUser(backendUser);
      await persistUser(backendUser);
    } else {
      if (!GoogleSignin) {
        throw new Error("Google Sign-In is not available on this device.");
      }
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken ?? signInResult?.idToken;
      if (!idToken) {
        throw new Error("Failed to get ID token from Google Sign-In.");
      }
      const credential = GoogleAuthProvider.credential(idToken);
      const cred = await signInWithCredential(auth, credential);
      firebaseUserRef.current = cred.user;
      const backendUser = await syncWithBackend(cred.user);
      setUser(backendUser);
      await persistUser(backendUser);
    }
  }, []);

  const sendPhoneOTP = useCallback(async (phoneNumber: string, appVerifier?: any) => {
    if (Platform.OS === "web") {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
      confirmationResultRef.current = confirmation;
    } else {
      if (!appVerifier) {
        throw new Error("PHONE_AUTH_NATIVE_UNSUPPORTED");
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      confirmationResultRef.current = confirmation;
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (code: string, displayName?: string) => {
    if (!confirmationResultRef.current) {
      throw new Error("No pending phone verification. Please request a code first.");
    }
    const cred = await confirmationResultRef.current.confirm(code);
    firebaseUserRef.current = cred.user;
    if (displayName && cred.user) {
      await firebaseUpdateProfile(cred.user, { displayName });
    }
    const backendUser = await syncWithBackend(cred.user);
    setUser(backendUser);
    await persistUser(backendUser);
    confirmationResultRef.current = null;
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const sendVerificationEmailFn = useCallback(async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not signed in");
    await sendEmailVerification(fbUser);
  }, []);

  const checkEmailVerification = useCallback(async (): Promise<boolean> => {
    const fbUser = auth.currentUser;
    if (!fbUser) return false;
    await fbUser.reload();
    const verified = fbUser.emailVerified;
    if (verified) {
      setIsEmailVerified(true);
      setNeedsEmailVerification(false);
      const backendUser = await syncWithBackend(fbUser);
      setUser(backendUser);
      await persistUser(backendUser);
    }
    return verified;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) throw new Error("Not signed in with email");
    const credential = EmailAuthProvider.credential(fbUser.email, currentPassword);
    await reauthenticateWithCredential(fbUser, credential);
    await firebaseUpdatePassword(fbUser, newPassword);
  }, []);

  const linkEmailToPhone = useCallback(async (email: string, password: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not signed in");
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(fbUser, credential);
    await sendEmailVerification(fbUser);
    const backendUser = await syncWithBackend(fbUser);
    setUser(backendUser);
    await persistUser(backendUser);
  }, []);

  const linkPhoneToEmail = useCallback(async (phoneNumber: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error("Not signed in");
    if (Platform.OS === "web") {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifierRef.current);
      confirmationResultRef.current = confirmation;
    } else {
      if (!appVerifier) {
        throw new Error("PHONE_AUTH_NATIVE_UNSUPPORTED");
      }
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
      confirmationResultRef.current = confirmation;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    firebaseUserRef.current = null;
    setUser(null);
    setIsEmailVerified(true);
    setNeedsEmailVerification(false);
    await persistUser(null);
    confirmationResultRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      user, isLoading, isEmailVerified, needsEmailVerification,
      loginWithEmail, signupWithEmail, loginWithGoogle, sendPhoneOTP, verifyPhoneOTP,
      resetPassword, sendVerificationEmail: sendVerificationEmailFn, checkEmailVerification,
      changePassword, linkEmailToPhone, linkPhoneToEmail, logout,
    }),
    [user, isLoading, isEmailVerified, needsEmailVerification,
      loginWithEmail, signupWithEmail, loginWithGoogle, sendPhoneOTP, verifyPhoneOTP,
      resetPassword, sendVerificationEmailFn, checkEmailVerification,
      changePassword, linkEmailToPhone, linkPhoneToEmail, logout],
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
