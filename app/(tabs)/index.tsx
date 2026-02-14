import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getAssessments, getProfile } from "@/lib/storage";
import type { Assessment, PatientProfile } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { t, isRTL } = useSettings();

  useEffect(() => {
    loadRecent();
    getProfile().then(setProfile);
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
          { paddingTop: topInset + 24, paddingBottom: 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <LinearGradient
            colors={["#0D9488", "#0F766E", "#115E59"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroDecoRing1} />
            <View style={styles.heroDecoRing2} />
            <View style={styles.heroDecoDot1} />
            <View style={styles.heroDecoDot2} />
            <View style={styles.heroDecoDot3} />

            <View style={[styles.heroTop, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.heroLogoWrap}>
                <Image source={require("@/assets/images/logo.png")} style={styles.heroLogo} />
              </View>
              <View style={styles.heroStatusPill}>
                <View style={styles.heroStatusDot} />
                <Text style={styles.heroStatusText}>{t("Ready", "جاهز")}</Text>
              </View>
            </View>

            <View style={[styles.heroTextBlock, isRTL && { alignItems: "flex-end" }]}>
              <Text style={[styles.heroGreeting, isRTL && { textAlign: "right" }]}>
                {t("Welcome to", "مرحباً بك في")}
              </Text>
              <Text style={[styles.heroAppName, isRTL && { textAlign: "right" }]}>
                {t("Tabibi", "طبيبي")}
              </Text>
              <View style={styles.heroTaglineDivider} />
              <Text style={[styles.heroTagline, isRTL && { textAlign: "right" }]}>
                {t("Your Active Healthcare Navigator", "مساعدك الصحي الذكي")}
              </Text>
            </View>
          </LinearGradient>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.mainCTA,
            pressed && { opacity: 0.95, transform: [{ scale: 0.97 }] },
          ]}
          onPress={startAssessment}
        >
          <LinearGradient
            colors={["#0D9488", "#0A7C72", "#07635B"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <View style={styles.ctaDecoArc} />
            <View style={styles.ctaDecoGlow} />

            <View style={[styles.ctaHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.ctaIconWrap}>
                <Ionicons name="chatbubbles" size={26} color={Colors.light.primary} />
              </View>
              <View style={styles.ctaChip}>
                <View style={styles.ctaChipDot} />
                <Text style={styles.ctaChipText}>{t("AI-Powered", "بالذكاء الاصطناعي")}</Text>
              </View>
            </View>

            <View style={[styles.ctaTextBlock, isRTL && { alignItems: "flex-end" }]}>
              <Text style={[styles.ctaTitle, isRTL && { textAlign: "right" }]}>
                {t("Start Assessment", "ابدأ التقييم")}
              </Text>
              <Text style={[styles.ctaSubtitle, isRTL && { textAlign: "right" }]}>
                {t("Describe your symptoms and get personalized health guidance", "صف أعراضك واحصل على إرشادات صحية مخصصة")}
              </Text>
            </View>

            <View style={[styles.ctaAction, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={styles.ctaActionText}>{t("Begin Now", "ابدأ الآن")}</Text>
              <View style={styles.ctaArrow}>
                <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={18} color={Colors.light.primary} />
              </View>
            </View>
          </LinearGradient>
        </Pressable>

        <Text style={[styles.sectionTitle, isRTL && { textAlign: "right" }]}>{t("Quick Actions", "إجراءات سريعة")}</Text>

        <View style={styles.quickActionsGrid}>
          <View style={styles.quickActionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
              ]}
              onPress={openScanner}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.accentLight }]}>
                <MaterialCommunityIcons
                  name="pill"
                  size={28}
                  color={Colors.light.accent}
                />
              </View>
              <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Drug Interactions", "التداخلات الدوائية")}</Text>
              <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
                {t("Check medicine safety", "تحقق من سلامة الأدوية")}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.actionCard,
                pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/heart-rate");
              }}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.emergencyLight }]}>
                <Ionicons
                  name="heart"
                  size={28}
                  color={Colors.light.emergency}
                />
              </View>
              <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Heart Rate", "نبضات القلب")}</Text>
              {profile?.lastBpm ? (
                <View style={[styles.bpmBadge, isRTL && { flexDirection: "row-reverse" }]}>
                  <Text style={styles.bpmBadgeValue}>{profile.lastBpm}</Text>
                  <Text style={styles.bpmBadgeUnit}>BPM</Text>
                </View>
              ) : (
                <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
                  {t("Camera-based monitor", "مقياس عبر الكاميرا")}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.quickActionsRow}>
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
                  size={28}
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
                router.push("/routing");
              }}
            >
              <View style={[styles.actionIcon, { backgroundColor: "#F3E8FF" }]}>
                <Ionicons name="medkit" size={28} color="#7C3AED" />
              </View>
              <Text style={[styles.actionTitle, isRTL && { textAlign: "right" }]}>{t("Find Care", "ابحث عن رعاية")}</Text>
              <Text style={[styles.actionDesc, isRTL && { textAlign: "right" }]}>
                {t("Clinics, labs & hospitals", "عيادات ومختبرات ومستشفيات")}
              </Text>
            </Pressable>
          </View>

        </View>

        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <View style={[styles.infoCardRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.infoCardIconWrap}>
                <LinearGradient
                  colors={[Colors.light.primary, "#14B8A6"]}
                  style={styles.infoCardIconGradient}
                >
                  <Ionicons name="shield-checkmark" size={20} color="#fff" />
                </LinearGradient>
              </View>
              <View style={[styles.infoCardContent, isRTL && { alignItems: "flex-end" }]}>
                <Text style={[styles.infoCardTitle, isRTL && { textAlign: "right" }]}>{t("Safety First", "السلامة أولاً")}</Text>
                <Text style={[styles.infoCardText, isRTL && { textAlign: "right" }]}>
                  {t("Checks for emergency symptoms, drug interactions, and contraindications before any recommendation.", "يتحقق من أعراض الطوارئ والتداخلات الدوائية وموانع الاستعمال قبل أي توصية.")}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.infoCard}>
            <View style={[styles.infoCardRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.infoCardIconWrap}>
                <LinearGradient
                  colors={[Colors.light.accent, "#FB923C"]}
                  style={styles.infoCardIconGradient}
                >
                  <Ionicons name="navigate" size={20} color="#fff" />
                </LinearGradient>
              </View>
              <View style={[styles.infoCardContent, isRTL && { alignItems: "flex-end" }]}>
                <Text style={[styles.infoCardTitle, isRTL && { textAlign: "right" }]}>{t("Smart Routing", "التوجيه الذكي")}</Text>
                <Text style={[styles.infoCardText, isRTL && { textAlign: "right" }]}>
                  {t("Find the nearest facility with exactly what you need \u2014 pharmacies, labs, or clinics.", "ابحث عن أقرب مرفق يحتوي على ما تحتاجه \u2014 صيدليات أو مختبرات أو عيادات.")}
                </Text>
              </View>
            </View>
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
                    styles.recentIndicator,
                    {
                      backgroundColor: a.result?.assessment?.severity
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
                  size={18}
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
  heroCard: {
    marginBottom: 24,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  heroGradient: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 28,
    borderRadius: 28,
    overflow: "hidden",
  },
  heroDecoRing1: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroDecoRing2: {
    position: "absolute",
    bottom: -50,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.06)",
  },
  heroDecoDot1: {
    position: "absolute",
    top: 32,
    right: 60,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroDecoDot2: {
    position: "absolute",
    bottom: 44,
    right: 40,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroDecoDot3: {
    position: "absolute",
    top: 60,
    left: 50,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  heroLogoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogo: {
    width: 36,
    height: 36,
    resizeMode: "contain" as const,
  },
  heroStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  heroStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#34D399",
  },
  heroStatusText: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: "rgba(255,255,255,0.9)",
  },
  heroTextBlock: {
    gap: 4,
  },
  heroGreeting: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.3,
  },
  heroAppName: {
    fontSize: 34,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroTaglineDivider: {
    width: 36,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginVertical: 6,
  },
  heroTagline: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 20,
  },
  mainCTA: {
    marginBottom: 28,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#0D9488",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 14,
  },
  ctaGradient: {
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
    overflow: "hidden",
  },
  ctaDecoArc: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ctaDecoGlow: {
    position: "absolute",
    bottom: -30,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ctaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  ctaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  ctaChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34D399",
  },
  ctaChipText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: "rgba(255,255,255,0.9)",
  },
  ctaTextBlock: {
    marginBottom: 22,
    gap: 6,
  },
  ctaTitle: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  ctaSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 21,
  },
  ctaAction: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 10,
    justifyContent: "center",
  },
  ctaActionText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#FFFFFF",
  },
  ctaArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 14,
    marginTop: 8,
  },
  quickActionsGrid: {
    gap: 14,
    marginBottom: 28,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 14,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionCardWide: {
    flex: 1,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 3,
  },
  actionDesc: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    lineHeight: 17,
  },
  infoCards: {
    gap: 12,
    marginBottom: 28,
  },
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  infoCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  infoCardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    overflow: "hidden",
  },
  infoCardIconGradient: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCardContent: {
    flex: 1,
    gap: 4,
  },
  infoCardTitle: {
    fontSize: 15,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.1,
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
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  recentIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
  },
  recentContent: {
    flex: 1,
  },
  recentTitle: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  recentDate: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 3,
  },
  bpmBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: 2,
  },
  bpmBadgeValue: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.emergency,
  },
  bpmBadgeUnit: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
  },
});
