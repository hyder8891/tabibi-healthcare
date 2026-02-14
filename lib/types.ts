export interface PatientProfile {
  name?: string;
  age?: number;
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
}

export interface MedicineRecommendation {
  name: string;
  activeIngredient: string;
  class: string;
  dosage: string;
  frequency: string;
  duration: string;
  warnings: string[];
}

export interface TestRecommendation {
  name: string;
  type: "lab" | "imaging";
  urgency: "routine" | "urgent" | "emergency";
  reason: string;
  facilityType: string;
  capabilities: string[];
}

export interface AssessmentResult {
  assessment: {
    condition: string;
    confidence: string;
    severity: string;
    description: string;
  };
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
  followUp: string;
}

export interface EmergencyAlert {
  emergency: boolean;
  condition: string;
  action: string;
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
