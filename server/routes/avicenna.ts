import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "./middleware";
import { avicenna } from "../avicenna";

const trackEventSchema = z.object({
  eventType: z.string().min(1).max(100),
  category: z.enum(["symptom", "medication", "vital", "facility", "order", "scan", "assessment"]),
  eventData: z.any().optional(),
  tags: z.array(z.string().max(200)).max(20).optional(),
  outcome: z.enum(["resolved", "recurring", "worsened", "unknown"]).optional(),
});

const syncProfileSchema = z.object({
  medications: z.array(z.string().max(200)).max(50).optional(),
  conditions: z.array(z.string().max(200)).max(50).optional(),
  allergies: z.array(z.string().max(200)).max(50).optional(),
  age: z.number().int().min(0).max(120).optional(),
  gender: z.string().max(20).optional(),
  region: z.string().max(100).optional(),
});

const assessmentOutcomeSchema = z.object({
  chiefComplaint: z.string().max(500),
  condition: z.string().max(300).optional(),
  severity: z.string().max(50).optional(),
  medicines: z.array(z.object({
    name: z.string().max(200),
    localBrand: z.string().max(200).optional(),
    activeIngredient: z.string().max(200).optional(),
  })).max(20).optional(),
  pathway: z.string().max(10).optional(),
});

const vitalDataSchema = z.object({
  type: z.string().max(50),
  value: z.number(),
  confidence: z.string().max(20).optional(),
  validReading: z.boolean().optional(),
});

export function registerAvicennaRoutes(app: Express): void {
  app.post("/api/avicenna/track", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = trackEventSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid event data", details: validation.error.issues.map(i => i.message) });
      }
      const userId = (req as any).userId;
      const event = await avicenna.trackEvent({
        userId,
        ...validation.data,
      });
      res.json({ success: true, eventId: event.id });
    } catch (err) {
      console.error("Avicenna track error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to track event" });
    }
  });

  app.post("/api/avicenna/sync-profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = syncProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid profile data" });
      }
      const userId = (req as any).userId;
      await avicenna.syncProfileFromClient(userId, validation.data);
      res.json({ success: true });
    } catch (err) {
      console.error("Avicenna sync error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to sync profile" });
    }
  });

  app.post("/api/avicenna/assessment-outcome", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = assessmentOutcomeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid assessment data" });
      }
      const userId = (req as any).userId;
      await avicenna.enrichProfileFromAssessment(userId, validation.data);

      const tags: string[] = [];
      if (validation.data.condition) tags.push(validation.data.condition);
      if (validation.data.chiefComplaint) tags.push(validation.data.chiefComplaint);

      await avicenna.trackEvent({
        userId,
        eventType: "assessment_completed",
        category: "assessment",
        eventData: validation.data,
        tags,
      });

      if (validation.data.medicines) {
        for (const med of validation.data.medicines) {
          await avicenna.trackEvent({
            userId,
            eventType: "medicine_recommended",
            category: "medication",
            eventData: med,
            tags: [med.name, med.activeIngredient || ""].filter(Boolean),
          });
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Avicenna assessment outcome error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to record assessment outcome" });
    }
  });

  app.post("/api/avicenna/vital", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = vitalDataSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid vital data" });
      }
      const userId = (req as any).userId;
      await avicenna.enrichProfileFromVital(userId, validation.data);

      if (validation.data.validReading) {
        await avicenna.trackEvent({
          userId,
          eventType: "heart_rate_measured",
          category: "vital",
          eventData: validation.data,
          tags: [`bpm:${Math.round(validation.data.value)}`],
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Avicenna vital error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to record vital" });
    }
  });

  app.get("/api/avicenna/insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const insights = await avicenna.getPersonalInsights(userId);
      res.json(insights);
    } catch (err) {
      console.error("Avicenna insights error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to get insights" });
    }
  });

  app.get("/api/avicenna/trending", async (_req: Request, res: Response) => {
    try {
      const [conditions, symptoms, medicines] = await Promise.all([
        avicenna.getTrendingConditions(7, 10),
        avicenna.getTrendingSymptoms(7, 10),
        avicenna.getPopularMedicines(30, 10),
      ]);
      res.json({ conditions, symptoms, medicines });
    } catch (err) {
      console.error("Avicenna trending error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to get trends" });
    }
  });

  app.get("/api/avicenna/knowledge/:category", async (req: Request, res: Response) => {
    try {
      const category = req.params.category as string;
      const knowledge = await avicenna.getIraqiKnowledge(category);
      res.json(knowledge.map(k => ({
        id: k.id,
        nameEn: k.nameEn,
        nameAr: k.nameAr,
        data: JSON.parse(k.data),
        prevalenceRank: k.prevalenceRank,
      })));
    } catch (err) {
      console.error("Avicenna knowledge error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to get knowledge" });
    }
  });

  app.get("/api/avicenna/health-profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const profile = await avicenna.getHealthProfile(userId);
      if (!profile) {
        return res.json({ exists: false });
      }
      res.json({
        exists: true,
        assessmentCount: profile.assessmentCount,
        lastConditions: profile.lastConditions ? JSON.parse(profile.lastConditions) : [],
        region: profile.region,
        hasVitals: !!profile.vitalTrends,
        updatedAt: profile.updatedAt,
      });
    } catch (err) {
      console.error("Avicenna health profile error:", err instanceof Error ? err.message : "Unknown");
      res.status(500).json({ error: "Failed to get health profile" });
    }
  });
}
