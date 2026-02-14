import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Assessment, PatientProfile, ScannedMedication } from "./types";

const ASSESSMENTS_KEY = "@tabibi_assessments";
const PROFILE_KEY = "@tabibi_profile";
const MEDICATIONS_KEY = "@tabibi_medications";
const SETTINGS_KEY = "@tabibi_settings";

export async function saveAssessment(assessment: Assessment): Promise<void> {
  const existing = await getAssessments();
  existing.unshift(assessment);
  if (existing.length > 50) existing.pop();
  await AsyncStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(existing));
}

export async function getAssessments(): Promise<Assessment[]> {
  const data = await AsyncStorage.getItem(ASSESSMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  const assessments = await getAssessments();
  return assessments.find((a) => a.id === id) || null;
}

export async function deleteAssessment(id: string): Promise<void> {
  const assessments = await getAssessments();
  const filtered = assessments.filter((a) => a.id !== id);
  await AsyncStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(filtered));
}

export async function updateAssessment(assessment: Assessment): Promise<void> {
  const assessments = await getAssessments();
  const index = assessments.findIndex((a) => a.id === assessment.id);
  if (index >= 0) {
    assessments[index] = assessment;
  } else {
    assessments.unshift(assessment);
  }
  await AsyncStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(assessments));
}

export async function saveProfile(profile: PatientProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function getProfile(): Promise<PatientProfile> {
  const data = await AsyncStorage.getItem(PROFILE_KEY);
  const profile: PatientProfile = data
    ? { medications: [], conditions: [], allergies: [], ...JSON.parse(data) }
    : { medications: [], conditions: [], allergies: [] };
  if (typeof profile.age === "number" && isNaN(profile.age)) profile.age = undefined;
  if (typeof profile.weight === "number" && isNaN(profile.weight)) profile.weight = undefined;
  if (typeof profile.height === "number" && isNaN(profile.height)) profile.height = undefined;
  return profile;
}

export async function saveMedications(
  meds: ScannedMedication[],
): Promise<void> {
  await AsyncStorage.setItem(MEDICATIONS_KEY, JSON.stringify(meds));
}

export async function getMedications(): Promise<ScannedMedication[]> {
  const data = await AsyncStorage.getItem(MEDICATIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export interface AppSettings {
  language: "en" | "ar";
  pediatricMode: boolean;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getSettings(): Promise<AppSettings> {
  const data = await AsyncStorage.getItem(SETTINGS_KEY);
  return data
    ? JSON.parse(data)
    : { language: "ar", pediatricMode: false };
}
