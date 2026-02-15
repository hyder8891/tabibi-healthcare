import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { getMedications, saveMedications, getProfile, saveProfile } from "@/lib/storage";
import type { ScannedMedication } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";
import { useAvicenna } from "@/contexts/AvicennaContext";

interface InteractionResult {
  drug1: string;
  drug2: string;
  severity: "mild" | "moderate" | "severe" | "contraindicated";
  description: string;
  recommendation: string;
}

interface InteractionReport {
  interactions: InteractionResult[];
  overallRisk: "low" | "moderate" | "high" | "critical";
  summary: string;
}

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") {
    return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  }
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, settings } = useSettings();
  const { trackEvent } = useAvicenna();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCheckingInteractions, setIsCheckingInteractions] = useState(false);
  const [medicationList, setMedicationList] = useState<ScannedMedication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [interactionReport, setInteractionReport] = useState<InteractionReport | null>(null);
  const [expandedMedIndex, setExpandedMedIndex] = useState<number | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const scrollRef = useRef<ScrollView>(null);

  const pickImage = async (useCamera: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);

    let result;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError(t(
          "Camera permission is needed to scan medications.",
          "يجب السماح بالوصول إلى الكاميرا.",
        ));
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];

      let base64Data = asset.base64 || "";
      if (!base64Data && asset.uri) {
        try {
          base64Data = await uriToBase64(asset.uri);
        } catch (e) {
          console.error("Failed to convert image to base64:", e);
          setError(t("Failed to process image. Please try again.", "فشل في معالجة الصورة. حاول مرة أخرى."));
          return;
        }
      }

      if (!base64Data) {
        setError(t("Could not read image data. Please try again.", "لم أتمكن من قراءة بيانات الصورة. حاول مرة أخرى."));
        return;
      }

      analyzeImage(base64Data, asset.mimeType || "image/jpeg");
    }
  };

  const analyzeImage = async (base64: string, mimeType: string) => {
    setIsAnalyzing(true);
    setError(null);
    setInteractionReport(null);

    try {
      const apiUrl = getApiUrl();
      const url = new URL("/api/analyze-medication", apiUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await response.json();

      if (data.medications && !data.medications[0]?.error) {
        const newMeds = data.medications as ScannedMedication[];
        setMedicationList((prev) => {
          const existingNames = new Set(prev.map((m) => m.name.toLowerCase()));
          const uniqueNew = newMeds.filter((m) => !existingNames.has(m.name.toLowerCase()));
          return [...prev, ...uniqueNew];
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const existing = await getMedications();
        const combined = [...data.medications, ...existing].slice(0, 20);
        await saveMedications(combined);

        const profile = await getProfile();
        const newMedNames = data.medications.map((m: ScannedMedication) => m.name);
        const allMeds = [...new Set([...profile.medications, ...newMedNames])];
        await saveProfile({ ...profile, medications: allMeds });

        for (const med of newMeds) {
          trackEvent("medication_scanned", "scan", {
            name: med.name,
            genericName: med.genericName,
            dosage: med.dosage,
          }, [med.name, med.genericName || ""].filter(Boolean)).catch(() => {});
        }
      } else {
        setError(
          data.medications?.[0]?.error ||
            data.medications?.[0]?.suggestion ||
            t("Could not identify medication. Try a clearer photo.", "لم أتمكن من تحديد الدواء. حاول صورة أوضح."),
        );
      }
    } catch (err) {
      setError(t(
        "Failed to analyze medication. Please try again.",
        "فشل في تحليل الدواء. حاول مرة أخرى.",
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addManualMedication = () => {
    const name = manualName.trim();
    if (!name) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const exists = medicationList.some((m) => m.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      setError(t("This medication is already in your list.", "هذا الدواء موجود بالفعل في قائمتك."));
      setShowManualModal(false);
      setManualName("");
      return;
    }

    setMedicationList((prev) => [...prev, { name }]);
    setManualName("");
    setShowManualModal(false);
    setInteractionReport(null);
  };

  const removeMedication = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMedicationList((prev) => prev.filter((_, i) => i !== index));
    setInteractionReport(null);
    if (expandedMedIndex === index) setExpandedMedIndex(null);
  };

  const checkInteractions = async () => {
    if (medicationList.length < 2) {
      setError(t(
        "Add at least 2 medications to check interactions.",
        "أضف دواءين على الأقل للتحقق من التداخلات.",
      ));
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCheckingInteractions(true);
    setError(null);
    setInteractionReport(null);

    try {
      const apiUrl = getApiUrl();
      const url = new URL("/api/check-interactions", apiUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medications: medicationList.map((m) => m.name), language: settings.language }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setInteractionReport(data);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 300);
      }
    } catch (err) {
      setError(t(
        "Failed to check interactions. Please try again.",
        "فشل في التحقق من التداخلات. حاول مرة أخرى.",
      ));
    } finally {
      setIsCheckingInteractions(false);
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "contraindicated":
        return Colors.light.emergency;
      case "severe":
        return Colors.light.emergency;
      case "moderate":
        return Colors.light.warning;
      default:
        return Colors.light.success;
    }
  };

  const riskColor = (risk: string) => {
    switch (risk) {
      case "critical":
        return Colors.light.emergency;
      case "high":
        return Colors.light.emergency;
      case "moderate":
        return Colors.light.warning;
      default:
        return Colors.light.success;
    }
  };

  const riskBgColor = (risk: string) => {
    switch (risk) {
      case "critical":
        return Colors.light.emergencyLight;
      case "high":
        return Colors.light.emergencyLight;
      case "moderate":
        return Colors.light.warningLight;
      default:
        return Colors.light.successLight;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Drug Interactions", "التداخلات الدوائية")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {medicationList.length === 0 && !isAnalyzing && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="pill"
                size={40}
                color={Colors.light.primary}
              />
            </View>
            <Text style={[styles.emptyTitle, isRTL && { textAlign: "right" }]}>
              {t("Check Drug Interactions", "تحقق من التداخلات الدوائية")}
            </Text>
            <Text style={styles.emptyDesc}>
              {t(
                "Add your medications by scanning photos, choosing from gallery, or typing names manually. Then check for interactions between them.",
                "أضف أدويتك عن طريق تصوير العلبة أو اختيار صورة من المعرض أو كتابة الاسم يدوياً. ثم تحقق من التداخلات بينها.",
              )}
            </Text>
          </View>
        )}

        {isAnalyzing && (
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="small" color={Colors.light.primary} />
            <Text style={styles.analyzingCardText}>
              {t("Analyzing medication...", "جاري تحليل الدواء...")}
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.errorCard, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="alert-circle" size={20} color={Colors.light.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {medicationList.length > 0 && (
          <View style={styles.medListSection}>
            <View style={[styles.medListHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <Text style={[styles.medListTitle, isRTL && { textAlign: "right" }]}>
                {t("Your Medications", "أدويتك")} ({medicationList.length})
              </Text>
            </View>

            {medicationList.map((med, i) => {
              const isExpanded = expandedMedIndex === i;
              const hasDetails = med.genericName || med.dosage || med.drugClass ||
                (med.commonUses && med.commonUses.length > 0) ||
                (med.commonSideEffects && med.commonSideEffects.length > 0) ||
                (med.warnings && med.warnings.length > 0);

              return (
                <View key={`${med.name}-${i}`} style={styles.medCard}>
                  <Pressable
                    style={[styles.medCardHeader, isRTL && { flexDirection: "row-reverse" }]}
                    onPress={() => {
                      if (hasDetails) {
                        setExpandedMedIndex(isExpanded ? null : i);
                      }
                    }}
                  >
                    <View style={styles.medPillIcon}>
                      <MaterialCommunityIcons
                        name="pill"
                        size={18}
                        color={Colors.light.primary}
                      />
                    </View>
                    <View style={styles.medCardInfo}>
                      <Text style={[styles.medName, isRTL && { textAlign: "right" }]} numberOfLines={1}>
                        {med.name}
                      </Text>
                      {med.genericName && (
                        <Text style={[styles.medGeneric, isRTL && { textAlign: "right" }]} numberOfLines={1}>
                          {med.genericName}
                        </Text>
                      )}
                    </View>
                    {hasDetails && (
                      <Ionicons
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={Colors.light.textTertiary}
                      />
                    )}
                    <Pressable
                      onPress={() => removeMedication(i)}
                      hitSlop={10}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle" size={22} color={Colors.light.textLight} />
                    </Pressable>
                  </Pressable>

                  {isExpanded && hasDetails && (
                    <View style={styles.medDetails}>
                      {med.dosage && (
                        <View style={[styles.medRow, isRTL && { flexDirection: "row-reverse" }]}>
                          <Text style={[styles.medLabel, isRTL && { textAlign: "right" }]}>
                            {t("Dosage", "الجرعة")}
                          </Text>
                          <Text style={[styles.medValue, isRTL && { textAlign: "right" }]}>
                            {med.dosage} {med.form ? `(${med.form})` : ""}
                          </Text>
                        </View>
                      )}

                      {med.drugClass && (
                        <View style={[styles.medRow, isRTL && { flexDirection: "row-reverse" }]}>
                          <Text style={[styles.medLabel, isRTL && { textAlign: "right" }]}>
                            {t("Class", "الفئة")}
                          </Text>
                          <Text style={[styles.medValue, isRTL && { textAlign: "right" }]}>{med.drugClass}</Text>
                        </View>
                      )}

                      {med.commonUses && med.commonUses.length > 0 && (
                        <View style={styles.medSection}>
                          <Text style={[styles.medSectionTitle, isRTL && { textAlign: "right" }]}>
                            {t("Common Uses", "الاستخدامات")}
                          </Text>
                          {med.commonUses.map((use, j) => (
                            <View key={j} style={[styles.bulletRow, isRTL && { flexDirection: "row-reverse" }]}>
                              <View style={styles.bullet} />
                              <Text style={[styles.bulletText, isRTL && { textAlign: "right" }]}>{use}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {med.commonSideEffects && med.commonSideEffects.length > 0 && (
                        <View style={styles.medSection}>
                          <Text style={[styles.medSectionTitle, isRTL && { textAlign: "right" }]}>
                            {t("Side Effects", "الآثار الجانبية")}
                          </Text>
                          {med.commonSideEffects.map((effect, j) => (
                            <View key={j} style={[styles.bulletRow, isRTL && { flexDirection: "row-reverse" }]}>
                              <View style={[styles.bullet, { backgroundColor: Colors.light.warning }]} />
                              <Text style={[styles.bulletText, isRTL && { textAlign: "right" }]}>{effect}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {med.warnings && med.warnings.length > 0 && (
                        <View style={styles.warningSection}>
                          {med.warnings.map((w, j) => (
                            <View key={j} style={[styles.warningRow, isRTL && { flexDirection: "row-reverse" }]}>
                              <Ionicons name="warning" size={14} color={Colors.light.accent} />
                              <Text style={[styles.warningText, isRTL && { textAlign: "right" }]}>{w}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.addMethodsSection}>
          <Text style={[styles.addMethodsTitle, isRTL && { textAlign: "right" }]}>
            {medicationList.length > 0
              ? t("Add More Medications", "أضف أدوية أخرى")
              : t("Add Medications", "أضف أدوية")}
          </Text>

          <View style={styles.addMethodsGrid}>
            <Pressable
              style={({ pressed }) => [
                styles.addMethodCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => pickImage(true)}
              disabled={isAnalyzing}
            >
              <View style={[styles.addMethodIcon, { backgroundColor: Colors.light.primarySurface }]}>
                <Ionicons name="camera" size={24} color={Colors.light.primary} />
              </View>
              <Text style={styles.addMethodLabel}>
                {t("Camera", "كاميرا")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.addMethodCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => pickImage(false)}
              disabled={isAnalyzing}
            >
              <View style={[styles.addMethodIcon, { backgroundColor: Colors.light.accentLight }]}>
                <Ionicons name="images" size={24} color={Colors.light.accent} />
              </View>
              <Text style={styles.addMethodLabel}>
                {t("Gallery", "المعرض")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.addMethodCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowManualModal(true);
              }}
            >
              <View style={[styles.addMethodIcon, { backgroundColor: "#F3E8FF" }]}>
                <Ionicons name="create" size={24} color="#7C3AED" />
              </View>
              <Text style={styles.addMethodLabel}>
                {t("Type Name", "اكتب الاسم")}
              </Text>
            </Pressable>
          </View>
        </View>

        {medicationList.length >= 2 && (
          <Pressable
            style={({ pressed }) => [
              styles.checkButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              isCheckingInteractions && { opacity: 0.7 },
            ]}
            onPress={checkInteractions}
            disabled={isCheckingInteractions}
          >
            {isCheckingInteractions ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="swap-horizontal-bold" size={22} color="#fff" />
            )}
            <Text style={styles.checkButtonText}>
              {isCheckingInteractions
                ? t("Checking...", "جاري التحقق...")
                : t("Check Interactions", "تحقق من التداخلات")}
            </Text>
          </Pressable>
        )}

        {interactionReport && (
          <View style={styles.interactionSection}>
            <View style={[styles.riskBanner, { backgroundColor: riskBgColor(interactionReport.overallRisk) }]}>
              <View style={[styles.riskBannerHeader, isRTL && { flexDirection: "row-reverse" }]}>
                <Ionicons
                  name={interactionReport.overallRisk === "low" ? "checkmark-circle" : "warning"}
                  size={22}
                  color={riskColor(interactionReport.overallRisk)}
                />
                <Text style={[styles.riskBannerTitle, { color: riskColor(interactionReport.overallRisk) }]}>
                  {interactionReport.overallRisk === "low"
                    ? t("Low Risk", "خطر منخفض")
                    : interactionReport.overallRisk === "moderate"
                      ? t("Moderate Risk", "خطر متوسط")
                      : interactionReport.overallRisk === "high"
                        ? t("High Risk", "خطر عالي")
                        : t("Critical Risk", "خطر حرج")}
                </Text>
              </View>
              <Text style={[styles.riskSummary, isRTL && { textAlign: "right" }]}>
                {interactionReport.summary}
              </Text>
            </View>

            {interactionReport.interactions && interactionReport.interactions.length > 0 && (
              <View style={styles.interactionsList}>
                <Text style={[styles.interactionsListTitle, isRTL && { textAlign: "right" }]}>
                  {t("Interaction Details", "تفاصيل التداخلات")}
                </Text>
                {interactionReport.interactions.map((interaction, i) => (
                  <View key={i} style={styles.interactionCard}>
                    <View style={[styles.interactionHeader, isRTL && { flexDirection: "row-reverse" }]}>
                      <View style={styles.interactionDrugs}>
                        <Text style={[styles.interactionDrugText, isRTL && { textAlign: "right" }]}>
                          {interaction.drug1}
                        </Text>
                        <MaterialCommunityIcons
                          name="swap-horizontal"
                          size={16}
                          color={Colors.light.textTertiary}
                        />
                        <Text style={[styles.interactionDrugText, isRTL && { textAlign: "right" }]}>
                          {interaction.drug2}
                        </Text>
                      </View>
                      <View style={[
                        styles.severityBadge,
                        {
                          backgroundColor: severityColor(interaction.severity) + "18",
                        },
                      ]}>
                        <Text style={[
                          styles.severityBadgeText,
                          { color: severityColor(interaction.severity) },
                        ]}>
                          {interaction.severity === "contraindicated"
                            ? t("Contraindicated", "ممنوع")
                            : interaction.severity === "severe"
                              ? t("Severe", "شديد")
                              : interaction.severity === "moderate"
                                ? t("Moderate", "متوسط")
                                : t("Mild", "خفيف")}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.interactionDesc, isRTL && { textAlign: "right" }]}>
                      {interaction.description}
                    </Text>
                    {interaction.recommendation && (
                      <View style={[styles.interactionRec, isRTL && { flexDirection: "row-reverse" }]}>
                        <Ionicons name="information-circle" size={16} color={Colors.light.primary} />
                        <Text style={[styles.interactionRecText, isRTL && { textAlign: "right" }]}>
                          {interaction.recommendation}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {interactionReport.interactions && interactionReport.interactions.length === 0 && (
              <View style={styles.noInteractionsCard}>
                <Ionicons name="checkmark-circle" size={32} color={Colors.light.success} />
                <Text style={styles.noInteractionsText}>
                  {t("No significant interactions found between your medications.",
                    "لم يتم العثور على تداخلات مهمة بين أدويتك.")}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showManualModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowManualModal(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, isRTL && { textAlign: "right" }]}>
                {t("Add Medication", "أضف دواء")}
              </Text>
              <Text style={[styles.modalDesc, isRTL && { textAlign: "right" }]}>
                {t("Type the medication name", "اكتب اسم الدواء")}
              </Text>
              <TextInput
                style={[styles.modalInput, isRTL && { textAlign: "right" }]}
                placeholder={t("e.g. Ibuprofen, Paracetamol...", "مثال: إيبوبروفين، باراسيتامول...")}
                placeholderTextColor={Colors.light.textLight}
                value={manualName}
                onChangeText={setManualName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addManualMedication}
              />
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalCancelBtn]}
                  onPress={() => {
                    setShowManualModal(false);
                    setManualName("");
                  }}
                >
                  <Text style={styles.modalCancelText}>{t("Cancel", "إلغاء")}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalAddBtn,
                    !manualName.trim() && { opacity: 0.5 },
                  ]}
                  onPress={addManualMedication}
                  disabled={!manualName.trim()}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.modalAddText}>{t("Add", "أضف")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
  },
  analyzingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.primarySurface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  analyzingCardText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.accentLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
    lineHeight: 20,
  },
  medListSection: {
    marginBottom: 20,
  },
  medListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  medListTitle: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  medCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: "hidden",
  },
  medCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  medPillIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  medCardInfo: {
    flex: 1,
  },
  medName: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  medGeneric: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  removeButton: {
    padding: 4,
  },
  medDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.divider,
  },
  medRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  medLabel: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  medValue: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  medSection: {
    marginTop: 10,
  },
  medSectionTitle: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.light.primary,
  },
  bulletText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    flex: 1,
  },
  warningSection: {
    backgroundColor: Colors.light.accentLight,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 4,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
    lineHeight: 17,
  },
  addMethodsSection: {
    marginBottom: 20,
  },
  addMethodsTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  addMethodsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  addMethodCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    gap: 8,
  },
  addMethodIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addMethodLabel: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  checkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  checkButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
  },
  interactionSection: {
    marginBottom: 8,
  },
  riskBanner: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  riskBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  riskBannerTitle: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
  },
  riskSummary: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    lineHeight: 21,
  },
  interactionsList: {
    gap: 12,
  },
  interactionsListTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  interactionCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  interactionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  interactionDrugs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    flexWrap: "wrap",
  },
  interactionDrugText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  severityBadgeText: {
    fontSize: 11,
    fontFamily: "DMSans_700Bold",
    textTransform: "capitalize" as const,
  },
  interactionDesc: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 19,
    marginBottom: 8,
  },
  interactionRec: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: Colors.light.primarySurface,
    borderRadius: 10,
    padding: 10,
  },
  interactionRecText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
    lineHeight: 18,
  },
  noInteractionsCard: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
    backgroundColor: Colors.light.successLight,
    borderRadius: 18,
    padding: 20,
  },
  noInteractionsText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.success,
    textAlign: "center",
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.light.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "web" ? 58 : 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.textLight,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  modalDesc: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: Colors.light.inputBg,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.surfaceSecondary,
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  modalAddBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.primary,
  },
  modalAddText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
});
