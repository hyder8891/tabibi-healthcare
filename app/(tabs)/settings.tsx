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
import { LinearGradient } from "expo-linear-gradient";
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

  const initials = profile.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.name
      ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
      : "";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <LinearGradient
            colors={[Colors.light.primary, "#14B8A6"]}
            style={styles.avatarGradient}
          >
            {initials ? (
              <Text style={styles.avatarInitials}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={28} color="#fff" />
            )}
          </LinearGradient>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, isRTL && { textAlign: "right" }]}>
              {profile.name || user?.name || t("Your Profile", "\u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a")}
            </Text>
            {(user?.email || user?.phone) && (
              <Text style={[styles.profileEmail, isRTL && { textAlign: "right" }]}>
                {user.email || user.phone}
              </Text>
            )}
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Personal Info", "\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0634\u062e\u0635\u064a\u0629")}
        </Text>
        <View style={styles.card}>
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <Ionicons name="person-outline" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Name", "\u0627\u0644\u0627\u0633\u0645")}</Text>
            <TextInput
              style={[styles.fieldInput, isRTL && { textAlign: "right" }]}
              value={profile.name || ""}
              onChangeText={(v) => updateProfile({ name: v || undefined })}
              placeholder={t("Your name", "\u0627\u0633\u0645\u0643")}
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <Ionicons name="male-female-outline" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Gender", "\u0627\u0644\u062c\u0646\u0633")}</Text>
            <View style={styles.chipRow}>
              {[{ key: "male", en: "Male", ar: "\u0630\u0643\u0631" }, { key: "female", en: "Female", ar: "\u0623\u0646\u062b\u0649" }].map((g) => (
                <Pressable
                  key={g.key}
                  style={[
                    styles.chip,
                    profile.gender === g.key && styles.chipActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateProfile({ gender: g.key });
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      profile.gender === g.key && styles.chipTextActive,
                    ]}
                  >
                    {t(g.en, g.ar)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <Ionicons name="calendar-outline" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Age", "\u0627\u0644\u0639\u0645\u0631")}</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputSmall]}
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
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <MaterialCommunityIcons name="weight-kilogram" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Weight", "\u0627\u0644\u0648\u0632\u0646")}</Text>
            <View style={styles.unitInputWrap}>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputSmall]}
                value={profile.weight != null && !isNaN(profile.weight) ? profile.weight.toString() : ""}
                onChangeText={(v) => {
                  const n = parseFloat(v);
                  updateProfile({ weight: v && !isNaN(n) ? n : undefined });
                }}
                keyboardType="decimal-pad"
                placeholder="--"
                placeholderTextColor={Colors.light.textTertiary}
              />
              <Text style={styles.unitLabel}>{t("kg", "\u0643\u063a")}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <MaterialCommunityIcons name="human-male-height" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Height", "\u0627\u0644\u0637\u0648\u0644")}</Text>
            <View style={styles.unitInputWrap}>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputSmall]}
                value={profile.height != null && !isNaN(profile.height) ? profile.height.toString() : ""}
                onChangeText={(v) => {
                  const n = parseFloat(v);
                  updateProfile({ height: v && !isNaN(n) ? n : undefined });
                }}
                keyboardType="decimal-pad"
                placeholder="--"
                placeholderTextColor={Colors.light.textTertiary}
              />
              <Text style={styles.unitLabel}>{t("cm", "\u0633\u0645")}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, { paddingVertical: 12 }, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.fieldIconWrap}>
              <Ionicons name="water-outline" size={17} color={Colors.light.primary} />
            </View>
            <Text style={[styles.fieldLabel, { marginRight: 12 }]}>{t("Blood Type", "\u0641\u0635\u064a\u0644\u0629 \u0627\u0644\u062f\u0645")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.bloodTypeRow}>
                {BLOOD_TYPES.map((bt) => (
                  <Pressable
                    key={bt}
                    style={[styles.bloodChip, profile.bloodType === bt && styles.bloodChipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateProfile({ bloodType: bt === profile.bloodType ? undefined : bt });
                    }}
                  >
                    <Text style={[styles.bloodChipText, profile.bloodType === bt && styles.bloodChipTextActive]}>
                      {bt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Medical Conditions", "\u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0627\u0644\u0637\u0628\u064a\u0629")}
        </Text>
        <View style={styles.card}>
          {(profile.conditions || []).length > 0 ? (
            <View style={styles.tagsWrap}>
              {(profile.conditions || []).map((c, i) => (
                <View key={i} style={styles.tag}>
                  <Ionicons name="medical" size={13} color={Colors.light.primary} />
                  <Text style={styles.tagText}>{c}</Text>
                  <Pressable onPress={() => removeCondition(i)} hitSlop={8} style={styles.tagRemove}>
                    <Ionicons name="close" size={14} color={Colors.light.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyHint, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons name="medical" size={16} color={Colors.light.textTertiary} />
              <Text style={styles.emptyHintText}>{t("No conditions added", "\u0644\u0627 \u064a\u0648\u062c\u062f")}</Text>
            </View>
          )}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, isRTL && { textAlign: "right" }]}
              value={newCondition}
              onChangeText={setNewCondition}
              placeholder={t("Add condition (e.g., Diabetes)", "\u0623\u0636\u0641 \u062d\u0627\u0644\u0629 (\u0645\u062b\u0644 \u0627\u0644\u0633\u0643\u0631\u064a)")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addCondition}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addBtn, !newCondition.trim() && { opacity: 0.4 }]}
              onPress={addCondition}
              disabled={!newCondition.trim()}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Allergies", "\u0627\u0644\u062d\u0633\u0627\u0633\u064a\u0629")}
        </Text>
        <View style={styles.card}>
          {(profile.allergies || []).length > 0 ? (
            <View style={styles.tagsWrap}>
              {(profile.allergies || []).map((a, i) => (
                <View key={i} style={[styles.tag, styles.tagWarn]}>
                  <Ionicons name="warning" size={13} color={Colors.light.accent} />
                  <Text style={[styles.tagText, { color: "#92400E" }]}>{a}</Text>
                  <Pressable onPress={() => removeAllergy(i)} hitSlop={8} style={styles.tagRemove}>
                    <Ionicons name="close" size={14} color={Colors.light.textTertiary} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyHint, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons name="warning" size={16} color={Colors.light.textTertiary} />
              <Text style={styles.emptyHintText}>{t("No allergies added", "\u0644\u0627 \u064a\u0648\u062c\u062f")}</Text>
            </View>
          )}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, isRTL && { textAlign: "right" }]}
              value={newAllergy}
              onChangeText={setNewAllergy}
              placeholder={t("Add allergy (e.g., Penicillin)", "\u0623\u0636\u0641 \u062d\u0633\u0627\u0633\u064a\u0629 (\u0645\u062b\u0644 \u0627\u0644\u0628\u0646\u0633\u0644\u064a\u0646)")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addAllergy}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addBtn, { backgroundColor: Colors.light.accent }, !newAllergy.trim() && { opacity: 0.4 }]}
              onPress={addAllergy}
              disabled={!newAllergy.trim()}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Preferences", "\u0627\u0644\u062a\u0641\u0636\u064a\u0644\u0627\u062a")}
        </Text>
        <View style={styles.card}>
          <View style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={[styles.prefIconWrap, { backgroundColor: "#ECFDF5" }]}>
                <MaterialCommunityIcons name="baby-face-outline" size={18} color={Colors.light.primary} />
              </View>
              <View style={isRTL ? { alignItems: "flex-end" } : undefined}>
                <Text style={styles.prefLabel}>{t("Pediatric Mode", "\u0648\u0636\u0639 \u0627\u0644\u0623\u0637\u0641\u0627\u0644")}</Text>
                <Text style={[styles.prefDesc, isRTL && { textAlign: "right" }]}>
                  {t("Weight-based dosage", "\u062d\u0633\u0627\u0628\u0627\u062a \u0627\u0644\u062c\u0631\u0639\u0629 \u062d\u0633\u0628 \u0627\u0644\u0648\u0632\u0646")}
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
          <View style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={[styles.prefIconWrap, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="language" size={18} color="#3B82F6" />
              </View>
              <View style={isRTL ? { alignItems: "flex-end" } : undefined}>
                <Text style={styles.prefLabel}>{t("Language", "\u0627\u0644\u0644\u063a\u0629")}</Text>
                <Text style={styles.prefDesc}>
                  {settings.language === "en" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}
                </Text>
              </View>
            </View>
            <View style={styles.chipRow}>
              {(["en", "ar"] as const).map((lang) => (
                <Pressable
                  key={lang}
                  style={[styles.chip, settings.language === lang && styles.chipActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateSettings({ language: lang });
                  }}
                >
                  <Text style={[styles.chipText, settings.language === lang && styles.chipTextActive]}>
                    {lang === "en" ? "EN" : "\u0639\u0631"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {user && (
          <>
            <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
              {t("Account", "\u0627\u0644\u062d\u0633\u0627\u0628")}
            </Text>
            <View style={styles.card}>
              <View style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}>
                <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
                  <View style={[styles.prefIconWrap, { backgroundColor: "#F3F4F6" }]}>
                    <Ionicons
                      name={user.email ? "mail-outline" : "call-outline"}
                      size={18}
                      color={Colors.light.textSecondary}
                    />
                  </View>
                  <Text style={styles.prefLabel} numberOfLines={1}>
                    {user.email || user.phone || user.name}
                  </Text>
                </View>
                {user.authProvider && user.authProvider !== "password" && (
                  <View style={styles.providerBadge}>
                    <MaterialCommunityIcons
                      name={user.authProvider === "google.com" ? "google" : "shield-check"}
                      size={14}
                      color={Colors.light.textSecondary}
                    />
                    <Text style={styles.providerText}>
                      {user.authProvider === "google.com" ? "Google" : user.authProvider}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await logout();
            router.replace("/auth");
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={Colors.light.emergency} />
          <Text style={styles.logoutText}>{t("Log Out", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c")}</Text>
        </Pressable>

        <View style={[styles.disclaimer, isRTL && { flexDirection: "row-reverse" }]}>
          <Ionicons name="information-circle" size={15} color={Colors.light.textTertiary} />
          <Text style={[styles.disclaimerText, isRTL && { textAlign: "right" }]}>
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
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  avatarGradient: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    letterSpacing: 1,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  profileEmail: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  fieldIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
    textAlign: "right",
    minWidth: 50,
    padding: 4,
  },
  fieldInputSmall: {
    minWidth: 36,
    textAlign: "center",
  },
  unitInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unitLabel: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 4,
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primaryLight,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  chipTextActive: {
    color: Colors.light.primary,
  },
  bloodTypeRow: {
    flexDirection: "row",
    gap: 5,
  },
  bloodChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  bloodChipActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  bloodChipText: {
    fontSize: 12,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.textTertiary,
  },
  bloodChipTextActive: {
    color: Colors.light.primary,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  tagWarn: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  tagText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  tagRemove: {
    marginLeft: 2,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    paddingVertical: 4,
  },
  emptyHintText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 12,
  },
  addInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  prefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  prefLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  prefIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  prefLabel: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  prefDesc: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 1,
  },
  providerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  providerText: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.emergencyLight,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.emergency,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 12,
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
