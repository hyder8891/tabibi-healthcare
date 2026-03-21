export interface EmergencyContact {
  name?: string;
  phone?: string;
  relationship?: string;
}

export interface PatientProfile {
  name?: string;
  age?: number;
  dateOfBirth?: string;
  weight?: number;
  height?: number;
  gender?: string;
  bloodType?: string;
  isPediatric?: boolean;
  medications: string[];
  conditions: string[];
  allergies: string[];
  lastBpm?: number;
  lastBpmDate?: number;
  onboardingComplete?: boolean;
  emergencyContact?: EmergencyContact;
}

export interface ScannedMedication {
  name: string;
  genericName?: string;
  dosage?: string;
  form?: string;
  manufacturer?: string;
  activeIngredients?: string[];
  drugClass?: string;
  commonUses?: string[];
  commonSideEffects?: string[];
  majorInteractions?: string[];
  warnings?: string[];
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  imageUri?: string;
  imageData?: string;
  mimeType?: string;
  isError?: boolean;
}

export interface MedicineRecommendation {
  name: string;
  localBrand?: string;
  activeIngredient: string;
  class: string;
  dosage: string;
  frequency: string;
  duration: string;
  warnings: string[];
}

export interface TestRecommendation {
  name: string;
  type: "lab" | "imaging" | "referral";
  urgency: "routine" | "urgent" | "emergency";
  reason: string;
  facilityType: string;
  capabilities: string[];
  estimatedCost?: "free-MOH" | "low" | "moderate" | "high";
  availableAt?: "MOH-lab" | "private-lab" | "hospital" | "any-pharmacy";
}

export interface DifferentialDiagnosis {
  condition: string;
  likelihood: string;
  distinguishingFeature: string;
}

export interface StructuredFollowUp {
  returnIn: string;
  redFlags: string[];
}

export interface AssessmentResult {
  assessment: {
    condition: string;
    confidence: string;
    severity: string;
    description: string;
  };
  differentials?: DifferentialDiagnosis[];
  triageLevel?: "immediate" | "within-hours" | "within-24h" | "within-week" | "routine";
  pathway: string;
  recommendations: {
    pathwayA?: {
      active: boolean;
      medicines: MedicineRecommendation[];
    };
    pathwayB?: {
      active: boolean;
      tests: TestRecommendation[];
    };
  };
  warnings: string[];
  followUp: string | StructuredFollowUp;
}

export interface EmergencyAlert {
  emergency: boolean;
  condition: string;
  action: string;
}

export interface ForWhom {
  name: string;
  relationship: string;
  age?: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  age?: number;
}

export interface MentalHealthResults {
  type: 'phq9' | 'gad7';
  totalScore: number;
  severityLevel: string;
  severityColor: string;
  evidenceSummary: string;
  recommendation: string;
}

export interface Assessment {
  id: string;
  date: number;
  chiefComplaint: string;
  messages: ChatMessage[];
  result?: AssessmentResult;
  emergency?: EmergencyAlert;
  medications: ScannedMedication[];
  patientProfile: PatientProfile;
  forWhom?: ForWhom;
  mentalHealthMode?: 'phq9' | 'gad7';
  mentalHealthCrisis?: boolean;
  mentalHealthResults?: MentalHealthResults;
}

export interface MedicineOrder {
  id: string;
  userId: string;
  pharmacyName: string;
  pharmacyPhone?: string;
  pharmacyAddress?: string;
  pharmacyPlaceId?: string;
  medicineName: string;
  medicineDosage?: string;
  medicineFrequency?: string;
  quantity: number;
  price?: number;
  deliveryFee?: number;
  totalPrice?: number;
  deliveryAddress: string;
  patientName: string;
  patientPhone: string;
  alWaseetOrderId?: string;
  status: string;
  pharmacyConfirmed?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NearbyFacility {
  id: string;
  name: string;
  type: "pharmacy" | "lab" | "clinic" | "hospital";
  distance: number;
  rating: number;
  isOpen: boolean;
  address: string;
  latitude: number;
  longitude: number;
  capabilities: string[];
  phone?: string;
  internationalPhone?: string;
  openHours?: string;
  openingHours?: string[];
  website?: string;
  googleMapsUrl?: string;
  placeId?: string;
  totalRatings?: number;
  photos?: string[];
}
