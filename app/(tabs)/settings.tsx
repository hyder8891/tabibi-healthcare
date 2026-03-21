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
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile, saveProfile } from "@/lib/storage";
import type { PatientProfile, EmergencyContact } from "@/lib/types";
import CollapsibleSection from "@/components/CollapsibleSection";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const RELATIONSHIPS = [
  { key: "spouse", en: "Spouse", ar: "\u0632\u0648\u062c/\u0632\u0648\u062c\u0629" },
  { key: "parent", en: "Parent", ar: "\u0648\u0627\u0644\u062f/\u0629" },
  { key: "sibling", en: "Sibling", ar: "\u0623\u062e/\u0623\u062e\u062a" },
  { key: "child", en: "Child", ar: "\u0627\u0628\u0646/\u0627\u0628\u0646\u0629" },
  { key: "friend", en: "Friend", ar: "\u0635\u062f\u064a\u0642/\u0629" },
  { key: "other", en: "Other", ar: "\u0622\u062e\u0631" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, t, isRTL } = useSettings();
  const { user, logout, isEmailVerified, changePassword, linkEmailToPhone, linkPhoneToEmail } = useAuth();
  const [profile, setProfile] = useState<PatientProfile>({
    medications: [],
    conditions: [],
    allergies: [],
  });
  const [newCondition, setNewCondition] = useState("");
  const [newAllergy, setNewAllergy] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showLinkEmail, setShowLinkEmail] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  const updateProfile = (partial: Partial<PatientProfile>) => {
    const updated = { ...profile, ...partial };
    setProfile(updated);
    saveProfile(updated);
  };

  const updateEmergencyContact = (partial: Partial<EmergencyContact>) => {
    const updated = { ...(profile.emergencyContact || {}), ...partial };
    updateProfile({ emergencyContact: updated });
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

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSuccess(false);
    if (!currentPassword.trim()) {
      setPasswordError(t("Please enter your current password", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629"));
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError(t("New password must be at least 6 characters", "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("Passwords do not match", "\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0645\u062a\u0637\u0627\u0628\u0642\u0629"));
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setShowPasswordModal(false), 1500);
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordError(t("Current password is incorrect", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629"));
      } else if (code === "auth/requires-recent-login") {
        setPasswordError(t("Please log out and log in again before changing your password", "\u064a\u0631\u062c\u0649 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c \u0648\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649"));
      } else if (code === "auth/weak-password") {
        setPasswordError(t("Password is too weak", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0636\u0639\u064a\u0641\u0629 \u062c\u062f\u0627\u064b"));
      } else {
        setPasswordError(err?.message || t("Failed to change password", "\u0641\u0634\u0644 \u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"));
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLinkEmail = async () => {
    setLinkError("");
    setLinkSuccess(false);
    if (!linkEmail.trim() || !linkEmail.includes("@")) {
      setLinkError(t("Please enter a valid email", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d"));
      return;
    }
    if (linkPassword.length < 6) {
      setLinkError(t("Password must be at least 6 characters", "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644"));
      return;
    }
    setLinkingAccount(true);
    try {
      await linkEmailToPhone(linkEmail.trim(), linkPassword);
      setLinkSuccess(true);
      setLinkEmail("");
      setLinkPassword("");
      setTimeout(() => { setShowLinkEmail(false); setLinkSuccess(false); }, 1500);
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        setLinkError(t("This email is already linked to another account", "\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0645\u0631\u062a\u0628\u0637 \u0628\u062d\u0633\u0627\u0628 \u0622\u062e\u0631"));
      } else if (code === "auth/credential-already-in-use") {
        setLinkError(t("This credential is already linked to another account", "\u0647\u0630\u0627 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0645\u0631\u062a\u0628\u0637 \u0628\u062d\u0633\u0627\u0628 \u0622\u062e\u0631"));
      } else if (code === "auth/weak-password") {
        setLinkError(t("Password is too weak", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0636\u0639\u064a\u0641\u0629"));
      } else {
        setLinkError(err?.message || t("Failed to link account", "\u0641\u0634\u0644 \u0631\u0628\u0637 \u0627\u0644\u062d\u0633\u0627\u0628"));
      }
    } finally {
      setLinkingAccount(false);
    }
  };

  const initials = profile.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : user?.name
      ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
      : "";

  const isPasswordUser = user?.authProvider === "password";
  const isPhoneUser = user?.authProvider === "phone";
  const canLinkEmail = isPhoneUser && !user?.email;

  const formatDOB = (dob?: string) => {
    if (!dob) return "";
    const parts = dob.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dob;
  };

  const ageFromDOB = (dob?: string): string => {
    if (!dob) return "";
    const date = new Date(dob);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const m = now.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--;
    return age >= 0 ? age.toString() : "";
  };

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
              <Ionicons name="person" size={32} color="#fff" />
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
            {ageFromDOB(profile.dateOfBirth) ? (
              <Text style={[styles.profileAge, isRTL && { textAlign: "right" }]}>
                {ageFromDOB(profile.dateOfBirth)} {t("years old", "\u0633\u0646\u0629")}
                {profile.bloodType ? ` \u00B7 ${profile.bloodType}` : ""}
              </Text>
            ) : null}
          </View>
        </View>

        <CollapsibleSection
          title={t("Personal Information", "\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0634\u062e\u0635\u064a\u0629")}
          icon={<Ionicons name="person-circle-outline" size={20} color={Colors.light.primary} />}
          summary={profile.name || t("Not set", "\u063a\u064a\u0631 \u0645\u062d\u062f\u062f")}
          isRTL={isRTL}
          testID="section-personal-info"
        >
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
              <Ionicons name="calendar-outline" size={17} color={Colors.light.primary} />
            </View>
            <Text style={styles.fieldLabel}>{t("Date of Birth", "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u064a\u0644\u0627\u062f")}</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldInputMedium]}
              value={profile.dateOfBirth || ""}
              onChangeText={(v) => updateProfile({ dateOfBirth: v || undefined })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.light.textTertiary}
              keyboardType="numbers-and-punctuation"
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
        </CollapsibleSection>

        <CollapsibleSection
          title={t("Body Measurements", "\u0627\u0644\u0642\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u062c\u0633\u062f\u064a\u0629")}
          icon={<MaterialCommunityIcons name="human-male-height" size={20} color={Colors.light.primary} />}
          summary={
            profile.weight || profile.height
              ? [
                  profile.weight ? `${profile.weight} ${t("kg", "\u0643\u063a")}` : "",
                  profile.height ? `${profile.height} ${t("cm", "\u0633\u0645")}` : "",
                ].filter(Boolean).join(" / ")
              : t("Not set", "\u063a\u064a\u0631 \u0645\u062d\u062f\u062f")
          }
          isRTL={isRTL}
          testID="section-body-measurements"
        >
        <View style={styles.card}>
          <View style={[styles.measureRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.measureItem, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={styles.fieldIconWrap}>
                <MaterialCommunityIcons name="weight-kilogram" size={17} color={Colors.light.primary} />
              </View>
              <Text style={styles.measureLabel}>{t("Weight", "\u0627\u0644\u0648\u0632\u0646")}</Text>
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
            <View style={styles.measureDivider} />
            <View style={[styles.measureItem, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={styles.fieldIconWrap}>
                <MaterialCommunityIcons name="human-male-height" size={17} color={Colors.light.primary} />
              </View>
              <Text style={styles.measureLabel}>{t("Height", "\u0627\u0644\u0637\u0648\u0644")}</Text>
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
          </View>
        </View>
        </CollapsibleSection>

        <CollapsibleSection
          title={t("Medical History", "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0637\u0628\u064a")}
          icon={<Ionicons name="medkit-outline" size={20} color={Colors.light.primary} />}
          summary={
            (() => {
              const cCount = (profile.conditions || []).length;
              const aCount = (profile.allergies || []).length;
              if (cCount === 0 && aCount === 0) return t("None added", "\u0644\u0627 \u064a\u0648\u062c\u062f");
              const parts: string[] = [];
              if (cCount > 0) parts.push(`${cCount} ${cCount === 1 ? t("condition", "\u062d\u0627\u0644\u0629") : t("conditions", "\u062d\u0627\u0644\u0627\u062a")}`);
              if (aCount > 0) parts.push(`${aCount} ${aCount === 1 ? t("allergy", "\u062d\u0633\u0627\u0633\u064a\u0629") : t("allergies", "\u062d\u0633\u0627\u0633\u064a\u0627\u062a")}`);
              return parts.join(", ");
            })()
          }
          isRTL={isRTL}
          testID="section-medical-history"
        >
        <View style={styles.card}>
          <Text style={[styles.subSectionLabel, isRTL && { textAlign: "right" }]}>
            {t("Conditions", "\u0627\u0644\u062d\u0627\u0644\u0627\u062a \u0627\u0644\u0637\u0628\u064a\u0629")}
          </Text>
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
          <View style={[styles.divider, { marginVertical: 14 }]} />
          <Text style={[styles.subSectionLabel, isRTL && { textAlign: "right" }]}>
            {t("Allergies", "\u0627\u0644\u062d\u0633\u0627\u0633\u064a\u0629")}
          </Text>
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
        </CollapsibleSection>

        <CollapsibleSection
          title={t("Emergency Contact", "\u062c\u0647\u0629 \u0627\u062a\u0635\u0627\u0644 \u0627\u0644\u0637\u0648\u0627\u0631\u0626")}
          icon={<Ionicons name="call-outline" size={20} color={Colors.light.emergency} />}
          summary={profile.emergencyContact?.name || t("Not set", "\u063a\u064a\u0631 \u0645\u062d\u062f\u062f")}
          isRTL={isRTL}
          testID="section-emergency-contact"
        >
        <View style={styles.card}>
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.fieldIconWrap, { backgroundColor: Colors.light.emergencyLight }]}>
              <Ionicons name="person-outline" size={17} color={Colors.light.emergency} />
            </View>
            <Text style={styles.fieldLabel}>{t("Name", "\u0627\u0644\u0627\u0633\u0645")}</Text>
            <TextInput
              style={[styles.fieldInput, isRTL && { textAlign: "right" }]}
              value={profile.emergencyContact?.name || ""}
              onChangeText={(v) => updateEmergencyContact({ name: v || undefined })}
              placeholder={t("Contact name", "\u0627\u0633\u0645 \u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644")}
              placeholderTextColor={Colors.light.textTertiary}
            />
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.fieldIconWrap, { backgroundColor: Colors.light.emergencyLight }]}>
              <Ionicons name="call-outline" size={17} color={Colors.light.emergency} />
            </View>
            <Text style={styles.fieldLabel}>{t("Phone", "\u0627\u0644\u0647\u0627\u062a\u0641")}</Text>
            <TextInput
              style={[styles.fieldInput, isRTL && { textAlign: "right" }]}
              value={profile.emergencyContact?.phone || ""}
              onChangeText={(v) => updateEmergencyContact({ phone: v || undefined })}
              placeholder={t("Phone number", "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641")}
              placeholderTextColor={Colors.light.textTertiary}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.divider} />
          <View style={[styles.fieldRow, { paddingVertical: 12 }, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={[styles.fieldIconWrap, { backgroundColor: Colors.light.emergencyLight }]}>
              <Ionicons name="people-outline" size={17} color={Colors.light.emergency} />
            </View>
            <Text style={[styles.fieldLabel, { marginRight: 8 }]}>{t("Relationship", "\u0627\u0644\u0639\u0644\u0627\u0642\u0629")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.chipRow}>
                {RELATIONSHIPS.map((r) => (
                  <Pressable
                    key={r.key}
                    style={[
                      styles.chip,
                      profile.emergencyContact?.relationship === r.key && styles.chipActiveEmergency,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateEmergencyContact({
                        relationship: r.key === profile.emergencyContact?.relationship ? undefined : r.key,
                      });
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        profile.emergencyContact?.relationship === r.key && styles.chipTextActiveEmergency,
                      ]}
                    >
                      {t(r.en, r.ar)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
        </CollapsibleSection>

        {user && (
          <CollapsibleSection
            title={t("Account & Security", "\u0627\u0644\u062d\u0633\u0627\u0628 \u0648\u0627\u0644\u0623\u0645\u0627\u0646")}
            icon={<Ionicons name="shield-checkmark-outline" size={20} color={Colors.light.primary} />}
            summary={user.email || user.phone || user.name || ""}
            isRTL={isRTL}
            testID="section-account-security"
          >
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
                  <View style={[{ flex: 1 }, isRTL && { alignItems: "flex-end" }]}>
                    <Text style={styles.prefLabel} numberOfLines={1}>
                      {user.email || user.phone || user.name}
                    </Text>
                    {user.authProvider && (
                      <Text style={styles.prefDesc}>
                        {user.authProvider === "google.com"
                          ? "Google"
                          : user.authProvider === "password"
                            ? t("Email & Password", "\u0628\u0631\u064a\u062f \u0648\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631")
                            : user.authProvider === "phone"
                              ? t("Phone", "\u0647\u0627\u062a\u0641")
                              : user.authProvider}
                      </Text>
                    )}
                  </View>
                </View>
                {user.authProvider && user.authProvider !== "password" && (
                  <View style={styles.providerBadge}>
                    <MaterialCommunityIcons
                      name={user.authProvider === "google.com" ? "google" : "shield-check"}
                      size={14}
                      color={Colors.light.textSecondary}
                    />
                  </View>
                )}
              </View>

              {isPasswordUser && (
                <>
                  <View style={styles.divider} />
                  <View style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
                      <View style={[styles.prefIconWrap, { backgroundColor: isEmailVerified ? Colors.light.successLight : Colors.light.warningLight }]}>
                        <Ionicons
                          name={isEmailVerified ? "checkmark-circle" : "alert-circle"}
                          size={18}
                          color={isEmailVerified ? Colors.light.success : Colors.light.warning}
                        />
                      </View>
                      <View style={isRTL ? { alignItems: "flex-end" } : undefined}>
                        <Text style={styles.prefLabel}>
                          {t("Email Verification", "\u062a\u062d\u0642\u0642 \u0627\u0644\u0628\u0631\u064a\u062f")}
                        </Text>
                        <Text style={[styles.prefDesc, { color: isEmailVerified ? Colors.light.success : Colors.light.warning }]}>
                          {isEmailVerified
                            ? t("Verified", "\u0645\u0648\u062b\u0642")
                            : t("Not verified", "\u063a\u064a\u0631 \u0645\u0648\u062b\u0642")}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.verificationBadge, isEmailVerified ? styles.verifiedBadge : styles.unverifiedBadge]}>
                      <Text style={[styles.verificationBadgeText, isEmailVerified ? styles.verifiedBadgeText : styles.unverifiedBadgeText]}>
                        {isEmailVerified ? t("Verified", "\u0645\u0648\u062b\u0642") : t("Pending", "\u0645\u0639\u0644\u0642")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <Pressable
                    style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPasswordError("");
                      setPasswordSuccess(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setShowPasswordModal(true);
                    }}
                  >
                    <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
                      <View style={[styles.prefIconWrap, { backgroundColor: "#EFF6FF" }]}>
                        <Ionicons name="lock-closed-outline" size={18} color="#3B82F6" />
                      </View>
                      <Text style={styles.prefLabel}>
                        {t("Change Password", "\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.light.textTertiary} />
                  </Pressable>
                </>
              )}

              {canLinkEmail && (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    style={[styles.prefRow, isRTL && { flexDirection: "row-reverse" }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowLinkEmail(!showLinkEmail);
                      setLinkError("");
                      setLinkSuccess(false);
                    }}
                  >
                    <View style={[styles.prefLeft, isRTL && { flexDirection: "row-reverse" }]}>
                      <View style={[styles.prefIconWrap, { backgroundColor: "#EFF6FF" }]}>
                        <Ionicons name="link-outline" size={18} color="#3B82F6" />
                      </View>
                      <View style={isRTL ? { alignItems: "flex-end" } : undefined}>
                        <Text style={styles.prefLabel}>
                          {t("Add Email & Password", "\u0625\u0636\u0627\u0641\u0629 \u0628\u0631\u064a\u062f \u0648\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631")}
                        </Text>
                        <Text style={styles.prefDesc}>
                          {t("Link email to your phone account", "\u0631\u0628\u0637 \u0627\u0644\u0628\u0631\u064a\u062f \u0628\u062d\u0633\u0627\u0628 \u0647\u0627\u062a\u0641\u0643")}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name={showLinkEmail ? "chevron-up" : "chevron-forward"} size={18} color={Colors.light.textTertiary} />
                  </Pressable>
                  {showLinkEmail && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                      <View style={[styles.linkInputWrapper, { marginBottom: 10 }]}>
                        <Ionicons name="mail-outline" size={18} color={Colors.light.textTertiary} style={{ marginRight: 8 }} />
                        <TextInput
                          style={styles.linkInput}
                          value={linkEmail}
                          onChangeText={setLinkEmail}
                          placeholder={t("Email address", "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a")}
                          placeholderTextColor={Colors.light.textTertiary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={[styles.linkInputWrapper, { marginBottom: 12 }]}>
                        <Ionicons name="lock-closed-outline" size={18} color={Colors.light.textTertiary} style={{ marginRight: 8 }} />
                        <TextInput
                          style={styles.linkInput}
                          value={linkPassword}
                          onChangeText={setLinkPassword}
                          placeholder={t("Password (min 6 chars)", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 (6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644)")}
                          placeholderTextColor={Colors.light.textTertiary}
                          secureTextEntry
                        />
                      </View>
                      {linkError ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, backgroundColor: Colors.light.emergencyLight, padding: 10, borderRadius: 10 }}>
                          <Ionicons name="alert-circle" size={14} color={Colors.light.emergency} />
                          <Text style={{ flex: 1, fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.light.emergency }}>{linkError}</Text>
                        </View>
                      ) : null}
                      {linkSuccess ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, backgroundColor: Colors.light.successLight, padding: 10, borderRadius: 10 }}>
                          <Ionicons name="checkmark-circle" size={14} color={Colors.light.success} />
                          <Text style={{ flex: 1, fontSize: 12, fontFamily: "DMSans_500Medium", color: Colors.light.success }}>
                            {t("Email linked! Verification email sent.", "\u062a\u0645 \u0631\u0628\u0637 \u0627\u0644\u0628\u0631\u064a\u062f! \u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u062a\u062d\u0642\u0642.")}
                          </Text>
                        </View>
                      ) : null}
                      <Pressable
                        style={({ pressed }) => [{
                          backgroundColor: Colors.light.primary,
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: "center" as const,
                          opacity: (linkingAccount || pressed) ? 0.8 : 1,
                        }]}
                        onPress={handleLinkEmail}
                        disabled={linkingAccount}
                      >
                        {linkingAccount ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ fontSize: 14, fontFamily: "DMSans_600SemiBold", color: "#fff" }}>
                            {t("Link Email", "\u0631\u0628\u0637 \u0627\u0644\u0628\u0631\u064a\u062f")}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title={t("App Preferences", "\u062a\u0641\u0636\u064a\u0644\u0627\u062a \u0627\u0644\u062a\u0637\u0628\u064a\u0642")}
          icon={<Ionicons name="settings-outline" size={20} color={Colors.light.primary} />}
          summary={settings.language === "en" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}
          isRTL={isRTL}
          testID="section-app-preferences"
        >
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
        </CollapsibleSection>

        <CollapsibleSection
          title={t("Danger Zone", "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062e\u0637\u0631")}
          icon={<Ionicons name="warning-outline" size={20} color={Colors.light.emergency} />}
          summary={t("Log out", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c")}
          isRTL={isRTL}
          titleColor={Colors.light.emergency}
          testID="section-danger-zone"
        >
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
        </CollapsibleSection>

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

      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, isRTL && { textAlign: "right" }]}>
                {t("Change Password", "\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
              </Text>
              <Pressable onPress={() => setShowPasswordModal(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalInputLabel, isRTL && { textAlign: "right" }]}>
                {t("Current Password", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629")}
              </Text>
              <TextInput
                style={[styles.modalInput, isRTL && { textAlign: "right" }]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                placeholder={t("Enter current password", "\u0623\u062f\u062e\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a\u0629")}
                placeholderTextColor={Colors.light.textTertiary}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalInputLabel, isRTL && { textAlign: "right" }]}>
                {t("New Password", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629")}
              </Text>
              <TextInput
                style={[styles.modalInput, isRTL && { textAlign: "right" }]}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                placeholder={t("At least 6 characters", "\u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 6 \u0623\u062d\u0631\u0641")}
                placeholderTextColor={Colors.light.textTertiary}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={[styles.modalInputLabel, isRTL && { textAlign: "right" }]}>
                {t("Confirm Password", "\u062a\u0623\u0643\u064a\u062f \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
              </Text>
              <TextInput
                style={[styles.modalInput, isRTL && { textAlign: "right" }]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                placeholder={t("Re-enter new password", "\u0623\u0639\u062f \u0625\u062f\u062e\u0627\u0644 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
                placeholderTextColor={Colors.light.textTertiary}
              />
            </View>

            {passwordError ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={Colors.light.emergency} />
                <Text style={styles.errorText}>{passwordError}</Text>
              </View>
            ) : null}

            {passwordSuccess ? (
              <View style={styles.successRow}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.light.success} />
                <Text style={styles.successText}>
                  {t("Password changed successfully", "\u062a\u0645 \u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0628\u0646\u062c\u0627\u062d")}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.modalButton, changingPassword && { opacity: 0.6 }]}
              onPress={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? (
                <Text style={styles.modalButtonText}>...</Text>
              ) : (
                <Text style={styles.modalButtonText}>
                  {t("Update Password", "\u062a\u062d\u062f\u064a\u062b \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 24,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  avatarGradient: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 24,
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
  profileAge: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 2,
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
  subSectionLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 10,
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
  fieldInputMedium: {
    minWidth: 100,
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
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  measureItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  measureLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  measureDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 12,
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
  chipActiveEmergency: {
    backgroundColor: Colors.light.emergencyLight,
    borderColor: "#FECACA",
  },
  chipText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  chipTextActive: {
    color: Colors.light.primary,
  },
  chipTextActiveEmergency: {
    color: Colors.light.emergency,
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
  verificationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  verifiedBadge: {
    backgroundColor: Colors.light.successLight,
    borderColor: "#A7F3D0",
  },
  unverifiedBadge: {
    backgroundColor: Colors.light.warningLight,
    borderColor: "#FDE68A",
  },
  verificationBadgeText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
  },
  verifiedBadgeText: {
    color: Colors.light.success,
  },
  unverifiedBadgeText: {
    color: Colors.light.warning,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  modalInputGroup: {
    marginBottom: 16,
  },
  modalInputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.emergencyLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.emergency,
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.successLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.success,
  },
  modalButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  linkInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 12,
    height: 46,
  },
  linkInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
  },
});
