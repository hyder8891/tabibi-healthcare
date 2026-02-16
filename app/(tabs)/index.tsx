import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useAvicenna } from "@/contexts/AvicennaContext";
import { useAuth } from "@/contexts/AuthContext";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const { t, isRTL } = useSettings();
  const { user } = useAuth();
  const { insights, syncProfile } = useAvicenna();

  useEffect(() => {
    loadRecent();
    getProfile().then((p) => {
      setProfile(p);
      if (user && p) {
        syncProfile({
          medications: p.medications,
          conditions: p.conditions,
          allergies: p.allergies,
          age: p.age,
          gender: p.gender,
        }).catch(() => {});
      }
    });
  }, [user]);

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

  const getInsightCards = () => {
    const cards: Array<{
      id: string;
      icon: string;
      iconSet: "ionicons" | "mci";
      colors: [string, string];
      titleEn: string;
      titleAr: string;
      descEn: string;
      descAr: string;
      route?: string;
      priority: number;
    }> = [];

    if (insights?.nudges) {
      for (const nudge of insights.nudges) {
        const iconMap: Record<string, string> = {
          onboarding: "sparkles",
          vital_check: "heart-outline",
          vital_alert: "heart",
          recurring_condition: "refresh",
          seasonal: "cloudy",
        };
        const colorMap: Record<string, [string, string]> = {
          onboarding: [Colors.light.primary, "#14B8A6"],
          vital_check: ["#EF4444", "#F87171"],
          vital_alert: ["#DC2626", "#EF4444"],
          recurring_condition: [Colors.light.accent, "#FB923C"],
          seasonal: ["#7C3AED", "#A78BFA"],
        };
        const routeMap: Record<string, string> = {
          onboarding: "/assessment",
          vital_check: "/heart-rate",
          vital_alert: "/heart-rate",
          recurring_condition: "/assessment",
        };
        cards.push({
          id: `nudge-${nudge.type}`,
          icon: iconMap[nudge.type] || "sparkles",
          iconSet: "ionicons",
          colors: colorMap[nudge.type] || [Colors.light.primary, "#14B8A6"],
          titleEn: nudge.titleEn,
          titleAr: nudge.titleAr,
          descEn: nudge.descEn,
          descAr: nudge.descAr,
          route: routeMap[nudge.type],
          priority: nudge.priority,
        });
      }
    }

    const month = new Date().getMonth() + 1;
    const hour = new Date().getHours();

    if (month >= 6 && month <= 9) {
      cards.push({
        id: "tip-hydration",
        icon: "water",
        iconSet: "ionicons",
        colors: ["#0EA5E9", "#38BDF8"],
        titleEn: "Stay Hydrated",
        titleAr: "حافظ على ترطيب جسمك",
        descEn: "Drink 3-4 liters of water daily in this heat. Avoid being outdoors between 11am-4pm.",
        descAr: "اشرب ٣-٤ لتر ماء يومياً في هذا الحر. تجنب الخروج بين الساعة ١١ صباحاً و ٤ عصراً.",
        priority: 4,
      });
    }

    if (month >= 11 || month <= 3) {
      cards.push({
        id: "tip-flu",
        icon: "thermometer",
        iconSet: "ionicons",
        colors: ["#6366F1", "#818CF8"],
        titleEn: "Flu Season Active",
        titleAr: "موسم الإنفلونزا نشط",
        descEn: "Wash hands often, ventilate rooms, and consider a flu vaccine. Keep paracetamol handy.",
        descAr: "اغسل يديك كثيراً، هوّ الغرف، وفكّر بلقاح الإنفلونزا. احتفظ بالباراسيتامول.",
        priority: 4,
      });
    }

    if (month >= 3 && month <= 6) {
      cards.push({
        id: "tip-dust",
        icon: "cloud",
        iconSet: "ionicons",
        colors: ["#D97706", "#F59E0B"],
        titleEn: "Dust Storm Season",
        titleAr: "موسم العواصف الرملية",
        descEn: "Keep rescue inhalers accessible. Stay indoors during storms and seal windows.",
        descAr: "احتفظ بجهاز الاستنشاق قريباً. ابقَ في المنزل أثناء العواصف وأغلق النوافذ.",
        priority: 4,
      });
    }

    cards.push({
      id: "feature-scan",
      icon: "camera",
      iconSet: "ionicons",
      colors: ["#059669", "#10B981"],
      titleEn: "Scan Your Medicine",
      titleAr: "امسح دواءك",
      descEn: "Take a photo of any medication to identify it, check interactions, and get dosage info.",
      descAr: "التقط صورة لأي دواء للتعرف عليه والتحقق من التداخلات ومعرفة الجرعة.",
      route: "/scan",
      priority: 5,
    });

    cards.push({
      id: "feature-routing",
      icon: "navigate",
      iconSet: "ionicons",
      colors: [Colors.light.accent, "#FB923C"],
      titleEn: "Find Nearby Care",
      titleAr: "ابحث عن رعاية قريبة",
      descEn: "Locate pharmacies, labs, clinics, and hospitals near you with real-time availability.",
      descAr: "حدّد موقع الصيدليات والمختبرات والعيادات والمستشفيات القريبة منك.",
      route: "/routing",
      priority: 5,
    });

    if (hour >= 22 || hour < 6) {
      cards.push({
        id: "tip-sleep",
        icon: "moon",
        iconSet: "ionicons",
        colors: ["#4338CA", "#6366F1"],
        titleEn: "Sleep Well Tonight",
        titleAr: "نم جيداً الليلة",
        descEn: "Avoid screens 30 min before bed. Keep room cool and dark for better sleep quality.",
        descAr: "تجنب الشاشات ٣٠ دقيقة قبل النوم. حافظ على غرفة باردة ومظلمة لنوم أفضل.",
        priority: 6,
      });
    }

    if (hour >= 6 && hour < 12) {
      cards.push({
        id: "tip-morning",
        icon: "sunny",
        iconSet: "ionicons",
        colors: ["#EA580C", "#F97316"],
        titleEn: "Morning Health Check",
        titleAr: "فحص صحي صباحي",
        descEn: "Start your day right - measure your heart rate and log any symptoms early.",
        descAr: "ابدأ يومك بشكل صحيح - قس معدل ضربات قلبك وسجّل أي أعراض مبكراً.",
        route: "/heart-rate",
        priority: 6,
      });
    }

    cards.push({
      id: "tip-selfmed",
      icon: "medical",
      iconSet: "ionicons",
      colors: ["#BE185D", "#EC4899"],
      titleEn: "Safe Self-Medication",
      titleAr: "العلاج الذاتي الآمن",
      descEn: "Always check drug interactions before combining medications. Use the scanner to verify.",
      descAr: "تحقق دائماً من التداخلات الدوائية قبل الجمع بين الأدوية. استخدم الماسح للتأكد.",
      route: "/scan",
      priority: 6,
    });

    cards.push({
      id: "tip-emergency",
      icon: "alert-circle",
      iconSet: "ionicons",
      colors: ["#DC2626", "#EF4444"],
      titleEn: "Know Emergency Signs",
      titleAr: "اعرف علامات الطوارئ",
      descEn: "Chest pain, difficulty breathing, sudden weakness, or high fever? Seek care immediately.",
      descAr: "ألم في الصدر، صعوبة تنفس، ضعف مفاجئ، أو حمى شديدة؟ اطلب الرعاية فوراً.",
      route: "/assessment",
      priority: 7,
    });

    cards.push({
      id: "tip-family",
      icon: "people",
      iconSet: "ionicons",
      colors: ["#0891B2", "#06B6D4"],
      titleEn: "Family Health Tip",
      titleAr: "نصيحة صحية للعائلة",
      descEn: "Keep a first-aid kit at home: paracetamol, ORS, bandages, antiseptic, and a thermometer.",
      descAr: "احتفظ بحقيبة إسعافات أولية: باراسيتامول، محلول ملح، ضمادات، مطهر، وميزان حرارة.",
      priority: 7,
    });

    if (profile?.age && profile.age >= 40) {
      cards.push({
        id: "tip-checkup",
        icon: "clipboard",
        iconSet: "ionicons",
        colors: ["#7C3AED", "#A78BFA"],
        titleEn: "Regular Check-ups",
        titleAr: "فحوصات دورية",
        descEn: "Adults 40+ should check blood pressure, blood sugar, and cholesterol regularly.",
        descAr: "البالغون فوق ٤٠ يجب فحص ضغط الدم والسكر والكوليسترول بانتظام.",
        priority: 5,
      });
    }

    cards.sort((a, b) => a.priority - b.priority);
    return cards;
  };

  const insightCards = getInsightCards();

  const insightsScrollRef = useRef<ScrollView>(null);
  const scrollDirection = useRef<1 | -1>(1);
  const scrollOffset = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CARD_WIDTH = 176;
  const CARD_GAP = 12;
  const STEP = CARD_WIDTH + CARD_GAP;

  const isWeb = Platform.OS === "web";

  const startAutoScroll = useCallback(() => {
    if (!isWeb) return;
    if (autoScrollTimer.current) return;
    if (insightCards.length <= 1) return;
    const maxScroll = (insightCards.length - 1) * STEP;
    autoScrollTimer.current = setInterval(() => {
      scrollOffset.current += 0.5 * scrollDirection.current;
      if (scrollOffset.current >= maxScroll) {
        scrollOffset.current = maxScroll;
        scrollDirection.current = -1;
      } else if (scrollOffset.current <= 0) {
        scrollOffset.current = 0;
        scrollDirection.current = 1;
      }
      insightsScrollRef.current?.scrollTo({ x: scrollOffset.current, animated: false });
    }, 16);
  }, [insightCards.length]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (isWeb) startAutoScroll();
    return () => { stopAutoScroll(); if (resumeTimer.current) clearTimeout(resumeTimer.current); };
  }, [insightCards.length]);

  const onInsightScrollBegin = useCallback(() => {
    stopAutoScroll();
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);
  const onInsightScrollEnd = useCallback((e: any) => {
    scrollOffset.current = e.nativeEvent.contentOffset.x;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (isWeb) resumeTimer.current = setTimeout(() => { startAutoScroll(); }, 3000);
  }, []);

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

        {insightCards.length > 0 && (
          <>
            <View style={[styles.avicennaHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={styles.avicennaHeaderLeft}>
                <LinearGradient
                  colors={["#7C3AED", "#A78BFA"]}
                  style={styles.avicennaIconGradient}
                >
                  <MaterialCommunityIcons name="brain" size={16} color="#fff" />
                </LinearGradient>
                <Text style={[styles.sectionTitle, { marginBottom: 0, marginTop: 0 }]}>
                  {t("Health Insights", "رؤى صحية")}
                </Text>
              </View>
            </View>

            <ScrollView
              ref={insightsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.nudgesScroll}
              style={styles.nudgesContainer}
              decelerationRate="fast"
              snapToInterval={STEP}
              onScrollBeginDrag={onInsightScrollBegin}
              onScrollEndDrag={onInsightScrollEnd}
              onMomentumScrollEnd={onInsightScrollEnd}
            >
              {insightCards.map((card, idx) => (
                <Pressable
                  key={card.id + idx}
                  style={({ pressed }) => [
                    styles.nudgeCard,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (card.route) router.push(card.route as any);
                  }}
                >
                  <LinearGradient
                    colors={card.colors}
                    style={styles.nudgeIconGradient}
                  >
                    <Ionicons name={card.icon as any} size={18} color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.nudgeTitle, isRTL && { textAlign: "right" }]} numberOfLines={2}>
                    {t(card.titleEn, card.titleAr)}
                  </Text>
                  <Text style={[styles.nudgeDesc, isRTL && { textAlign: "right" }]} numberOfLines={3}>
                    {t(card.descEn, card.descAr)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {insights?.healthSummary && insights.healthSummary.totalAssessments > 0 && (
          <View style={styles.healthSummaryCard}>
            <LinearGradient
              colors={["#F0FDFA", "#ECFDF5"]}
              style={styles.healthSummaryGradient}
            >
              <View style={[styles.healthSummaryHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={styles.healthSummaryHeaderLeft}>
                  <Ionicons name="analytics" size={18} color={Colors.light.primary} />
                  <Text style={styles.healthSummaryTitle}>
                    {t("Your Health Profile", "ملفك الصحي")}
                  </Text>
                </View>
                <View style={[styles.riskBadge, {
                  backgroundColor:
                    insights.healthSummary.riskLevel === "high" ? Colors.light.emergencyLight :
                    insights.healthSummary.riskLevel === "moderate" ? Colors.light.warningLight :
                    Colors.light.successLight
                }]}>
                  <View style={[styles.riskDot, {
                    backgroundColor:
                      insights.healthSummary.riskLevel === "high" ? Colors.light.emergency :
                      insights.healthSummary.riskLevel === "moderate" ? Colors.light.warning :
                      Colors.light.success
                  }]} />
                  <Text style={[styles.riskText, {
                    color:
                      insights.healthSummary.riskLevel === "high" ? Colors.light.emergency :
                      insights.healthSummary.riskLevel === "moderate" ? Colors.light.warning :
                      Colors.light.success
                  }]}>
                    {t(
                      insights.healthSummary.riskLevel === "high" ? "High Risk" :
                      insights.healthSummary.riskLevel === "moderate" ? "Moderate" : "Low Risk",
                      insights.healthSummary.riskLevel === "high" ? "خطر عالي" :
                      insights.healthSummary.riskLevel === "moderate" ? "متوسط" : "خطر منخفض"
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.healthStatsRow}>
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>{insights.healthSummary.totalAssessments}</Text>
                  <Text style={styles.healthStatLabel}>{t("Assessments", "تقييمات")}</Text>
                </View>
                <View style={styles.healthStatDivider} />
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>{insights.healthSummary.medicationCount}</Text>
                  <Text style={styles.healthStatLabel}>{t("Medications", "أدوية")}</Text>
                </View>
                <View style={styles.healthStatDivider} />
                <View style={styles.healthStat}>
                  <Text style={styles.healthStatValue}>{insights.healthSummary.recentVitals.length}</Text>
                  <Text style={styles.healthStatLabel}>{t("Vitals", "مؤشرات")}</Text>
                </View>
              </View>

              {insights.healthSummary.recentConditions.length > 0 && (
                <View style={styles.recentConditionsRow}>
                  {insights.healthSummary.recentConditions.slice(0, 3).map((condition, idx) => (
                    <View key={idx} style={styles.conditionChip}>
                      <Text style={styles.conditionChipText} numberOfLines={1}>{condition}</Text>
                    </View>
                  ))}
                </View>
              )}
            </LinearGradient>
          </View>
        )}

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
  avicennaHeader: {
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    marginTop: 4,
  },
  avicennaHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avicennaIconGradient: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgesContainer: {
    marginBottom: 24,
    marginHorizontal: -20,
  },
  nudgesScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  nudgeCard: {
    width: 176,
    backgroundColor: Colors.light.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  nudgeIconGradient: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  nudgeTitle: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
    lineHeight: 19,
  },
  nudgeDesc: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 17,
  },
  healthSummaryCard: {
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  healthSummaryGradient: {
    padding: 18,
    borderRadius: 20,
  },
  healthSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  healthSummaryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  healthSummaryTitle: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  riskBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
  },
  healthStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 14,
  },
  healthStat: {
    alignItems: "center",
    flex: 1,
  },
  healthStatValue: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.primary,
  },
  healthStatLabel: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  healthStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.light.borderLight,
  },
  recentConditionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  conditionChip: {
    backgroundColor: Colors.light.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(13, 148, 136, 0.12)",
  },
  conditionChipText: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
});
