import { eq, desc, sql, and, gte } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";
import { db } from "./storage";
import {
  healthProfiles, healthEvents, populationAnalytics, iraqiHealthKnowledge,
  type HealthProfile, type InsertHealthProfile,
  type HealthEvent, type InsertHealthEvent,
  type PopulationAnalytic, type IraqiHealthKnowledge,
} from "@shared/schema";

function encryptHealthData(data: any): string {
  return encrypt(JSON.stringify(data));
}

export function decryptHealthData(encrypted: string | null): any {
  if (!encrypted) return null;
  try {
    return JSON.parse(decrypt(encrypted));
  } catch {
    return null;
  }
}

function safeJsonParse(str: string | null): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export class AvicennaService {
  async getOrCreateHealthProfile(userId: string): Promise<HealthProfile> {
    const [existing] = await db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId));
    if (existing) return existing;
    const [profile] = await db.insert(healthProfiles).values({ userId }).returning();
    return profile;
  }

  async getHealthProfile(userId: string): Promise<HealthProfile | null> {
    const [profile] = await db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId));
    return profile || null;
  }

  async updateHealthProfile(userId: string, data: Partial<InsertHealthProfile>): Promise<HealthProfile> {
    const profile = await this.getOrCreateHealthProfile(userId);
    const [updated] = await db.update(healthProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(healthProfiles.id, profile.id))
      .returning();
    return updated;
  }

  async trackEvent(event: {
    userId: string;
    eventType: string;
    category: string;
    eventData?: any;
    tags?: string[];
    outcome?: string;
  }): Promise<HealthEvent> {
    const insertData: InsertHealthEvent = {
      userId: event.userId,
      eventType: event.eventType,
      category: event.category,
      eventData: event.eventData ? encryptHealthData(event.eventData) : null,
      tags: event.tags ? JSON.stringify(event.tags) : null,
      outcome: event.outcome || null,
    };
    const [saved] = await db.insert(healthEvents).values(insertData).returning();

    this.updatePopulationAnalytics(event).catch(err =>
      console.error("Population analytics update error:", err instanceof Error ? err.message : "Unknown")
    );

    return saved;
  }

  private async updatePopulationAnalytics(event: {
    category: string;
    tags?: string[];
    eventData?: any;
  }): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const tags = event.tags || [];

    for (const tag of tags) {
      const [existing] = await db.select().from(populationAnalytics)
        .where(and(
          eq(populationAnalytics.period, "daily"),
          eq(populationAnalytics.periodDate, today),
          eq(populationAnalytics.category, event.category),
          eq(populationAnalytics.itemName, tag),
        ));

      if (existing) {
        await db.update(populationAnalytics)
          .set({ count: existing.count + 1, updatedAt: new Date() })
          .where(eq(populationAnalytics.id, existing.id));
      } else {
        await db.insert(populationAnalytics).values({
          period: "daily",
          periodDate: today,
          category: event.category,
          itemName: tag,
          count: 1,
        });
      }
    }
  }

  async enrichProfileFromAssessment(userId: string, assessmentData: {
    chiefComplaint: string;
    condition?: string;
    severity?: string;
    medicines?: Array<{ name: string; localBrand?: string; activeIngredient?: string }>;
    pathway?: string;
  }): Promise<void> {
    const profile = await this.getOrCreateHealthProfile(userId);

    const currentConditions: string[] = decryptHealthData(profile.chronicConditions) || [];
    if (assessmentData.condition && !currentConditions.includes(assessmentData.condition)) {
      currentConditions.push(assessmentData.condition);
      if (currentConditions.length > 20) currentConditions.shift();
    }

    const medHistory: Array<{ name: string; date: string; localBrand?: string; activeIngredient?: string }> =
      decryptHealthData(profile.medicationHistory) || [];
    if (assessmentData.medicines) {
      for (const med of assessmentData.medicines) {
        medHistory.push({
          name: med.name,
          localBrand: med.localBrand,
          activeIngredient: med.activeIngredient,
          date: new Date().toISOString().split("T")[0],
        });
      }
      if (medHistory.length > 50) medHistory.splice(0, medHistory.length - 50);
    }

    const lastConditions: string[] = decryptHealthData(profile.lastConditions) || [];
    if (assessmentData.condition) {
      lastConditions.unshift(assessmentData.condition);
      if (lastConditions.length > 10) lastConditions.pop();
    }

    await this.updateHealthProfile(userId, {
      chronicConditions: encryptHealthData(currentConditions),
      medicationHistory: encryptHealthData(medHistory),
      assessmentCount: sql`${healthProfiles.assessmentCount} + 1` as unknown as number,
      lastConditions: encryptHealthData(lastConditions),
    });
  }

  async enrichProfileFromVital(userId: string, vitalData: {
    type: string;
    value: number;
    confidence?: string;
    validReading?: boolean;
  }): Promise<void> {
    if (!vitalData.validReading) return;
    const profile = await this.getOrCreateHealthProfile(userId);
    const trends: Array<{ type: string; value: number; date: string; confidence?: string }> =
      decryptHealthData(profile.vitalTrends) || [];
    trends.push({
      type: vitalData.type,
      value: vitalData.value,
      date: new Date().toISOString(),
      confidence: vitalData.confidence,
    });
    if (trends.length > 100) trends.splice(0, trends.length - 100);
    await this.updateHealthProfile(userId, {
      vitalTrends: encryptHealthData(trends),
    });
  }

  async enrichProfileFromOrder(userId: string, pharmacyPlaceId?: string): Promise<void> {
    if (!pharmacyPlaceId) return;
    const profile = await this.getOrCreateHealthProfile(userId);
    const preferred: string[] = safeJsonParse(profile.preferredPharmacies) || [];
    if (!preferred.includes(pharmacyPlaceId)) {
      preferred.push(pharmacyPlaceId);
      if (preferred.length > 10) preferred.shift();
    }
    await this.updateHealthProfile(userId, {
      preferredPharmacies: JSON.stringify(preferred),
    });
  }

  async syncProfileFromClient(userId: string, clientProfile: {
    medications?: string[];
    conditions?: string[];
    allergies?: string[];
    age?: number;
    gender?: string;
    region?: string;
  }): Promise<void> {
    const profile = await this.getOrCreateHealthProfile(userId);

    const updates: Partial<InsertHealthProfile> = {};

    if (clientProfile.allergies && clientProfile.allergies.length > 0) {
      updates.allergyDetails = encryptHealthData(clientProfile.allergies);
    }

    if (clientProfile.conditions && clientProfile.conditions.length > 0) {
      const existing: string[] = decryptHealthData(profile.chronicConditions) || [];
      const merged = [...new Set([...existing, ...clientProfile.conditions])];
      updates.chronicConditions = encryptHealthData(merged);
    }

    if (clientProfile.region) {
      updates.region = clientProfile.region;
    }

    if (Object.keys(updates).length > 0) {
      await this.updateHealthProfile(userId, updates);
    }
  }

  async getUserEvents(userId: string, limit = 20): Promise<HealthEvent[]> {
    return db.select().from(healthEvents)
      .where(eq(healthEvents.userId, userId))
      .orderBy(desc(healthEvents.createdAt))
      .limit(limit);
  }

  async getUserEventsByCategory(userId: string, category: string, limit = 10): Promise<HealthEvent[]> {
    return db.select().from(healthEvents)
      .where(and(
        eq(healthEvents.userId, userId),
        eq(healthEvents.category, category),
      ))
      .orderBy(desc(healthEvents.createdAt))
      .limit(limit);
  }

  async getTrendingConditions(days = 7, limit = 10): Promise<Array<{ name: string; count: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split("T")[0];

    const results = await db.select({
      name: populationAnalytics.itemName,
      totalCount: sql<number>`SUM(${populationAnalytics.count})::int`,
    })
      .from(populationAnalytics)
      .where(and(
        eq(populationAnalytics.category, "condition"),
        gte(populationAnalytics.periodDate, dateStr),
      ))
      .groupBy(populationAnalytics.itemName)
      .orderBy(sql`SUM(${populationAnalytics.count}) DESC`)
      .limit(limit);

    return results.map(r => ({ name: r.name, count: r.totalCount }));
  }

  async getTrendingSymptoms(days = 7, limit = 10): Promise<Array<{ name: string; count: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split("T")[0];

    const results = await db.select({
      name: populationAnalytics.itemName,
      totalCount: sql<number>`SUM(${populationAnalytics.count})::int`,
    })
      .from(populationAnalytics)
      .where(and(
        eq(populationAnalytics.category, "symptom"),
        gte(populationAnalytics.periodDate, dateStr),
      ))
      .groupBy(populationAnalytics.itemName)
      .orderBy(sql`SUM(${populationAnalytics.count}) DESC`)
      .limit(limit);

    return results.map(r => ({ name: r.name, count: r.totalCount }));
  }

  async getPopularMedicines(days = 30, limit = 10): Promise<Array<{ name: string; count: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const dateStr = startDate.toISOString().split("T")[0];

    const results = await db.select({
      name: populationAnalytics.itemName,
      totalCount: sql<number>`SUM(${populationAnalytics.count})::int`,
    })
      .from(populationAnalytics)
      .where(and(
        eq(populationAnalytics.category, "medicine"),
        gte(populationAnalytics.periodDate, dateStr),
      ))
      .groupBy(populationAnalytics.itemName)
      .orderBy(sql`SUM(${populationAnalytics.count}) DESC`)
      .limit(limit);

    return results.map(r => ({ name: r.name, count: r.totalCount }));
  }

  async getIraqiKnowledge(category?: string): Promise<IraqiHealthKnowledge[]> {
    if (category) {
      return db.select().from(iraqiHealthKnowledge)
        .where(and(
          eq(iraqiHealthKnowledge.category, category),
          eq(iraqiHealthKnowledge.isActive, true),
        ))
        .orderBy(iraqiHealthKnowledge.prevalenceRank);
    }
    return db.select().from(iraqiHealthKnowledge)
      .where(eq(iraqiHealthKnowledge.isActive, true))
      .orderBy(iraqiHealthKnowledge.prevalenceRank);
  }

  async buildAIContext(userId: string): Promise<string> {
    let context = "";

    try {
      const profile = await this.getHealthProfile(userId);
      if (profile) {
        context += "\n\nAVICENNA PATIENT INTELLIGENCE:\n";

        const conditions = decryptHealthData(profile.chronicConditions);
        if (conditions && conditions.length > 0) {
          context += `- Known conditions history: ${conditions.join(", ")}\n`;
        }

        const medHistory = decryptHealthData(profile.medicationHistory);
        if (medHistory && medHistory.length > 0) {
          const recentMeds = medHistory.slice(-10);
          const medSummary = recentMeds.map((m: any) =>
            `${m.name}${m.localBrand ? ` (${m.localBrand})` : ""} [${m.date}]`
          ).join("; ");
          context += `- Recent medication history: ${medSummary}\n`;
        }

        const allergies = decryptHealthData(profile.allergyDetails);
        if (allergies && allergies.length > 0) {
          context += `- Known allergies: ${allergies.join(", ")}\n`;
        }

        const familyHx = decryptHealthData(profile.familyHistory);
        if (familyHx) {
          context += `- Family health history: ${JSON.stringify(familyHx)}\n`;
        }

        const vitals = decryptHealthData(profile.vitalTrends);
        if (vitals && vitals.length > 0) {
          const recentVitals = vitals.slice(-5);
          const vitalSummary = recentVitals.map((v: any) =>
            `${v.type}: ${v.value} (${v.confidence}, ${v.date.split("T")[0]})`
          ).join("; ");
          context += `- Recent vitals: ${vitalSummary}\n`;
        }

        if (profile.assessmentCount > 0) {
          context += `- Total assessments: ${profile.assessmentCount}\n`;
        }

        const lastConds = decryptHealthData(profile.lastConditions);
        if (lastConds && lastConds.length > 0) {
          context += `- Recent diagnosed conditions: ${lastConds.slice(0, 5).join(", ")}\n`;
          const recurrences = lastConds.filter((c: string, i: number) => lastConds.indexOf(c) !== i);
          if (recurrences.length > 0) {
            context += `- RECURRING CONDITIONS (pay special attention): ${[...new Set(recurrences)].join(", ")}\n`;
          }
        }

        if (profile.region) {
          context += `- Patient region: ${profile.region}\n`;
        }
      }
    } catch (err) {
      console.error("Avicenna profile context error:", err instanceof Error ? err.message : "Unknown");
    }

    try {
      const trending = await this.getTrendingConditions(7, 5);
      if (trending.length > 0) {
        context += `\nIRAQI POPULATION HEALTH TRENDS (last 7 days):\n`;
        context += `- Trending conditions: ${trending.map(t => `${t.name} (${t.count} cases)`).join(", ")}\n`;
      }

      const trendingSymptoms = await this.getTrendingSymptoms(7, 5);
      if (trendingSymptoms.length > 0) {
        context += `- Trending symptoms: ${trendingSymptoms.map(t => `${t.name} (${t.count})`).join(", ")}\n`;
      }

      const popularMeds = await this.getPopularMedicines(30, 5);
      if (popularMeds.length > 0) {
        context += `- Most prescribed medicines (30d): ${popularMeds.map(m => `${m.name} (${m.count})`).join(", ")}\n`;
      }
    } catch (err) {
      console.error("Avicenna population context error:", err instanceof Error ? err.message : "Unknown");
    }

    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const seasonal = await db.select().from(iraqiHealthKnowledge)
        .where(and(
          eq(iraqiHealthKnowledge.category, "seasonal_pattern"),
          eq(iraqiHealthKnowledge.isActive, true),
        ));

      const relevantSeasonal = seasonal.filter(s => {
        const data = safeJsonParse(s.data);
        return data?.months?.includes(month);
      });

      if (relevantSeasonal.length > 0) {
        context += `\nSEASONAL HEALTH ALERTS FOR IRAQ (current month):\n`;
        for (const s of relevantSeasonal) {
          const data = safeJsonParse(s.data);
          context += `- ${s.nameEn}: ${data?.description || ""}\n`;
        }
      }
    } catch (err) {
      console.error("Avicenna seasonal context error:", err instanceof Error ? err.message : "Unknown");
    }

    return context;
  }

  async getPersonalInsights(userId: string): Promise<{
    healthSummary: {
      totalAssessments: number;
      recentConditions: string[];
      activeAllergies: string[];
      recentVitals: Array<{ type: string; value: number; date: string }>;
      medicationCount: number;
      riskLevel: string;
    };
    nudges: Array<{ type: string; titleEn: string; titleAr: string; descEn: string; descAr: string; priority: number }>;
    trending: Array<{ name: string; count: number }>;
    seasonalAlerts: Array<{ nameEn: string; nameAr: string; description: string; descriptionAr: string }>;
  }> {
    const profile = await this.getOrCreateHealthProfile(userId);
    const conditions = decryptHealthData(profile.chronicConditions) || [];
    const allergies = decryptHealthData(profile.allergyDetails) || [];
    const medHistory = decryptHealthData(profile.medicationHistory) || [];
    const vitals: Array<{ type: string; value: number; date: string }> = decryptHealthData(profile.vitalTrends) || [];
    const lastConds: string[] = decryptHealthData(profile.lastConditions) || [];

    const riskLevel = this.computeRiskLevel(conditions, vitals, profile.assessmentCount);

    const nudges: Array<{ type: string; titleEn: string; titleAr: string; descEn: string; descAr: string; priority: number }> = [];

    if (profile.assessmentCount === 0) {
      nudges.push({
        type: "onboarding",
        titleEn: "Complete Your First Assessment",
        titleAr: "أكمل تقييمك الأول",
        descEn: "Start a symptom assessment to build your health profile",
        descAr: "ابدأ تقييم الأعراض لبناء ملفك الصحي",
        priority: 1,
      });
    }

    if (vitals.length === 0) {
      nudges.push({
        type: "vital_check",
        titleEn: "Check Your Heart Rate",
        titleAr: "افحص معدل ضربات قلبك",
        descEn: "Use the heart rate monitor to track your cardiovascular health",
        descAr: "استخدم جهاز مراقبة معدل ضربات القلب لتتبع صحة قلبك",
        priority: 2,
      });
    }

    const recurrences = lastConds.filter((c, i) => lastConds.indexOf(c) !== i);
    if (recurrences.length > 0) {
      const uniqueRecur = [...new Set(recurrences)];
      nudges.push({
        type: "recurring_condition",
        titleEn: `Recurring: ${uniqueRecur[0]}`,
        titleAr: `متكرر: ${uniqueRecur[0]}`,
        descEn: `You've been assessed for "${uniqueRecur[0]}" multiple times. Consider visiting a specialist.`,
        descAr: `تم تقييمك لـ "${uniqueRecur[0]}" عدة مرات. فكر في زيارة أخصائي.`,
        priority: 1,
      });
    }

    const recentHeartRates = vitals.filter(v => v.type === "heart_rate").slice(-5);
    const highHR = recentHeartRates.filter(v => v.value > 100);
    if (highHR.length >= 2) {
      nudges.push({
        type: "vital_alert",
        titleEn: "Elevated Heart Rate Pattern",
        titleAr: "نمط ارتفاع معدل ضربات القلب",
        descEn: "Your recent heart rate readings have been elevated. Monitor closely.",
        descAr: "قراءات معدل ضربات قلبك الأخيرة كانت مرتفعة. راقب عن كثب.",
        priority: 1,
      });
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const [seasonal, trending] = await Promise.all([
      db.select().from(iraqiHealthKnowledge)
        .where(and(
          eq(iraqiHealthKnowledge.category, "seasonal_pattern"),
          eq(iraqiHealthKnowledge.isActive, true),
        )),
      this.getTrendingConditions(7, 5),
    ]);
    const relevantSeasonal = seasonal.filter(s => {
      const data = safeJsonParse(s.data);
      return data?.months?.includes(month);
    }).map(s => {
      const data = safeJsonParse(s.data);
      return { nameEn: s.nameEn, nameAr: s.nameAr, description: data?.description || "", descriptionAr: data?.descriptionAr || data?.description || "" };
    });

    for (const alert of relevantSeasonal) {
      nudges.push({
        type: "seasonal",
        titleEn: alert.nameEn,
        titleAr: alert.nameAr,
        descEn: alert.description,
        descAr: alert.descriptionAr,
        priority: 3,
      });
    }

    return {
      healthSummary: {
        totalAssessments: profile.assessmentCount,
        recentConditions: lastConds.slice(0, 5),
        activeAllergies: allergies.slice(0, 5),
        recentVitals: vitals.slice(-5),
        medicationCount: medHistory.length,
        riskLevel,
      },
      nudges: nudges.sort((a, b) => a.priority - b.priority),
      trending,
      seasonalAlerts: relevantSeasonal,
    };
  }

  private computeRiskLevel(
    conditions: string[],
    vitals: Array<{ type: string; value: number }>,
    assessmentCount: number
  ): string {
    let score = 0;

    const highRiskConditions = ["diabetes", "hypertension", "heart disease", "asthma", "copd", "kidney disease"];
    for (const c of conditions) {
      if (highRiskConditions.some(hr => c.toLowerCase().includes(hr))) score += 2;
      else score += 1;
    }

    const heartRates = vitals.filter(v => v.type === "heart_rate");
    const abnormalHR = heartRates.filter(v => v.value > 100 || v.value < 50);
    score += abnormalHR.length;

    if (assessmentCount > 10) score += 1;

    if (score >= 5) return "high";
    if (score >= 2) return "moderate";
    return "low";
  }
}

export const avicenna = new AvicennaService();
