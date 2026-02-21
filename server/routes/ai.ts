import type { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { requireAuth } from "./middleware";
import { avicenna } from "../avicenna";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function sanitizeInput(text: string): string {
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules|guidelines)/gi,
    /ignore\s+all\s+instructions/gi,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)?\s*(instructions|prompts|rules|guidelines)/gi,
    /forget\s+(your|all|previous)\s+(instructions|prompts|rules|guidelines|training)/gi,
    /override\s+(all\s+)?(safety|security|system)\s*(protocols?|rules?|instructions?|guidelines?)?/gi,
    /new\s+instructions?\s*:/gi,
    /system\s*:\s*/gi,
    /you\s+are\s+now\s+/gi,
    /pretend\s+(you\s+are|to\s+be)\s+/gi,
    /act\s+as\s+(if|though)\s+/gi,
    /\bdo\s+not\s+follow\s+(your|the|any)\s+(rules|instructions|guidelines)/gi,
    /reveal\s+(your|the|system)\s+(prompt|instructions|rules)/gi,
    /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions|rules)/gi,
  ];
  let sanitized = text;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "");
  }
  return sanitized.trim();
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(5000),
  imageData: z.string().optional(),
  mimeType: z.string().optional(),
});

const patientProfileSchema = z.object({
  name: z.string().max(200).optional(),
  age: z.number().min(0).max(120).optional(),
  gender: z.string().max(50).optional(),
  weight: z.number().min(0).max(300).optional(),
  height: z.number().min(0).max(250).optional(),
  bloodType: z.string().max(10).optional(),
  isPediatric: z.boolean().optional(),
  medications: z.array(z.string().max(200)).optional(),
  conditions: z.array(z.string().max(200)).optional(),
  allergies: z.array(z.string().max(200)).optional(),
}).optional();

const assessmentSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  patientProfile: patientProfileSchema,
});

const medicationAnalysisSchema = z.object({
  imageBase64: z.string().min(1).max(15_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]).optional(),
});

const interactionCheckSchema = z.object({
  medications: z.array(z.string().max(200)).optional(),
  currentMedications: z.array(z.string().max(200)).optional(),
  newMedication: z.string().max(200).optional(),
  language: z.enum(["en", "ar"]).optional(),
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

IRAQ LOCALIZATION - CRITICAL:
You are serving patients in IRAQ. You MUST follow these rules for all medicine recommendations:
1. IRAQI BRANDS FIRST: Always recommend the most popular Iraqi/locally-available brand names. Examples:
   - Paracetamol → "سامراء باراسيتامول" (Samarra Paracetamol) by SDI Samarra
   - Ibuprofen → "ايبوفين" (Ibufen) by SDI or "بروفين" (Brufen) by Abbott
   - Amoxicillin → "اموكسيل" (Amoxil) locally available or "فلوموكس" (Flumox)
   - Omeprazole → "لوسك" (Losec) or "اوميز" (Omez)
   - Metformin → "غلوكوفاج" (Glucophage) widely used in Iraq
   - Cetirizine → "زيرتك" (Zyrtec) or local generics
   - Azithromycin → "زيثروماكس" (Zithromax) or "ازومايسين" (Azomycin)
   Prefer SDI (Samarra Drug Industries), Pioneer/Julphar, and other Iraqi/Gulf manufacturers when possible.
2. IRAQI DOSAGES: Use dosage forms and strengths commonly available in Iraqi pharmacies (e.g., 500mg tablets for paracetamol, not 325mg).
3. LOCAL BRAND: Include "localBrand" field with the Iraqi/local brand name in Arabic script.

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
          "name": "Medicine name (Iraqi brand preferred)",
          "localBrand": "الاسم التجاري المحلي بالعربي",
          "activeIngredient": "Active ingredient",
          "class": "Drug class",
          "dosage": "Recommended dosage (Iraqi market strength)",
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

PEDIATRIC MODE: If the patient is a child, always ask for exact weight (kg) and age. Calculate dosages using mg/kg formulas. Use liquid formulations when appropriate. Use Iraqi pediatric brands (e.g., Samarra Paracetamol syrup, Brufen syrup).

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

export function registerAiRoutes(app: Express): void {
  app.post("/api/assess", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = assessmentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request data", details: validation.error.issues.map(i => i.message) });
      }
      const { messages, patientProfile } = validation.data;

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

      const userId = (req as any).userId;
      try {
        const avicennaContext = await avicenna.buildAIContext(userId);
        if (avicennaContext) {
          systemContext += avicennaContext;
        }
      } catch (err) {
        console.error("Avicenna context injection error:", err instanceof Error ? err.message : "Unknown");
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
          let content = m.role === "user" ? sanitizeInput(m.content) : m.content;
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
      let aborted = false;
      req.on("close", () => { aborted = true; });

      for await (const chunk of stream) {
        if (aborted) break;
        const content = chunk.text || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Assessment error:", error instanceof Error ? error.message : "Unknown error");
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Assessment failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process assessment" });
      }
    }
  });

  app.post("/api/analyze-medication", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = medicationAnalysisSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Image data is required" });
      }
      const { imageBase64, mimeType } = validation.data;

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
      console.error("Medication analysis error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to analyze medication" });
    }
  });

  app.post("/api/check-interactions", requireAuth, async (req: Request, res: Response) => {
    try {
      const validation = interactionCheckSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request data" });
      }
      const { medications, currentMedications, newMedication, language } = validation.data;

      const sanitizedMedications = medications?.map(m => sanitizeInput(m));
      const sanitizedCurrentMeds = currentMedications?.map(m => sanitizeInput(m));
      const sanitizedNewMed = newMedication ? sanitizeInput(newMedication) : undefined;

      const lang = language === "en" ? "English" : "Arabic (العربية)";
      const langInstruction = `\n\nIMPORTANT: Write ALL text fields (description, recommendation, summary) in ${lang}. Drug names can remain in their original form, but all explanatory text MUST be in ${lang}.`;

      let promptText: string;
      if (sanitizedMedications && Array.isArray(sanitizedMedications) && sanitizedMedications.length >= 2) {
        promptText = `Check for ALL possible drug-drug interactions between the following medications that a patient is taking simultaneously: ${JSON.stringify(sanitizedMedications)}.

Check every pair of medications against each other. There are ${sanitizedMedications.length} medications, so check all ${sanitizedMedications.length * (sanitizedMedications.length - 1) / 2} possible pairs.

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
        promptText = `Check for drug-drug interactions between these current medications: ${JSON.stringify(sanitizedCurrentMeds)} and this proposed new medication: ${JSON.stringify(sanitizedNewMed)}.

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
      console.error("Interaction check error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to check interactions" });
    }
  });
}
