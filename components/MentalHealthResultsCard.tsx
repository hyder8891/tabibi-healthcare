import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/contexts/SettingsContext";
import type { MentalHealthResults } from "@/lib/types";

interface MentalHealthResultsCardProps {
  results: MentalHealthResults;
  onStartNew: () => void;
  onStartGAD7?: () => void;
}

export function MentalHealthResultsCard({ results, onStartNew, onStartGAD7 }: MentalHealthResultsCardProps) {
  const { t, isRTL } = useSettings();

  const typeLabel = results.type === 'phq9'
    ? t("PHQ-9 Depression Screening", "فحص الاكتئاب PHQ-9")
    : t("GAD-7 Anxiety Screening", "فحص القلق GAD-7");

  return (
    <View style={styles.card}>
      <View style={[styles.header, isRTL && { flexDirection: "row-reverse" }]}>
        <View style={[styles.iconWrap, { backgroundColor: results.severityColor + "20" }]}>
          <Ionicons name="clipboard" size={24} color={results.severityColor} />
        </View>
        <Text style={[styles.typeLabel, isRTL && { textAlign: "right" }]}>{typeLabel}</Text>
      </View>

      <View style={styles.scoreSection}>
        <Text style={[styles.scoreValue, { color: results.severityColor }]}>
          {results.totalScore}
        </Text>
        <Text style={styles.scoreMax}>
          / {results.type === 'phq9' ? '27' : '21'}
        </Text>
      </View>

      <View style={[styles.severityBadge, isRTL && { flexDirection: "row-reverse" }, { backgroundColor: results.severityColor + "18" }]}>
        <View style={[styles.severityDot, { backgroundColor: results.severityColor }]} />
        <Text style={[styles.severityText, { color: results.severityColor }]}>
          {results.severityLevel}
        </Text>
      </View>

      <View style={styles.divider} />

      <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>
        {t("Evidence Summary", "ملخص الأدلة")}
      </Text>
      <Text style={[styles.bodyText, isRTL && { textAlign: "right" }]}>
        {results.evidenceSummary}
      </Text>

      <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>
        {t("Recommendation", "التوصية")}
      </Text>
      <Text style={[styles.bodyText, isRTL && { textAlign: "right" }]}>
        {results.recommendation}
      </Text>

      <View style={[styles.disclaimer, isRTL && { flexDirection: "row-reverse" }]}>
        <Ionicons name="information-circle" size={16} color="#9CA3AF" />
        <Text style={[styles.disclaimerText, isRTL && { textAlign: "right" }]}>
          هذا الفحص للتوعية فقط وليس تشخيصاً طبياً
        </Text>
      </View>

      {results.type === 'phq9' && onStartGAD7 && (
        <Pressable
          style={({ pressed }) => [styles.gad7Button, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onStartGAD7();
          }}
        >
          <Ionicons name="pulse" size={20} color="#7C3AED" />
          <Text style={styles.gad7ButtonText}>
            {t("Take GAD-7 Anxiety Screening", "إجراء فحص القلق GAD-7")}
          </Text>
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onStartNew();
        }}
      >
        <Ionicons name="refresh" size={20} color="#fff" />
        <Text style={styles.newButtonText}>
          {t("Start new assessment", "ابدأ فحصاً جديداً")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.12)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#1F2937",
    flex: 1,
  },
  scoreSection: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 12,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: "800" as const,
  },
  scoreMax: {
    fontSize: 20,
    fontWeight: "500" as const,
    color: "#9CA3AF",
    marginStart: 4,
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#4B5563",
    marginBottom: 6,
  },
  bodyText: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
    marginBottom: 16,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 12,
    color: "#9CA3AF",
    flex: 1,
    lineHeight: 18,
  },
  gad7Button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(124, 58, 237, 0.08)",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.2)",
  },
  gad7ButtonText: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: "#7C3AED",
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    borderRadius: 14,
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#fff",
  },
});
