import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useIdTokenAuthRequest } from "expo-auth-session/providers/google";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { setAuthTokenGetter } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveProfile as saveLocalProfile } from "@/lib/storage";
import {
  auth,
  onAuthStateChanged,
  firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithPhoneNumber,
  signInWithCredential,
  signInWithCustomToken,
  linkWithCredential,
  PhoneAuthProvider,
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

WebBrowser.maybeCompleteAuthSession();

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

let nativeFirebaseAuth: any = null;
if (Platform.OS !== "web") {
  try {
    const rnfbAuth = require("@react-native-firebase/auth");
    nativeFirebaseAuth = rnfbAuth.default || rnfbAuth;
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
  authError: string | null;
  clearAuthError: () => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken?: string) => Promise<void>;
  sendPhoneOTP: (phoneNumber: string) => Promise<void>;
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
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const nativeConfirmationRef = useRef<any>(null);
  const recaptchaVerifierRef = useRef<any>(null);
  const firebaseUserRef = useRef<FirebaseUser | null>(null);
  const phoneSessionInfoRef = useRef<string | null>(null);
  const pendingPhoneRef = useRef<string>("");
  const nativeAuthHandledRef = useRef(false);

  const [_googleRequest, _googleResponse, googlePromptAsync] = useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "",
  });

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

  const restoreProfileFromServer = async () => {
    try {
      const existing = await AsyncStorage.getItem("@tabibi_profile");
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          const hasData = parsed.name || parsed.age || parsed.gender || parsed.weight ||
            parsed.height || parsed.onboardingComplete ||
            (Array.isArray(parsed.conditions) && parsed.conditions.length > 0) ||
            (Array.isArray(parsed.allergies) && parsed.allergies.length > 0) ||
            (Array.isArray(parsed.medications) && parsed.medications.length > 0);
          if (hasData) return;
        } catch (_e) {}
      }
      const res = await apiRequest("GET", "/api/profile");
      const serverProfile = await res.json();
      if (serverProfile) {
        await saveLocalProfile({
          name: serverProfile.name,
          age: serverProfile.age,
          gender: serverProfile.gender,
          weight: serverProfile.weight,
          height: serverProfile.height,
          conditions: serverProfile.conditions || [],
          allergies: serverProfile.allergies || [],
          medications: serverProfile.medications || [],
          onboardingComplete: serverProfile.onboardingComplete,
        }, true);
      }
    } catch (_e) {}
  };

  useEffect(() => {
    setAuthTokenGetter(async () => {
      let fbUser = firebaseUserRef.current;
      if (!fbUser) {
        fbUser = auth.currentUser;
        if (fbUser) firebaseUserRef.current = fbUser;
      }
      if (fbUser) {
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
        }
      }
      if (nativeFirebaseAuth) {
        try {
          const nativeUser = nativeFirebaseAuth().currentUser;
          if (nativeUser) {
            return await nativeUser.getIdToken(true);
          }
        } catch {}
      }
      return null;
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

    if (Platform.OS === "web") {
      getRedirectResult(auth)
        .then(async (result) => {
          if (result && result.user && mounted) {
            firebaseUserRef.current = result.user;
            try {
              const backendUser = await syncWithBackend(result.user);
              if (mounted) {
                setUser(backendUser);
                await persistUser(backendUser);
                restoreProfileFromServer();
              }
            } catch (err) {
              console.error("Backend sync after redirect failed:", err);
            }
          }
        })
        .catch((err) => {
          if (mounted) {
            const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
            console.error("Google redirect sign-in failed:", code || err);
            if (code) {
              setAuthError(code);
            }
          }
        });
    }

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
            restoreProfileFromServer();
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

    let nativeUnsubscribe: (() => void) | null = null;
    if (nativeFirebaseAuth) {
      try {
        nativeUnsubscribe = nativeFirebaseAuth().onAuthStateChanged(async (nativeUser: any) => {
          if (!mounted) return;
          if (nativeAuthHandledRef.current) {
            nativeAuthHandledRef.current = false;
            return;
          }
          if (nativeUser && !auth.currentUser) {
            try {
              const backendUser = await syncWithBackend();
              if (mounted) {
                setUser(backendUser);
                await persistUser(backendUser);
                restoreProfileFromServer();
              }
            } catch (err) {
              console.error("Backend sync from native auth failed:", err);
            }
          }
          if (mounted) setIsLoading(false);
        });
      } catch {}
    }

    const timeout = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 5000);

    return () => {
      mounted = false;
      unsubscribe();
      if (nativeUnsubscribe) nativeUnsubscribe();
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
    restoreProfileFromServer();
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
      restoreProfileFromServer();
      return;
    }
    if (Platform.OS === "web") {
      const isIframe = typeof window !== "undefined" && window.self !== window.top;
      if (isIframe) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        firebaseUserRef.current = cred.user;
        const backendUser = await syncWithBackend(cred.user);
        setUser(backendUser);
        await persistUser(backendUser);
        restoreProfileFromServer();
      } catch (popupErr: unknown) {
        const code = popupErr && typeof popupErr === "object" && "code" in popupErr ? (popupErr as { code: string }).code : "";
        if (code === "auth/unauthorized-domain" || code === "auth/popup-blocked") {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupErr;
      }
    } else {
      if (GoogleSignin) {
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
        restoreProfileFromServer();
      } else {
        const result = await googlePromptAsync();
        if (result.type === "success" && result.params?.id_token) {
          const credential = GoogleAuthProvider.credential(result.params.id_token);
          const cred = await signInWithCredential(auth, credential);
          firebaseUserRef.current = cred.user;
          const backendUser = await syncWithBackend(cred.user);
          setUser(backendUser);
          await persistUser(backendUser);
          restoreProfileFromServer();
        } else if (result.type === "error") {
          throw new Error(result.error?.message || "Google Sign-In failed");
        } else if (result.type === "dismiss" || result.type === "cancel") {
          throw new Error("GOOGLE_SIGNIN_CANCELLED");
        }
      }
    }
  }, [googlePromptAsync]);

  const sendPhoneOTP = useCallback(async (phoneNumber: string) => {
    pendingPhoneRef.current = phoneNumber;

    if (Platform.OS === "web") {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
      recaptchaVerifierRef.current = verifier;
      try {
        await verifier.render();
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        confirmationResultRef.current = confirmation;
      } catch (err) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
        throw err;
      }
    } else if (nativeFirebaseAuth) {
      const confirmation = await nativeFirebaseAuth().signInWithPhoneNumber(phoneNumber);
      nativeConfirmationRef.current = confirmation;
    } else {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/phone/send-code", baseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to send verification code");
      }
      if (data.sessionInfo) {
        phoneSessionInfoRef.current = data.sessionInfo;
      } else {
        phoneSessionInfoRef.current = null;
      }
    }
  }, []);

  const verifyPhoneOTP = useCallback(async (code: string, displayName?: string) => {
    if (Platform.OS === "web") {
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
      restoreProfileFromServer();
      confirmationResultRef.current = null;
    } else if (nativeFirebaseAuth && nativeConfirmationRef.current) {
      nativeAuthHandledRef.current = true;
      const confirmation = nativeConfirmationRef.current;
      await confirmation.confirm(code);
      const nativeUser = nativeFirebaseAuth().currentUser;
      if (!nativeUser) {
        nativeAuthHandledRef.current = false;
        throw new Error("Phone verification succeeded but no user found");
      }
      if (displayName) {
        await nativeUser.updateProfile({ displayName });
      }
      const backendUser = await syncWithBackend();
      setUser(backendUser);
      await persistUser(backendUser);
      restoreProfileFromServer();
      nativeConfirmationRef.current = null;
      pendingPhoneRef.current = "";
    } else {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/phone/verify-code", baseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: pendingPhoneRef.current,
          sessionInfo: phoneSessionInfoRef.current || undefined,
          code,
          displayName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to verify code");
      }

      if (!data.customToken) {
        throw new Error("Server did not return authentication token");
      }

      const cred = await signInWithCustomToken(auth, data.customToken);
      firebaseUserRef.current = cred.user;
      if (displayName && cred.user) {
        await firebaseUpdateProfile(cred.user, { displayName });
      }
      const backendUser = await syncWithBackend(cred.user);
      setUser(backendUser);
      await persistUser(backendUser);
      restoreProfileFromServer();

      phoneSessionInfoRef.current = null;
      pendingPhoneRef.current = "";
    }
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
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      recaptchaVerifierRef.current = verifier;
      try {
        await verifier.render();
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        confirmationResultRef.current = confirmation;
      } catch (err) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
        throw err;
      }
    } else if (nativeFirebaseAuth) {
      pendingPhoneRef.current = phoneNumber;
      const confirmation = await nativeFirebaseAuth().signInWithPhoneNumber(phoneNumber);
      nativeConfirmationRef.current = confirmation;
    } else {
      pendingPhoneRef.current = phoneNumber;
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/phone/send-code", baseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to send verification code");
      }
      if (data.sessionInfo) {
        phoneSessionInfoRef.current = data.sessionInfo;
      } else {
        phoneSessionInfoRef.current = null;
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {}
    if (nativeFirebaseAuth) {
      try {
        await nativeFirebaseAuth().signOut();
      } catch {}
    }
    firebaseUserRef.current = null;
    setUser(null);
    setIsEmailVerified(true);
    setNeedsEmailVerification(false);
    await persistUser(null);
    try {
      await AsyncStorage.removeItem("@tabibi_profile");
    } catch (_e) {}
    confirmationResultRef.current = null;
    nativeConfirmationRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      user, isLoading, isEmailVerified, needsEmailVerification,
      authError, clearAuthError,
      loginWithEmail, signupWithEmail, loginWithGoogle, sendPhoneOTP, verifyPhoneOTP,
      resetPassword, sendVerificationEmail: sendVerificationEmailFn, checkEmailVerification,
      changePassword, linkEmailToPhone, linkPhoneToEmail, logout,
    }),
    [user, isLoading, isEmailVerified, needsEmailVerification,
      authError, clearAuthError,
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
