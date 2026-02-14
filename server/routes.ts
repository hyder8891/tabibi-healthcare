import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { GoogleGenAI } from "@google/genai";
import { storage } from "./storage";
import { verifyFirebaseToken } from "./firebase-auth";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const MEDICAL_SYSTEM_PROMPT = `You are Tabibi, an expert AI healthcare assessment assistant. Your role is to simulate the reasoning of an experienced diagnostician through a conversational, adaptive interview.

CRITICAL SAFETY RULES:
1. EMERGENCY RED FLAGS: If ANY of these are detected, include an emergency JSON block in your response AND provide a clear, readable explanation for the patient:
   {"emergency":true,"condition":"description","action":"Call emergency services immediately"}
   IMPORTANT: Always write a helpful, readable message BEFORE the emergency JSON. Explain what you found, why it's urgent, and what action they should take. Never respond with ONLY the JSON block.
   Red flags include: crushing chest pain, sudden facial drooping, slurred speech, loss of consciousness, severe bleeding, difficulty breathing at rest, sudden severe headache ("worst headache of my life"), signs of anaphylaxis, sudden vision loss, chest pain radiating to arm/jaw, signs of stroke (FAST), severe abdominal pain with rigidity, high fever with neck stiffness (meningitis signs), imaging showing acute stroke/hemorrhage/mass effect.

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

MEDICAL IMAGE ANALYSIS:
- When a user attaches a medical image (X-ray, MRI, CT scan, lab results, skin photos, ECG, ultrasound, pathology slides, prescriptions, etc.), ANALYZE it thoroughly.
- Describe what you observe in the image: identify anatomical structures, abnormalities, notable findings, and any pathology visible.
- For radiology images (MRI, CT, X-ray): describe the imaging modality, relevant anatomical region, and any abnormal findings (masses, fractures, fluid collections, signal abnormalities, contrast enhancement, etc.).
- For lab results: read and interpret the values, flag abnormal results, and explain their clinical significance.
- For skin/wound photos: describe the appearance, morphology, distribution, and possible differential diagnoses.
- Integrate image findings into your overall clinical assessment alongside reported symptoms.
- If image quality is poor or you cannot identify specific findings, say what you CAN see and ask for a clearer image.
- NEVER refuse to look at or describe a medical image. You are a medical AI assistant — analyzing medical images is a core part of your role.

QUICK REPLY OPTIONS:
- After EVERY question you ask, you MUST include a quickReplies JSON block with 2-5 suggested answer options tailored to your specific question.
- Format: Place this at the very end of your message on its own line: {"quickReplies":["option1","option2","option3"]}
- Options must be concise (1-5 words each), relevant to the question, and in the same language as your message.
- Examples:
  - For "How severe is your pain on a scale of 1-10?": {"quickReplies":["خفيف (1-3)","متوسط (4-6)","شديد (7-9)","لا يحتمل (10)"]}
  - For "When did the symptoms start?": {"quickReplies":["اليوم","منذ يومين","هذا الأسبوع","أكثر من أسبوع"]}
  - For "Do you have a fever?": {"quickReplies":["نعم","لا","لست متأكداً"]}
  - For "Are you currently taking any medications?": {"quickReplies":["نعم","لا"]}
- Do NOT include quickReplies when providing the final assessment/recommendation JSON block.
- The quickReplies block must be valid JSON on a single line.

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
  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        return res.status(400).json({ message: "Firebase ID token is required" });
      }

      const firebaseUser = await verifyFirebaseToken(idToken);
      if (!firebaseUser) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      let user = await storage.getUserByFirebaseUid(firebaseUser.localId);

      if (!user) {
        if (firebaseUser.email) {
          user = await storage.getUserByEmail(firebaseUser.email);
        }

        if (user) {
          user = await storage.updateUser(user.id, {
            firebaseUid: firebaseUser.localId,
            photoUrl: firebaseUser.photoUrl || undefined,
            authProvider: firebaseUser.providerUserInfo?.[0]?.providerId || "email",
          });
        } else {
          user = await storage.createUser({
            firebaseUid: firebaseUser.localId,
            email: firebaseUser.email || null,
            phone: firebaseUser.phoneNumber || null,
            name: firebaseUser.displayName || null,
            photoUrl: firebaseUser.photoUrl || null,
            authProvider: firebaseUser.providerUserInfo?.[0]?.providerId || "email",
          });
        }
      } else {
        if (firebaseUser.displayName || firebaseUser.photoUrl) {
          user = await storage.updateUser(user.id, {
            name: firebaseUser.displayName || user.name,
            photoUrl: firebaseUser.photoUrl || user.photoUrl,
          });
        }
      }

      req.session.userId = user.id;
      return res.json({
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        photoUrl: user.photoUrl,
        authProvider: user.authProvider,
      });
    } catch (error) {
      console.error("Firebase auth error:", error);
      return res.status(500).json({ message: "Authentication failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      return res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      photoUrl: user.photoUrl,
      authProvider: user.authProvider,
    });
  });

  app.post("/api/assess", async (req: Request, res: Response) => {
    try {
      const { messages, patientProfile } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      let systemContext = MEDICAL_SYSTEM_PROMPT;
      if (patientProfile) {
        systemContext += `\n\nPATIENT PROFILE:\n`;
        if (patientProfile.name) systemContext += `- Name: ${patientProfile.name}\n`;
        if (patientProfile.age) systemContext += `- Age: ${patientProfile.age}\n`;
        if (patientProfile.gender) systemContext += `- Gender: ${patientProfile.gender}\n`;
        if (patientProfile.weight) systemContext += `- Weight: ${patientProfile.weight} kg\n`;
        if (patientProfile.height) systemContext += `- Height: ${patientProfile.height} cm\n`;
        if (patientProfile.bloodType) systemContext += `- Blood Type: ${patientProfile.bloodType}\n`;
        if (patientProfile.isPediatric) systemContext += `- PEDIATRIC PATIENT: Use age/weight-appropriate dosing\n`;
        if (patientProfile.medications && patientProfile.medications.length > 0) {
          systemContext += `- Current Medications: ${patientProfile.medications.join(", ")}\n`;
          systemContext += `- IMPORTANT: Check for drug interactions and ADRs with any recommendations\n`;
        }
        if (patientProfile.conditions && patientProfile.conditions.length > 0) {
          systemContext += `- Known Conditions: ${patientProfile.conditions.join(", ")}\n`;
        }
        if (patientProfile.allergies && patientProfile.allergies.length > 0) {
          systemContext += `- Allergies: ${patientProfile.allergies.join(", ")}\n`;
          systemContext += `- CRITICAL: Do NOT recommend any medications the patient is allergic to\n`;
        }
      }

      let imageAnalysis = "";
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.imageData && lastMessage.role === "user") {
        try {
          const imageResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    inlineData: {
                      data: lastMessage.imageData,
                      mimeType: lastMessage.mimeType || "image/jpeg",
                    },
                  },
                  {
                    text: `You are a medical imaging expert. Thoroughly analyze this medical image. Describe:
1. The imaging modality (X-ray, MRI, CT, ultrasound, lab results, skin photo, ECG, etc.)
2. The anatomical region shown
3. All visible findings - normal and abnormal
4. Any pathology, lesions, masses, fractures, signal abnormalities, or other notable observations
5. Clinical significance of the findings

If this is a lab result, read all values and flag abnormal ones.
If this is a skin/wound photo, describe morphology and differential diagnoses.
If this is a prescription or medication label, extract the medication information.
Be thorough and specific. Provide your analysis in the same language the user is using.`,
                  },
                ],
              },
            ],
            config: {
              maxOutputTokens: 2048,
            },
          });
          imageAnalysis = imageResponse.text || "";
          console.log("Image analysis completed:", imageAnalysis.substring(0, 200));
        } catch (imgErr) {
          console.error("Image analysis error:", imgErr);
          imageAnalysis = "Image was attached but could not be analyzed due to a processing error.";
        }
      }

      const chatMessages = messages.map((m: { role: string; content: string; imageData?: string; mimeType?: string }) => {
        const parts: any[] = [];
        if (m.content) {
          let content = m.content;
          if (m === lastMessage && imageAnalysis) {
            content += `\n\n[MEDICAL IMAGE ANALYSIS RESULTS]:\n${imageAnalysis}\n\nPlease incorporate these image findings into your clinical assessment. Discuss what the image shows and its clinical relevance.`;
          }
          parts.push({ text: content });
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
      const { medications, currentMedications, newMedication, language } = req.body;

      const lang = language === "en" ? "English" : "Arabic (العربية)";
      const langInstruction = `\n\nIMPORTANT: Write ALL text fields (description, recommendation, summary) in ${lang}. Drug names can remain in their original form, but all explanatory text MUST be in ${lang}.`;

      let promptText: string;
      if (medications && Array.isArray(medications) && medications.length >= 2) {
        promptText = `Check for ALL possible drug-drug interactions between the following medications that a patient is taking simultaneously: ${JSON.stringify(medications)}.

Check every pair of medications against each other. There are ${medications.length} medications, so check all ${medications.length * (medications.length - 1) / 2} possible pairs.

Respond ONLY with JSON:
{
  "interactions": [
    {
      "drug1": "name",
      "drug2": "name", 
      "severity": "mild|moderate|severe|contraindicated",
      "description": "Brief patient-friendly description of the interaction and its effects",
      "recommendation": "What the patient should do about this interaction"
    }
  ],
  "overallRisk": "low|moderate|high|critical",
  "summary": "Brief patient-friendly summary of all interactions found. If no interactions exist, say so clearly."
}

If there are no significant interactions between any pair, return an empty interactions array with overallRisk "low" and a reassuring summary.${langInstruction}`;
      } else {
        promptText = `Check for drug-drug interactions between these current medications: ${JSON.stringify(currentMedications)} and this proposed new medication: ${JSON.stringify(newMedication)}.

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
}${langInstruction}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: promptText,
              },
            ],
          },
        ],
        config: {
          maxOutputTokens: 4096,
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

  app.post("/api/process-rppg", (req: Request, res: Response) => {
    try {
      const { signals, fps } = req.body;

      if (!signals || !Array.isArray(signals) || signals.length < 30) {
        return res.status(400).json({ 
          error: "At least 30 RGB signal samples are required (10+ seconds of data)" 
        });
      }

      const actualFps = fps || 3;
      const n = signals.length;

      const rRaw = signals.map((s: any) => s.r as number);
      const gRaw = signals.map((s: any) => s.g as number);
      const bRaw = signals.map((s: any) => s.b as number);

      const rMean = rRaw.reduce((a: number, b: number) => a + b, 0) / n;
      const gMean = gRaw.reduce((a: number, b: number) => a + b, 0) / n;
      const bMean = bRaw.reduce((a: number, b: number) => a + b, 0) / n;

      const rNorm = rRaw.map((v: number) => v / (rMean || 1));
      const gNorm = gRaw.map((v: number) => v / (gMean || 1));
      const bNorm = bRaw.map((v: number) => v / (bMean || 1));

      const posSignal: number[] = [];
      const windowSize = Math.min(Math.floor(actualFps * 1.6), n);
      
      for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(n, i + Math.floor(windowSize / 2));
        const len = end - start;

        let lRMean = 0, lGMean = 0, lBMean = 0;
        for (let j = start; j < end; j++) {
          lRMean += rNorm[j];
          lGMean += gNorm[j];
          lBMean += bNorm[j];
        }
        lRMean /= len;
        lGMean /= len;
        lBMean /= len;

        const xs = 3 * (rNorm[i] / (lRMean || 1)) - 2 * (gNorm[i] / (lGMean || 1));
        const ys = 1.5 * (rNorm[i] / (lRMean || 1)) + (gNorm[i] / (lGMean || 1)) - 1.5 * (bNorm[i] / (lBMean || 1));

        const stdXs = Math.sqrt(posSignal.reduce((sum, v) => sum + v * v, 0) / (posSignal.length || 1)) || 1;
        const alpha = stdXs;
        posSignal.push(xs + alpha * ys);
      }

      const minFreq = 0.7;
      const maxFreq = 4.0;

      const mean = posSignal.reduce((a, b) => a + b, 0) / n;
      const centered = posSignal.map(v => v - mean);

      const hannWindow = centered.map((v, i) => v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))));

      const fftSize = Math.pow(2, Math.ceil(Math.log2(n)));
      const real = new Array(fftSize).fill(0);
      const imag = new Array(fftSize).fill(0);
      for (let i = 0; i < n; i++) {
        real[i] = hannWindow[i];
      }

      function fft(real: number[], imag: number[], n: number) {
        if (n <= 1) return;

        const halfN = n / 2;
        const evenReal = new Array(halfN);
        const evenImag = new Array(halfN);
        const oddReal = new Array(halfN);
        const oddImag = new Array(halfN);

        for (let i = 0; i < halfN; i++) {
          evenReal[i] = real[2 * i];
          evenImag[i] = imag[2 * i];
          oddReal[i] = real[2 * i + 1];
          oddImag[i] = imag[2 * i + 1];
        }

        fft(evenReal, evenImag, halfN);
        fft(oddReal, oddImag, halfN);

        for (let k = 0; k < halfN; k++) {
          const angle = -2 * Math.PI * k / n;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const tReal = cos * oddReal[k] - sin * oddImag[k];
          const tImag = sin * oddReal[k] + cos * oddImag[k];

          real[k] = evenReal[k] + tReal;
          imag[k] = evenImag[k] + tImag;
          real[k + halfN] = evenReal[k] - tReal;
          imag[k + halfN] = evenImag[k] - tImag;
        }
      }

      fft(real, imag, fftSize);

      const magnitudes: number[] = [];
      for (let i = 0; i < fftSize / 2; i++) {
        magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
      }

      const scaledMinBin = Math.max(1, Math.floor(minFreq * fftSize / actualFps));
      const scaledMaxBin = Math.min(fftSize / 2 - 1, Math.ceil(maxFreq * fftSize / actualFps));

      let peakBin = scaledMinBin;
      let peakMag = 0;
      for (let i = scaledMinBin; i <= scaledMaxBin; i++) {
        if (magnitudes[i] > peakMag) {
          peakMag = magnitudes[i];
          peakBin = i;
        }
      }

      const peakFreq = peakBin * actualFps / fftSize;
      let heartRate = Math.round(peakFreq * 60);

      heartRate = Math.max(40, Math.min(200, heartRate));

      let totalPower = 0;
      let peakPower = 0;
      for (let i = scaledMinBin; i <= scaledMaxBin; i++) {
        totalPower += magnitudes[i] * magnitudes[i];
        if (Math.abs(i - peakBin) <= 1) {
          peakPower += magnitudes[i] * magnitudes[i];
        }
      }
      const snr = totalPower > 0 ? peakPower / totalPower : 0;

      let confidence: "high" | "medium" | "low";
      if (snr > 0.3 && n >= 60) {
        confidence = "high";
      } else if (snr > 0.15 && n >= 30) {
        confidence = "medium";
      } else {
        confidence = "low";
      }

      const waveformLength = 100;
      const waveform: number[] = [];
      for (let i = 0; i < waveformLength; i++) {
        const idx = Math.floor(i * posSignal.length / waveformLength);
        waveform.push(posSignal[idx] || 0);
      }

      const maxWave = Math.max(...waveform.map(Math.abs)) || 1;
      const normalizedWaveform = waveform.map(v => v / maxWave);

      res.json({
        heartRate,
        confidence,
        waveform: normalizedWaveform,
        signalQuality: Math.round(snr * 100),
        samplesProcessed: n,
        message: confidence === "high" 
          ? "Strong signal detected" 
          : confidence === "medium"
            ? "Moderate signal quality - try holding still in good lighting"
            : "Weak signal - ensure face is well-lit and stay still",
      });
    } catch (error) {
      console.error("rPPG processing error:", error);
      res.status(500).json({ error: "Failed to process heart rate data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
