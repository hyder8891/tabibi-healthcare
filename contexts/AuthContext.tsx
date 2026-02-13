import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const AUTH_USER_KEY = "@tabibi_auth_user";

interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
}

interface LoginParams {
  email?: string;
  phone?: string;
  password: string;
}

interface SignupParams {
  email?: string;
  phone?: string;
  password: string;
  name?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (params: LoginParams) => Promise<void>;
  signup: (params: SignupParams) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const persistUser = async (userData: AuthUser | null) => {
    try {
      if (userData) {
        await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(userData));
      } else {
        await AsyncStorage.removeItem(AUTH_USER_KEY);
      }
    } catch {}
  };

  const checkAuth = async () => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/me", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        await persistUser(data);
        setIsLoading(false);
        return;
      }
    } catch {}
    try {
      const stored = await AsyncStorage.getItem(AUTH_USER_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {}
    setIsLoading(false);
  };

  const login = useCallback(async (params: LoginParams) => {
    const res = await apiRequest("POST", "/api/auth/login", params);
    const data = await res.json();
    setUser(data);
    await persistUser(data);
  }, []);

  const signup = useCallback(async (params: SignupParams) => {
    const res = await apiRequest("POST", "/api/auth/signup", params);
    const data = await res.json();
    setUser(data);
    await persistUser(data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setUser(null);
    await persistUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, signup, logout }),
    [user, isLoading, login, signup, logout],
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
