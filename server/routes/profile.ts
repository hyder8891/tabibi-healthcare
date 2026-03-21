import type { Express, Request, Response } from "express";
import type { InsertPatientProfile } from "@shared/schema";
import { requireAuth } from "./middleware";
import { storage } from "../storage";

function safeParseJsonArray(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function registerProfileRoutes(app: Express): void {
  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getPatientProfile(req.userId!);
      if (!profile) {
        return res.json(null);
      }
      return res.json({
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        weight: profile.weight,
        height: profile.height,
        conditions: safeParseJsonArray(profile.conditions),
        allergies: safeParseJsonArray(profile.allergies),
        medications: safeParseJsonArray(profile.medications),
        onboardingComplete: profile.onboardingComplete ?? false,
      });
    } catch (error) {
      console.error("Get profile error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to get profile" });
    }
  });

  app.post("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, age, gender, weight, height, conditions, allergies, medications, onboardingComplete } = req.body;
      const data: Partial<InsertPatientProfile> = {};
      if (name !== undefined) data.name = name || null;
      if (age !== undefined) data.age = typeof age === "number" && !isNaN(age) ? age : null;
      if (gender !== undefined) data.gender = gender || null;
      if (weight !== undefined) data.weight = typeof weight === "number" && !isNaN(weight) ? weight : null;
      if (height !== undefined) data.height = typeof height === "number" && !isNaN(height) ? height : null;
      if (conditions !== undefined) data.conditions = JSON.stringify(conditions ?? []);
      if (allergies !== undefined) data.allergies = JSON.stringify(allergies ?? []);
      if (medications !== undefined) data.medications = JSON.stringify(medications ?? []);
      if (onboardingComplete !== undefined) data.onboardingComplete = !!onboardingComplete;

      const profile = await storage.upsertPatientProfile(req.userId!, data);
      return res.json({
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        weight: profile.weight,
        height: profile.height,
        conditions: safeParseJsonArray(profile.conditions),
        allergies: safeParseJsonArray(profile.allergies),
        medications: safeParseJsonArray(profile.medications),
        onboardingComplete: profile.onboardingComplete ?? false,
      });
    } catch (error) {
      console.error("Save profile error:", error instanceof Error ? error.message : "Unknown");
      return res.status(500).json({ message: "Failed to save profile" });
    }
  });
}
