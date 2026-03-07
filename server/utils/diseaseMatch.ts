import { readFileSync } from "fs";
import { join } from "path";

interface Disease {
  id: string;
  name_ar: string;
  name_en: string;
  icd10: string;
  iraq_context: string;
  iraq_incidence_per_100k: number;
  urgency: string;
  symptom_triggers: string[];
  presentation_pattern: string;
  screening_questions_ar: string[];
  key_tests: string[];
  seasonal_peak: string[];
  high_risk_governorates: string[];
  differentials_to_exclude: string[];
}

interface MatchedDisease {
  id: string;
  nameAr: string;
  nameEn: string;
  urgency: string;
  questionsAr: string[];
  tests: string[];
  matchCount: number;
  incidence: number;
}

let diseases: Disease[] = [];

try {
  const raw = readFileSync(join(__dirname, "iraq_epi_triggers.json"), "utf-8");
  const data = JSON.parse(raw);
  diseases = data.diseases || [];
} catch (e) {
  console.error("Failed to load iraq_epi_triggers.json:", e);
}

const GENERIC_WORDS = new Set([
  "high", "low", "pain", "loss", "dark", "pale", "severe",
  "acute", "chronic", "mild", "left", "right", "upper", "lower",
  "blood", "skin", "eye", "ear", "nose", "mouth", "chest",
  "back", "head", "neck", "arm", "leg", "foot", "hand",
  "post", "pre", "non", "new", "old", "red", "blue", "white",
]);

const SYNONYMS: Record<string, string[]> = {
  fever: ["حمى", "حرارة", "سخونة", "temperature", "febrile"],
  headache: ["صداع", "head pain", "رأسي"],
  abdominal_pain: ["ألم بطن", "مغص", "بطني", "stomach pain", "belly pain", "ألم في البطن"],
  diarrhea: ["إسهال", "diarrhoea", "loose stool", "watery stool"],
  vomiting: ["تقيؤ", "استفراغ", "قيء", "throwing up", "vomit"],
  cough: ["سعال", "كحة", "coughing"],
  dyspnea: ["ضيق تنفس", "shortness of breath", "breathing difficulty", "ضيق نفس"],
  chest_pain: ["ألم صدر", "صدري", "ألم في الصدر"],
  joint_pain: ["ألم مفاصل", "مفصل", "ألم في المفاصل"],
  fatigue: ["تعب", "إرهاق", "إعياء", "tired", "exhaustion", "weakness"],
  rash: ["طفح", "حبوب", "بقع جلدية", "skin rash"],
  jaundice: ["يرقان", "اصفرار", "yellow skin", "yellow eyes", "اصفرار العينين"],
  weight_loss: ["فقدان وزن", "نحافة", "losing weight", "نقصان وزن"],
  night_sweats: ["تعرق ليلي", "sweating at night", "عرق ليلي"],
  back_pain: ["ألم ظهر", "ظهري", "ألم في الظهر"],
  nausea: ["غثيان", "nauseous"],
  sore_throat: ["ألم حلق", "التهاب حلق", "throat pain"],
  skin_lesion: ["آفة جلدية", "قرحة جلدية", "جرح لا يلتئم"],
  skin_ulcer: ["قرحة جلدية", "ulcer on skin"],
  bleeding: ["نزيف", "نزف"],
  swelling: ["تورم", "ورم", "انتفاخ", "swollen"],
  myalgia: ["ألم عضلات", "عضلي", "muscle pain", "ألم في العضلات"],
  arthralgia: ["ألم مفاصل", "مفصلي", "joint pain"],
  dark_urine: ["بول داكن", "بول غامق"],
  pale_stool: ["براز فاتح", "براز أبيض"],
  anorexia: ["فقدان شهية", "loss of appetite", "لا أشتهي"],
  constipation: ["إمساك", "constipated"],
  seizure: ["تشنج", "نوبة صرع", "convulsion"],
  confusion: ["تشوش", "ارتباك", "confused", "disoriented"],
  blurred_vision: ["تشوش بصري", "ضبابية الرؤية", "blurry vision"],
  palpitation: ["خفقان", "heart racing", "دقات قلب سريعة"],
  edema: ["وذمة", "تورم القدمين", "swelling feet"],
  pallor: ["شحوب", "pale face", "شاحب"],
  pruritus: ["حكة", "itching"],
  dysuria: ["ألم تبول", "حرقان بول", "painful urination", "حرقة بول"],
  hematuria: ["دم في البول", "blood in urine"],
  cyanosis: ["زرقة", "bluish"],
  wheezing: ["أزيز", "صفير", "wheeze"],
  hemoptysis: ["سعال دموي", "coughing blood", "دم مع السعال"],
  epistaxis: ["رعاف", "نزيف أنف", "nosebleed"],
  lymphadenopathy: ["تورم غدد", "عقد لمفاوية", "swollen glands", "swollen lymph nodes"],
  splenomegaly: ["تضخم طحال", "enlarged spleen"],
  hepatomegaly: ["تضخم كبد", "enlarged liver"],
  orchitis: ["التهاب خصية", "testicular pain", "ألم خصية"],
  pregnancy: ["حامل", "حمل", "pregnant"],
  dog_bite: ["عضة كلب", "bitten by dog", "عض كلب"],
  animal_bite: ["عضة حيوان", "bitten by animal"],
  profuse_watery_diarrhea: ["إسهال مائي شديد", "إسهال شديد", "profuse diarrhea"],
  rice_water_stool: ["براز مثل ماء الرز"],
  severe_dehydration: ["جفاف شديد", "severely dehydrated"],
  prolonged_fever: ["حمى مستمرة", "حمى طويلة", "fever lasting", "حرارة مستمرة"],
  pediatric_fever: ["حمى طفل", "حرارة طفل", "child fever"],
  non_healing_wound: ["جرح لا يلتئم", "wound not healing"],
  painless_ulcer: ["قرحة بدون ألم", "painless sore"],
  difficulty_swallowing: ["صعوبة بلع", "difficulty swallowing", "dysphagia"],
  blood_in_stool: ["دم في البراز", "blood in stool", "bloody stool"],
  genital_ulcer: ["قرحة تناسلية", "genital sore"],
  urethral_discharge: ["إفرازات إحليلية", "penile discharge"],
  vaginal_discharge: ["إفرازات مهبلية", "vaginal discharge"],
};

const TRIGGER_PHRASES: Record<string, string[]> = {};

function buildPhrases(trigger: string): string[] {
  const phrase = trigger.replace(/_/g, " ").toLowerCase();
  const result = [phrase];

  if (SYNONYMS[trigger]) {
    result.push(...SYNONYMS[trigger].map(s => s.toLowerCase()));
  }

  return result;
}

for (const disease of diseases) {
  for (const trigger of disease.symptom_triggers) {
    if (!TRIGGER_PHRASES[trigger]) {
      TRIGGER_PHRASES[trigger] = buildPhrases(trigger);
    }
  }
}

function phraseMatch(text: string, phrase: string): boolean {
  const idx = text.indexOf(phrase);
  if (idx === -1) return false;

  if (phrase.length <= 3) {
    const before = idx > 0 ? text[idx - 1] : " ";
    const after = idx + phrase.length < text.length ? text[idx + phrase.length] : " ";
    const isBoundary = (c: string) => /[\s,.\-;:!?()'"،؛]/.test(c);
    return isBoundary(before) && isBoundary(after);
  }

  return true;
}

const URGENCY_ORDER: Record<string, number> = {
  emergency: 0,
  emergency_post_exposure: 0,
  high: 1,
  high_if_pregnant: 1,
  urgent: 1,
  moderate_to_high: 1,
  moderate: 2,
  routine: 3,
  low: 3,
};

function getMinMatches(urgency: string): number {
  const level = URGENCY_ORDER[urgency] ?? 2;
  if (level === 0) return 2;
  if (level === 1) return 2;
  return 3;
}

export function matchDiseases(conversationText: string): MatchedDisease[] {
  if (!conversationText || diseases.length === 0) return [];

  const textLower = conversationText.toLowerCase();

  const scored: MatchedDisease[] = [];

  for (const disease of diseases) {
    let matchCount = 0;

    for (const trigger of disease.symptom_triggers) {
      const phrases = TRIGGER_PHRASES[trigger] || [trigger.replace(/_/g, " ")];
      for (const phrase of phrases) {
        if (phraseMatch(textLower, phrase)) {
          matchCount++;
          break;
        }
      }
    }

    const minMatches = getMinMatches(disease.urgency);

    if (matchCount >= minMatches) {
      scored.push({
        id: disease.id,
        nameAr: disease.name_ar,
        nameEn: disease.name_en,
        urgency: disease.urgency,
        questionsAr: disease.screening_questions_ar,
        tests: disease.key_tests,
        matchCount,
        incidence: disease.iraq_incidence_per_100k,
      });
    }
  }

  scored.sort((a, b) => {
    const ua = URGENCY_ORDER[a.urgency] ?? 2;
    const ub = URGENCY_ORDER[b.urgency] ?? 2;
    if (ua !== ub) return ua - ub;
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return b.incidence - a.incidence;
  });

  return scored;
}
