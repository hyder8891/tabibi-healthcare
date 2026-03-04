import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { Assessment, PatientProfile, ScannedMedication } from "./types";

const ASSESSMENTS_KEY = "@tabibi_assessments";
const PROFILE_KEY = "@tabibi_profile";
const MEDICATIONS_KEY = "@tabibi_medications";
const SETTINGS_KEY = "@tabibi_settings";
const SECURE_KEY_ALIAS = "tabibi_storage_key";

let cachedKey: string | null = null;

async function getOrCreateEncryptionKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  try {
    const existing = await SecureStore.getItemAsync(SECURE_KEY_ALIAS);
    if (existing) {
      cachedKey = existing;
      return existing;
    }
  } catch {}
  const raw = Crypto.randomUUID() + Crypto.randomUUID();
  const key = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );
  try {
    await SecureStore.setItemAsync(SECURE_KEY_ALIAS, key);
  } catch {}
  cachedKey = key;
  return key;
}

function xorCipher(data: string, key: string): string {
  const result: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result.push(String.fromCharCode(charCode));
  }
  return result.join("");
}

function toBase64(str: string): string {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

async function encryptData(plaintext: string): Promise<string> {
  const key = await getOrCreateEncryptionKey();
  const ciphered = xorCipher(plaintext, key);
  return "ENC:" + toBase64(ciphered);
}

async function decryptData(stored: string): Promise<string> {
  if (!stored.startsWith("ENC:")) {
    return stored;
  }
  try {
    const key = await getOrCreateEncryptionKey();
    const ciphered = fromBase64(stored.slice(4));
    return xorCipher(ciphered, key);
  } catch {
    return stored;
  }
}

async function setEncryptedItem(key: string, json: string): Promise<void> {
  const encrypted = await encryptData(json);
  await AsyncStorage.setItem(key, encrypted);
}

async function getDecryptedItem(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return null;
  try {
    const decrypted = await decryptData(raw);
    JSON.parse(decrypted);
    return decrypted;
  } catch {
    try {
      JSON.parse(raw);
      return raw;
    } catch {
      return null;
    }
  }
}

export async function saveAssessment(assessment: Assessment): Promise<void> {
  const existing = await getAssessments();
  existing.unshift(assessment);
  if (existing.length > 50) existing.pop();
  await setEncryptedItem(ASSESSMENTS_KEY, JSON.stringify(existing));
}

export async function getAssessments(): Promise<Assessment[]> {
  const data = await getDecryptedItem(ASSESSMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function getAssessment(id: string): Promise<Assessment | null> {
  const assessments = await getAssessments();
  return assessments.find((a) => a.id === id) || null;
}

export async function deleteAssessment(id: string): Promise<void> {
  const assessments = await getAssessments();
  const filtered = assessments.filter((a) => a.id !== id);
  await setEncryptedItem(ASSESSMENTS_KEY, JSON.stringify(filtered));
}

export async function updateAssessment(assessment: Assessment): Promise<void> {
  const assessments = await getAssessments();
  const index = assessments.findIndex((a) => a.id === assessment.id);
  if (index >= 0) {
    assessments[index] = assessment;
  } else {
    assessments.unshift(assessment);
  }
  await setEncryptedItem(ASSESSMENTS_KEY, JSON.stringify(assessments));
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
  await setEncryptedItem(MEDICATIONS_KEY, JSON.stringify(meds));
}

export async function getMedications(): Promise<ScannedMedication[]> {
  const data = await getDecryptedItem(MEDICATIONS_KEY);
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
