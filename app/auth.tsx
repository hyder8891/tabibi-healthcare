import React, { useState, useEffect, useRef } from "react";
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
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";

type AuthMode = "login" | "signup";
type IdentifierType = "email" | "phone";
type Step = "credentials" | "verification";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, signup, sendVerification, verifyPhoneOTP, checkEmailVerified, resendVerification } = useAuth();
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

  const [step, setStep] = useState<Step>("credentials");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [verificationIdentifier, setVerificationIdentifier] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [devCode, setDevCode] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);
  const emailCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const formScale = useSharedValue(1);
  const formAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: formScale.value }],
  }));

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    return () => {
      if (emailCheckInterval.current) clearInterval(emailCheckInterval.current);
    };
  }, []);

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    formScale.value = withSpring(0.97, { damping: 15 }, () => {
      formScale.value = withSpring(1, { damping: 15 });
    });
    setMode((m) => (m === "login" ? "signup" : "login"));
    setError("");
    setStep("credentials");
    setOtpCode(["", "", "", "", "", ""]);
  };

  const switchIdentifier = (type: IdentifierType) => {
    if (type === identifierType) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIdentifierType(type);
    setError("");
  };

  const identifierValue = identifierType === "email" ? email : phone;

  const handleOtpChange = (value: string, index: number) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").split("").slice(0, 6);
      const newCode = [...otpCode];
      digits.forEach((d, i) => {
        if (index + i < 6) newCode[index + i] = d;
      });
      setOtpCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    const newCode = [...otpCode];
    newCode[index] = value.replace(/\D/g, "");
    setOtpCode(newCode);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      const newCode = [...otpCode];
      newCode[index - 1] = "";
      setOtpCode(newCode);
    }
  };

  const handleSubmit = async () => {
    if (!identifierValue.trim() || !password.trim()) {
      setError(t("Please fill in all fields", "\u064a\u0631\u062c\u0649 \u0645\u0644\u0621 \u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0644"));
      return;
    }
    if (identifierType === "email" && !email.includes("@")) {
      setError(t("Please enter a valid email", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d"));
      return;
    }
    if (identifierType === "phone" && phone.replace(/[\s\-\(\)\+]/g, "").length < 7) {
      setError(t("Please enter a valid phone number", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u0635\u062d\u064a\u062d"));
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError(t("Password must be at least 6 characters", "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644"));
      return;
    }

    setLoading(true);
    setError("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (mode === "login") {
        const params = {
          ...(identifierType === "email" ? { email: email.trim() } : { phone: phone.trim() }),
          password,
        };
        await login(params);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        const params = {
          ...(identifierType === "email" ? { email: email.trim() } : { phone: phone.trim() }),
          password,
        };
        const result = await sendVerification(params);
        setVerificationIdentifier(result.identifier);
        if (result.refreshToken) setRefreshToken(result.refreshToken);
        if (result.devCode) setDevCode(result.devCode);
        setStep("verification");
        setResendCooldown(60);

        if (result.method === "email") {
          startEmailVerificationPolling(result.identifier, result.refreshToken);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("409")) {
        setError(
          identifierType === "email"
            ? t("An account with this email already exists", "\u064a\u0648\u062c\u062f \u062d\u0633\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0628\u0627\u0644\u0641\u0639\u0644")
            : t("An account with this phone number already exists", "\u064a\u0648\u062c\u062f \u062d\u0633\u0627\u0628 \u0628\u0647\u0630\u0627 \u0627\u0644\u0631\u0642\u0645 \u0628\u0627\u0644\u0641\u0639\u0644")
        );
      } else if (msg.includes("401")) {
        setError(t("Invalid credentials", "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062f\u062e\u0648\u0644 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d\u0629"));
      } else {
        setError(t("Something went wrong. Please try again.", "\u062d\u062f\u062b \u062e\u0637\u0623. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const startEmailVerificationPolling = (identifier: string, rToken?: string) => {
    if (emailCheckInterval.current) clearInterval(emailCheckInterval.current);
    emailCheckInterval.current = setInterval(async () => {
      try {
        const verified = await checkEmailVerified(identifier, rToken);
        if (verified) {
          if (emailCheckInterval.current) clearInterval(emailCheckInterval.current);
          await completeSignup();
        }
      } catch {}
    }, 3000);
  };

  const handleCheckEmailManually = async () => {
    setCheckingEmail(true);
    setError("");
    try {
      const verified = await checkEmailVerified(verificationIdentifier, refreshToken);
      if (verified) {
        if (emailCheckInterval.current) clearInterval(emailCheckInterval.current);
        await completeSignup();
      } else {
        setError(t("Email not verified yet. Please check your inbox and click the verification link.", "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0628\u0639\u062f. \u064a\u0631\u062c\u0649 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a."));
      }
    } catch {
      setError(t("Failed to check verification status", "\u0641\u0634\u0644 \u0641\u064a \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u062d\u0627\u0644\u0629 \u0627\u0644\u062a\u062d\u0642\u0642"));
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleVerifyPhoneOTP = async () => {
    const code = otpCode.join("");
    if (code.length !== 6) {
      setError(t("Please enter the 6-digit code", "\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const verified = await verifyPhoneOTP(verificationIdentifier, code);
      if (verified) {
        await completeSignup();
      } else {
        setError(t("Invalid code. Please try again.", "\u0631\u0645\u0632 \u063a\u064a\u0631 \u0635\u062d\u064a\u062d. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setError(t("Verification failed. Please try again.", "\u0641\u0634\u0644 \u0627\u0644\u062a\u062d\u0642\u0642. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async () => {
    setLoading(true);
    try {
      const params = {
        ...(identifierType === "email" ? { email: email.trim() } : { phone: phone.trim() }),
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
      };
      await signup(params);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(t("Failed to create account. Please try again.", "\u0641\u0634\u0644 \u0641\u064a \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062d\u0633\u0627\u0628. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError("");
    try {
      const params = {
        ...(identifierType === "email" ? { email: email.trim() } : { phone: phone.trim() }),
        password,
      };
      const result = await resendVerification(params);
      if (result.refreshToken) setRefreshToken(result.refreshToken);
      if (result.devCode) setDevCode(result.devCode);
      setResendCooldown(60);

      if (identifierType === "email" && result.refreshToken) {
        startEmailVerificationPolling(verificationIdentifier, result.refreshToken);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(t("Failed to resend. Please try again.", "\u0641\u0634\u0644 \u0641\u064a \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
    } finally {
      setLoading(false);
    }
  };

  const goBackToCredentials = () => {
    if (emailCheckInterval.current) clearInterval(emailCheckInterval.current);
    setStep("credentials");
    setOtpCode(["", "", "", "", "", ""]);
    setDevCode("");
    setError("");
  };

  const renderVerificationStep = () => {
    if (identifierType === "email") {
      return (
        <Animated.View entering={FadeIn.duration(300)} style={styles.formCard}>
          <Pressable onPress={goBackToCredentials} style={styles.backButton} hitSlop={12}>
            <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={Colors.light.text} />
          </Pressable>

          <View style={styles.verificationHeader}>
            <View style={styles.verificationIconBg}>
              <Ionicons name="mail" size={32} color={Colors.light.primary} />
            </View>
            <Text style={[styles.verificationTitle, isRTL && { textAlign: "right" }]}>
              {t("Check Your Email", "\u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643")}
            </Text>
            <Text style={[styles.verificationSubtitle, isRTL && { textAlign: "right" }]}>
              {t(
                `We sent a verification link to ${verificationIdentifier}. Click the link in the email to verify your account.`,
                `\u0623\u0631\u0633\u0644\u0646\u0627 \u0631\u0627\u0628\u0637 \u0627\u0644\u062a\u062d\u0642\u0642 \u0625\u0644\u0649 ${verificationIdentifier}. \u0627\u0646\u0642\u0631 \u0639\u0644\u0649 \u0627\u0644\u0631\u0627\u0628\u0637 \u0641\u064a \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0644\u062a\u062d\u0642\u0642.`
              )}
            </Text>
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
              checkingEmail && { opacity: 0.7 },
            ]}
            onPress={handleCheckEmailManually}
            disabled={checkingEmail}
          >
            <LinearGradient
              colors={[Colors.light.cardGradientStart, Colors.light.cardGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {checkingEmail ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.submitText}>
                    {t("I've Verified My Email", "\u0644\u0642\u062f \u062a\u062d\u0642\u0642\u062a \u0645\u0646 \u0628\u0631\u064a\u062f\u064a")}
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={handleResend}
            disabled={resendCooldown > 0 || loading}
            style={styles.resendButton}
          >
            <Text style={[styles.resendText, resendCooldown > 0 && { opacity: 0.5 }]}>
              {resendCooldown > 0
                ? t(`Resend in ${resendCooldown}s`, `\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062e\u0644\u0627\u0644 ${resendCooldown}\u062b`)
                : t("Resend Verification Email", "\u0625\u0639\u0627\u062f\u0629 \u0625\u0631\u0633\u0627\u0644 \u0631\u0627\u0628\u0637 \u0627\u0644\u062a\u062d\u0642\u0642")}
            </Text>
          </Pressable>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.formCard}>
        <Pressable onPress={goBackToCredentials} style={styles.backButton} hitSlop={12}>
          <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={Colors.light.text} />
        </Pressable>

        <View style={styles.verificationHeader}>
          <View style={styles.verificationIconBg}>
            <Ionicons name="phone-portrait" size={32} color={Colors.light.primary} />
          </View>
          <Text style={[styles.verificationTitle, isRTL && { textAlign: "right" }]}>
            {t("Enter Verification Code", "\u0623\u062f\u062e\u0644 \u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642")}
          </Text>
          <Text style={[styles.verificationSubtitle, isRTL && { textAlign: "right" }]}>
            {t(
              `Enter the 6-digit code sent to ${verificationIdentifier}`,
              `\u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u0645\u0643\u0648\u0646 \u0645\u0646 6 \u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u0645\u0631\u0633\u0644 \u0625\u0644\u0649 ${verificationIdentifier}`
            )}
          </Text>
        </View>

        {devCode ? (
          <View style={styles.devCodeBanner}>
            <Ionicons name="bug" size={16} color="#92400E" />
            <Text style={styles.devCodeText}>
              Dev Code: {devCode}
            </Text>
          </View>
        ) : null}

        <View style={styles.otpContainer}>
          {otpCode.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { otpInputRefs.current[index] = ref; }}
              style={[
                styles.otpInput,
                digit ? styles.otpInputFilled : null,
              ]}
              value={digit}
              onChangeText={(v) => handleOtpChange(v, index)}
              onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              testID={`otp-input-${index}`}
            />
          ))}
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
          onPress={handleVerifyPhoneOTP}
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
                  {t("Verify", "\u062a\u062d\u0642\u0642")}
                </Text>
                <Ionicons name={isRTL ? "arrow-back" : "arrow-forward"} size={20} color="#fff" />
              </>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={resendCooldown > 0 || loading}
          style={styles.resendButton}
        >
          <Text style={[styles.resendText, resendCooldown > 0 && { opacity: 0.5 }]}>
            {resendCooldown > 0
              ? t(`Resend in ${resendCooldown}s`, `\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062e\u0644\u0627\u0644 ${resendCooldown}\u062b`)
              : t("Resend Code", "\u0625\u0639\u0627\u062f\u0629 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0645\u0632")}
          </Text>
        </Pressable>
      </Animated.View>
    );
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
              {t("Tabibi", "\u0637\u0628\u064a\u0628\u064a")}
            </Text>
            <Text style={[styles.appSubtitle, isRTL && { textAlign: "right" }]}>
              {t("Your Active Healthcare Navigator", "\u0645\u0633\u0627\u0639\u062f\u0643 \u0627\u0644\u0635\u062d\u064a \u0627\u0644\u0630\u0643\u064a")}
            </Text>
          </View>

          {step === "verification" ? (
            renderVerificationStep()
          ) : (
            <>
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

                {mode === "signup" && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
                      {t("Name", "\u0627\u0644\u0627\u0633\u0645")}
                    </Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.textInput, isRTL && { textAlign: "right" }]}
                        value={name}
                        onChangeText={setName}
                        placeholder={t("Your name", "\u0627\u0633\u0645\u0643")}
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
                        ? t("Email", "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a")
                        : t("Phone Number", "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641")}
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
                          {t("Phone", "\u0647\u0627\u062a\u0641")}
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
                          {t("Email", "\u0628\u0631\u064a\u062f")}
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
                    {t("Password", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631")}
                  </Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={20} color={Colors.light.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.textInput, { flex: 1 }, isRTL && { textAlign: "right" }]}
                      value={password}
                      onChangeText={(v) => { setPassword(v); setError(""); }}
                      placeholder={mode === "signup" ? t("Min. 6 characters", "6 \u0623\u062d\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644") : "********"}
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
                            ? t("Log In", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644")
                            : t("Continue", "\u0645\u062a\u0627\u0628\u0639\u0629")}
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
                    ? t("Don't have an account? ", "\u0644\u064a\u0633 \u0644\u062f\u064a\u0643 \u062d\u0633\u0627\u0628\u061f ")
                    : t("Already have an account? ", "\u0644\u062f\u064a\u0643 \u062d\u0633\u0627\u0628 \u0628\u0627\u0644\u0641\u0639\u0644\u061f ")}
                  <Text style={styles.switchLink}>
                    {mode === "login" ? t("Sign Up", "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628") : t("Log In", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644")}
                  </Text>
                </Text>
              </Pressable>
            </>
          )}
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
  backButton: {
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  verificationHeader: {
    alignItems: "center",
    marginBottom: 24,
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
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 24,
  },
  otpInput: {
    width: 46,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.light.borderLight,
    backgroundColor: Colors.light.background,
    textAlign: "center" as const,
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  otpInputFilled: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySurface,
  },
  devCodeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  devCodeText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: "#92400E",
  },
  resendButton: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  resendText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
});
