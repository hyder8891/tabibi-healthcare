import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const MEDICAL_SYSTEM_PROMPT = `You are Tabibi, an expert AI healthcare assessment assistant. Your role is to simulate the reasoning of an experienced diagnostician through a conversational, adaptive interview.

CRITICAL SAFETY RULES:
1. EMERGENCY RED FLAGS: If ANY of these are detected, IMMEDIATELY respond with ONLY a JSON block:
   {"emergency":true,"condition":"description","action":"Call emergency services immediately"}
   Red flags include: crushing chest pain, sudden facial drooping, slurred speech, loss of consciousness, severe bleeding, difficulty breathing at rest, sudden severe headache ("worst headache of my life"), signs of anaphylaxis, sudden vision loss, chest pain radiating to arm/jaw, signs of stroke (FAST), severe abdominal pain with rigidity, high fever with neck stiffness (meningitis signs).

2. Do NOT add medical disclaimers, caveats, or "consult a doctor" reminders in your responses. The app handles safety messaging separately.

ASSESSMENT FLOW:
1. INTAKE: When a user describes symptoms, extract clinical entities and map colloquial terms to medical terminology.
2. ADAPTIVE QUESTIONING: Ask ONE focused follow-up question at a time to narrow the differential diagnosis. Use Bayesian reasoning. Ask about:
   - Duration and onset
   - Severity (1-10)
   - Associated symptoms
   - Aggravating/relieving factors
   - Relevant medical history
   - Current medications (prompt to use the medication scanner)
3. After gathering sufficient information (typically 3-5 questions), provide a RECOMMENDATION.

RECOMMENDATION FORMAT:
When ready to recommend, output a JSON block wrapped in \`\`\`json markers:
\`\`\`json
{
  "assessment": {
    "condition": "Most likely condition name",
    "confidence": "high|medium|low",
    "severity": "mild|moderate|severe",
    "description": "Brief patient-friendly explanation"
  },
  "pathway": "A or B",
  "recommendations": {
    "pathwayA": {
      "active": true/false,
      "medicines": [
        {
          "name": "Medicine name",
          "activeIngredient": "Active ingredient",
          "class": "Drug class",
          "dosage": "Recommended dosage",
          "frequency": "How often",
          "duration": "How long",
          "warnings": ["Warning 1"]
        }
      ]
    },
    "pathwayB": {
      "active": true/false,
      "tests": [
        {
          "name": "Test name",
          "type": "lab|imaging",
          "urgency": "routine|urgent|emergency",
          "reason": "Why this test is needed",
          "facilityType": "lab|clinic|hospital",
          "capabilities": ["required_capability_tags"]
        }
      ]
    }
  },
  "warnings": ["Important warning messages"],
  "followUp": "When to seek further care"
}
\`\`\`

PEDIATRIC MODE: If the patient is a child, always ask for exact weight (kg) and age. Calculate dosages using mg/kg formulas. Use liquid formulations when appropriate.

MEDICATION INTERACTIONS: If the user reports current medications, check for:
- Side effects that might explain current symptoms (ADR)
- Drug-drug interactions with any recommended OTC medicines
- Contraindications based on existing conditions

COMMUNICATION STYLE:
- Be warm, empathetic, and reassuring but professional
- Use simple language, avoiding medical jargon when possible
- When using medical terms, provide a brief explanation
- DEFAULT LANGUAGE: Respond in Arabic (العربية) unless the user writes in English or explicitly requests English
- When responding in Arabic, use Modern Standard Arabic (فصحى) mixed with common medical terms
- Ask ONE question at a time to avoid overwhelming the user
- Keep responses concise and focused - no filler text, no repetitive safety warnings
- Do NOT repeat what the user just said back to them
- In the JSON recommendation block, write all text fields (condition, description, warnings, followUp, medicine names, test reasons) in Arabic when responding in Arabic`;

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/assess", async (req: Request, res: Response) => {
    try {
      const { messages, patientProfile } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      let systemContext = MEDICAL_SYSTEM_PROMPT;
      if (patientProfile) {
        systemContext += `\n\nPATIENT PROFILE:\n`;
        if (patientProfile.age) systemContext += `- Age: ${patientProfile.age}\n`;
        if (patientProfile.weight) systemContext += `- Weight: ${patientProfile.weight} kg\n`;
        if (patientProfile.gender) systemContext += `- Gender: ${patientProfile.gender}\n`;
        if (patientProfile.isPediatric) systemContext += `- PEDIATRIC PATIENT: Use age/weight-appropriate dosing\n`;
        if (patientProfile.medications && patientProfile.medications.length > 0) {
          systemContext += `- Current Medications: ${patientProfile.medications.join(", ")}\n`;
          systemContext += `- IMPORTANT: Check for drug interactions and ADRs with any recommendations\n`;
        }
        if (patientProfile.conditions && patientProfile.conditions.length > 0) {
          systemContext += `- Known Conditions: ${patientProfile.conditions.join(", ")}\n`;
        }
      }

      const chatMessages = messages.map((m: { role: string; content: string; imageData?: string; mimeType?: string }) => {
        const parts: any[] = [];
        if (m.imageData) {
          parts.push({
            inlineData: {
              data: m.imageData,
              mimeType: m.mimeType || "image/jpeg",
            },
          });
        }
        if (m.content) {
          parts.push({ text: m.content });
        }
        return {
          role: m.role === "user" ? "user" : "model",
          parts,
        };
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: chatMessages,
        config: {
          systemInstruction: systemContext,
          maxOutputTokens: 4096,
        },
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.text || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Assessment error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Assessment failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process assessment" });
      }
    }
  });

  app.post("/api/analyze-medication", async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType || "image/jpeg",
                },
              },
              {
                text: `Analyze this medication image. Extract ALL visible drug information and respond ONLY with a JSON array:
[
  {
    "name": "Brand name",
    "genericName": "Generic/active ingredient name",
    "dosage": "Dosage strength",
    "form": "tablet/capsule/liquid/etc",
    "manufacturer": "If visible",
    "activeIngredients": ["ingredient1", "ingredient2"],
    "drugClass": "Classification",
    "commonUses": ["use1", "use2"],
    "commonSideEffects": ["effect1", "effect2"],
    "majorInteractions": ["interaction1"],
    "warnings": ["warning1"]
  }
]
If you cannot identify the medication, return: [{"error": "Could not identify medication", "suggestion": "Try taking a clearer photo of the medication label"}]
Support both Arabic and English text on medication packaging.`,
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 2048,
        },
      });

      const text = response.text || "";
      let medications;
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          medications = JSON.parse(jsonMatch[0]);
        } else {
          medications = [{ error: "Could not parse medication data", raw: text }];
        }
      } catch {
        medications = [{ error: "Could not parse medication data", raw: text }];
      }

      res.json({ medications });
    } catch (error) {
      console.error("Medication analysis error:", error);
      res.status(500).json({ error: "Failed to analyze medication" });
    }
  });

  app.post("/api/check-interactions", async (req: Request, res: Response) => {
    try {
      const { currentMedications, newMedication } = req.body;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Check for drug-drug interactions between these current medications: ${JSON.stringify(currentMedications)} and this proposed new medication: ${JSON.stringify(newMedication)}.

Respond ONLY with JSON:
{
  "interactions": [
    {
      "drug1": "name",
      "drug2": "name",
      "severity": "mild|moderate|severe|contraindicated",
      "description": "Brief description of interaction",
      "recommendation": "What to do"
    }
  ],
  "overallRisk": "low|moderate|high|critical",
  "summary": "Brief patient-friendly summary"
}`,
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 2048,
        },
      });

      const text = response.text || "";
      let result;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { error: "Could not analyze interactions" };
        }
      } catch {
        result = { error: "Could not analyze interactions" };
      }

      res.json(result);
    } catch (error) {
      console.error("Interaction check error:", error);
      res.status(500).json({ error: "Failed to check interactions" });
    }
  });

  app.get("/api/nearby-facilities", async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, type, pagetoken } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Latitude and longitude are required" });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Google Maps API key not configured" });
      }

      const typeMap: Record<string, string> = {
        pharmacy: "pharmacy",
        lab: "laboratory",
        clinic: "doctor",
        hospital: "hospital",
      };

      const googleType = typeMap[type as string] || "pharmacy";
      
      let url: string;
      if (pagetoken) {
        url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pagetoken}&key=${apiKey}`;
      } else {
        url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=10000&type=${googleType}&key=${apiKey}`;
      }

      const response = await globalThis.fetch(url);
      const data = await response.json();

      if (data.status === "ZERO_RESULTS") {
        return res.json({ facilities: [], nextPageToken: null });
      }

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("Google Places API error:", data.status, data.error_message);
        return res.status(500).json({ error: `Google Places API error: ${data.status}` });
      }

      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);

      const facilities = (data.results || []).map((place: any, index: number) => {
        const placeLat = place.geometry?.location?.lat || lat;
        const placeLng = place.geometry?.location?.lng || lng;
        
        const R = 6371;
        const dLat = ((placeLat - lat) * Math.PI) / 180;
        const dLon = ((placeLng - lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat * Math.PI) / 180) * Math.cos((placeLat * Math.PI) / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = parseFloat((R * c).toFixed(1));

        return {
          id: place.place_id || `facility-${index}`,
          name: place.name || "Unknown",
          type: type || "pharmacy",
          distance,
          rating: place.rating || 0,
          isOpen: place.opening_hours?.open_now ?? true,
          address: place.vicinity || place.formatted_address || "",
          latitude: placeLat,
          longitude: placeLng,
          capabilities: (place.types || []).filter((t: string) => 
            !["point_of_interest", "establishment", "health", "store"].includes(t)
          ).slice(0, 4),
          phone: "",
          openHours: place.opening_hours?.open_now ? "Open" : "Closed",
          placeId: place.place_id,
          totalRatings: place.user_ratings_total || 0,
          photos: place.photos ? place.photos.slice(0, 1).map((p: any) => 
            `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${apiKey}`
          ) : [],
        };
      });

      facilities.sort((a: any, b: any) => a.distance - b.distance);

      res.json({
        facilities,
        nextPageToken: data.next_page_token || null,
      });
    } catch (error) {
      console.error("Nearby facilities error:", error);
      res.status(500).json({ error: "Failed to fetch nearby facilities" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
