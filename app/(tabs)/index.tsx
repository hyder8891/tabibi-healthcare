import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getAssessments } from "@/lib/storage";
import type { Assessment } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { t, isRTL } = useSettings();

  useEffect(() => {
    loadRecent();
  }, []);

  const loadRecent = async () => {
    const assessments = await getAssessments();
    setRecentAssessments(assessments.slice(0, 3));
  };

  const startAssessment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/assessment");
  };

  const openScanner = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/scan");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 16, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.greetingRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <View>
            <Text style={[styles.greeting, isRTL && { textAlign: "right" }]}>{t("Welcome to", "مرحباً بك في")}</Text>
            <Text style={[styles.appName, isRTL && { textAlign: "right" }]}>{t("Tabibi", "طبيبي")}</Text>
          </View>
          <View style={styles.logoCircle}>
            <Ionicons name="medical" size={24} color="#fff" />
          </View>
        </View>

        <Text style={[styles.tagline, isRTL && { textAlign: "right" }]}>
          {t("Your Active Healthcare Navigator", "مساعدك الصحي الذكي")}
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.mainCTA,
            pressed && { opacity: 0.95, transform: [{ scale: 0.98 }] },
          ]}
          onPress={startAssessment}
        >
          <LinearGradient
            colors={[Colors.light.primary, Colors.light.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <View style={[styles.ctaContent, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.ctaLeft}>
                <Text style={[styles.ctaTitle, isRTL && { textAlign: "right" }]}>{t("Start Assessment", "ابدأ التقييم")}</Text>
                <Text style={[styles.ctaSubtitle, isRTL && { textAlign: "right" }]}>
                  {t("Describe your symptoms and get personalized health guidance", "صف أعراضك واحصل على إرشادات صحية مخصصة")}
                </Text>
              </View>
              <View style={[styles.ctaIcon, isRTL ? { marginRight: 16, marginLeft: 0 } : {}]}>
                <Ionicons name="chatbubbles" size={32} color="rgba(255,255,255,0.9)" />
              </View>
            </View>
            <View style={[styles.ctaArrow, isRTL && { alignSelf: "flex-start" }]}>
              <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Quick Actions", "إجراءات سريعة")}</Text>

        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
            ]}
            onPress={openScanner}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FFF7ED" }]}>
              <MaterialCommunityIcons
                name="pill"
                size={24}
                color={Colors.light.accent}
              />
            </View>
            <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Scan Medicine", "مسح الدواء")}</Text>
            <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
              {t("Check drug interactions", "تحقق من التداخلات الدوائية")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/routing?type=pharmacy");
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.light.primarySurface }]}>
              <Ionicons
                name="location"
                size={24}
                color={Colors.light.primary}
              />
            </View>
            <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Find Pharmacy", "ابحث عن صيدلية")}</Text>
            <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
              {t("Nearest open pharmacies", "أقرب الصيدليات المفتوحة")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionCard,
              pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/routing?type=lab");
            }}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#F3E8FF" }]}>
              <MaterialCommunityIcons name="flask" size={24} color="#7C3AED" />
            </View>
            <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Find Lab", "ابحث عن مختبر")}</Text>
            <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
              {t("Labs & imaging centers", "مختبرات ومراكز تصوير")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <View style={[styles.infoCardHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.light.primary} />
              <Text style={[styles.infoCardTitle, isRTL && { textAlign: "right" }]}>{t("Safety First", "السلامة أولاً")}</Text>
            </View>
            <Text style={[styles.infoCardText, isRTL && { textAlign: "right" }]}>
              {t("Tabibi checks for emergency symptoms, drug interactions, and contraindications before making any recommendation.", "طبيبي يتحقق من أعراض الطوارئ والتداخلات الدوائية وموانع الاستعمال قبل أي توصية.")}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <View style={[styles.infoCardHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons name="navigate" size={20} color={Colors.light.accent} />
              <Text style={[styles.infoCardTitle, isRTL && { textAlign: "right" }]}>{t("Smart Routing", "التوجيه الذكي")}</Text>
            </View>
            <Text style={[styles.infoCardText, isRTL && { textAlign: "right" }]}>
              {t("Find the nearest facility that has exactly what you need - from pharmacies with specific medicines to labs with MRI machines.", "ابحث عن أقرب مرفق يحتوي على ما تحتاجه - من صيدليات بأدوية محددة إلى مختبرات بأجهزة الرنين المغناطيسي.")}
            </Text>
          </View>
        </View>

        {recentAssessments.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Recent Assessments", "التقييمات الأخيرة")}</Text>
            {recentAssessments.map((a) => (
              <Pressable
                key={a.id}
                style={({ pressed }) => [
                  styles.recentCard,
                  isRTL && { flexDirection: "row-reverse" },
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/results",
                    params: { assessmentId: a.id },
                  })
                }
              >
                <View
                  style={[
                    styles.recentDot,
                    {
                      backgroundColor: a.result
                        ? a.result.assessment.severity === "severe"
                          ? Colors.light.emergency
                          : a.result.assessment.severity === "moderate"
                            ? Colors.light.warning
                            : Colors.light.success
                        : Colors.light.textTertiary,
                    },
                  ]}
                />
                <View style={styles.recentContent}>
                  <Text style={[styles.recentTitle, isRTL && { textAlign: "right" }]} numberOfLines={1}>
                    {a.chiefComplaint || t("Assessment", "تقييم")}
                  </Text>
                  <Text style={[styles.recentDate, isRTL && { textAlign: "right" }]}>
                    {new Date(a.date).toLocaleDateString(isRTL ? "ar-SA" : "en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                </View>
                <Ionicons
                  name={isRTL ? "chevron-back" : "chevron-forward"}
                  size={16}
                  color={Colors.light.textTertiary}
                />
              </Pressable>
            ))}
          </>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  greetingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 16,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  appName: {
    fontSize: 34,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tagline: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginBottom: 24,
  },
  mainCTA: {
    marginBottom: 28,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaGradient: {
    padding: 24,
    borderRadius: 20,
  },
  ctaContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  ctaLeft: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    marginBottom: 6,
  },
  ctaSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.8)",
    lineHeight: 20,
  },
  ctaIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 16,
  },
  ctaArrow: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 14,
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  infoCards: {
    gap: 10,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoCardTitle: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  infoCardText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recentContent: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  recentDate: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 1,
  },
});
