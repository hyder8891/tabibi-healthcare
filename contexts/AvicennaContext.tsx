import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";

interface HealthSummary {
  totalAssessments: number;
  recentConditions: string[];
  activeAllergies: string[];
  recentVitals: Array<{ type: string; value: number; date: string }>;
  medicationCount: number;
  riskLevel: string;
}

interface Nudge {
  type: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  priority: number;
}

interface TrendingItem {
  name: string;
  count: number;
}

interface SeasonalAlert {
  nameEn: string;
  nameAr: string;
  description: string;
}

interface AvicennaInsights {
  healthSummary: HealthSummary;
  nudges: Nudge[];
  trending: TrendingItem[];
  seasonalAlerts: SeasonalAlert[];
}

interface RecordVitalParams {
  type: string;
  value: number;
  confidence?: string;
  validReading?: boolean;
}

interface MedicineData {
  name: string;
  localBrand?: string;
  activeIngredient?: string;
}

interface RecordAssessmentParams {
  chiefComplaint: string;
  condition?: string;
  severity?: string;
  medicines?: MedicineData[];
  pathway?: string;
}

interface SyncProfileParams {
  medications?: string[];
  conditions?: string[];
  allergies?: string[];
  age?: number;
  gender?: string;
  region?: string;
}

interface AvicennaContextValue {
  insights: AvicennaInsights | null;
  isLoading: boolean;
  refreshInsights: () => void;
  trackEvent: (eventType: string, category: string, eventData?: unknown, tags?: string[]) => Promise<void>;
  recordAssessmentOutcome: (data: RecordAssessmentParams) => Promise<void>;
  recordVital: (type: string, value: number, confidence?: string, validReading?: boolean) => Promise<void>;
  syncProfile: (profile: SyncProfileParams) => Promise<void>;
}

const AvicennaContext = createContext<AvicennaContextValue | null>(null);

export function AvicennaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const insightsQuery = useQuery<AvicennaInsights | null>({
    queryKey: ["/api/avicenna/insights"],
    queryFn: getQueryFn<AvicennaInsights>({ on401: "returnNull" }),
    enabled: !!user,
  });

  const trackEvent = async (
    eventType: string,
    category: string,
    eventData?: unknown,
    tags?: string[],
  ): Promise<void> => {
    try {
      await apiRequest("POST", "/api/avicenna/track", {
        eventType,
        category,
        eventData,
        tags,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/avicenna/insights"] });
    } catch {}
  };

  const recordAssessmentOutcome = async (data: RecordAssessmentParams): Promise<void> => {
    try {
      await apiRequest("POST", "/api/avicenna/assessment-outcome", data);
      void queryClient.invalidateQueries({ queryKey: ["/api/avicenna/insights"] });
    } catch {}
  };

  const recordVital = async (
    type: string,
    value: number,
    confidence?: string,
    validReading?: boolean,
  ): Promise<void> => {
    try {
      await apiRequest("POST", "/api/avicenna/vital", {
        type,
        value,
        confidence,
        validReading,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/avicenna/insights"] });
    } catch {}
  };

  const syncProfile = async (profile: SyncProfileParams): Promise<void> => {
    try {
      await apiRequest("POST", "/api/avicenna/sync-profile", profile);
      void queryClient.invalidateQueries({ queryKey: ["/api/avicenna/insights"] });
    } catch {}
  };

  const refreshInsights = () => {
    void insightsQuery.refetch();
  };

  const value = useMemo(
    () => ({
      insights: insightsQuery.data ?? null,
      isLoading: insightsQuery.isLoading,
      refreshInsights,
      trackEvent,
      recordAssessmentOutcome,
      recordVital,
      syncProfile,
    }),
    [insightsQuery.data, insightsQuery.isLoading],
  );

  return <AvicennaContext.Provider value={value}>{children}</AvicennaContext.Provider>;
}

export function useAvicenna() {
  const context = useContext(AvicennaContext);
  if (!context) {
    throw new Error("useAvicenna must be used within an AvicennaProvider");
  }
  return context;
}
