import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { AssessmentResult } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

interface RecommendationCardProps {
  result: AssessmentResult;
  onFindPharmacy?: () => void;
  onFindLab?: () => void;
  onOrderMedicine?: (med: { name: string; dosage: string; frequency: string }) => void;
}

export function RecommendationCard({
  result,
  onFindPharmacy,
  onFindLab,
  onOrderMedicine,
}: RecommendationCardProps) {
  const { t, isRTL } = useSettings();

  const severity = result?.assessment?.severity || "mild";

  const severityColor =
    severity === "severe"
      ? Colors.light.emergency
      : severity === "moderate"
        ? Colors.light.warning
        : Colors.light.success;

  const severityBg =
    severity === "severe"
      ? Colors.light.emergencyLight
      : severity === "moderate"
        ? Colors.light.warningLight
        : Colors.light.successLight;

  return (
    <View style={styles.container}>
      <View style={[styles.header, isRTL && { flexDirection: "row-reverse" }]}>
        <View style={[styles.severityBadge, { backgroundColor: severityBg }]}>
          <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
          <Text style={[styles.severityText, { color: severityColor }]}>
            {isRTL
              ? (severity === "severe" ? "شديد" : severity === "moderate" ? "متوسط" : "خفيف")
              : severity.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.confidence}>
          {result?.assessment?.confidence || "—"} {t("confidence", "الثقة")}
        </Text>
      </View>

      <Text style={[styles.condition, isRTL && { textAlign: "right" }]}>{result?.assessment?.condition || t("Assessment", "تقييم")}</Text>
      <Text style={[styles.description, isRTL && { textAlign: "right" }]}>{result?.assessment?.description || ""}</Text>

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
        result.recommendations.pathwayA.medicines?.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <MaterialCommunityIcons
                name="pill"
                size={20}
                color={Colors.light.primary}
              />
              <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Recommended Medicines", "الأدوية الموصى بها")}</Text>
            </View>
            {result.recommendations.pathwayA.medicines.map((med, i) => (
              <View key={i} style={styles.medCard}>
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

                {onOrderMedicine && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.orderMedBtn,
                      isRTL && { flexDirection: "row-reverse" },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => onOrderMedicine({ name: med.name, dosage: med.dosage, frequency: med.frequency })}
                  >
                    <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={Colors.light.primary} />
                    <Text style={styles.orderMedBtnText}>{t("Order for Delivery", "اطلب للتوصيل")}</Text>
                  </Pressable>
                )}
              </View>
            ))}
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
                  {test.type === "lab" ? t("Laboratory Test", "فحص مخبري") : t("Medical Imaging", "تصوير طبي")}
                </Text>
                <Text style={[styles.testReason, isRTL && { textAlign: "right" }]}>{test.reason}</Text>
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

      <View style={[styles.followUpContainer, isRTL && { flexDirection: "row-reverse" }]}>
        <Ionicons name="time" size={16} color={Colors.light.textSecondary} />
        <Text style={[styles.followUpText, isRTL && { textAlign: "right" }]}>{result?.followUp || ""}</Text>
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
  orderMedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.primarySurface,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  orderMedBtnText: {
    fontSize: 13,
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
  followUpContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  followUpText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
