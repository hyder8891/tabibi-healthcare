import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

type AuthMode = "login" | "signup";
type IdentifierType = "email" | "phone";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, signup } = useAuth();
  const { t, isRTL } = useSettings();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : Math.max(insets.bottom, 16);

  const [mode, setMode] = useState<AuthMode>("login");
  const [identifierType, setIdentifierType] = useState<IdentifierType>("phone");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formScale = useSharedValue(1);
  const formAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: formScale.value }],
  }));

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    formScale.value = withSpring(0.97, { damping: 15 }, () => {
      formScale.value = withSpring(1, { damping: 15 });
    });
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
  };

  const switchIdentifier = (type: IdentifierType) => {
    if (type === identifierType) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIdentifierType(type);
    setError("");
  };

  const identifierValue = identifierType === "email" ? email : phone;

  const handleSubmit = async () => {
    if (!identifierValue.trim() || !password.trim()) {
      setError(t("Please fill in all fields", "يرجى ملء جميع الحقول"));
      return;
    }
    if (identifierType === "email" && !email.includes("@")) {
      setError(t("Please enter a valid email", "يرجى إدخال بريد إلكتروني صحيح"));
      return;
    }
    if (identifierType === "phone" && phone.replace(/[\s\-\(\)\+]/g, "").length < 7) {
      setError(t("Please enter a valid phone number", "يرجى إدخال رقم هاتف صحيح"));
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError(t("Password must be at least 6 characters", "يجب أن تكون كلمة المرور 6 أحرف على الأقل"));
      return;
    }

    setLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const params = {
        ...(identifierType === "email" ? { email: email.trim() } : { phone: phone.trim() }),
        password,
        ...(mode === "signup" && name.trim() ? { name: name.trim() } : {}),
      };

      if (mode === "login") {
        await login(params);
      } else {
        await signup(params);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("409")) {
        setError(
          identifierType === "email"
            ? t("An account with this email already exists", "يوجد حساب بهذا البريد الإلكتروني بالفعل")
            : t("An account with this phone number already exists", "يوجد حساب بهذا الرقم بالفعل")
        );
      } else if (msg.includes("401")) {
        setError(t("Invalid credentials", "بيانات الدخول غير صحيحة"));
      } else {
        setError(t("Something went wrong. Please try again.", "حدث خطأ. يرجى المحاولة مرة أخرى."));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <LinearGradient
              colors={[Colors.light.cardGradientStart, Colors.light.cardGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBg}
            >
              <MaterialCommunityIcons name="stethoscope" size={40} color="#fff" />
            </LinearGradient>
            <Text style={[styles.appTitle, isRTL && { textAlign: "right" }]}>
              {t("Tabibi", "طبيبي")}
            </Text>
            <Text style={[styles.appSubtitle, isRTL && { textAlign: "right" }]}>
              {t("Your Active Healthcare Navigator", "مساعدك الصحي الذكي")}
            </Text>
          </View>

          <Animated.View style={[styles.formCard, formAnimStyle]}>
            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, mode === "login" && styles.tabActive]}
                onPress={() => mode !== "login" && toggleMode()}
              >
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  {t("Log In", "تسجيل الدخول")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "signup" && styles.tabActive]}
                onPress={() => mode !== "signup" && toggleMode()}
              >
                <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                  {t("Sign Up", "إنشاء حساب")}
                </Text>
              </Pressable>
            </View>

            {mode === "signup" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                  {t("Name", "الاسم")}
                </Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.textInput, isRTL && { textAlign: "right" }]}
                    value={name}
                    onChangeText={setName}
                    placeholder={t("Your name", "اسمك")}
                    placeholderTextColor={Colors.light.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <View style={styles.identifierHeader}>
                <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                  {identifierType === "email"
                    ? t("Email", "البريد الإلكتروني")
                    : t("Phone Number", "رقم الهاتف")}
                </Text>
                <View style={styles.identifierToggle}>
                  <Pressable
                    onPress={() => switchIdentifier("phone")}
                    style={[styles.identifierPill, identifierType === "phone" && styles.identifierPillActive]}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="call-outline"
                      size={14}
                      color={identifierType === "phone" ? Colors.light.primary : Colors.light.textTertiary}
                    />
                    <Text
                      style={[
                        styles.identifierPillText,
                        identifierType === "phone" && styles.identifierPillTextActive,
                      ]}
                    >
                      {t("Phone", "هاتف")}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchIdentifier("email")}
                    style={[styles.identifierPill, identifierType === "email" && styles.identifierPillActive]}
                    hitSlop={4}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={14}
                      color={identifierType === "email" ? Colors.light.primary : Colors.light.textTertiary}
                    />
                    <Text
                      style={[
                        styles.identifierPillText,
                        identifierType === "email" && styles.identifierPillTextActive,
                      ]}
                    >
                      {t("Email", "بريد")}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name={identifierType === "email" ? "mail-outline" : "call-outline"}
                  size={20}
                  color={Colors.light.textTertiary}
                  style={styles.inputIcon}
                />
                {identifierType === "email" ? (
                  <TextInput
                    style={[styles.textInput, isRTL && { textAlign: "right" }]}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(""); }}
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.light.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : (
                  <TextInput
                    style={[styles.textInput, isRTL && { textAlign: "right" }]}
                    value={phone}
                    onChangeText={(v) => { setPhone(v); setError(""); }}
                    placeholder={t("+1 234 567 8900", "+966 5X XXX XXXX")}
                    placeholderTextColor={Colors.light.textTertiary}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                {t("Password", "كلمة المرور")}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { flex: 1 }, isRTL && { textAlign: "right" }]}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(""); }}
                  placeholder={mode === "signup" ? t("Min. 6 characters", "6 أحرف على الأقل") : "********"}
                  placeholderTextColor={Colors.light.textTertiary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={Colors.light.textTertiary}
                  />
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={16} color={Colors.light.emergency} />
                <Text style={[styles.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                loading && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <LinearGradient
                colors={[Colors.light.cardGradientStart, Colors.light.cardGradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {mode === "login"
                        ? t("Log In", "تسجيل الدخول")
                        : t("Create Account", "إنشاء حساب")}
                    </Text>
                    <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable onPress={toggleMode} style={styles.switchRow}>
            <Text style={[styles.switchText, isRTL && { textAlign: "right" }]}>
              {mode === "login"
                ? t("Don't have an account? ", "ليس لديك حساب؟ ")
                : t("Already have an account? ", "لديك حساب بالفعل؟ ")}
              <Text style={styles.switchLink}>
                {mode === "login" ? t("Sign Up", "إنشاء حساب") : t("Log In", "تسجيل الدخول")}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 36,
  },
  logoBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 32,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: Colors.light.surface,
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
  },
  tabTextActive: {
    color: Colors.light.primary,
    fontFamily: "DMSans_600SemiBold",
  },
  inputGroup: {
    marginBottom: 18,
  },
  identifierHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  identifierToggle: {
    flexDirection: "row",
    gap: 4,
  },
  identifierPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
  },
  identifierPillActive: {
    backgroundColor: Colors.light.primarySurface,
  },
  identifierPillText: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
  },
  identifierPillTextActive: {
    color: Colors.light.primary,
    fontFamily: "DMSans_600SemiBold",
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
    paddingVertical: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.light.emergencyLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.emergency,
    flex: 1,
  },
  submitButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
  },
  switchRow: {
    marginTop: 24,
    alignItems: "center",
  },
  switchText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  switchLink: {
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
  },
});
