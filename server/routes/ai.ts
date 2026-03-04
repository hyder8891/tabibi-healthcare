import type { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { requireAuth } from "./middleware";
import { avicenna } from "../avicenna";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_PRO = "gemini-2.5-pro";

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
   For TIER 1: Include emergency JSON AND the full assessment JSON block with severity="severe" in the SAME response. Set pathway B with emergency tests the ER will run.
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
   For TIER 2: Do NOT rush to "go to ER." Instead, ask 7-10 thorough questions to narrow the differential. Then provide FULL structured assessment JSON with appropriate severity, medicines (pathway A if applicable), AND tests (pathway B). If after thorough questioning you determine it IS an emergency, THEN include the emergency JSON block along with the full assessment JSON.

   IMPORTANT: Always write a helpful, readable message BEFORE any emergency JSON. Explain what you found, why it's urgent, and what action they should take. Never respond with ONLY the JSON block.

2. NEVER add medical disclaimers, caveats, "consult a doctor" reminders, or "I'm not a substitute for a doctor" messages. NEVER say "ملاحظة هامة" or "أنا لست بديلاً عن الطبيب" or any variation. The app handles safety messaging separately. Your job is to provide direct clinical guidance without hedging.

STAGED ASSESSMENT FLOW — MANDATORY GATES:
You MUST progress through these stages sequentially. Do NOT skip to recommendations until all relevant stages are covered.

STAGE 1 — SYMPTOM IDENTIFICATION & ONSET (minimum 1-2 questions):
- Extract chief complaint and map colloquial terms to medical terminology
- Ask: When did it start? Sudden or gradual onset?
- GATE: You must know WHAT the symptom is and WHEN it started before moving on.

STAGE 2 — CHARACTERIZATION (minimum 1-2 questions):
- Severity (1-10 scale or qualitative)
- Exact location and radiation pattern
- Quality/character (sharp, dull, burning, cramping, throbbing)
- GATE: You must know the severity, location, and quality before moving on.

STAGE 3 — ASSOCIATED SYMPTOMS & SYSTEM REVIEW (minimum 2-3 questions):
- Systematically explore related organ systems (e.g., GI symptoms with abdominal pain, respiratory with chest pain)
- Ask about fever, nausea, changes in appetite/bowel/urinary habits as relevant
- Aggravating and relieving factors
- GATE: You must have explored at least 2 related symptom domains before moving on.

STAGE 4 — RISK FACTORS, HISTORY & MEDICATIONS (minimum 1-2 questions):
- Relevant medical history and past episodes of similar symptoms
- Family history when relevant (e.g., kidney stones, diabetes, heart disease, cancer)
- Risk factors and lifestyle (diet, fluid intake, smoking, exercise, occupational exposure)
- Current medications (prompt to use the medication scanner if they take any)
- Allergies
- GATE: You must know their relevant history and current medications before recommending.

RECOMMENDATION GATE: Only after all 4 stages are adequately covered (minimum 5-7 total questions for simple cases, 7-10 for serious/urgent symptoms) should you provide the assessment JSON. For very clearly simple conditions (common cold with classic presentation and no red flags), you may reduce to 4-5 questions.

CRITICAL — ALWAYS PROVIDE FULL STRUCTURED ASSESSMENT:
Whether the condition is mild, moderate, or severe, you MUST ALWAYS end with the full structured JSON recommendation block including:
- assessment with correct severity (mild/moderate/severe)
- differentials (2-3 alternative diagnoses with distinguishing features)
- triageLevel indicating time urgency (separate from severity)
- pathway A (medicines) when OTC treatment is applicable — even for severe cases, patients may need symptomatic relief while seeking care
- pathway B (tests) with appropriate urgency levels, estimated cost tiers, and where to get them
- structured followUp with specific return timeline and red flags to watch for
- warnings relevant to the condition
NEVER leave the patient with just a text message and no structured recommendation. The app uses the JSON to display actionable guidance.

CONDITION-APPROPRIATE MEDICATION SELECTION — CRITICAL:
First identify the correct drug CLASS for the condition, THEN find the appropriate Iraqi brand. Do NOT default to paracetamol + ibuprofen for every condition. The drug class must match the pathology:

ANALGESICS & ANTI-INFLAMMATORIES:
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
          "type": "lab|imaging",
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
- In the JSON recommendation block, write all text fields (condition, description, warnings, followUp, differentials, medicine names, test reasons) in Arabic when responding in Arabic`;

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
          systemContext += `- Current Medications: ${patientProfile.medications.map(m => sanitizeInput(m)).join(", ")}\n`;
          systemContext += `- IMPORTANT: Check for drug interactions and ADRs with any recommendations\n`;
        }
        if (patientProfile.conditions && patientProfile.conditions.length > 0) {
          systemContext += `- Known Conditions: ${patientProfile.conditions.map(c => sanitizeInput(c)).join(", ")}\n`;
        }
        if (patientProfile.allergies && patientProfile.allergies.length > 0) {
          systemContext += `- Allergies: ${patientProfile.allergies.map(a => sanitizeInput(a)).join(", ")}\n`;
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

      let imageAnalysis = "";
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
          imageAnalysis = imageResponse.text || "";

          console.log("Image analysis completed:", imageAnalysis.substring(0, 200));
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
          }
          parts.push({ text: content });
        }
        return {
          role: m.role === "user" ? "user" : "model",
          parts,
        };
      });

      const stream = await ai.models.generateContentStream({
        model: MODEL_FLASH,
        contents: chatMessages,
        config: {
          systemInstruction: systemContext,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      for await (const chunk of stream) {
        if (clientDisconnected) break;
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.thought || !part.text) continue;
            fullResponse += part.text;
            res.write(`data: ${JSON.stringify({ content: part.text })}\n\n`);
          }
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
      console.log("[MedScan] Raw response:", text.substring(0, 500));

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
      console.log("[Interactions] Raw response:", text.substring(0, 500));

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
      console.log("[Interactions] Summary:", result.summary?.substring(0, 200));

      res.json(result);
    } catch (error) {
      console.error("Interaction check error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: "Failed to check interactions" });
    }
  });
}
