import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  TextInput,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, saveProfile } from "@/lib/storage";
import type { PatientProfile } from "@/lib/types";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, t, isRTL } = useSettings();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<PatientProfile>({
    medications: [],
    conditions: [],
    allergies: [],
  });
  const [newCondition, setNewCondition] = useState("");
  const [newAllergy, setNewAllergy] = useState("");
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  const updateProfile = (partial: Partial<PatientProfile>) => {
    const updated = { ...profile, ...partial };
    setProfile(updated);
    saveProfile(updated);
  };

  const addCondition = () => {
    if (newCondition.trim()) {
      updateProfile({
        conditions: [...(profile.conditions || []), newCondition.trim()],
      });
      setNewCondition("");
    }
  };

  const removeCondition = (index: number) => {
    const updated = [...(profile.conditions || [])];
    updated.splice(index, 1);
    updateProfile({ conditions: updated });
  };

  const addAllergy = () => {
    if (newAllergy.trim()) {
      updateProfile({
        allergies: [...(profile.allergies || []), newAllergy.trim()],
      });
      setNewAllergy("");
    }
  };

  const removeAllergy = (index: number) => {
    const updated = [...(profile.allergies || [])];
    updated.splice(index, 1);
    updateProfile({ allergies: updated });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 12, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, isRTL && { textAlign: "right" }]}>{t("Settings", "\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a")}</Text>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Health Profile", "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0635\u062d\u064a")}
        </Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Name", "\u0627\u0644\u0627\u0633\u0645")}</Text>
            <TextInput
              style={[styles.fieldInput, { flex: 1, textAlign: isRTL ? "right" : "left" }]}
              value={profile.name || ""}
              onChangeText={(v) => updateProfile({ name: v || undefined })}
              placeholder={t("Your name", "\u0627\u0633\u0645\u0643")}
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Gender", "\u0627\u0644\u062c\u0646\u0633")}</Text>
            <View style={styles.genderRow}>
              {[{ key: "male", en: "Male", ar: "\u0630\u0643\u0631" }, { key: "female", en: "Female", ar: "\u0623\u0646\u062b\u0649" }].map((g) => (
                <Pressable
                  key={g.key}
                  style={[
                    styles.genderButton,
                    profile.gender === g.key && styles.genderButtonActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateProfile({ gender: g.key });
                  }}
                >
                  <Text
                    style={[
                      styles.genderText,
                      profile.gender === g.key && styles.genderTextActive,
                    ]}
                  >
                    {t(g.en, g.ar)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Age", "\u0627\u0644\u0639\u0645\u0631")}</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.age != null && !isNaN(profile.age) ? profile.age.toString() : ""}
              onChangeText={(v) => {
                const n = parseInt(v);
                updateProfile({ age: v && !isNaN(n) ? n : undefined });
              }}
              keyboardType="number-pad"
              placeholder="--"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Weight (kg)", "\u0627\u0644\u0648\u0632\u0646 (\u0643\u063a)")}</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.weight != null && !isNaN(profile.weight) ? profile.weight.toString() : ""}
              onChangeText={(v) => {
                const n = parseFloat(v);
                updateProfile({ weight: v && !isNaN(n) ? n : undefined });
              }}
              keyboardType="decimal-pad"
              placeholder="--"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Height (cm)", "\u0627\u0644\u0637\u0648\u0644 (\u0633\u0645)")}</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.height != null && !isNaN(profile.height) ? profile.height.toString() : ""}
              onChangeText={(v) => {
                const n = parseFloat(v);
                updateProfile({ height: v && !isNaN(n) ? n : undefined });
              }}
              keyboardType="decimal-pad"
              placeholder="--"
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>{t("Blood Type", "\u0641\u0635\u064a\u0644\u0629 \u0627\u0644\u062f\u0645")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.bloodTypeRow}>
                {BLOOD_TYPES.map((bt) => (
                  <Pressable
                    key={bt}
                    style={[styles.bloodTypeChip, profile.bloodType === bt && styles.bloodTypeChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateProfile({ bloodType: bt === profile.bloodType ? undefined : bt });
                    }}
                  >
                    <Text style={[styles.bloodTypeText, profile.bloodType === bt && styles.bloodTypeTextActive]}>
                      {bt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Known Conditions", "\u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0627\u0644\u0645\u0639\u0631\u0648\u0641\u0629")}
        </Text>
        <View style={styles.card}>
          {(profile.conditions || []).map((c, i) => (
            <View key={i}>
              <View style={styles.conditionRow}>
                <Ionicons name="medical" size={18} color={Colors.light.primary} />
                <Text style={styles.conditionText}>{c}</Text>
                <Pressable onPress={() => removeCondition(i)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.light.textTertiary} />
                </Pressable>
              </View>
              {i < (profile.conditions || []).length - 1 && <View style={styles.divider} />}
            </View>
          ))}
          <View
            style={[
              styles.addRow,
              (profile.conditions || []).length > 0 && { borderTopWidth: 1, borderTopColor: Colors.light.borderLight, paddingTop: 12, marginTop: 8 },
            ]}
          >
            <TextInput
              style={styles.addInput}
              value={newCondition}
              onChangeText={setNewCondition}
              placeholder={t("Add condition (e.g., Diabetes)", "\u0623\u0636\u0641 \u062d\u0627\u0644\u0629 (\u0645\u062b\u0644 \u0627\u0644\u0633\u0643\u0631\u064a)")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addCondition}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addButton, !newCondition.trim() && { opacity: 0.4 }]}
              onPress={addCondition}
              disabled={!newCondition.trim()}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Allergies", "\u0627\u0644\u062d\u0633\u0627\u0633\u064a\u0629")}
        </Text>
        <View style={styles.card}>
          {(profile.allergies || []).map((a, i) => (
            <View key={i}>
              <View style={styles.conditionRow}>
                <Ionicons name="warning" size={18} color={Colors.light.accent} />
                <Text style={styles.conditionText}>{a}</Text>
                <Pressable onPress={() => removeAllergy(i)} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={Colors.light.textTertiary} />
                </Pressable>
              </View>
              {i < (profile.allergies || []).length - 1 && <View style={styles.divider} />}
            </View>
          ))}
          <View
            style={[
              styles.addRow,
              (profile.allergies || []).length > 0 && { borderTopWidth: 1, borderTopColor: Colors.light.borderLight, paddingTop: 12, marginTop: 8 },
            ]}
          >
            <TextInput
              style={styles.addInput}
              value={newAllergy}
              onChangeText={setNewAllergy}
              placeholder={t("Add allergy (e.g., Penicillin)", "\u0623\u0636\u0641 \u062d\u0633\u0627\u0633\u064a\u0629 (\u0645\u062b\u0644 \u0627\u0644\u0628\u0646\u0633\u0644\u064a\u0646)")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addAllergy}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addButton, { backgroundColor: Colors.light.accent }, !newAllergy.trim() && { opacity: 0.4 }]}
              onPress={addAllergy}
              disabled={!newAllergy.trim()}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Preferences", "\u0627\u0644\u062a\u0641\u0636\u064a\u0644\u0627\u062a")}
        </Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <MaterialCommunityIcons name="baby-face-outline" size={22} color={Colors.light.primary} />
              <View>
                <Text style={styles.switchLabel}>{t("Pediatric Mode", "\u0648\u0636\u0639 \u0627\u0644\u0623\u0637\u0641\u0627\u0644")}</Text>
                <Text style={styles.switchDesc}>
                  {t("Weight-based dosage calculations", "\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u062c\u0631\u0639\u0629 \u062d\u0633\u0628 \u0627\u0644\u0648\u0632\u0646")}
                </Text>
              </View>
            </View>
            <Switch
              value={settings.pediatricMode}
              onValueChange={(v) => updateSettings({ pediatricMode: v })}
              trackColor={{ false: Colors.light.borderLight, true: Colors.light.primaryLight }}
              thumbColor={settings.pediatricMode ? Colors.light.primary : "#f4f3f4"}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Ionicons name="language" size={22} color={Colors.light.primary} />
              <View>
                <Text style={styles.switchLabel}>{t("Language", "\u0627\u0644\u0644\u063a\u0629")}</Text>
                <Text style={styles.switchDesc}>
                  {settings.language === "en" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}
                </Text>
              </View>
            </View>
            <View style={styles.langRow}>
              {(["en", "ar"] as const).map((lang) => (
                <Pressable
                  key={lang}
                  style={[styles.langButton, settings.language === lang && styles.langButtonActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ language: lang });
                  }}
                >
                  <Text style={[styles.langText, settings.language === lang && styles.langTextActive]}>
                    {lang === "en" ? "EN" : "\u0639\u0631"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {user && (
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Ionicons
                name={user.email ? "mail-outline" : "call-outline"}
                size={18}
                color={Colors.light.textSecondary}
              />
              <Text style={[styles.fieldLabel, { marginLeft: 8, flex: 1 }]}>
                {user.email || user.phone || user.name}
              </Text>
            </View>
            {user.authProvider && user.authProvider !== "password" && (
              <>
                <View style={styles.divider} />
                <View style={styles.fieldRow}>
                  <MaterialCommunityIcons
                    name={user.authProvider === "google.com" ? "google" : "shield-check"}
                    size={18}
                    color={Colors.light.textSecondary}
                  />
                  <Text style={[styles.fieldLabel, { marginLeft: 8, flex: 1 }]}>
                    {user.authProvider === "google.com" ? "Google" : user.authProvider}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.8 },
          ]}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
            router.replace("/auth");
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.light.emergency} />
          <Text style={styles.logoutText}>{t("Log Out", "تسجيل الخروج")}</Text>
        </Pressable>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle" size={16} color={Colors.light.textTertiary} />
          <Text style={styles.disclaimerText}>
            {t(
              "Tabibi is not a replacement for professional medical advice. Always consult a healthcare provider for serious conditions.",
              "\u0637\u0628\u064a\u0628\u064a \u0644\u064a\u0633 \u0628\u062f\u064a\u0644\u0627\u064b \u0639\u0646 \u0627\u0644\u0627\u0633\u062a\u0634\u0627\u0631\u0629 \u0627\u0644\u0637\u0628\u064a\u0629 \u0627\u0644\u0645\u062a\u062e\u0635\u0635\u0629.",
            )}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
    textAlign: "right",
    minWidth: 60,
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginVertical: 10,
  },
  genderRow: {
    flexDirection: "row",
    gap: 8,
  },
  genderButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
  },
  genderButtonActive: {
    backgroundColor: Colors.light.primarySurface,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  genderText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  genderTextActive: {
    color: Colors.light.primary,
  },
  bloodTypeRow: {
    flexDirection: "row",
    gap: 6,
  },
  bloodTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  bloodTypeChipActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  bloodTypeText: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  bloodTypeTextActive: {
    color: Colors.light.primary,
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  conditionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    padding: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  switchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  switchLabel: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  switchDesc: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 1,
  },
  langRow: {
    flexDirection: "row",
    gap: 6,
  },
  langButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
  },
  langButtonActive: {
    backgroundColor: Colors.light.primarySurface,
  },
  langText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  langTextActive: {
    color: Colors.light.primary,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.emergencyLight,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.emergency,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    lineHeight: 18,
  },
});
