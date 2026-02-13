import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { saveProfile, getProfile } from "@/lib/storage";
import type { PatientProfile } from "@/lib/types";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : Math.max(insets.bottom, 16);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [conditionInput, setConditionInput] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);

  const fadeOpacity = useSharedValue(1);
  const totalSteps = 3;

  const animatedFade = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  const goNext = () => {
    if (step < totalSteps - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      fadeOpacity.value = withTiming(0, { duration: 120 }, () => {
        fadeOpacity.value = withTiming(1, { duration: 200 });
      });
      setTimeout(() => setStep((s) => s + 1), 120);
    }
  };

  const goBack = () => {
    if (step > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      fadeOpacity.value = withTiming(0, { duration: 120 }, () => {
        fadeOpacity.value = withTiming(1, { duration: 200 });
      });
      setTimeout(() => setStep((s) => s - 1), 120);
    }
  };

  const finishOnboarding = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const existing = await getProfile();
    const profile: PatientProfile = {
      ...existing,
      name: name.trim() || undefined,
      gender: gender || undefined,
      age: age ? parseInt(age) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      height: height ? parseFloat(height) : undefined,
      bloodType: bloodType || undefined,
      conditions,
      allergies,
      medications: existing.medications || [],
      onboardingComplete: true,
    };
    await saveProfile(profile);
    router.replace("/(tabs)");
  };

  const skipOnboarding = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = await getProfile();
    await saveProfile({ ...existing, onboardingComplete: true });
    router.replace("/(tabs)");
  };

  const addCondition = () => {
    if (conditionInput.trim()) {
      setConditions((prev) => [...prev, conditionInput.trim()]);
      setConditionInput("");
    }
  };

  const addAllergy = () => {
    if (allergyInput.trim()) {
      setAllergies((prev) => [...prev, allergyInput.trim()]);
      setAllergyInput("");
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i === step && styles.stepDotActive,
            i < step && styles.stepDotDone,
          ]}
        />
      ))}
    </View>
  );

  const renderStep0 = () => (
    <View style={styles.stepContainer}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeIcon}>
          <MaterialCommunityIcons name="stethoscope" size={48} color={Colors.light.primary} />
        </View>
        <Text style={[styles.stepTitle, isRTL && { textAlign: "right" }]}>
          {t("Let's get to know you", "دعنا نتعرف عليك")}
        </Text>
        <Text style={[styles.stepSubtitle, isRTL && { textAlign: "right" }]}>
          {t(
            "This helps us provide more accurate health guidance",
            "هذا يساعدنا في تقديم إرشادات صحية أكثر دقة",
          )}
        </Text>

        <View style={styles.formCard}>
          <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
            {t("Your Name", "اسمك")}
          </Text>
          <TextInput
            style={[styles.textInput, isRTL && { textAlign: "right" }]}
            value={name}
            onChangeText={setName}
            placeholder={t("Enter your name", "أدخل اسمك")}
            placeholderTextColor={Colors.light.textTertiary}
          />

          <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }, { marginTop: 20 }]}>
            {t("Gender", "الجنس")}
          </Text>
          <View style={[styles.genderRow, isRTL && { flexDirection: "row-reverse" }]}>
            {[
              { key: "male", en: "Male", ar: "ذكر", icon: "male" as const },
              { key: "female", en: "Female", ar: "أنثى", icon: "female" as const },
            ].map((g) => (
              <Pressable
                key={g.key}
                style={[styles.genderOption, gender === g.key && styles.genderOptionActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGender(g.key);
                }}
              >
                <Ionicons
                  name={g.icon}
                  size={22}
                  color={gender === g.key ? Colors.light.primary : Colors.light.textTertiary}
                />
                <Text style={[styles.genderText, gender === g.key && styles.genderTextActive]}>
                  {t(g.en, g.ar)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.rowFields, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.halfField}>
              <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                {t("Age", "العمر")}
              </Text>
              <TextInput
                style={[styles.textInput, isRTL && { textAlign: "right" }]}
                value={age}
                onChangeText={setAge}
                placeholder="--"
                placeholderTextColor={Colors.light.textTertiary}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                {t("Blood Type", "فصيلة الدم")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.bloodTypeRow}>
                  {BLOOD_TYPES.map((bt) => (
                    <Pressable
                      key={bt}
                      style={[styles.bloodTypeChip, bloodType === bt && styles.bloodTypeChipActive]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setBloodType(bt === bloodType ? "" : bt);
                      }}
                    >
                      <Text
                        style={[
                          styles.bloodTypeText,
                          bloodType === bt && styles.bloodTypeTextActive,
                        ]}
                      >
                        {bt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeIcon}>
          <MaterialCommunityIcons name="human-male-height" size={48} color={Colors.light.primary} />
        </View>
        <Text style={[styles.stepTitle, isRTL && { textAlign: "right" }]}>
          {t("Body Measurements", "القياسات الجسدية")}
        </Text>
        <Text style={[styles.stepSubtitle, isRTL && { textAlign: "right" }]}>
          {t(
            "Used for accurate dosage and health calculations",
            "تستخدم لحسابات الجرعة والصحة الدقيقة",
          )}
        </Text>

        <View style={styles.formCard}>
          <View style={[styles.measureRow, isRTL && { flexDirection: "row-reverse" }]}>
            <View style={styles.measureField}>
              <View style={styles.measureIconBox}>
                <MaterialCommunityIcons name="weight-kilogram" size={28} color={Colors.light.primary} />
              </View>
              <Text style={styles.measureLabel}>{t("Weight", "الوزن")}</Text>
              <View style={styles.measureInputRow}>
                <TextInput
                  style={styles.measureInput}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="--"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.measureUnit}>{t("kg", "كغ")}</Text>
              </View>
            </View>

            <View style={styles.measureDivider} />

            <View style={styles.measureField}>
              <View style={styles.measureIconBox}>
                <MaterialCommunityIcons name="human-male-height-variant" size={28} color={Colors.light.primary} />
              </View>
              <Text style={styles.measureLabel}>{t("Height", "الطول")}</Text>
              <View style={styles.measureInputRow}>
                <TextInput
                  style={styles.measureInput}
                  value={height}
                  onChangeText={setHeight}
                  placeholder="--"
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.measureUnit}>{t("cm", "سم")}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <ScrollView
        contentContainerStyle={styles.stepScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeIcon}>
          <MaterialCommunityIcons name="medical-bag" size={48} color={Colors.light.primary} />
        </View>
        <Text style={[styles.stepTitle, isRTL && { textAlign: "right" }]}>
          {t("Medical History", "التاريخ الطبي")}
        </Text>
        <Text style={[styles.stepSubtitle, isRTL && { textAlign: "right" }]}>
          {t(
            "Any existing conditions or allergies we should know about",
            "أي حالات أو حساسية يجب أن نعرف عنها",
          )}
        </Text>

        <View style={styles.formCard}>
          <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
            {t("Known Conditions", "الحالات المعروفة")}
          </Text>
          <View style={styles.chipWrap}>
            {conditions.map((c, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
                <Pressable
                  onPress={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={6}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.light.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={[styles.addItemRow, isRTL && { flexDirection: "row-reverse" }]}>
            <TextInput
              style={[styles.addItemInput, isRTL && { textAlign: "right" }]}
              value={conditionInput}
              onChangeText={setConditionInput}
              placeholder={t("e.g., Diabetes, Hypertension", "مثال: السكري، ارتفاع الضغط")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addCondition}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addItemBtn, !conditionInput.trim() && { opacity: 0.3 }]}
              onPress={addCondition}
              disabled={!conditionInput.trim()}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.sectionDivider} />

          <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
            {t("Allergies", "الحساسية")}
          </Text>
          <View style={styles.chipWrap}>
            {allergies.map((a, i) => (
              <View key={i} style={[styles.chip, styles.chipAllergy]}>
                <Text style={[styles.chipText, styles.chipAllergyText]}>{a}</Text>
                <Pressable
                  onPress={() => setAllergies((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={6}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.light.accent} />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={[styles.addItemRow, isRTL && { flexDirection: "row-reverse" }]}>
            <TextInput
              style={[styles.addItemInput, isRTL && { textAlign: "right" }]}
              value={allergyInput}
              onChangeText={setAllergyInput}
              placeholder={t("e.g., Penicillin, Peanuts", "مثال: البنسلين، الفول السوداني")}
              placeholderTextColor={Colors.light.textTertiary}
              onSubmitEditing={addAllergy}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.addItemBtn, { backgroundColor: Colors.light.accent }, !allergyInput.trim() && { opacity: 0.3 }]}
              onPress={addAllergy}
              disabled={!allergyInput.trim()}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const isLastStep = step === totalSteps - 1;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
          {step > 0 ? (
            <Pressable onPress={goBack} hitSlop={10}>
              <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={Colors.light.text} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
          {renderStepIndicator()}
          <Pressable onPress={skipOnboarding} hitSlop={10}>
            <Text style={styles.skipText}>{t("Skip", "تخطي")}</Text>
          </Pressable>
        </View>

        <Animated.View style={[styles.stepsWrapper, animatedFade]}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
        </Animated.View>

        <View style={[styles.bottomBar, { paddingBottom: bottomInset }]}>
          <Pressable
            style={({ pressed }) => [
              styles.continueButton,
              isLastStep && styles.finishButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            onPress={isLastStep ? finishOnboarding : goNext}
          >
            <Text style={styles.continueText}>
              {isLastStep
                ? t("Get Started", "ابدأ الآن")
                : t("Continue", "متابعة")}
            </Text>
            <Ionicons
              name={isLastStep ? "checkmark" : (isRTL ? "arrow-back" : "arrow-forward")}
              size={20}
              color="#fff"
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.borderLight,
  },
  stepDotActive: {
    width: 24,
    backgroundColor: Colors.light.primary,
    borderRadius: 4,
  },
  stepDotDone: {
    backgroundColor: Colors.light.primaryLight,
  },
  stepsWrapper: {
    flex: 1,
    overflow: "hidden",
  },
  stepContainer: {
    flex: 1,
  },
  stepScroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  textInput: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  genderRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  genderOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.background,
    borderWidth: 1.5,
    borderColor: Colors.light.borderLight,
  },
  genderOptionActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  genderText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  genderTextActive: {
    color: Colors.light.primary,
  },
  rowFields: {
    flexDirection: "row",
    gap: 16,
    marginTop: 20,
  },
  halfField: {
    flex: 1,
  },
  bloodTypeRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  bloodTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  bloodTypeChipActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  bloodTypeText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
  },
  bloodTypeTextActive: {
    color: Colors.light.primary,
  },
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  measureField: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  measureDivider: {
    width: 1,
    height: 100,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 16,
  },
  measureIconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  measureLabel: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  measureInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  measureInput: {
    fontSize: 28,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    textAlign: "center",
    minWidth: 60,
    borderBottomWidth: 2,
    borderBottomColor: Colors.light.primaryLight,
    paddingVertical: 4,
  },
  measureUnit: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.primarySurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
  chipAllergy: {
    backgroundColor: Colors.light.accentLight,
  },
  chipAllergyText: {
    color: Colors.light.accent,
  },
  addItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addItemInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  addItemBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginVertical: 20,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    borderRadius: 16,
  },
  finishButton: {
    backgroundColor: Colors.light.primary,
  },
  continueText: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
});
