import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { Assessment } from "@/lib/types";

interface AssessmentCardProps {
  assessment: Assessment;
  onPress: () => void;
  onDelete?: () => void;
}

export function AssessmentCard({
  assessment,
  onPress,
  onDelete,
}: AssessmentCardProps) {
  const date = new Date(assessment.date);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const severityColor = assessment.result
    ? assessment.result.assessment.severity === "severe"
      ? Colors.light.emergency
      : assessment.result.assessment.severity === "moderate"
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
            {assessment.chiefComplaint || "Health Assessment"}
          </Text>
          <Text style={styles.dateText}>
            {formattedDate} at {formattedTime}
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
          name="chevron-forward"
          size={18}
          color={Colors.light.textTertiary}
        />
      </View>
      {assessment.result && (
        <View style={styles.resultRow}>
          <Text style={styles.resultCondition} numberOfLines={1}>
            {assessment.result.assessment.condition}
          </Text>
          <View
            style={[
              styles.severityBadge,
              {
                backgroundColor:
                  assessment.result.assessment.severity === "severe"
                    ? Colors.light.emergencyLight
                    : assessment.result.assessment.severity === "moderate"
                      ? Colors.light.warningLight
                      : Colors.light.successLight,
              },
            ]}
          >
            <Text style={[styles.severityText, { color: severityColor }]}>
              {assessment.result.assessment.severity}
            </Text>
          </View>
        </View>
      )}
      {assessment.emergency && (
        <View style={styles.emergencyRow}>
          <Ionicons name="warning" size={14} color={Colors.light.emergency} />
          <Text style={styles.emergencyText}>
            Emergency: {assessment.emergency.condition}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  indicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  content: {
    flex: 1,
  },
  complaint: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 13,
    color: Colors.light.textTertiary,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  resultCondition: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "600" as const,
    textTransform: "capitalize" as const,
  },
  emergencyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.emergencyLight,
  },
  emergencyText: {
    fontSize: 13,
    color: Colors.light.emergency,
    fontWeight: "500" as const,
    flex: 1,
  },
});
