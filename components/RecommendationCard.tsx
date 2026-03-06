import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { AssessmentResult, MedicineRecommendation, StructuredFollowUp } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

interface RecommendationCardProps {
  result: AssessmentResult;
  onFindPharmacy?: () => void;
  onFindLab?: () => void;
  onOrderMedicines?: (meds: { name: string; dosage: string; frequency: string }[]) => void;
}

const TRIAGE_CONFIG: Record<string, { color: string; bg: string; labelEn: string; labelAr: string }> = {
  immediate: { color: "#EF4444", bg: "#FEF2F2", labelEn: "IMMEDIATE", labelAr: "فوري" },
  "within-hours": { color: "#F97316", bg: "#FFF7ED", labelEn: "WITHIN HOURS", labelAr: "خلال ساعات" },
  "within-24h": { color: "#F59E0B", bg: "#FFFBEB", labelEn: "WITHIN 24H", labelAr: "خلال 24 ساعة" },
  "within-week": { color: "#3B82F6", bg: "#EFF6FF", labelEn: "WITHIN A WEEK", labelAr: "خلال أسبوع" },
  routine: { color: "#10B981", bg: "#ECFDF5", labelEn: "ROUTINE", labelAr: "روتيني" },
};

const COST_LABELS: Record<string, { en: string; ar: string }> = {
  "free-MOH": { en: "Free (MOH)", ar: "مجاني (وزارة الصحة)" },
  low: { en: "Low Cost", ar: "تكلفة منخفضة" },
  moderate: { en: "Moderate Cost", ar: "تكلفة متوسطة" },
  high: { en: "High Cost", ar: "تكلفة عالية" },
};

const AVAILABLE_LABELS: Record<string, { en: string; ar: string }> = {
  "MOH-lab": { en: "MOH Lab", ar: "مختبر وزارة الصحة" },
  "private-lab": { en: "Private Lab", ar: "مختبر خاص" },
  hospital: { en: "Hospital", ar: "مستشفى" },
  "any-pharmacy": { en: "Any Pharmacy", ar: "أي صيدلية" },
};

export function RecommendationCard({
  result,
  onFindPharmacy,
  onFindLab,
  onOrderMedicines,
}: RecommendationCardProps) {
  const { t, isRTL } = useSettings();

  const medicines = result?.recommendations?.pathwayA?.medicines || [];
  const [selectedMeds, setSelectedMeds] = useState<Record<number, boolean>>(
    () => Object.fromEntries(medicines.map((_, i) => [i, true]))
  );

  const toggleMed = (index: number) => {
    setSelectedMeds((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const selectedCount = Object.values(selectedMeds).filter(Boolean).length;

  const handleOrderSelected = () => {
    if (!onOrderMedicines) return;
    const selected = medicines
      .filter((_, i) => selectedMeds[i])
      .map((med) => ({ name: med.name, dosage: med.dosage, frequency: med.frequency }));
    if (selected.length > 0) onOrderMedicines(selected);
  };

  const severity = result?.assessment?.severity || "moderate";

  const severityColor =
    severity === "severe" || severity === "urgent"
      ? Colors.light.emergency
      : severity === "moderate"
        ? Colors.light.warning
        : Colors.light.success;

  const severityBg =
    severity === "severe" || severity === "urgent"
      ? Colors.light.emergencyLight
      : severity === "moderate"
        ? Colors.light.warningLight
        : Colors.light.successLight;

  const triageLevel = result?.triageLevel;
  const triageCfg = triageLevel ? TRIAGE_CONFIG[triageLevel] : null;

  const followUp = result?.followUp;
  const isStructuredFollowUp = followUp && typeof followUp === "object" && "returnIn" in followUp;

  return (
    <View style={styles.container}>
      <View style={[styles.header, isRTL && { flexDirection: "row-reverse" }]}>
        <View style={[styles.badgeRow, isRTL && { flexDirection: "row-reverse" }]}>
          <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
            <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
            <Text style={[styles.severityText, { color: severityColor }]}>
              {isRTL
                ? (severity === "severe" || severity === "urgent" ? "شديد" : severity === "moderate" ? "متوسط" : "خفيف")
                : severity.toUpperCase()}
            </Text>
          </View>
          {triageCfg && (
            <View style={[styles.triageBadge, { backgroundColor: triageCfg.bg }]}>
              <Ionicons name="timer-outline" size={12} color={triageCfg.color} />
              <Text style={[styles.triageText, { color: triageCfg.color }]}>
                {isRTL ? triageCfg.labelAr : triageCfg.labelEn}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.confidence}>
          {result?.assessment?.confidence || "—"} {t("confidence", "الثقة")}
        </Text>
      </View>

      <Text style={[styles.condition, isRTL && { textAlign: "right" }]}>{result?.assessment?.condition || t("Assessment", "تقييم")}</Text>
      <Text style={[styles.description, isRTL && { textAlign: "right" }]}>{result?.assessment?.description || ""}</Text>

      {result?.differentials && result.differentials.length > 0 && (
        <View style={styles.differentialsContainer}>
          <View style={[styles.sectionHeader, isRTL && { flexDirection: "row-reverse" }]}>
            <MaterialCommunityIcons name="format-list-checks" size={18} color={Colors.light.primary} />
            <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>
              {t("Differential Diagnoses", "التشخيصات التفريقية")}
            </Text>
          </View>
          {result.differentials.map((diff, i) => (
            <View key={i} style={styles.diffCard}>
              <View style={[styles.diffHeader, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[styles.diffCondition, isRTL && { textAlign: "right" }]}>{diff.condition}</Text>
                <View style={styles.diffLikelihoodBadge}>
                  <Text style={styles.diffLikelihoodText}>{diff.likelihood}</Text>
                </View>
              </View>
              <View style={[styles.diffFeatureRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.light.textTertiary} />
                <Text style={[styles.diffFeatureText, isRTL && { textAlign: "right" }]}>
                  {diff.distinguishingFeature}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {result?.warnings && result.warnings.length > 0 && (
        <View style={styles.warningsContainer}>
          {result.warnings.map((warning, i) => (
            <View key={i} style={[styles.warningRow, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons
                name="alert-circle"
                size={16}
                color={Colors.light.accent}
              />
              <Text style={[styles.warningText, isRTL && { textAlign: "right" }]}>{warning}</Text>
            </View>
          ))}
        </View>
      )}

      {result?.recommendations?.pathwayA?.active &&
        medicines.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <MaterialCommunityIcons
                name="pill"
                size={20}
                color={Colors.light.primary}
              />
              <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Recommended Medicines", "الأدوية الموصى بها")}</Text>
            </View>
            {medicines.map((med, i) => (
              <View key={i} style={[styles.medCard, !selectedMeds[i] && styles.medCardDeselected]}>
                {onOrderMedicines && medicines.length > 1 && (
                  <Pressable
                    style={[styles.checkboxRow, isRTL && { flexDirection: "row-reverse" }]}
                    onPress={() => toggleMed(i)}
                    hitSlop={8}
                  >
                    <View style={[styles.checkbox, selectedMeds[i] && styles.checkboxChecked]}>
                      {selectedMeds[i] && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.checkboxLabel, isRTL && { textAlign: "right" }]}>
                      {selectedMeds[i]
                        ? t("Selected for order", "محدد للطلب")
                        : t("Tap to include", "اضغط لتضمينه")}
                    </Text>
                  </Pressable>
                )}

                <View style={[styles.medTitleRow, isRTL && { flexDirection: "row-reverse" }]}>
                  <MaterialCommunityIcons name="pill" size={18} color={Colors.light.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.medName, isRTL && { textAlign: "right" }]}>{med.name}</Text>
                    {med.localBrand && (
                      <Text style={[styles.medLocalBrand, isRTL && { textAlign: "right" }]}>{med.localBrand}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.medDivider} />

                <View style={styles.medDetailsGrid}>
                  <View style={[styles.medDetailRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.medDetailLabel, isRTL && { flexDirection: "row-reverse" }]}>
                      <MaterialCommunityIcons name="flask-outline" size={14} color={Colors.light.textTertiary} />
                      <Text style={styles.medDetailLabelText}>{t("Active Ingredient", "المادة الفعالة")}</Text>
                    </View>
                    <Text style={[styles.medDetailValue, isRTL && { textAlign: "right" }]}>{med.activeIngredient}</Text>
                  </View>

                  <View style={[styles.medDetailRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.medDetailLabel, isRTL && { flexDirection: "row-reverse" }]}>
                      <MaterialCommunityIcons name="medical-bag" size={14} color={Colors.light.textTertiary} />
                      <Text style={styles.medDetailLabelText}>{t("Class", "التصنيف")}</Text>
                    </View>
                    <Text style={[styles.medDetailValue, isRTL && { textAlign: "right" }]}>{med.class}</Text>
                  </View>

                  <View style={styles.medDivider} />

                  <View style={[styles.medDetailRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.medDetailLabel, isRTL && { flexDirection: "row-reverse" }]}>
                      <MaterialCommunityIcons name="needle" size={14} color={Colors.light.primary} />
                      <Text style={[styles.medDetailLabelText, { color: Colors.light.primary }]}>{t("Dosage", "الجرعة")}</Text>
                    </View>
                    <Text style={[styles.medDetailValueBold, isRTL && { textAlign: "right" }]}>{med.dosage}</Text>
                  </View>

                  <View style={[styles.medDetailRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.medDetailLabel, isRTL && { flexDirection: "row-reverse" }]}>
                      <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.light.primary} />
                      <Text style={[styles.medDetailLabelText, { color: Colors.light.primary }]}>{t("Frequency", "التكرار")}</Text>
                    </View>
                    <Text style={[styles.medDetailValueBold, isRTL && { textAlign: "right" }]}>{med.frequency}</Text>
                  </View>

                  <View style={[styles.medDetailRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={[styles.medDetailLabel, isRTL && { flexDirection: "row-reverse" }]}>
                      <MaterialCommunityIcons name="calendar-range" size={14} color={Colors.light.primary} />
                      <Text style={[styles.medDetailLabelText, { color: Colors.light.primary }]}>{t("Duration", "المدة")}</Text>
                    </View>
                    <Text style={[styles.medDetailValueBold, isRTL && { textAlign: "right" }]}>{med.duration}</Text>
                  </View>
                </View>

                {med.warnings && med.warnings.length > 0 && (
                  <View style={styles.medWarningBox}>
                    <View style={[styles.medWarningHeader, isRTL && { flexDirection: "row-reverse" }]}>
                      <Ionicons name="warning" size={14} color={Colors.light.accent} />
                      <Text style={styles.medWarningTitle}>{t("Warnings", "تحذيرات")}</Text>
                    </View>
                    {med.warnings.map((w, wi) => (
                      <Text key={wi} style={[styles.medWarningText, isRTL && { textAlign: "right" }]}>
                        {med.warnings.length > 1 ? `${wi + 1}. ` : ""}{w}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {onOrderMedicines && (
              <Pressable
                style={({ pressed }) => [
                  styles.orderAllBtn,
                  isRTL && { flexDirection: "row-reverse" },
                  pressed && { opacity: 0.8 },
                  selectedCount === 0 && styles.orderAllBtnDisabled,
                ]}
                onPress={handleOrderSelected}
                disabled={selectedCount === 0}
              >
                <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={selectedCount === 0 ? Colors.light.textTertiary : Colors.light.primary} />
                <Text style={[styles.orderAllBtnText, selectedCount === 0 && { color: Colors.light.textTertiary }]}>
                  {medicines.length === 1
                    ? t("Order for Delivery", "اطلب للتوصيل")
                    : selectedCount === medicines.length
                      ? t(`Order All ${medicines.length} Medicines`, `اطلب جميع الأدوية (${medicines.length})`)
                      : selectedCount > 0
                        ? t(`Order ${selectedCount} Selected`, `اطلب ${selectedCount} أدوية محددة`)
                        : t("Select medicines to order", "اختر الأدوية للطلب")}
                </Text>
              </Pressable>
            )}

            {onFindPharmacy && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.pharmacyButton,
                  isRTL && { flexDirection: "row-reverse" },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
                onPress={onFindPharmacy}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>{t("Find Nearest Pharmacy", "ابحث عن أقرب صيدلية")}</Text>
              </Pressable>
            )}
          </View>
        )}

      {result?.recommendations?.pathwayB?.active &&
        result.recommendations.pathwayB.tests?.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <MaterialCommunityIcons
                name="flask"
                size={20}
                color={Colors.light.primary}
              />
              <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Required Tests", "الفحوصات المطلوبة")}</Text>
            </View>
            {result.recommendations.pathwayB.tests.map((test, i) => (
              <View key={i} style={styles.testCard}>
                <View style={[styles.testHeader, isRTL && { flexDirection: "row-reverse" }]}>
                  <Text style={[styles.testName, isRTL && { textAlign: "right" }]}>{test.name}</Text>
                  <View
                    style={[
                      styles.urgencyBadge,
                      {
                        backgroundColor:
                          test.urgency === "emergency"
                            ? Colors.light.emergencyLight
                            : test.urgency === "urgent"
                              ? Colors.light.warningLight
                              : Colors.light.primarySurface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.urgencyText,
                        {
                          color:
                            test.urgency === "emergency"
                              ? Colors.light.emergency
                              : test.urgency === "urgent"
                                ? Colors.light.warning
                                : Colors.light.primary,
                        },
                      ]}
                    >
                      {isRTL
                        ? (test.urgency === "emergency" ? "طوارئ" : test.urgency === "urgent" ? "عاجل" : "روتيني")
                        : test.urgency.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.testType}>
                  {test.type === "lab" ? t("Laboratory Test", "فحص مخبري") : test.type === "referral" ? t("Specialist Referral", "تحويل لاختصاصي") : t("Medical Imaging", "تصوير طبي")}
                </Text>
                <Text style={[styles.testReason, isRTL && { textAlign: "right" }]}>{test.reason}</Text>

                {(test.estimatedCost || test.availableAt) && (
                  <View style={styles.testMetaRow}>
                    {test.estimatedCost && (
                      <View style={[styles.testMetaBadge, isRTL && { flexDirection: "row-reverse" }]}>
                        <MaterialCommunityIcons name="cash" size={13} color={Colors.light.textSecondary} />
                        <Text style={styles.testMetaText}>
                          {isRTL
                            ? (COST_LABELS[test.estimatedCost]?.ar || test.estimatedCost)
                            : (COST_LABELS[test.estimatedCost]?.en || test.estimatedCost)}
                        </Text>
                      </View>
                    )}
                    {test.availableAt && (
                      <View style={[styles.testMetaBadge, isRTL && { flexDirection: "row-reverse" }]}>
                        <MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.light.textSecondary} />
                        <Text style={styles.testMetaText}>
                          {isRTL
                            ? (AVAILABLE_LABELS[test.availableAt]?.ar || test.availableAt)
                            : (AVAILABLE_LABELS[test.availableAt]?.en || test.availableAt)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
            {onFindLab && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.labButton,
                  isRTL && { flexDirection: "row-reverse" },
                  pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                ]}
                onPress={onFindLab}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>
                  {t("Find Nearest Lab / Clinic", "ابحث عن أقرب مختبر / عيادة")}
                </Text>
              </Pressable>
            )}
          </View>
        )}

      <View style={styles.followUpSection}>
        {isStructuredFollowUp ? (
          <>
            <View style={[styles.followUpTimelineRow, isRTL && { flexDirection: "row-reverse" }]}>
              <MaterialCommunityIcons name="calendar-clock" size={18} color={Colors.light.primary} />
              <Text style={[styles.followUpTimelineText, isRTL && { textAlign: "right" }]}>
                {t("Follow up", "المتابعة")}: {(followUp as StructuredFollowUp).returnIn}
              </Text>
            </View>
            {(followUp as StructuredFollowUp).redFlags && (followUp as StructuredFollowUp).redFlags.length > 0 && (
              <View style={styles.redFlagsContainer}>
                <View style={[styles.redFlagsHeader, isRTL && { flexDirection: "row-reverse" }]}>
                  <Ionicons name="warning" size={15} color={Colors.light.emergency} />
                  <Text style={styles.redFlagsTitle}>
                    {t("Return immediately if", "عد فورًا إذا")}
                  </Text>
                </View>
                {(followUp as StructuredFollowUp).redFlags.map((flag, i) => (
                  <View key={i} style={[styles.redFlagRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={styles.redFlagBullet} />
                    <Text style={[styles.redFlagText, isRTL && { textAlign: "right" }]}>{flag}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.followUpContainer, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="time" size={16} color={Colors.light.textSecondary} />
            <Text style={[styles.followUpText, isRTL && { textAlign: "right" }]}>
              {typeof followUp === "string" ? followUp : ""}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    margin: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 12,
    fontWeight: "700" as const,
  },
  triageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  triageText: {
    fontSize: 10,
    fontWeight: "700" as const,
  },
  confidence: {
    fontSize: 12,
    color: Colors.light.textTertiary,
    fontWeight: "500" as const,
  },
  condition: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: Colors.light.text,
    marginBottom: 6,
  },
  description: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  differentialsContainer: {
    backgroundColor: Colors.light.primarySurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  diffCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  diffHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  diffCondition: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.light.text,
    flex: 1,
    marginRight: 8,
  },
  diffLikelihoodBadge: {
    backgroundColor: Colors.light.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  diffLikelihoodText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: Colors.light.primary,
  },
  diffFeatureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  diffFeatureText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 17,
    flex: 1,
  },
  warningsContainer: {
    backgroundColor: Colors.light.accentLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.accent,
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.light.text,
  },
  medCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  medCardDeselected: {
    opacity: 0.5,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.light.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: Colors.light.textTertiary,
  },
  medTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  medName: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.light.text,
  },
  medLocalBrand: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.light.primary,
    marginTop: 2,
  },
  medDivider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginVertical: 10,
  },
  medDetailsGrid: {
    gap: 8,
  },
  medDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 24,
  },
  medDetailLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 120,
  },
  medDetailLabelText: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: Colors.light.textTertiary,
  },
  medDetailValue: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.light.textSecondary,
    flex: 1,
    textAlign: "right",
  },
  medDetailValueBold: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.light.text,
    flex: 1,
    textAlign: "right",
  },
  medWarningBox: {
    backgroundColor: Colors.light.accentLight,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  medWarningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  medWarningTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.light.accent,
  },
  medWarningText: {
    fontSize: 12,
    color: Colors.light.accent,
    lineHeight: 17,
    paddingLeft: 20,
  },
  orderAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.primarySurface,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  orderAllBtnDisabled: {
    backgroundColor: Colors.light.background,
    borderColor: Colors.light.borderLight,
  },
  orderAllBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.light.primary,
  },
  testCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  testHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  testName: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.light.text,
    flex: 1,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  urgencyText: {
    fontSize: 10,
    fontWeight: "700" as const,
  },
  testType: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  testReason: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  testMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  testMetaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.light.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  testMetaText: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: Colors.light.textSecondary,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  pharmacyButton: {
    backgroundColor: Colors.light.primary,
  },
  labButton: {
    backgroundColor: Colors.light.primaryDark,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#fff",
  },
  followUpSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  followUpContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  followUpText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  followUpTimelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  followUpTimelineText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.light.primary,
  },
  redFlagsContainer: {
    backgroundColor: Colors.light.emergencyLight,
    borderRadius: 12,
    padding: 12,
  },
  redFlagsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  redFlagsTitle: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: Colors.light.emergency,
  },
  redFlagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  redFlagBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.emergency,
    marginTop: 5,
  },
  redFlagText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.emergencyDark,
    lineHeight: 17,
  },
});
