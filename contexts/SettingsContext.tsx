import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { I18nManager } from "react-native";
import { getSettings, saveSettings, type AppSettings } from "@/lib/storage";

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  isRTL: boolean;
  t: (en: string, ar: string) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({
    language: "ar",
    pediatricMode: false,
  });

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
      I18nManager.forceRTL(loaded.language === "ar");
    });
  }, []);

  const updateSettings = (partial: Partial<AppSettings>) => {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    saveSettings(updated);
    if (partial.language) {
      I18nManager.forceRTL(partial.language === "ar");
    }
  };

  const isRTL = settings.language === "ar";

  const t = (en: string, ar: string) => {
    return settings.language === "ar" ? ar : en;
  };

  const value = useMemo(
    () => ({ settings, updateSettings, isRTL, t }),
    [settings],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return context;
}
