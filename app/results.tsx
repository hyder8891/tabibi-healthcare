import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { RecommendationCard } from "@/components/RecommendationCard";
import { MessageBubble } from "@/components/MessageBubble";
import { getAssessment } from "@/lib/storage";
import type { Assessment } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";
import { useAvicenna } from "@/contexts/AvicennaContext";

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const { assessmentId } = useLocalSearchParams<{ assessmentId: string }>();
  const { t, isRTL } = useSettings();
  const { recordAssessmentOutcome, trackEvent } = useAvicenna();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [outcomeTracked, setOutcomeTracked] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    if (assessmentId) {
      getAssessment(assessmentId).then((data) => {
        setAssessment(data);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    if (assessment?.result && !outcomeTracked) {
      setOutcomeTracked(true);
      recordAssessmentOutcome({
        chiefComplaint: assessment.chiefComplaint || "unknown",
        condition: assessment.result.assessment?.condition,
        severity: assessment.result.assessment?.severity,
        medicines: assessment.result.recommendations?.pathwayA?.medicines?.map(m => ({
          name: m.name,
          localBrand: m.localBrand,
          activeIngredient: m.activeIngredient,
        })),
        pathway: assessment.result.pathway,
      }).catch(() => {});

      trackEvent("assessment_viewed", "assessment", {
        assessmentId: assessment.id,
        condition: assessment.result.assessment?.condition,
      }, [assessment.result.assessment?.condition || "unknown"].filter(Boolean)).catch(() => {});
    }
  }, [assessment?.result, outcomeTracked]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!assessment) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: topInset }]}>
        <Ionicons name="document-text-outline" size={48} color={Colors.light.textTertiary} />
        <Text style={[styles.notFoundText, isRTL && { textAlign: "right" }]}>
          {t("Assessment not found", "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u062a\u0642\u064a\u064a\u0645")}
        </Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t("Go Back", "\u0639\u0648\u062f\u0629")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Assessment Results", "\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u062a\u0642\u064a\u064a\u0645")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryHeader}>
          <Text style={[styles.complaintLabel, isRTL && { textAlign: "right" }]}>
            {t("Chief Complaint", "\u0627\u0644\u0634\u0643\u0648\u0649 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629")}
          </Text>
          <Text style={[styles.complaint, isRTL && { textAlign: "right" }]}>
            {assessment.chiefComplaint || t("Health Assessment", "\u062a\u0642\u064a\u064a\u0645 \u0635\u062d\u064a")}
          </Text>
          <Text style={[styles.dateText, isRTL && { textAlign: "right" }]}>
            {new Date(assessment.date).toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {assessment.emergency && (
          <View style={[styles.emergencyBanner, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="warning" size={20} color="#fff" />
            <View style={styles.emergencyContent}>
              <Text style={styles.emergencyTitle}>
                {t("Emergency Detected", "\u062d\u0627\u0644\u0629 \u0637\u0648\u0627\u0631\u0626")}
              </Text>
              <Text style={styles.emergencyText}>
                {assessment.emergency.condition}
              </Text>
            </View>
          </View>
        )}

        {assessment.result && (
          <RecommendationCard
            result={assessment.result}
            onFindPharmacy={() =>
              router.push({
                pathname: "/routing",
                params: { type: "pharmacy" },
              })
            }
            onFindLab={() =>
              router.push({
                pathname: "/routing",
                params: {
                  type: "lab",
                  capabilities: assessment.result?.recommendations?.pathwayB?.tests
                    ?.map((t) => t.capabilities?.join(","))
                    .join("|") || "",
                },
              })
            }
            onOrderMedicine={(med) =>
              router.push({
                pathname: "/order",
                params: {
                  medicineName: med.name,
                  medicineDosage: med.dosage,
                  medicineFrequency: med.frequency,
                },
              })
            }
          />
        )}

        {!assessment.result && !assessment.emergency && (
          <View style={[styles.noResultCard, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons
              name="information-circle"
              size={24}
              color={Colors.light.textTertiary}
            />
            <Text style={[styles.noResultText, isRTL && { textAlign: "right" }]}>
              {t(
                "This assessment was incomplete. Start a new assessment for a full evaluation.",
                "\u0647\u0630\u0627 \u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u063a\u064a\u0631 \u0645\u0643\u062a\u0645\u0644. \u0627\u0628\u062f\u0623 \u062a\u0642\u064a\u064a\u0645\u0627\u064b \u062c\u062f\u064a\u062f\u0627\u064b.",
              )}
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.chatToggle, isRTL && { flexDirection: "row-reverse" }]}
          onPress={() => setShowChat(!showChat)}
        >
          <Ionicons
            name={showChat ? "chevron-up" : "chevron-down"}
            size={20}
            color={Colors.light.textSecondary}
          />
          <Text style={styles.chatToggleText}>
            {showChat
              ? t("Hide Conversation", "\u0625\u062e\u0641\u0627\u0621 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629")
              : t(
                  `View Conversation (${assessment.messages.length} messages)`,
                  `\u0639\u0631\u0636 \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 (${assessment.messages.length} \u0631\u0633\u0627\u0626\u0644)`,
                )}
          </Text>
        </Pressable>

        {showChat && (
          <View style={styles.chatContainer}>
            {assessment.messages
              .filter((m) => m.id !== "welcome")
              .map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
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
    paddingBottom: 40,
  },
  summaryHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 4,
  },
  complaintLabel: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  complaint: {
    fontSize: 26,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  emergencyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.emergency,
    margin: 16,
    padding: 18,
    borderRadius: 18,
  },
  emergencyContent: {
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 15,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    marginBottom: 2,
  },
  emergencyText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.9)",
  },
  noResultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.surface,
    margin: 16,
    padding: 16,
    borderRadius: 18,
  },
  noResultText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.light.primary,
  },
  backButtonText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  chatToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  chatToggleText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  chatContainer: {
    marginTop: 12,
    paddingBottom: 20,
  },
});
