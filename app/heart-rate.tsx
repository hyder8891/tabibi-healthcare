import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions } from "expo-camera";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { getProfile, saveProfile } from "@/lib/storage";

const MEASUREMENT_DURATION = 30;
const CAPTURE_FPS = 10;
const MIN_SAMPLES = 150;

type MeasurementState = "idle" | "measuring" | "processing" | "result";

interface RppgResult {
  heartRate: number;
  confidence: "high" | "medium" | "low";
  waveform: number[];
  signalQuality: number;
  message: string;
}

function extractRGBFromBase64Web(base64Data: string): Promise<{ r: number; g: number; b: number }> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ r: 128, g: 128, b: 128 });
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const roiX = Math.floor(size * 0.25);
        const roiY = Math.floor(size * 0.25);
        const roiW = Math.floor(size * 0.5);
        const roiH = Math.floor(size * 0.5);
        const imageData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const data = imageData.data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }
        resolve({
          r: count > 0 ? rSum / count : 128,
          g: count > 0 ? gSum / count : 128,
          b: count > 0 ? bSum / count : 128,
        });
      };
      img.onerror = () => resolve({ r: 128, g: 128, b: 128 });
      img.src = `data:image/jpeg;base64,${base64Data}`;
    } catch {
      resolve({ r: 128, g: 128, b: 128 });
    }
  });
}

function extractRGBFromBase64Native(base64Data: string): { r: number; g: number; b: number } {
  try {
    const raw = atob(base64Data);
    const len = raw.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = raw.charCodeAt(i);
    }

    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < len - 2; i++) {
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      if (b1 === 0xFF && b2 === 0xC0) {
        break;
      }
    }

    const quarter = Math.floor(len * 0.25);
    const threeQuarter = Math.floor(len * 0.75);
    const step = Math.max(1, Math.floor((threeQuarter - quarter) / 3000));

    for (let i = quarter; i < threeQuarter - 2; i += step) {
      rSum += bytes[i];
      gSum += bytes[i + 1];
      bSum += bytes[i + 2];
      count++;
    }

    return {
      r: count > 0 ? rSum / count : 128,
      g: count > 0 ? gSum / count : 128,
      b: count > 0 ? bSum / count : 128,
    };
  } catch {
    return { r: 128, g: 128, b: 128 };
  }
}

function PulseWaveform({ waveform, color }: { waveform: number[]; color: string }) {
  const width = Dimensions.get("window").width - 64;
  const height = 80;
  const points = waveform.length;
  
  if (points === 0) return null;

  const stepX = width / (points - 1);
  const midY = height / 2;
  const amplitude = height * 0.4;

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      {waveform.map((val, i) => {
        if (i === 0) return null;
        const x = i * stepX;
        const y = midY - val * amplitude;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: x - 1.5,
              top: y - 1.5,
              width: 3,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: color,
              opacity: 0.8,
            }}
          />
        );
      })}
    </View>
  );
}

export default function HeartRateScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<MeasurementState>("idle");
  const [countdown, setCountdown] = useState(MEASUREMENT_DURATION);
  const [result, setResult] = useState<RppgResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const signalsRef = useRef<Array<{ r: number; g: number; b: number; timestamp: number }>>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  const pulseAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const startPulseAnimation = useCallback(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 400, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 400, easing: Easing.in(Easing.ease) })
      ),
      -1,
      false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.6, { duration: 400 })
      ),
      -1,
      false
    );
  }, []);

  const stopPulseAnimation = useCallback(() => {
    cancelAnimation(pulseScale);
    cancelAnimation(pulseOpacity);
    pulseScale.value = 1;
    pulseOpacity.value = 0.6;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      stopPulseAnimation();
    };
  }, []);

  const captureFrame = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.1,
        base64: true,
        skipProcessing: true,
      });
      
      if (photo?.base64) {
        let rgb: { r: number; g: number; b: number };
        if (Platform.OS === "web") {
          rgb = await extractRGBFromBase64Web(photo.base64);
        } else {
          rgb = extractRGBFromBase64Native(photo.base64);
        }
        signalsRef.current.push({
          ...rgb,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      // silently skip failed frame captures
    }
  }, []);

  const processSignals = useCallback(async () => {
    setState("processing");
    
    try {
      const signals = signalsRef.current;
      if (signals.length < MIN_SAMPLES) {
        setError(t(
          "Not enough data collected. Please try again with better lighting.",
          "لم يتم جمع بيانات كافية. يرجى المحاولة مرة أخرى في إضاءة أفضل."
        ));
        setState("idle");
        return;
      }

      const apiUrl = getApiUrl();
      const url = new URL("/api/process-rppg", apiUrl);
      const authHeaders = await getAuthHeaders();
      
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          signals,
          fps: CAPTURE_FPS,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setState("idle");
        return;
      }

      setResult(data);
      setState("result");
      startPulseAnimation();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      getProfile().then((profile) => {
        saveProfile({ ...profile, lastBpm: data.heartRate, lastBpmDate: Date.now() });
      });
    } catch (err) {
      setError(t(
        "Failed to process heart rate data. Please try again.",
        "فشل في معالجة بيانات معدل ضربات القلب. يرجى المحاولة مرة أخرى."
      ));
      setState("idle");
    }
  }, []);

  const startMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setResult(null);
    signalsRef.current = [];
    setState("measuring");
    setCountdown(MEASUREMENT_DURATION);

    intervalRef.current = setInterval(captureFrame, Math.round(1000 / CAPTURE_FPS));

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          processSignals();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [captureFrame, processSignals]);

  const resetMeasurement = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopPulseAnimation();
    signalsRef.current = [];
    setState("idle");
    setResult(null);
    setError(null);
    setCountdown(MEASUREMENT_DURATION);
  }, []);

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: topInset }]}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIconCircle}>
            <Ionicons name="heart" size={40} color={Colors.light.emergency} />
          </View>
          <Text style={styles.permissionTitle}>
            {t("Camera Access Required", "مطلوب الوصول إلى الكاميرا")}
          </Text>
          <Text style={styles.permissionText}>
            {t(
              "The heart rate monitor uses your front camera to detect subtle color changes in your face that correspond to your pulse.",
              "يستخدم مقياس معدل ضربات القلب الكاميرا الأمامية للكشف عن تغييرات اللون الدقيقة في وجهك التي تتوافق مع نبضك."
            )}
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>
              {t("Enable Camera", "تفعيل الكاميرا")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const confidenceColor = result?.confidence === "high"
    ? Colors.light.success
    : result?.confidence === "medium"
      ? Colors.light.warning
      : Colors.light.emergency;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Heart Rate Monitor", "مقياس نبضات القلب")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {state !== "result" ? (
        <View style={styles.cameraSection}>
          <View style={styles.cameraContainer}>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              animateShutter={false}
            />
            <View style={styles.cameraOverlay}>
              <View style={styles.faceGuide}>
                <View style={[styles.cornerTL, styles.corner]} />
                <View style={[styles.cornerTR, styles.corner]} />
                <View style={[styles.cornerBL, styles.corner]} />
                <View style={[styles.cornerBR, styles.corner]} />
              </View>
            </View>
            {state === "measuring" && (
              <View style={styles.countdownOverlay}>
                <Text style={styles.countdownText}>{countdown}s</Text>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${((MEASUREMENT_DURATION - countdown) / MEASUREMENT_DURATION) * 100}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            )}
          </View>

          <View style={styles.instructionSection}>
            {state === "idle" && (
              <>
                <Text style={[styles.instructionTitle, isRTL && { textAlign: "right" }]}>
                  {t("Position Your Face", "ضع وجهك")}
                </Text>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t(
                    "Hold your phone steady and look at the camera. Ensure good lighting on your face.",
                    "امسك هاتفك ثابتاً وانظر إلى الكاميرا. تأكد من الإضاءة الجيدة على وجهك."
                  )}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.startButton,
                    pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                  ]}
                  onPress={startMeasurement}
                >
                  <Ionicons name="heart" size={20} color="#fff" />
                  <Text style={styles.startButtonText}>
                    {t("Start Measurement", "بدء القياس")}
                  </Text>
                </Pressable>
              </>
            )}

            {state === "measuring" && (
              <>
                <View style={styles.measuringRow}>
                  <View style={styles.pulsingDot} />
                  <Text style={styles.measuringText}>
                    {t("Measuring...", "جاري القياس...")}
                  </Text>
                </View>
                <Text style={[styles.instructionText, isRTL && { textAlign: "right" }]}>
                  {t("Stay still and breathe normally", "ابقَ ثابتاً وتنفس بشكل طبيعي")}
                </Text>
                <Pressable style={styles.cancelButton} onPress={resetMeasurement}>
                  <Text style={styles.cancelButtonText}>
                    {t("Cancel", "إلغاء")}
                  </Text>
                </Pressable>
              </>
            )}

            {state === "processing" && (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <Text style={styles.processingText}>
                  {t("Analyzing pulse data...", "جاري تحليل بيانات النبض...")}
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : result ? (
        <View style={styles.resultSection}>
          <Animated.View style={[styles.bpmCircle, pulseAnimStyle]}>
            <Ionicons name="heart" size={28} color={Colors.light.emergency} />
            <Text style={styles.bpmValue}>{result.heartRate}</Text>
            <Text style={styles.bpmLabel}>BPM</Text>
          </Animated.View>

          <View style={[styles.confidenceBadge, { backgroundColor: confidenceColor + "20" }]}>
            <View style={[styles.confidenceDot, { backgroundColor: confidenceColor }]} />
            <Text style={[styles.confidenceText, { color: confidenceColor }]}>
              {result.confidence === "high"
                ? t("High Confidence", "ثقة عالية")
                : result.confidence === "medium"
                  ? t("Medium Confidence", "ثقة متوسطة")
                  : t("Low Confidence", "ثقة منخفضة")}
            </Text>
          </View>

          <Text style={[styles.resultMessage, isRTL && { textAlign: "right" }]}>
            {result.message}
          </Text>

          {result.waveform && result.waveform.length > 0 && (
            <View style={styles.waveformContainer}>
              <Text style={styles.waveformLabel}>
                {t("Pulse Waveform", "موجة النبض")}
              </Text>
              <PulseWaveform waveform={result.waveform} color={Colors.light.emergency} />
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{result.signalQuality}%</Text>
              <Text style={styles.statLabel}>{t("Signal Quality", "جودة الإشارة")}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {result.heartRate < 60
                  ? t("Low", "منخفض")
                  : result.heartRate > 100
                    ? t("High", "مرتفع")
                    : t("Normal", "طبيعي")}
              </Text>
              <Text style={styles.statLabel}>{t("Range", "النطاق")}</Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.9 },
            ]}
            onPress={resetMeasurement}
          >
            <Ionicons name="refresh" size={18} color={Colors.light.primary} />
            <Text style={styles.retryButtonText}>
              {t("Measure Again", "قياس مرة أخرى")}
            </Text>
          </Pressable>

          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.light.textTertiary} />
            <Text style={[styles.disclaimerText, isRTL && { textAlign: "right" }]}>
              {t(
                "This is not a medical device. Results are approximate and for informational purposes only. Consult a healthcare professional for accurate measurements.",
                "هذا ليس جهازاً طبياً. النتائج تقريبية ولأغراض إعلامية فقط. استشر مختصاً في الرعاية الصحية للحصول على قياسات دقيقة."
              )}
            </Text>
          </View>
        </View>
      ) : null}

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={Colors.light.accent} />
          <Text style={[styles.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 36,
    gap: 4,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.emergencyLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 10,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  permissionButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  cameraSection: {
    flex: 1,
    padding: 16,
  },
  cameraContainer: {
    aspectRatio: 3 / 4,
    width: "100%",
    maxHeight: "55%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
    alignSelf: "center",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  faceGuide: {
    width: 180,
    height: 220,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "rgba(255,255,255,0.7)",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  countdownOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: "center",
  },
  countdownText: {
    fontSize: 24,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
    marginBottom: 8,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressBarBg: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.primaryLight,
  },
  instructionSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  instructionTitle: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: "center",
  },
  instructionText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.emergency,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: Colors.light.emergency,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  measuringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.emergency,
  },
  measuringText: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.light.borderLight,
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  processingContainer: {
    alignItems: "center",
    gap: 16,
  },
  processingText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  resultSection: {
    flex: 1,
    alignItems: "center",
    padding: 24,
    paddingTop: 32,
  },
  bpmCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.light.emergencyLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 4,
    borderColor: Colors.light.emergency + "40",
    shadowColor: Colors.light.emergency,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  bpmValue: {
    fontSize: 48,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.emergency,
    marginTop: 2,
  },
  bpmLabel: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.emergency,
    opacity: 0.7,
    marginTop: -4,
  },
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
  },
  resultMessage: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  waveformContainer: {
    width: "100%",
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  waveformLabel: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.light.primarySurface,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: Colors.light.borderLight,
    borderRadius: 12,
    marginTop: "auto",
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    lineHeight: 16,
  },
  errorBanner: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    backgroundColor: Colors.light.accentLight,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
  },
});
