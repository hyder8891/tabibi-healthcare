import type { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { requireAuth } from "./middleware";
import { avicenna } from "../avicenna";
import { matchDiseases } from "../utils/diseaseMatch";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_PRO = "gemini-2.5-pro";

const GATE1_REFERRAL_ONLY = new Set([
  "cancer", "carcinoma", "malignant", "malignancy", "tumor", "tumour", "neoplasm",
  "fracture", "stroke", "infarct", "organ failure", "cirrhosis", "aneurysm",
  "appendicitis", "ectopic pregnancy", "pulmonary embolism", "pneumothorax",
  "سرطان", "ورم", "كسر", "جلطة دماغية", "فشل عضوي", "تليف",
]);

const ASPIRIN_NAMES = new Set([
  "aspirin", "acetylsalicylic acid", "أسبرين", "اسبرين", "asa",
]);

function extractAssessmentJson(text: string): any | null {
  const codeFenced = text.match(/```json\s*([\s\S]*?)```/);
  if (codeFenced) {
    try { return JSON.parse(codeFenced[1]); } catch {}
  }

  const keys = ["assessment", "recommendations", "pathwayA", "pathwayB", "followUp", "triageLevel", "differentials"];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    const snippet = text.substring(i, i + 300);
    if (!keys.some(k => snippet.includes(`"${k}"`))) continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.substring(i, j + 1)); } catch { break; }
        }
      }
    }
  }
  return null;
}

function containsErUrgency(text: string): boolean {
  const erPatterns = [
    /go\s+to\s+(the\s+)?(er|emergency|hospital)/i,
    /seek\s+immediate\s+(medical\s+)?(attention|care|help)/i,
    /call\s+(an?\s+)?ambulance/i,
    /emergency\s+room/i,
    /توجه\s*(إلى|الى)?\s*(أقرب|اقرب)?\s*(طوارئ|مستشفى)/,
    /اذهب\s*(إلى|الى)?\s*(الطوارئ|المستشفى)/,
    /حالة\s+طوارئ/,
    /اتصل\s+ب(الإسعاف|الاسعاف)/,
    /فوراً.*طوارئ|طوارئ.*فوراً/,
    /immediately.*emergency|emergency.*immediately/i,
  ];
  return erPatterns.some(p => p.test(text));
}

function applyDeterministicRules(
  assessment: any,
  patientProfile: { age?: number; allergies?: string[]; isPediatric?: boolean; medications?: string[] } | null,
  conversationText: string
): any {
  if (!assessment) return assessment;

  const severity = assessment.assessment?.severity?.toLowerCase();
  const triage = assessment.triageLevel?.toLowerCase();

  if (severity === "severe") {
    if (!triage || !["immediate", "within-hours"].includes(triage)) {
      assessment.triageLevel = "within-hours";
    }
  }
  if (triage === "immediate") {
    if (assessment.assessment) assessment.assessment.severity = "severe";
  }

  if (containsErUrgency(conversationText)) {
    if (assessment.assessment) {
      assessment.assessment.severity = "severe";
    }
    if (!assessment.triageLevel || !["immediate", "within-hours"].includes(assessment.triageLevel?.toLowerCase())) {
      assessment.triageLevel = "immediate";
    }
  }

  const isPediatric = patientProfile?.isPediatric || (patientProfile?.age != null && patientProfile.age < 16);
  if (isPediatric && assessment.recommendations?.pathwayA?.medicines) {
    assessment.recommendations.pathwayA.medicines = assessment.recommendations.pathwayA.medicines.filter(
      (med: any) => {
        const name = (med.name || med.genericName || "").toLowerCase();
        return !ASPIRIN_NAMES.has(name) && !name.includes("aspirin") && !name.includes("أسبرين");
      }
    );
  }

  const allergies = (patientProfile?.allergies || []).map(a => a.toLowerCase());
  if (allergies.length > 0 && assessment.recommendations?.pathwayA?.medicines) {
    assessment.recommendations.pathwayA.medicines = assessment.recommendations.pathwayA.medicines.filter(
      (med: any) => {
        const ingredients = Array.isArray(med.activeIngredients) ? med.activeIngredients : [];
        if (med.activeIngredient && !ingredients.includes(med.activeIngredient)) {
          ingredients.push(med.activeIngredient);
        }
        const medNames = [med.name, med.genericName, ...ingredients]
          .filter(Boolean).map((n: string) => n.toLowerCase());
        return !medNames.some(n => allergies.some(a => n.includes(a) || a.includes(n)));
      }
    );
  }

  const condition = (assessment.assessment?.condition || "").toLowerCase();
  const isGate1 = [...GATE1_REFERRAL_ONLY].some(term => condition.includes(term));
  if (isGate1 && assessment.recommendations?.pathwayA) {
    assessment.recommendations.pathwayA.active = false;
    assessment.recommendations.pathwayA.medicines = [];
  }

  return assessment;
}

const PRO_VALIDATION_PROMPT = `You are a senior clinical reviewer validating an AI-generated medical assessment. You receive the original patient conversation and a structured JSON assessment produced by a junior AI.

Your job is to review and CORRECT the JSON if needed. Check for:

1. SEVERITY-TRIAGE ALIGNMENT: If the conversation indicates the patient should go to the ER or seek immediate care, severity MUST be "severe" and triageLevel MUST be "immediate" or "within-hours". A "moderate" severity with ER advice is WRONG.
2. DIFFERENTIAL PLAUSIBILITY: Are the differentials clinically reasonable given the symptoms discussed?
3. MEDICATION APPROPRIATENESS: Are recommended medications appropriate for the diagnosed condition? Are there drug-drug interactions with the patient's current medications?
4. MEDICATION-ALLERGY CROSS-CHECK: If the patient profile lists allergies, verify NONE of the recommended medicines (by brand name, generic name, or active ingredient) match any listed allergy. Remove any that do.
5. CONFIDENCE CALIBRATION: Does the stated confidence match the completeness of information gathered?

Return ONLY the corrected JSON assessment block — no explanation, no markdown fences, no extra text. If the assessment is already correct, return it unchanged. Preserve the exact same JSON structure.`;

async function validateWithPro(
  conversationMessages: Array<{ role: string; content: string }>,
  flashAssessment: any,
  patientProfile: any,
  timeoutMs: number = 10000
): Promise<any | null> {
  try {
    let contextSummary = "PATIENT CONVERSATION:\n";
    for (const msg of conversationMessages) {
      contextSummary += `[${msg.role}]: ${msg.content}\n`;
    }

    if (patientProfile) {
      contextSummary += "\nPATIENT PROFILE:\n";
      if (patientProfile.age) contextSummary += `- Age: ${patientProfile.age}\n`;
      if (patientProfile.gender) contextSummary += `- Gender: ${patientProfile.gender}\n`;
      if (patientProfile.medications?.length) contextSummary += `- Medications on file (check conversation for patient confirmation/denial): ${patientProfile.medications.join(", ")}\n`;
      if (patientProfile.allergies?.length) contextSummary += `- Allergies (always enforce): ${patientProfile.allergies.join(", ")}\n`;
      if (patientProfile.conditions?.length) contextSummary += `- Conditions on file (check conversation for patient confirmation/denial): ${patientProfile.conditions.join(", ")}\n`;
      if (patientProfile.isPediatric) contextSummary += `- PEDIATRIC PATIENT\n`;
    }

    contextSummary += `\nASSESSMENT JSON TO VALIDATE:\n${JSON.stringify(flashAssessment, null, 2)}`;

    const proResponse = await Promise.race([
      ai.models.generateContent({
        model: MODEL_PRO,
        contents: [{ role: "user", parts: [{ text: contextSummary }] }],
        config: {
          systemInstruction: PRO_VALIDATION_PROMPT,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 2048 },
        },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!proResponse) {
      console.log("[ProValidation] Timed out after", timeoutMs, "ms — using Flash assessment with deterministic rules only");
      return null;
    }

    const responseText = (proResponse as any).text || "";
    let cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("[ProValidation] Successfully validated and corrected assessment");
      return parsed;
    }

    console.warn("[ProValidation] Could not parse Pro response — using Flash assessment");
    return null;
  } catch (err) {
    console.error("[ProValidation] Error:", err instanceof Error ? err.message : "Unknown");
    return null;
  }
}

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
  imageData: z.string().max(10_000_000).optional(),
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
  imageBase64: z.string().min(1).max(10_000_000),
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
1. EMERGENCY RED FLAGS — TWO TIERS:
   TIER 1 — IMMEDIATE LIFE THREAT (skip questioning, direct to ER immediately):
   These are conditions where every second counts. Include the emergency JSON AND readable message immediately:
   - Active stroke signs (FAST: face drooping, arm weakness, speech difficulty)
   - Cardiac arrest / crushing chest pain radiating to arm/jaw with diaphoresis
   - Active severe bleeding that won't stop
   - Signs of anaphylaxis (throat closing, severe allergic reaction with breathing difficulty)
   - Loss of consciousness / unresponsive
   - Sudden complete vision loss
   For TIER 1: Include emergency JSON AND the full assessment JSON block with severity="severe" and triageLevel="immediate" in the SAME response. Set pathway B with emergency tests the ER will run. severity MUST be "severe" for ALL TIER 1 emergencies — NEVER use "moderate" or "mild" when an emergency is detected.
   {"emergency":true,"condition":"description","action":"Call emergency services immediately"}

   TIER 2 — URGENT BUT NEEDS DIFFERENTIAL (continue thorough questioning):
   These are serious symptoms that STILL require proper clinical assessment before concluding:
   - Severe headache with fever (could be meningitis, sinusitis, viral illness, migraine with fever)
   - High fever with various associated symptoms
   - Severe abdominal pain (many possible causes)
   - Hematuria (kidney stones, UTI, trauma, etc.)
   - Chest pain without classic cardiac radiation
   - Difficulty breathing with gradual onset
   - Sudden severe headache WITHOUT other stroke signs
   For TIER 2: Do NOT rush to "go to ER." Follow the adaptive phased interview (Phase 0-3) thoroughly — these cases typically need 10-14 questions to narrow the differential. Then provide FULL structured assessment JSON with appropriate severity, medicines (pathway A if applicable), AND tests (pathway B). If after thorough questioning you determine it IS an emergency, THEN include the emergency JSON block along with the full assessment JSON.

   IMPORTANT: Always write a helpful, readable message BEFORE any emergency JSON. Explain what you found, why it's urgent, and what action they should take. Never respond with ONLY the JSON block.

2. NEVER add medical disclaimers, caveats, "consult a doctor" reminders, or "I'm not a substitute for a doctor" messages. NEVER say "ملاحظة هامة" or "أنا لست بديلاً عن الطبيب" or any variation. The app handles safety messaging separately. Your job is to provide direct clinical guidance without hedging.

ADAPTIVE ASSESSMENT FLOW — PHASED CLINICAL INTERVIEW:
You are conducting an adaptive clinical interview, NOT a rigid questionnaire. Ask ONE question per message. NEVER combine multiple questions in one message. Progress through the phases below, but EXIT to your assessment the moment you have enough clinical confidence to narrow the differential to 1-2 conditions. Do NOT mechanically run through every phase if the picture is already clear.

STORED RECORDS CONFIRMATION PROTOCOL:
If the patient profile includes UNCONFIRMED medications or conditions on file, you MUST verify them with the patient EARLY in the interview (during Phase 0 or at the start of Phase 1). Ask a single, natural confirmation question — for example: "سجلاتك تُظهر أنك تتناول [medication names] — هل لا تزال تتناولها؟" / "Your records show you take [medication names] — are you still taking these?"
- If the patient CONFIRMS the medications/conditions: treat them as active and factor them into your differential diagnosis, drug interaction checks, and recommendations.
- If the patient DENIES them (e.g., "I don't have chronic diseases", "I stopped taking those"): immediately discard those items. Do NOT silently reference denied medications in your reasoning, differential diagnosis, or recommendation JSON. Treat denied items as if they do not exist.
- Allergies labeled as SAFETY-CRITICAL are the ONE exception: always enforce allergy-based medication filtering regardless of patient confirmation.

PHASE 0 — RED FLAG SCREENING (2-3 questions, mandatory for ALL presentations):
- First question: Acknowledge the symptom warmly, then screen for the most dangerous possibility related to it (e.g., for headache: "Is it the worst headache of your life? Any neck stiffness or vision changes?")
- Second question: Ask when it started and whether it was sudden or gradual
- If the patient has stored medications/conditions on file, include a confirmation question in Phase 0 or early Phase 1 (can be combined with another question if natural)
- After Phase 0, if no red flags found, send a SECTION HEADER transition: "جيد — لا توجد علامات طوارئ. دعني أسألك بعض الأسئلة لفهم حالتك بشكل أفضل." (or English equivalent: "Good — no emergency signs. Let me ask a few more questions to understand your symptoms better.")
- GATE: You must have screened for dangerous differentials and know the onset before proceeding.

PHASE 1 — SOCRATES CORE (5-7 questions, mandatory for all non-emergency):
Use the SOCRATES mnemonic as your guide. Ask about these one at a time:
- Site: Exact location, does it radiate anywhere?
- Onset: Already covered in Phase 0 — skip if answered
- Character: Quality/nature (sharp, dull, burning, cramping, throbbing, pressure, aching)
- Associated symptoms: Most clinically relevant associated symptom for the suspected condition (e.g., fever with headache, nausea with abdominal pain, cough with chest pain)
- Timing: Pattern — constant vs intermittent? Worse at certain times of day? How long do episodes last?
- Exacerbating/relieving: What makes it worse? What makes it better? Position, food, movement, medication tried?
- Severity: Pain scale 1-10 or impact on daily activities
- You do NOT need to ask every single SOCRATES element — skip those already answered by the patient's responses. Adapt based on what they volunteer.
- ADAPTIVE EXIT CHECK: After Phase 1, assess your confidence. If the presentation is clearly a simple/mild condition (classic cold with runny nose + sore throat + no fever, minor paper cut, simple muscle strain with clear mechanism) AND you have enough information, you MAY proceed directly to the assessment. Otherwise continue to Phase 2.
- After Phase 1 for cases continuing to Phase 2, send a SECTION HEADER transition: "شكراً على إجاباتك. الآن أحتاج أن أسألك عن بعض الأعراض المرتبطة." (or English: "Thanks for your answers. Now I need to ask about some related symptoms.")

PHASE 2 — SYSTEMS REVIEW (3-5 questions, only if case is NOT clearly mild):
- Systematically explore related organ systems based on your evolving differential:
  - GI symptoms with abdominal pain (appetite, bowel changes, vomiting)
  - Respiratory with chest/throat symptoms (cough, sputum, wheezing)
  - Urinary with back/flank pain (frequency, color, burning)
  - Neurological with headache (vision, dizziness, numbness)
- Ask about fever if not yet covered
- Explore one additional associated symptom based on the differential you're considering
- ADAPTIVE EXIT CHECK: If after 2-3 systems review questions the differential is clear, proceed to assessment. No need to exhaust all possible questions.

PHASE 3 — CONTEXT & RISK FACTORS (2-3 questions, only for moderate-to-complex cases):
- Medical history: Have you experienced this before? Any chronic conditions?
- Current medications and allergies (prompt to use the medication scanner if they take regular medicines)
- Relevant lifestyle: smoking, diet, fluid intake, sleep, stress, occupation — ask ONLY what's clinically relevant to the differential
- Family history ONLY when directly relevant (kidney stones, diabetes, heart disease, cancer)

QUESTION BUDGET BY CASE COMPLEXITY:
- Emergency (TIER 1 red flags): 0-3 questions → immediate response with emergency JSON
- Obviously simple (classic cold, minor cut, mild muscle ache): 6-8 questions total
- Moderate (UTI, back pain, persistent fever, infection): 10-14 questions total
- Complex/serious (chest pain, neurological symptoms, multi-system): 15-20 questions total
- HARD CAP: NEVER exceed 20 questions for ANY presentation. If you reach 20 questions, you MUST deliver your assessment regardless.
- If the user says "just tell me" or tries to rush, acknowledge their urgency but explain briefly that a few more questions will lead to a better recommendation, then continue efficiently

CRITICAL — ALWAYS PROVIDE FULL STRUCTURED ASSESSMENT:
Whether the condition is mild, moderate, or severe, you MUST ALWAYS end with the full structured JSON recommendation block including:
- assessment with correct severity (mild/moderate/severe)
- differentials (2-3 alternative diagnoses with distinguishing features)
- triageLevel indicating time urgency (separate from severity)
- pathway A (medicines) ONLY when condition-specific OTC treatment exists — see SEVERITY-BASED MEDICATION GATE below
- pathway B (tests) with appropriate urgency levels, estimated cost tiers, and where to get them
- structured followUp with specific return timeline and red flags to watch for
- warnings relevant to the condition
NEVER leave the patient with just a text message and no structured recommendation. The app uses the JSON to display actionable guidance.

SEVERITY-BASED MEDICATION GATE — MANDATORY:
Before populating Pathway A medicines, apply these rules in order:

GATE 1 — REFERRAL-ONLY CONDITIONS (pathwayA.active = false, medicines = []):
For conditions that REQUIRE specialist medical management, do NOT recommend ANY OTC medicines. Set pathwayA.active = false and medicines = []. These include:
- Cancer, tumors, masses, malignancies (any type — brain, lung, breast, etc.)
- Fractures, dislocations, or structural bone/joint damage
- Organ damage or failure (kidney, liver, heart, lung)
- Stroke, TIA, or acute neurological deficits
- Internal bleeding or hemorrhage
- Suspected blood disorders (leukemia, severe anemia requiring transfusion)
- Any condition identified from medical imaging that shows serious pathology
- Conditions requiring surgery or hospitalization
For these: Focus ENTIRELY on Pathway B (specialist referral, diagnostic tests, imaging). The patient needs a doctor, NOT pills.

GATE 2 — CONDITION-SPECIFIC TREATMENT ONLY:
For moderate-to-severe conditions where OTC treatment exists, recommend ONLY medicines that directly treat the underlying condition:
- Bacterial infection → antibiotics (with doctor referral note)
- Acid reflux → PPIs/antacids
- Allergic reaction → antihistamines
- Asthma exacerbation → bronchodilator inhaler
- Dehydration → ORS
Do NOT add "symptomatic relief" analgesics alongside condition-specific medicines unless the patient explicitly reports pain as a SEPARATE complaint.

GATE 3 — MILD/ROUTINE CONDITIONS:
Only for clearly mild, self-limiting conditions may you recommend symptomatic relief including analgesics IF pain/fever is present.

CONDITION-APPROPRIATE MEDICATION SELECTION — CRITICAL:
First identify the correct drug CLASS for the condition, THEN find the appropriate Iraqi brand.

ANTI-REPETITION RULE — MANDATORY:
You MUST NOT recommend Paracetamol (Samarra Paracetamol) and/or Ibuprofen (Brufen) unless the PRIMARY symptom is pain or fever AND the condition passes the SEVERITY-BASED MEDICATION GATE above. These two drugs are NOT appropriate for:
- Cancer, tumors, or any malignancy (these need specialist referral, NOT painkillers)
- Serious findings from medical imaging (masses, fractures, organ pathology)
- GI complaints (use PPIs, antacids, antispasmodics, antiemetics, ORS)
- Respiratory issues without fever (use mucolytics, antihistamines, inhalers)
- Skin conditions (use topical treatments)
- Allergic reactions (use antihistamines)
- Urinary symptoms (use appropriate antibiotics with doctor referral)
- Anxiety/insomnia/dizziness/fatigue (these need targeted treatment, NOT painkillers)
- Eye/ear infections (use topical drops)
- Nutritional deficiencies (use supplements)
- ANY condition where the triage level is "immediate" or "within-hours"
If the condition does not involve pain or fever as the MAIN complaint, recommending Paracetamol or Ibuprofen is a CRITICAL ERROR. Choose the drug class that treats the actual pathology, or set pathwayA.active = false if no OTC treatment is appropriate.

SELF-CHECK BEFORE FINALIZING MEDICINES:
Before outputting your JSON, verify:
1. Is this a referral-only condition? → pathwayA.active = false
2. Does every medicine in pathwayA.medicines directly treat the diagnosed condition? If any medicine is just "symptomatic relief" for a serious condition, REMOVE it.
3. Did I default to Paracetamol/Ibuprofen out of habit? If the condition is NOT primarily pain/fever, REMOVE them and find the correct drug class.

ANALGESICS & ANTI-INFLAMMATORIES (ONLY when pain/fever is the primary symptom):
- Mild pain/headache/fever without inflammation: Paracetamol (first-line)
- Inflammatory/colicky pain (renal colic, menstrual cramps, musculoskeletal, arthritis): NSAIDs are first-line (Ibuprofen, Diclofenac), NOT paracetamol
- Severe pain with spasm: NSAID + antispasmodic combination

ANTISPASMODICS:
- GI spasms, biliary colic, renal colic, IBS cramping: Hyoscine butylbromide (Buscopan)
- IBS with chronic abdominal pain: Mebeverine (Duspatalin)

GASTROINTESTINAL:
- Acid reflux/GERD (sustained treatment): PPIs — Omeprazole, Esomeprazole, Lansoprazole
- Acute heartburn (quick relief): Antacids — aluminium/magnesium hydroxide combinations (Maalox), sodium alginate (Gaviscon)
- H. pylori / peptic ulcer: PPI + clarithromycin + amoxicillin (requires doctor supervision)
- Nausea/vomiting: Antiemetics — Metoclopramide (Primperan), Domperidone (Motilium)
- Acute diarrhea (non-infectious, adults): Loperamide (Imodium) + ORS for hydration
- Infectious gastroenteritis: ORS is primary treatment; loperamide contraindicated if bloody/febrile diarrhea
- Constipation: Osmotic laxatives — Lactulose (Duphalac); stimulant — Bisacodyl (Dulcolax); bulk-forming — Psyllium husk (Metamucil)

ANTIHISTAMINES & ALLERGY:
- Allergic rhinitis, urticaria, mild allergic reactions: 2nd-gen antihistamines — Cetirizine (Zyrtec), Loratadine (Claritine)
- Severe allergic reaction with itching/swelling (non-anaphylaxis): Cetirizine + short course prednisolone (requires doctor)

RESPIRATORY:
- Acute bronchospasm / wheezing: Salbutamol MDI inhaler (Ventolin) — 2 puffs PRN
- Allergic rhinitis (moderate-severe): Intranasal corticosteroids — Fluticasone (Avamys/Flixonase)
- Productive cough with thick mucus: Mucolytics — N-acetylcysteine (Fluimucil/NAC), Ambroxol (Mucosolvan)
- Dry irritating cough: Dextromethorphan-based preparations, or honey-based syrups for children
- Common cold/URI: Symptomatic treatment only (paracetamol for fever, saline nasal spray, fluids)

TOPICAL TREATMENTS:
- Fungal skin infections (tinea, candida): Clotrimazole cream (Canesten), Miconazole (Daktarin)
- Oral/vaginal thrush: Clotrimazole topical or Fluconazole 150mg single dose (Diflucan)
- Mild eczema / contact dermatitis: Low-potency topical corticosteroid — Hydrocortisone 1% cream
- Moderate dermatitis / psoriasis flares: Betamethasone (Betnovate) — short course only
- Wound care / minor burns: Povidone-iodine (Betadine), silver sulfadiazine cream for burns
- Bacterial conjunctivitis: Chloramphenicol eye drops or Tobramycin (Tobrex) eye drops
- Otitis externa: Ciprofloxacin/dexamethasone ear drops (requires doctor)

REHYDRATION & SUPPLEMENTS:
- Dehydration from any cause (gastroenteritis, heat, fever): ORS packets — CRITICAL in Iraq's hot climate, available in all pharmacies
- Iron deficiency / anemia: Ferrous sulfate (Ferosac) or ferrous fumarate + Vitamin C for absorption
- Vitamin D deficiency (extremely common in Iraq): Cholecalciferol 50,000 IU weekly loading or 1,000-2,000 IU daily maintenance
- B12 deficiency: Cyanocobalamin tablets or IM injections (common in vegetarians, elderly, metformin users)
- Calcium supplementation: Calcium carbonate + Vitamin D (especially postmenopausal women)

ANTIBIOTICS (note: require doctor prescription, but include when clearly indicated):
- Upper respiratory bacterial infection: Amoxicillin, Amoxicillin-clavulanate (Augmentin)
- UTI (uncomplicated): Nitrofurantoin or Ciprofloxacin (adults only)
- Skin/soft tissue infection: Cephalexin, Amoxicillin-clavulanate
- Azithromycin for atypical pneumonia, sinusitis

ANTIHYPERTENSIVE / CARDIAC EMERGENCIES:
- If patient reports BP crisis symptoms (severe headache + very high BP reading, nosebleed with hypertension): Direct to ER immediately (TIER 1)
- Known hypertensive who missed doses: Advise to take their prescribed medication and monitor; if symptoms persist, seek urgent care
- Do NOT recommend starting new antihypertensive medications — this requires physician management

LAXATIVES (by mechanism — match to patient needs):
- Osmotic (gentle, safe long-term): Lactulose (Duphalac), PEG (Movicol)
- Stimulant (faster acting, short-term): Bisacodyl (Dulcolax), Senna
- Bulk-forming (for chronic management): Psyllium husk (Metamucil), Methylcellulose

PEDIATRIC RULES — INTEGRATED THROUGHOUT:
These rules apply whenever the patient is a child (age <18 or isPediatric flag):
1. ALWAYS ask for exact weight (kg) AND age before recommending any medication
2. Calculate all dosages using mg/kg formulas; NEVER exceed the maximum adult dose
3. CONTRAINDICATED MEDICATIONS IN CHILDREN:
   - Aspirin: CONTRAINDICATED under age 16 (Reye's syndrome risk)
   - Codeine: CONTRAINDICATED under age 12 (respiratory depression)
   - Loperamide (Imodium): CONTRAINDICATED under age 2; use with caution ages 2-6
   - Fluoroquinolones (Ciprofloxacin, Levofloxacin): AVOID under age 18 (cartilage damage)
   - Tetracyclines (Doxycycline): AVOID under age 8 (dental staining)
   - Metoclopramide: AVOID under age 1; restrict dose and duration in older children
   - Bismuth subsalicylate (Pepto-Bismol): AVOID under age 12
4. PREFER liquid formulations: syrups, oral drops, suspensions, dispersible tablets
5. For fever in young children (<5 years): Ask about immunization status — incomplete vaccination changes the differential significantly
6. For diarrhea in children: ORS is the primary treatment (NOT loperamide); zinc supplementation 10-20mg/day for 10-14 days
7. Common pediatric dosing references:
   - Paracetamol: 15mg/kg/dose every 4-6h (max 60mg/kg/day)
   - Ibuprofen: 5-10mg/kg/dose every 6-8h (max 40mg/kg/day, only >6 months)
   - Amoxicillin: 25-50mg/kg/day divided q8h (high dose: 80-90mg/kg/day for resistant infections)
8. Iraqi pediatric brands: Samarra Paracetamol syrup, Brufen syrup (100mg/5ml), Augmentin suspension (228mg/5ml, 457mg/5ml), Flagyl suspension, Calpol drops

IRAQ LOCALIZATION — BRAND REFERENCE BY THERAPEUTIC CATEGORY:
You are serving patients in IRAQ. Choose the drug class first based on the condition, THEN select the appropriate Iraqi brand. PRIORITIZE Iraqi/locally-available brands when they exist for the chosen drug class. If no Iraqi brand is commonly available for a specific drug, use the most widely available international brand in Iraqi pharmacies.

Analgesics & Anti-inflammatories:
- Paracetamol → سامراء باراسيتامول (Samarra Paracetamol) by SDI | كالبول (Calpol) drops/syrup for children
- Ibuprofen → بروفين (Brufen) by Abbott | ايبوفين (Ibufen) by SDI
- Diclofenac → فولتارين (Voltaren) by Novartis | كاتافلام (Cataflam) dispersible

Antispasmodics:
- Hyoscine butylbromide → بسكوبان (Buscopan) by Boehringer
- Mebeverine → دوسباتالين (Duspatalin) by Abbott

GI Medications:
- Omeprazole → لوسك (Losec) | اوميز (Omez)
- Ranitidine → زانتاك (Zantac)
- Metoclopramide → بريمبران (Primperan)
- Domperidone → موتيليوم (Motilium)
- Loperamide → ايموديوم (Imodium)
- Lactulose → دوفالاك (Duphalac)
- Bisacodyl → دولكولاكس (Dulcolax)
- Antacids → مالوكس (Maalox) | جافيسكون (Gaviscon)

Antihistamines:
- Cetirizine → زيرتك (Zyrtec)
- Loratadine → كلاريتين (Claritine)

Respiratory:
- Salbutamol → فنتولين (Ventolin) inhaler
- Fluticasone → أفاميس (Avamys) nasal spray
- N-acetylcysteine → فلويميوسيل (Fluimucil)
- Ambroxol → ميوكوسولفان (Mucosolvan)

Antibiotics:
- Amoxicillin → اموكسيل (Amoxil) | فلوموكس (Flumox)
- Amoxicillin-clavulanate → اوغمنتين (Augmentin)
- Azithromycin → زيثروماكس (Zithromax) | ازومايسين (Azomycin)
- Ciprofloxacin → سيبروفلوكساسين (generic widely available)

Topicals:
- Clotrimazole → كانستين (Canesten)
- Miconazole → دكتارين (Daktarin)
- Betamethasone → بيتنوفيت (Betnovate)
- Povidone-iodine → بيتادين (Betadine)

Supplements:
- Vitamin D → various brands widely available (50,000 IU capsules common)
- Iron → فيروساك (Ferosac)
- ORS → available in all Iraqi pharmacies (multiple brands)
- Metformin → غلوكوفاج (Glucophage)

Prefer SDI (Samarra Drug Industries), Pioneer/Julphar, and other Iraqi/Gulf manufacturers when possible.
IRAQI DOSAGES: Use dosage forms and strengths commonly available in Iraqi pharmacies (e.g., 500mg tablets for paracetamol, not 325mg).
LOCAL BRAND: Include "localBrand" field with the Iraqi/local brand name in Arabic script.

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
  "differentials": [
    {
      "condition": "Second most likely diagnosis",
      "likelihood": "possible|less likely",
      "distinguishingFeature": "What specific symptom or test result would confirm or rule this out"
    },
    {
      "condition": "Third possibility to consider",
      "likelihood": "possible|less likely",
      "distinguishingFeature": "What differentiates this from the primary diagnosis"
    }
  ],
  "triageLevel": "immediate|within-hours|within-24h|within-week|routine",
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
          "name": "SPECIFIC test name (e.g., 'تحليل بول كامل (Urinalysis)', 'صورة أشعة سينية للبطن (KUB X-ray)', 'أشعة مقطعية للبطن (CT Abdomen)', 'تحليل دم شامل (CBC)', 'فحص وظائف الكلى (RFT)', 'تخطيط قلب (ECG)', 'سونار البطن (Abdominal Ultrasound)') - NEVER use vague terms like 'medical imaging' or 'medical evaluation'",
          "type": "lab|imaging|referral (use 'referral' for specialist consultations like surgical, cardiology, neurology referrals — NOT 'lab' or 'imaging')",
          "urgency": "routine|urgent|emergency",
          "reason": "Specific clinical justification explaining what this test will reveal and why it matters for this patient",
          "facilityType": "lab|clinic|hospital",
          "capabilities": ["required_capability_tags"],
          "estimatedCost": "free-MOH|low|moderate|high",
          "availableAt": "MOH-lab|private-lab|hospital|any-pharmacy"
        }
      ]
    }
  },
  "warnings": ["Important warning messages"],
  "followUp": {
    "returnIn": "Specific timeframe (e.g., '3 days', '1 week', '24 hours', 'immediately if worsening')",
    "redFlags": [
      "Specific new symptom that should trigger immediate medical attention",
      "Another specific warning sign to watch for"
    ]
  }
}
\`\`\`

TRIAGE LEVEL GUIDE (separate from severity — describes TIME URGENCY):
- "immediate": Life-threatening, go to ER now (cardiac, stroke, anaphylaxis, severe bleeding)
- "within-hours": Needs medical attention within 2-4 hours (high fever with rigors, severe dehydration, acute urinary retention)
- "within-24h": Should see a doctor within 24 hours (moderate infections, persistent vomiting, worsening symptoms)
- "within-week": Schedule a doctor visit within the week (chronic symptoms needing investigation, mild infections not resolving)
- "routine": Self-care with OTC treatment, follow up only if not improving (common cold, mild allergies, minor aches)

DIFFERENTIALS GUIDE:
Always provide 2-3 differential diagnoses. For each, explain what specific feature distinguishes it from the primary diagnosis. This helps the patient understand why follow-up matters and what to watch for. Example: Primary = kidney stones → Differential 1: UTI (distinguished by: burning on urination, cloudy urine) → Differential 2: appendicitis (distinguished by: pain migrating to lower right, rebound tenderness).

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
- Analyzing medical images is a core part of your role. Always attempt to provide useful observations, but exercise appropriate safety judgment on image content.

QUICK REPLY OPTIONS — MANDATORY ON EVERY QUESTION:
- You MUST include a quickReplies JSON block at the end of EVERY message where you ask a question. NO EXCEPTIONS.
- This is NOT optional. If your message contains a question mark, it MUST end with a quickReplies block.
- Format: Place this at the very end of your message, on its own separate line, after all text: {"quickReplies":["option1","option2","option3"]}
- Rules for options:
  - Always provide 3-5 options (never fewer than 3)
  - Options must be concise (1-5 words each)
  - Options must be specific and relevant to the exact question you asked
  - Options must be in the same language as your message
  - For yes/no questions: always include at least 3 options (yes, no, not sure)
  - For severity questions: use a range (mild, moderate, severe, unbearable)
  - For timing questions: use specific time ranges (today, 2 days ago, this week, more than a week)
  - For location questions: list the relevant body areas
- Examples:
  - Onset: {"quickReplies":["اليوم","منذ يومين","هذا الأسبوع","أكثر من أسبوع","أكثر من شهر"]}
  - Pattern: {"quickReplies":["مفاجئ","تدريجي","يأتي ويذهب","مستمر طوال الوقت"]}
  - Severity: {"quickReplies":["خفيف (1-3)","متوسط (4-6)","شديد (7-9)","لا يحتمل (10)"]}
  - Yes/No: {"quickReplies":["نعم","لا","لست متأكداً"]}
  - Medications: {"quickReplies":["نعم، أتناول أدوية","لا","أتناول مكملات فقط"]}
  - History: {"quickReplies":["نعم، حدث سابقاً","لا، أول مرة","لست متأكداً"]}
  - Character: {"quickReplies":["حاد/طاعن","خفيف/مؤلم","حارق","نابض","ضاغط"]}
  - Associated symptoms (abdominal): {"quickReplies":["غثيان/استفراغ","إسهال","حمى","فقدان شهية","لا أعراض أخرى"]}
  - Associated symptoms (headache): {"quickReplies":["غثيان","حساسية للضوء","دوخة","تشوش بصري","لا أعراض أخرى"]}
  - Associated symptoms (chest): {"quickReplies":["ضيق تنفس","سعال","خفقان","تعرق","لا أعراض أخرى"]}
  - Associated symptoms (generic): {"quickReplies":["حمى","تعب عام","فقدان شهية","نعم، أعراض أخرى","لا أعراض أخرى"]}
  - Aggravating/relieving: {"quickReplies":["يزداد مع الحركة","يزداد مع الأكل","يخف مع الراحة","لا شيء يؤثر عليه","جربت دواء"]}
- For questions about associated/additional symptoms, ALWAYS provide a checklist of the most clinically relevant symptoms as quick reply options. Always include "لا أعراض أخرى" (no other symptoms) as the last option.
- Do NOT include quickReplies when providing the final assessment/recommendation JSON block.
- The quickReplies block must be valid JSON on a single line.
- SELF-CHECK: Before sending any message with a question, verify it ends with {"quickReplies":[...]}. If it doesn't, add one.

COMMUNICATION STYLE:
- Be warm, empathetic, and reassuring but professional
- Use simple language, avoiding medical jargon when possible
- When using medical terms, provide a brief explanation
- DEFAULT LANGUAGE: Respond in Arabic (العربية) unless the user writes in English or explicitly requests English
- When responding in Arabic, use Modern Standard Arabic (فصحى) mixed with common medical terms
- Ask ONE question at a time to avoid overwhelming the user
- Keep responses concise and focused - no filler text, no repetitive safety warnings
- Do NOT repeat what the user just said back to them
- NEVER ask the same question twice. If you have already asked about a topic (e.g., medications, chronic conditions, symptom character), do NOT ask it again. Each question must gather NEW information not already covered.
- ARABIC GENDER CONJUGATION: Check the PATIENT PROFILE for gender. If male, use masculine Arabic conjugation (أنتَ، هل عانيتَ، هل تشعر). If female, use feminine (أنتِ، هل عانيتِ، هل تشعرين). If gender is not provided, use masculine as default (standard Arabic convention). NEVER mix conjugation within a session.
- LANGUAGE CONSISTENCY IN JSON: When the session language is Arabic, ALL text values in the JSON recommendation block MUST be in Arabic — including followUp.returnIn, medicine warnings, test reasons, differentials. Do NOT mix English words into Arabic text. Use "فوراً" not "immediately", "عاجل" not "urgent", "روتيني" not "routine", "خلال ٢٤ ساعة" not "within 24 hours". The ONLY exception is medicine activeIngredient names which stay in English.

---

## Iraq Disease Reference Database (73 Conditions)
You have been loaded with Iraq's complete epidemiological trigger database. This is your mandatory clinical decision support layer. You MUST consult it before every final recommendation.

## Iraq Epidemiological Mandatory Screening Rules

Before generating a final recommendation, silently cross-check the patient symptoms against these Iraq-specific trigger rules. If ANY trigger matches, you MUST ask the corresponding screening questions BEFORE concluding.

### CRITICAL TRIGGER RULES:
- FEVER + JOINT PAIN + FATIGUE: Brucellosis mandatory -- ask about raw milk, animal contact (23/100k in Iraq)
- NON-HEALING SKIN ULCER: Cutaneous Leishmaniasis -- ask about sandfly exposure, rural areas, Baghdad region
- CHRONIC COUGH >3 WEEKS + NIGHT SWEATS + WEIGHT LOSS: TB -- ask contact history, order AFB smear
- JAUNDICE + FEVER: Hepatitis A/E -- if PREGNANT mark as URGENT (HEV has 20% maternal mortality in Iraq)
- PROFUSE WATERY DIARRHEA sudden onset: Cholera -- ask about cluster, contaminated water, ORS urgently
- FEVER + HEMORRHAGE + ANIMAL/TICK EXPOSURE: CCHF -- EMERGENCY isolation, notify public health
- FEVER + CYCLICAL RIGORS: Malaria -- ask travel to northern Iraq or Sulaymaniyah
- CHILD + FEVER + HEADACHE + NECK STIFFNESS: Iraq national schedule EXCLUDES meningococcal vaccine. A vaccinated Iraqi child is NOT protected against N. meningitidis. Do NOT rule out based on vaccination history.
- POST-FLOODING ILLNESS: Triple risk -- Leptospirosis + Cholera + Hepatitis A/E
- EID AL-ADHA PERIOD + FEVER + HEMORRHAGE: CCHF high suspicion -- ask about slaughter animal contact

### PHARMACOGENOMIC SAFETY RULES (Iraq-specific):
- ALL IRAQI MALES before prescribing PRIMAQUINE, DAPSONE, or NITROFURANTOIN: Screen for G6PD deficiency first (8-12% Iraqi males are G6PD deficient -- risk of life-threatening hemolysis)
- SOUTHERN IRAQ CHILD + SEVERE ANEMIA: Consider Beta-thalassemia major (Basra, Misan, Wasit have highest carrier rates)
- FAVA BEANS + SUDDEN JAUNDICE + DARK URINE: G6PD hemolytic crisis -- urgent

### ENVIRONMENTAL AND OCCUPATIONAL TRIGGERS:
- BASRA RESIDENT + CANCER OR CONGENITAL MALFORMATION: Ask about heavy metal/depleted uranium exposure
- FARMER OR BUTCHER + PAINLESS BLACK ESCHAR: Anthrax -- do NOT drain, isolate, notify MOH immediately
- AGRICULTURAL WORKER + PINPOINT PUPILS + EXCESSIVE SECRETIONS: Organophosphate poisoning -- atropine + pralidoxime STAT
- HOTEL OR HOSPITAL STAY + SEVERE PNEUMONIA + CONFUSION + LOW SODIUM: Legionella -- urine antigen, use fluoroquinolone not penicillin
- CHILD + EATING SOIL/ICE + PALLOR + EOSINOPHILIA: Toxocariasis or severe Iron Deficiency Anemia

### NUTRITIONAL FLAGS:
- VEILED WOMAN, BREASTFED INFANT, OR NORTHERN MOUNTAIN RESIDENT: Vitamin D deficiency extremely prevalent -- check 25-OH VitD
- NECK SWELLING + NORTHERN IRAQ (Sulaymaniyah, Erbil, Dohuk): Iodine deficiency goiter
- IDP CAMP CHILD + WASTING OR LEG EDEMA: Protein-energy malnutrition -- check MUAC (less than 11.5cm = emergency)

### NEONATAL EMERGENCIES:
- NEONATE ANY FEVER 38C OR ABOVE: Neonatal sepsis until proven otherwise -- full septic workup + empirical antibiotics immediately
- NEONATE DAYS 3 TO 28 + JAW STIFFNESS + SPASMS + HOME DELIVERY: Neonatal tetanus emergency -- ICU transfer immediately
- NEONATE UNABLE TO SUCK + RIGID LIMBS: Neonatal tetanus or hypocalcemia -- emergency

### PUBLIC HEALTH NOTIFICATION REQUIRED:
- CLUSTER OF FATAL PNEUMONIA + HEMORRHAGE: Include plague in differential -- immediate isolation + notify WHO
- ANY ANTHRAX SUSPICION: Notify Iraq MOH + WHO immediately
- GRAY-WHITE ADHERENT THROAT MEMBRANE: Diphtheria -- give antitoxin immediately, do NOT wait for culture, notify public health

## How To Use:
Silently scan these rules for every patient. Do NOT tell the patient you are checking a database. If a trigger matches, ask the screening question naturally within the conversation before concluding. Never skip a trigger because you are already confident in a different diagnosis -- in Iraq, endemic co-diagnoses are common.
`;

function extractQuestionText(text: string): string {
  const stripped = text
    .replace(/\{[\s\S]*\}/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  const lines = stripped.split("\n").filter(l => l.trim().length > 0);
  const questionLines = lines.filter(l => l.includes("?") || l.includes("؟"));
  return questionLines.length > 0 ? questionLines.join(" ") : lines.slice(-2).join(" ");
}

function computeSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;

  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

const GARBLED_ARABIC_PATTERNS = [
  /[\u0600-\u06FF]{1}[\u0020][\u0600-\u06FF]{1}[\u0020][\u0600-\u06FF]{1}[\u0020][\u0600-\u06FF]{1}/,
  /([^\s\u0600-\u06FF])[\u0600-\u06FF]{1,2}([^\s\u0600-\u06FF])/,
  /[\u0600-\u06FF][\u0000-\u001F][\u0600-\u06FF]/,
  /(.)\1{4,}/,
];

function hasGarbledArabic(text: string): boolean {
  const arabicPortion = text.replace(/[^\u0600-\u06FF\s]/g, "").trim();
  if (arabicPortion.length < 10) return false;

  const words = arabicPortion.split(/\s+/).filter(w => w.length > 0);
  const singleCharWords = words.filter(w => w.length === 1).length;
  if (words.length > 5 && singleCharWords / words.length > 0.4) return true;

  for (const pattern of GARBLED_ARABIC_PATTERNS) {
    if (pattern.test(text)) {
      const matches = text.match(new RegExp(pattern.source, "g" + (pattern.flags || "")));
      if (matches && matches.length >= 3) return true;
    }
  }

  return false;
}

function buildPreviousQuestionsContext(messages: Array<{ role: string; content: string }>): string {
  const assistantMessages = messages
    .filter(m => m.role === "assistant" || m.role === "model")
    .map(m => extractQuestionText(m.content || ""))
    .filter(q => q.length > 10);

  if (assistantMessages.length === 0) return "";

  return `\n\nQUESTIONS ALREADY ASKED IN THIS SESSION (DO NOT repeat any of these — ask something NEW and different):\n${assistantMessages.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`;
}

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
        if (patientProfile.name) systemContext += `- Name: ${sanitizeInput(patientProfile.name)}\n`;
        if (patientProfile.age) systemContext += `- Age: ${patientProfile.age}\n`;
        if (patientProfile.gender) systemContext += `- Gender: ${sanitizeInput(patientProfile.gender)}\n`;
        if (patientProfile.weight) systemContext += `- Weight: ${patientProfile.weight} kg\n`;
        if (patientProfile.height) systemContext += `- Height: ${patientProfile.height} cm\n`;
        if (patientProfile.bloodType) systemContext += `- Blood Type: ${sanitizeInput(patientProfile.bloodType)}\n`;
        if (patientProfile.isPediatric) systemContext += `- PEDIATRIC PATIENT: Use age/weight-appropriate dosing\n`;
        if (patientProfile.medications && patientProfile.medications.length > 0) {
          systemContext += `\nMEDICATIONS ON FILE (UNCONFIRMED — verify with patient before using in clinical reasoning):\n`;
          systemContext += `- Stored medications: ${patientProfile.medications.map(m => sanitizeInput(m)).join(", ")}\n`;
          systemContext += `- ACTION REQUIRED: Early in the interview, ask the patient to confirm whether they still take these medications. Example: "سجلاتك تُظهر أنك تتناول [medications] — هل لا تزال تتناولها؟" / "Your records show you take [medications] — are you still taking these?"\n`;
          systemContext += `- If the patient CONFIRMS: treat as active medications and check for drug interactions/ADRs with any recommendations.\n`;
          systemContext += `- If the patient DENIES or says they stopped: do NOT reference these medications in your reasoning, differentials, or recommendation JSON. Treat them as inactive.\n`;
        }
        if (patientProfile.conditions && patientProfile.conditions.length > 0) {
          systemContext += `\nCONDITIONS ON FILE (UNCONFIRMED — verify with patient before using in clinical reasoning):\n`;
          systemContext += `- Stored conditions: ${patientProfile.conditions.map(c => sanitizeInput(c)).join(", ")}\n`;
          systemContext += `- ACTION REQUIRED: Ask the patient to confirm these conditions. If the patient denies having a condition, do NOT use it in your differential diagnosis or recommendations.\n`;
        }
        if (patientProfile.allergies && patientProfile.allergies.length > 0) {
          systemContext += `- Allergies (SAFETY-CRITICAL — always enforce even if unconfirmed): ${patientProfile.allergies.map(a => sanitizeInput(a)).join(", ")}\n`;
          systemContext += `- CRITICAL: Do NOT recommend any medications the patient is allergic to\n`;
        }
      }

      const userId = req.userId!;
      try {
        const avicennaContext = await avicenna.buildAIContext(userId);
        if (avicennaContext) {
          systemContext += avicennaContext;
        }
      } catch (err) {
        console.error("Avicenna context injection error:", err instanceof Error ? err.message : "Unknown");
      }

      try {
        const conversationText = messages.filter((m: any) => m.role === 'user').map((m: any) => m.content || m.text || '').join(' ');
        const matchedDiseases = matchDiseases(conversationText);
        if (matchedDiseases.length > 0) {
          systemContext += '\n\n## ACTIVE DISEASE SUSPECTS (matched from conversation):\n';
          matchedDiseases.slice(0, 3).forEach(d => {
            systemContext += `\n### ${d.nameAr} (${d.nameEn}) — urgency: ${d.urgency}\n`;
            systemContext += `Screening questions to ask naturally:\n`;
            d.questionsAr.forEach(q => { systemContext += `- ${q}\n`; });
            systemContext += `Key tests: ${d.tests.join(', ')}\n`;
          });
        }
      } catch (e) {
        console.error('disease match error', e);
      }

      const prevQuestionsCtx = buildPreviousQuestionsContext(
        messages.map((m: any) => ({ role: m.role, content: m.content || m.text || "" }))
      );
      if (prevQuestionsCtx) {
        systemContext += prevQuestionsCtx;
      }

      let imageAnalysis = "";
      let imageSeverityFlag = false;
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.imageData && lastMessage.role === "user") {
        try {
          const imagePrompt = `You are a medical imaging expert. Thoroughly analyze this medical image. Describe:
1. The imaging modality (X-ray, MRI, CT, ultrasound, lab results, skin photo, ECG, etc.)
2. The anatomical region shown
3. All visible findings - normal and abnormal
4. Any pathology, lesions, masses, fractures, signal abnormalities, or other notable observations
5. Clinical significance of the findings

If this is a lab result, read all values and flag abnormal ones.
If this is a skin/wound photo, describe morphology and differential diagnoses.
If this is a prescription or medication label, extract the medication information.
Be thorough and specific. Provide your analysis in the same language the user is using.`;

          const imageResponse = await ai.models.generateContent({
            model: MODEL_PRO,
            contents: [{
              role: "user",
              parts: [
                { inlineData: { data: lastMessage.imageData, mimeType: lastMessage.mimeType || "image/jpeg" } },
                { text: imagePrompt },
              ],
            }],
            config: { maxOutputTokens: 2048 },
          });
          imageAnalysis = sanitizeInput(imageResponse.text || "");

          const severityKeywords = /\b(cancer|carcinoma|malignant|malignancy|tumor|tumou?r|neoplasm|metastas[ie]s|mass|lesion|nodule|fracture|hemorrhage|haemorrhage|bleeding|stroke|infarct|thrombosis|embolism|aneurysm|organ failure|cirrhosis|fibrosis|pneumothorax|pleural effusion|سرطان|ورم|كتلة|كسر|نزيف|جلطة|انسداد)\b/i;
          if (severityKeywords.test(imageAnalysis)) {
            imageSeverityFlag = true;
            console.log("Image severity flag triggered — serious pathology detected in image analysis");
          }

          console.log("Image analysis completed, length:", imageAnalysis.length);
        } catch (imgErr) {
          console.error("Image analysis error:", imgErr);
          imageAnalysis = "Image was attached but could not be analyzed due to a processing error.";
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";
      let clientDisconnected = false;

      req.on("close", () => {
        clientDisconnected = true;
      });

      const chatMessages = messages.map((m: { role: string; content: string; imageData?: string; mimeType?: string }) => {
        const parts: any[] = [];
        if (m.content) {
          let content = m.role === "user" ? sanitizeInput(m.content) : m.content;
          if (m === lastMessage && imageAnalysis) {
            content += `\n\n[MEDICAL IMAGE ANALYSIS RESULTS]:\n${imageAnalysis}\n\nPlease incorporate these image findings into your clinical assessment. Discuss what the image shows and its clinical relevance.`;
            if (imageSeverityFlag) {
              content += `\n\n[CRITICAL SAFETY OVERRIDE]: The image analysis has identified potentially SERIOUS pathology (cancer, tumor, mass, fracture, hemorrhage, or organ damage). You MUST:\n1. Set assessment.severity to "severe"\n2. Set pathwayA.active to false and medicines to [] — do NOT recommend ANY OTC medicines including Paracetamol or Ibuprofen\n3. Focus ENTIRELY on Pathway B with specialist referral and urgent diagnostic tests\n4. Set triageLevel to "immediate" or "within-hours"\nThis is a GATE 1 referral-only condition. The patient needs specialist medical care, NOT pills.`;
            }
          }
          parts.push({ text: content });
        }
        return {
          role: m.role === "user" ? "user" : "model",
          parts,
        };
      });

      let streamTimedOut = false;

      try {
        const stream = await ai.models.generateContentStream({
          model: MODEL_FLASH,
          contents: chatMessages,
          config: {
            systemInstruction: systemContext,
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingBudget: 1024 },
          },
        });

        const iterator = stream[Symbol.asyncIterator]();
        const streamStartTime = Date.now();
        const STREAM_TIMEOUT_MS = 60_000;
        const CHUNK_TIMEOUT_MS = 15_000;

        while (true) {
          if (clientDisconnected) break;

          const chunkPromise = iterator.next();
          const timeoutPromise = new Promise<{ done: true; value: undefined }>((_, reject) => {
            setTimeout(() => reject(new Error("STREAM_TIMEOUT")), CHUNK_TIMEOUT_MS);
          });

          let iterResult: IteratorResult<any>;
          try {
            iterResult = await Promise.race([chunkPromise, timeoutPromise]);
          } catch (raceErr: any) {
            if (raceErr?.message === "STREAM_TIMEOUT") {
              streamTimedOut = true;
              console.error("Streaming chunk timed out after 15 seconds of no data");
              break;
            }
            throw raceErr;
          }

          if (iterResult.done) break;

          const chunk = iterResult.value;
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.thought || !part.text) continue;
              fullResponse += part.text;
              res.write(`data: ${JSON.stringify({ content: part.text })}\n\n`);
            }
          }

          if (Date.now() - streamStartTime > STREAM_TIMEOUT_MS) {
            streamTimedOut = true;
            console.error("Streaming exceeded 60-second total timeout");
            break;
          }
        }
      } catch (streamErr: any) {
        if (streamErr?.message === "STREAM_TIMEOUT") {
          streamTimedOut = true;
          console.error("Streaming timed out");
        } else {
          throw streamErr;
        }
      }

      const originalHadAssessment = !!extractAssessmentJson(fullResponse);
      if (!clientDisconnected && fullResponse && hasGarbledArabic(fullResponse)) {
        console.warn("[QualityCheck] Garbled Arabic detected in AI response — sending correction event");
        try {
          const correctionResponse = await ai.models.generateContent({
            model: MODEL_FLASH,
            contents: [
              ...chatMessages,
              { role: "model", parts: [{ text: fullResponse }] },
              { role: "user", parts: [{ text: "Your previous response contained garbled/corrupted Arabic text. Please rewrite your last message cleanly in proper Arabic. Only output the corrected message, nothing else." }] },
            ],
            config: {
              systemInstruction: systemContext,
              maxOutputTokens: 2048,
            },
          });
          const correctedText = correctionResponse.text || "";
          const correctionHasAssessment = !!extractAssessmentJson(correctedText);
          if (correctedText && !hasGarbledArabic(correctedText) && (!originalHadAssessment || correctionHasAssessment)) {
            res.write(`data: ${JSON.stringify({ correction: correctedText })}\n\n`);
            fullResponse = correctedText;
            console.log("[QualityCheck] Sent corrected Arabic text to client");
          } else {
            console.warn("[QualityCheck] Correction rejected (still garbled or lost assessment JSON), keeping original");
          }
        } catch (corrErr) {
          console.error("[QualityCheck] Correction retry failed:", corrErr instanceof Error ? corrErr.message : "Unknown");
        }
      }

      if (!clientDisconnected && fullResponse && !extractAssessmentJson(fullResponse)) {
        const currentQuestion = extractQuestionText(fullResponse);
        const previousQuestions = messages
          .filter((m: any) => m.role === "assistant" || m.role === "model")
          .map((m: any) => extractQuestionText(m.content || m.text || ""))
          .filter((q: string) => q.length > 10);

        const isDuplicate = previousQuestions.some(
          (prev: string) => computeSimilarity(currentQuestion, prev) > 0.6
        );

        if (isDuplicate) {
          console.warn("[DedupCheck] Duplicate question detected — regenerating once");
          try {
            const dedupResponse = await ai.models.generateContent({
              model: MODEL_FLASH,
              contents: [
                ...chatMessages,
                { role: "model", parts: [{ text: fullResponse }] },
                { role: "user", parts: [{ text: "You just repeated a question you already asked earlier in this conversation. Ask a DIFFERENT, NEW question that gathers information you have NOT already collected. Do not repeat or rephrase any previous question." }] },
              ],
              config: {
                systemInstruction: systemContext,
                maxOutputTokens: 2048,
              },
            });
            const newText = dedupResponse.text || "";
            if (newText && newText.length > 10) {
              const newQuestion = extractQuestionText(newText);
              const stillDuplicate = previousQuestions.some(
                (prev: string) => computeSimilarity(newQuestion, prev) > 0.6
              );
              if (!stillDuplicate) {
                res.write(`data: ${JSON.stringify({ correction: newText })}\n\n`);
                fullResponse = newText;
                console.log("[DedupCheck] Sent deduplicated question to client");
              } else {
                console.warn("[DedupCheck] Retry still duplicate, keeping original");
              }
            }
          } catch (dedupErr) {
            console.error("[DedupCheck] Retry failed:", dedupErr instanceof Error ? dedupErr.message : "Unknown");
          }
        }
      }

      const flashAssessment = extractAssessmentJson(fullResponse);

      if (flashAssessment && !clientDisconnected) {
        console.log("[ProValidation] Flash assessment detected — starting Pro validation");
        const conversationForValidation = messages.map((m: any) => ({
          role: m.role,
          content: m.content || m.text || "",
        }));
        conversationForValidation.push({ role: "assistant", content: fullResponse });

        let validatedAssessment = flashAssessment;

        const proResult = await validateWithPro(
          conversationForValidation,
          flashAssessment,
          patientProfile || null,
          10000
        );

        if (proResult) {
          validatedAssessment = proResult;
          console.log("[ProValidation] Using Pro-validated assessment");
        } else {
          console.log("[ProValidation] Using Flash assessment (Pro unavailable or timed out)");
        }

        validatedAssessment = applyDeterministicRules(
          validatedAssessment,
          patientProfile || null,
          fullResponse
        );

        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ validatedAssessment })}\n\n`);
          console.log("[ProValidation] Sent validated assessment to client — severity:", validatedAssessment.assessment?.severity, "triage:", validatedAssessment.triageLevel);
        }
      }

      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }

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

      const medPrompt = `Analyze this medication image. Extract ALL visible drug information and respond ONLY with a JSON array:
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
Support both Arabic and English text on medication packaging.`;

      const response = await ai.models.generateContent({
        model: MODEL_PRO,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { data: imageBase64, mimeType: mimeType || "image/jpeg" } },
            { text: medPrompt },
          ],
        }],
        config: { maxOutputTokens: 2048 },
      });
      let text = response.text || "";
      console.log("[MedScan] Response received, length:", text.length);

      text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");

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

      const interactionResponse = await ai.models.generateContent({
        model: MODEL_FLASH,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        config: { maxOutputTokens: 4096 },
      });
      let text = interactionResponse.text || "";
      console.log("[Interactions] Response received, length:", text.length);

      text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");

      let result;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { error: "Could not analyze interactions" };
        }
      } catch (parseErr) {
        console.error("[Interactions] JSON parse error:", parseErr);
        result = { error: "Could not analyze interactions" };
      }

      console.log("[Interactions] Parsed result keys:", Object.keys(result));
      console.log("[Interactions] Interactions count:", result.interactions?.length);
      console.log("[Interactions] Overall risk:", result.overallRisk);

      res.json(result);
    } catch (error) {
      console.error("Interaction check error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to check interactions" });
    }
  });
}
