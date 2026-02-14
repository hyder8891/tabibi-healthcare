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
  FadeIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

type AuthMode = "login" | "signup";
type ActiveView = "form" | "forgotPassword";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { loginWithEmail, signupWithEmail, loginWithGoogle, resetPassword } = useAuth();
  const { t, isRTL } = useSettings();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : Math.max(insets.bottom, 16);

  const [mode, setMode] = useState<AuthMode>("login");
  const [activeView, setActiveView] = useState<ActiveView>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

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

  const getFirebaseErrorMessage = (code: string): string => {
    switch (code) {
      case "auth/email-already-in-use":
        return t("An account with this email already exists", "\u064a\u0648\u062c\u062f \u062d\u0633\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0628\u0627\u0644\u0641\u0639\u0644");
      case "auth/invalid-email":
        return t("Please enter a valid email", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d");
      case "auth/user-disabled":
        return t("This account has been disabled", "\u062a\u0645 \u062a\u0639\u0637\u064a\u0644 \u0647\u0630\u0627 \u0627\u0644\u062d\u0633\u0627\u0628");
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return t("Invalid email or password", "\u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0623\u0648 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629");
      case "auth/weak-password":
        return t("Password must be at least 6 characters", "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
      case "auth/too-many-requests":
        return t("Too many attempts. Please try again later.", "\u0645\u062d\u0627\u0648\u0644\u0627\u062a \u0643\u062b\u064a\u0631\u0629. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0644\u0627\u062d\u0642\u0627\u064b.");
      case "auth/popup-closed-by-user":
        return t("Sign-in was cancelled", "\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644");
      case "auth/network-request-failed":
        return t("Network error. Please check your connection.", "\u062e\u0637\u0623 \u0641\u064a \u0627\u0644\u0634\u0628\u0643\u0629. \u064a\u0631\u062c\u0649 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062a\u0635\u0627\u0644.");
      default:
        return t("Something went wrong. Please try again.", "\u062d\u062f\u062b \u062e\u0637\u0623. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.");
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t("Please fill in all fields", "\u064a\u0631\u062c\u0649 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644"));
      return;
    }
    if (!email.includes("@")) {
      setError(t("Please enter a valid email", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d"));
      return;
    }

    setLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (mode === "login") {
        await loginWithEmail(email.trim(), password);
      } else {
        await signupWithEmail(email.trim(), password);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.code || "";
      setError(getFirebaseErrorMessage(code));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      await loginWithGoogle();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.code || "";
      if (code !== "auth/popup-closed-by-user") {
        setError(getFirebaseErrorMessage(code));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim() || !resetEmail.includes("@")) {
      setError(t("Please enter a valid email", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await resetPassword(resetEmail.trim());
      setResetSent(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.code || "";
      setError(getFirebaseErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  if (activeView === "forgotPassword") {
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
            </View>

            <Animated.View entering={FadeIn.duration(300)} style={styles.formCard}>
              <Pressable
                onPress={() => { setActiveView("form"); setError(""); setResetSent(false); }}
                style={styles.backButton}
                hitSlop={12}
              >
                <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={Colors.light.text} />
              </Pressable>

              <View style={styles.verificationHeader}>
                <View style={styles.verificationIconBg}>
                  <Ionicons name="key" size={32} color={Colors.light.primary} />
                </View>
                <Text style={[styles.verificationTitle, isRTL && { textAlign: "right" }]}>
                  {t("Reset Password", "\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
                </Text>
                <Text style={[styles.verificationSubtitle, isRTL && { textAlign: "right" }]}>
                  {resetSent
                    ? t("Check your email for a password reset link.", "\u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0631\u0627\u0628\u0637 \u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.")
                    : t("Enter your email and we'll send you a reset link.", "\u0623\u062f\u062e\u0644 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0648\u0633\u0646\u0631\u0633\u0644 \u0644\u0643 \u0631\u0627\u0628\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0639\u064a\u064a\u0646.")}
                </Text>
              </View>

              {!resetSent && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, isRTL && { textAlign: "right" }]}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      placeholder={t("Email address", "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a")}
                      placeholderTextColor={Colors.light.textTertiary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      testID="reset-email-input"
                    />
                  </View>
                </View>
              )}

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={16} color={Colors.light.emergency} />
                  <Text style={[styles.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
                </View>
              ) : null}

              {!resetSent ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    loading && { opacity: 0.7 },
                  ]}
                  onPress={handleResetPassword}
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
                      <Text style={styles.submitText}>
                        {t("Send Reset Link", "\u0625\u0631\u0633\u0627\u0644 \u0631\u0627\u0628\u0637 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0639\u064a\u064a\u0646")}
                      </Text>
                    )}
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.submitButton,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={() => { setActiveView("form"); setResetSent(false); setError(""); }}
                >
                  <LinearGradient
                    colors={[Colors.light.cardGradientStart, Colors.light.cardGradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.submitGradient}
                  >
                    <Text style={styles.submitText}>
                      {t("Back to Login", "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644")}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

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
              {t("Tabibi", "\u0637\u0628\u064a\u0628\u064a")}
            </Text>
            <Text style={[styles.appSubtitle, isRTL && { textAlign: "right" }]}>
              {t("Your Active Healthcare Navigator", "\u0645\u0633\u0627\u0639\u062f\u0643 \u0627\u0644\u0635\u062d\u064a \u0627\u0644\u0630\u0643\u064a")}
            </Text>
          </View>

          <Animated.View style={[styles.formCard, formAnimStyle]}>
            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, mode === "login" && styles.tabActive]}
                onPress={() => mode !== "login" && toggleMode()}
              >
                <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>
                  {t("Log In", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "signup" && styles.tabActive]}
                onPress={() => mode !== "signup" && toggleMode()}
              >
                <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
                  {t("Sign Up", "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628")}
                </Text>
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                {t("Email", "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a")}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, isRTL && { textAlign: "right" }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("your@email.com", "your@email.com")}
                  placeholderTextColor={Colors.light.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  testID="email-input"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                {t("Password", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.textInput, { flex: 1 }, isRTL && { textAlign: "right" }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t("Min 6 characters", "\u0623\u0642\u0644 6 \u0623\u062d\u0631\u0641")}
                  placeholderTextColor={Colors.light.textTertiary}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  testID="password-input"
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

            {mode === "login" && (
              <Pressable
                onPress={() => { setActiveView("forgotPassword"); setError(""); setResetEmail(email); }}
                style={styles.forgotButton}
              >
                <Text style={[styles.forgotText, isRTL && { textAlign: "right" }]}>
                  {t("Forgot password?", "\u0646\u0633\u064a\u062a \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631\u061f")}
                </Text>
              </Pressable>
            )}

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
              disabled={loading || googleLoading}
              testID="submit-button"
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
                        ? t("Log In", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644")
                        : t("Create Account", "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628")}
                    </Text>
                    <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t("or", "\u0623\u0648")}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                googleLoading && { opacity: 0.7 },
              ]}
              onPress={handleGoogleSignIn}
              disabled={loading || googleLoading}
              testID="google-signin-button"
            >
              {googleLoading ? (
                <ActivityIndicator color={Colors.light.text} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="google" size={22} color="#DB4437" />
                  <Text style={styles.googleButtonText}>
                    {t("Continue with Google", "\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0645\u0639 Google")}
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>

          <View style={styles.disclaimer}>
            <Ionicons name="shield-checkmark" size={16} color={Colors.light.textTertiary} />
            <Text style={styles.disclaimerText}>
              {t(
                "Your health data is encrypted and stored securely.",
                "\u0628\u064a\u0627\u0646\u0627\u062a\u0643 \u0627\u0644\u0635\u062d\u064a\u0629 \u0645\u0634\u0641\u0631\u0629 \u0648\u0645\u062e\u0632\u0646\u0629 \u0628\u0634\u0643\u0644 \u0622\u0645\u0646.",
              )}
            </Text>
          </View>
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
    flexGrow: 1,
    justifyContent: "center",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 32,
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
    fontSize: 30,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
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
    alignItems: "center",
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
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
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 8,
    marginTop: -8,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.emergencyLight,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.emergency,
  },
  submitButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 4,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.borderLight,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    paddingHorizontal: 16,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.light.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingVertical: 13,
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  backButton: {
    position: "absolute" as const,
    top: 16,
    left: 16,
    zIndex: 1,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  verificationHeader: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
  },
  verificationIconBg: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  verificationTitle: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: "center",
  },
  verificationSubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  disclaimerText: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
});
