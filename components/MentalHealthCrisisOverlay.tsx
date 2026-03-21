import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useSettings } from "@/contexts/SettingsContext";

interface MentalHealthCrisisOverlayProps {
  onDismiss: () => void;
}

export function MentalHealthCrisisOverlay({ onDismiss }: MentalHealthCrisisOverlayProps) {
  const insets = useSafeAreaInsets();
  const { t } = useSettings();

  const callHotline = (number: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (Platform.OS !== "web") {
      Linking.openURL(`tel:${number}`);
    }
  };

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="heart" size={48} color="#fff" />
        </View>

        <Text style={styles.title}>نحن هنا من أجلك</Text>
        <Text style={styles.subtitle}>
          {t(
            "You are not alone. There are people who care about you and want to help.",
            "لست وحدك. هناك أشخاص يهتمون بك ويريدون مساعدتك."
          )}
        </Text>

        <View style={styles.hotlineSection}>
          <Text style={styles.hotlineLabel}>
            {t("Iraqi Mental Health Support", "خطوط دعم الصحة النفسية في العراق")}
          </Text>

          <Pressable
            style={({ pressed }) => [styles.hotlineButton, pressed && styles.buttonPressed]}
            onPress={() => callHotline("07901988007")}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <View style={styles.hotlineTextWrap}>
              <Text style={styles.hotlineNumber}>07901988007</Text>
              <Text style={styles.hotlineDesc}>
                {t("Mental Health Helpline", "خط مساعدة الصحة النفسية")}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.hotlineButton, pressed && styles.buttonPressed]}
            onPress={() => callHotline("116")}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <View style={styles.hotlineTextWrap}>
              <Text style={styles.hotlineNumber}>116</Text>
              <Text style={styles.hotlineDesc}>
                {t("Emergency Services", "خدمات الطوارئ")}
              </Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.trustButton, pressed && styles.buttonPressed]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (Platform.OS === "ios") {
              Linking.openURL("contacts://");
            } else if (Platform.OS === "android") {
              Linking.openURL("content://contacts/people/");
            }
          }}
        >
          <Ionicons name="people" size={22} color="#7C3AED" />
          <Text style={styles.trustButtonText}>
            {t("Call someone you trust", "اتصل بشخص تثق به")}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.safeButton, pressed && { opacity: 0.7 }]}
          onPress={onDismiss}
        >
          <Text style={styles.safeButtonText}>
            {t("I'm safe now", "أنا بأمان الآن")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1E1047",
    zIndex: 1000,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    alignItems: "center",
    maxWidth: 340,
    width: "100%",
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#fff",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 24,
  },
  hotlineSection: {
    width: "100%",
    marginBottom: 20,
  },
  hotlineLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 12,
    textAlign: "center",
  },
  hotlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(124, 58, 237, 0.4)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    width: "100%",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(124, 58, 237, 0.5)",
  },
  hotlineTextWrap: {
    flex: 1,
  },
  hotlineNumber: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#fff",
  },
  hotlineDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  trustButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    marginBottom: 16,
  },
  trustButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#7C3AED",
  },
  safeButton: {
    padding: 14,
  },
  safeButtonText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.6)",
    textDecorationLine: "underline",
    fontWeight: "500" as const,
  },
});
