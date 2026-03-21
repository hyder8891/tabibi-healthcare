import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Linking,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";

const PRIVACY_URL = "https://tabibi.clinic/privacy";
const TERMS_URL = "https://tabibi.clinic/terms";

export default function ConsentScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();

  const bullets = [
    {
      icon: "shield-checkmark-outline" as const,
      en: "Your health data stays on your device and is encrypted",
      ar: "بياناتك الصحية تبقى على جهازك ومشفرة",
    },
    {
      icon: "medical-outline" as const,
      en: "AI-powered symptom assessment — not a medical diagnosis",
      ar: "تقييم الأعراض بالذكاء الاصطناعي — ليس تشخيصًا طبيًا",
    },
    {
      icon: "eye-off-outline" as const,
      en: "We do not sell or share your personal information",
      ar: "لا نبيع أو نشارك معلوماتك الشخصية",
    },
  ];

  const handleAgree = async () => {
    await AsyncStorage.setItem("consent_accepted", "true");
    router.replace("/auth");
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 + 24 : insets.top + 24,
          paddingBottom: Platform.OS === "web" ? 34 + 24 : insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <Image
          source={require("@/assets/images/logo-nobg.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={[styles.title, isRTL && { textAlign: "right" }]}>
          {t("Before You Start", "قبل أن تبدأ")}
        </Text>

        <View style={styles.bulletList}>
          {bullets.map((bullet, index) => (
            <View
              key={index}
              style={[styles.bulletRow, isRTL && { flexDirection: "row-reverse" }]}
            >
              <View style={styles.bulletIcon}>
                <Ionicons
                  name={bullet.icon}
                  size={22}
                  color={Colors.light.primary}
                />
              </View>
              <Text
                style={[
                  styles.bulletText,
                  isRTL && { textAlign: "right" },
                ]}
              >
                {t(bullet.en, bullet.ar)}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.linksRow, isRTL && { flexDirection: "row-reverse" }]}>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text style={styles.linkText}>
              {t("Privacy Policy", "سياسة الخصوصية")}
            </Text>
          </Pressable>
          <Text style={styles.linkSeparator}>•</Text>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
            <Text style={styles.linkText}>
              {t("Terms of Service", "شروط الاستخدام")}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.agreeButton,
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
        ]}
        onPress={handleAgree}
        testID="consent-agree-button"
      >
        <Text style={styles.agreeButtonText}>
          {t("I Agree & Continue", "أوافق وأستمر")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 32,
  },
  bulletList: {
    width: "100%",
    gap: 20,
    marginBottom: 32,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  bulletIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
    lineHeight: 22,
    paddingTop: 8,
  },
  linksRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
    textDecorationLine: "underline",
  },
  linkSeparator: {
    fontSize: 14,
    color: Colors.light.textTertiary,
  },
  agreeButton: {
    backgroundColor: Colors.light.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  agreeButtonText: {
    fontSize: 17,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
  },
});
