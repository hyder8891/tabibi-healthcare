import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { Assessment } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

interface AssessmentCardProps {
  assessment: Assessment;
  onPress: () => void;
  onContinue?: () => void;
  onDelete?: () => void;
}

export function AssessmentCard({
  assessment,
  onPress,
  onContinue,
  onDelete,
}: AssessmentCardProps) {
  const { t, isRTL } = useSettings();
  const date = new Date(assessment.date);
  const formattedDate = date.toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString(isRTL ? "ar-SA" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const severity = assessment.result?.assessment?.severity;
  const severityColor = severity
    ? severity === "severe"
      ? Colors.light.emergency
      : severity === "moderate"
        ? Colors.light.warning
        : Colors.light.success
    : Colors.light.textTertiary;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={styles.topRow}>
        <View style={[styles.indicator, { backgroundColor: severityColor }]} />
        <View style={styles.content}>
          <Text style={styles.complaint} numberOfLines={1}>
            {assessment.chiefComplaint || t("Health Assessment", "تقييم صحي")}
          </Text>
          <Text style={styles.dateText}>
            {formattedDate} {t("at", "في")} {formattedTime}
          </Text>
        </View>
        {onDelete && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            hitSlop={8}
          >
            <Ionicons
              name="trash-outline"
              size={18}
              color={Colors.light.textTertiary}
            />
          </Pressable>
        )}
        <Ionicons
          name={isRTL ? "chevron-back" : "chevron-forward"}
          size={18}
          color={Colors.light.textTertiary}
        />
      </View>
      {assessment.result?.assessment && (
        <View style={styles.resultRow}>
          <Text style={styles.resultCondition} numberOfLines={1}>
            {assessment.result.assessment.condition || t("Assessment", "تقييم")}
          </Text>
          {severity && (
            <View
              style={[
                styles.severityBadge,
                {
                  backgroundColor:
                    severity === "severe"
                      ? Colors.light.emergencyLight
                      : severity === "moderate"
                        ? Colors.light.warningLight
                        : Colors.light.successLight,
                },
              ]}
            >
              <Text style={[styles.severityText, { color: severityColor }]}>
                {severity}
              </Text>
            </View>
          )}
        </View>
      )}
      {assessment.emergency && (
        <View style={styles.emergencyRow}>
          <Ionicons name="warning" size={14} color={Colors.light.emergency} />
          <Text style={styles.emergencyText}>
            {t("Emergency:", "طوارئ:")} {assessment.emergency.condition}
          </Text>
        </View>
      )}
      {onContinue && (
        <Pressable
          style={({ pressed }) => [
            styles.continueButton,
            pressed && { opacity: 0.8 },
          ]}
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onContinue();
          }}
        >
          <Ionicons name="chatbubble-outline" size={14} color={Colors.light.primary} />
          <Text style={styles.continueText}>
            {t("Continue Chat", "متابعة المحادثة")}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  indicator: {
    width: 5,
    height: 40,
    borderRadius: 3,
  },
  content: {
    flex: 1,
  },
  complaint: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.divider,
  },
  resultCondition: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  severityText: {
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "capitalize" as const,
  },
  emergencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.emergencyLight,
  },
  emergencyText: {
    fontSize: 13,
    color: Colors.light.emergency,
    fontWeight: "500" as const,
    flex: 1,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.light.primarySurface,
    borderWidth: 1,
    borderColor: Colors.light.primarySurface,
  },
  continueText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.light.primary,
  },
});
