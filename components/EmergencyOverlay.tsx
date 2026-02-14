import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import type { EmergencyAlert } from "@/lib/types";

interface EmergencyOverlayProps {
  alert: EmergencyAlert;
  onDismiss: () => void;
}

export function EmergencyOverlay({ alert, onDismiss }: EmergencyOverlayProps) {
  const insets = useSafeAreaInsets();
  const { t } = useSettings();

  const callEmergency = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (Platform.OS !== "web") {
      Linking.openURL("tel:911");
    }
  };

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="warning" size={48} color="#fff" />
        </View>

        <Text style={styles.title}>{t("Emergency Detected", "تم اكتشاف حالة طوارئ")}</Text>
        <Text style={styles.condition}>{alert.condition}</Text>
        <Text style={styles.action}>{alert.action}</Text>

        <Pressable
          style={({ pressed }) => [
            styles.emergencyButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={callEmergency}
        >
          <Ionicons name="call" size={24} color="#fff" />
          <Text style={styles.emergencyButtonText}>{t("Call Emergency Services", "اتصل بخدمات الطوارئ")}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.dismissButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.dismissText}>{t("I understand the risk - dismiss", "أفهم المخاطر - تجاهل")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.light.emergencyDark,
    zIndex: 1000,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    maxWidth: 340,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.light.emergency,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  condition: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.9)",
    marginBottom: 8,
    textAlign: "center",
  },
  action: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 24,
  },
  emergencyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Colors.light.emergency,
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
  },
  emergencyButtonText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#fff",
  },
  dismissButton: {
    marginTop: 24,
    padding: 12,
  },
  dismissText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    textDecorationLine: "underline",
  },
});
