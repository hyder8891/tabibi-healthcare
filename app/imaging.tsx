import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { apiRequest } from "@/lib/query-client";

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") {
    return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  }
  const response = await globalThis.fetch(uri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface AnalysisResult {
  modality: string | null;
  anatomicalRegion: string | null;
  findings: string[];
  clinicalSignificance: string | null;
  recommendations: string[];
  severityLevel: string | null;
  severityFlag: boolean;
  rawAnalysis: string | null;
}

export default function ImagingScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;
  const { t, isRTL, settings } = useSettings();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (source: "camera" | "gallery") => {
    try {
      let pickerResult: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        if (Platform.OS === "web") {
          Alert.alert(t("Not Available", "غير متاح"), t("Camera is not available in the browser. Please choose from gallery instead.", "الكاميرا غير متاحة في المتصفح. يرجى الاختيار من المعرض بدلاً من ذلك."));
          return;
        }
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(t("Permission Required", "إذن مطلوب"), t("Camera access is needed to take photos.", "يلزم الوصول إلى الكاميرا لالتقاط الصور."));
          return;
        }
        pickerResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          base64: false,
        });
      } else {
        if (Platform.OS !== "web") {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert(t("Permission Required", "إذن مطلوب"), t("Gallery access is needed to select photos.", "يلزم الوصول إلى المعرض لاختيار الصور."));
            return;
          }
        }
        pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.8,
          base64: false,
        });
      }
      if (!pickerResult.canceled && pickerResult.assets[0]) {
        setImageUri(pickerResult.assets[0].uri);
        setResult(null);
        setError(null);
      }
    } catch (err: any) {
      console.error("Image picker error:", err);
      Alert.alert(
        t("Error", "خطأ"),
        t("Could not select image. Please try again.", "تعذر اختيار الصورة. حاول مرة أخرى.")
      );
    }
  };

  const showImageSourcePicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "web") {
      pickImage("gallery");
      return;
    }
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("Cancel", "إلغاء"), t("Take Photo", "التقاط صورة"), t("Choose from Gallery", "اختيار من المعرض")],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickImage("camera");
          if (buttonIndex === 2) pickImage("gallery");
        }
      );
    } else {
      Alert.alert(
        t("Select Image Source", "اختر مصدر الصورة"),
        "",
        [
          { text: t("Cancel", "إلغاء"), style: "cancel" },
          { text: t("Take Photo", "التقاط صورة"), onPress: () => pickImage("camera") },
          { text: t("Choose from Gallery", "اختيار من المعرض"), onPress: () => pickImage("gallery") },
        ]
      );
    }
  };

  const analyzeImage = async () => {
    if (!imageUri) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const base64 = await uriToBase64(imageUri);
      const ext = imageUri.split(".").pop()?.toLowerCase();
      const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const response = await apiRequest("POST", "/api/analyze-image", {
        imageData: base64,
        mimeType,
        language: settings.language,
      });
      const data: AnalysisResult = await response.json();
      setResult(data);
    } catch (err: unknown) {
      console.error("Analysis error:", err);
      setError(t("Failed to analyze image. Please try again.", "فشل تحليل الصورة. حاول مرة أخرى."));
    } finally {
      setAnalyzing(false);
    }
  };

  const getSeverityColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "critical": return "#DC2626";
      case "severe": return "#EA580C";
      case "moderate": return "#D97706";
      case "mild": return "#2563EB";
      case "normal": return "#16A34A";
      default: return "#6B7280";
    }
  };

  const getSeverityLabel = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case "critical": return t("Critical", "حرج");
      case "severe": return t("Severe", "شديد");
      case "moderate": return t("Moderate", "متوسط");
      case "mild": return t("Mild", "خفيف");
      case "normal": return t("Normal", "طبيعي");
      default: return t("Unknown", "غير محدد");
    }
  };

  const resetAnalysis = () => {
    setImageUri(null);
    setResult(null);
    setError(null);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} testID="imaging-back">
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={[styles.headerTitle, isRTL && { textAlign: "right" }]}>
          {t("Medical Imaging Analysis", "تحليل الصور الطبية")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {!imageUri && !result && (
          <View style={styles.uploadSection}>
            <View style={styles.uploadIconContainer}>
              <MaterialCommunityIcons name="image-search" size={64} color={Colors.light.primary} />
            </View>
            <Text style={[styles.uploadTitle, isRTL && { textAlign: "center" }]}>
              {t("Upload a Medical Image", "ارفع صورة طبية")}
            </Text>
            <Text style={[styles.uploadSubtitle, isRTL && { textAlign: "center" }]}>
              {t(
                "Upload X-rays, MRI scans, CT scans, lab results, or skin photos for AI analysis",
                "ارفع أشعة سينية، تصوير بالرنين المغناطيسي، أشعة مقطعية، نتائج مختبر، أو صور جلدية للتحليل بالذكاء الاصطناعي"
              )}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.uploadButton, pressed && { opacity: 0.9 }]}
              onPress={showImageSourcePicker}
              testID="imaging-upload"
            >
              <Ionicons name="cloud-upload" size={24} color="#fff" />
              <Text style={styles.uploadButtonText}>{t("Select Image", "اختر صورة")}</Text>
            </Pressable>
          </View>
        )}

        {imageUri && !result && (
          <View style={styles.previewSection}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="contain" />
            <View style={styles.previewActions}>
              <Pressable
                style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.9 }]}
                onPress={showImageSourcePicker}
              >
                <Ionicons name="swap-horizontal" size={20} color={Colors.light.primary} />
                <Text style={styles.secondaryButtonText}>{t("Change Image", "تغيير الصورة")}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.analyzeButton, pressed && { opacity: 0.9 }, analyzing && styles.disabledButton]}
                onPress={analyzeImage}
                disabled={analyzing}
                testID="imaging-analyze"
              >
                {analyzing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialCommunityIcons name="brain" size={20} color="#fff" />
                )}
                <Text style={styles.analyzeButtonText}>
                  {analyzing ? t("Analyzing...", "جاري التحليل...") : t("Analyze Image", "تحليل الصورة")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={24} color="#DC2626" />
            <Text style={[styles.errorText, isRTL && { textAlign: "right" }]}>{error}</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultSection}>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.resultImage} resizeMode="contain" />
            )}

            {result.severityFlag && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={[styles.warningText, isRTL && { textAlign: "right", flex: 1 }]}>
                  {t(
                    "Potentially serious findings detected. Please consult a healthcare professional immediately.",
                    "تم اكتشاف نتائج قد تكون خطيرة. يرجى استشارة أخصائي رعاية صحية فوراً."
                  )}
                </Text>
              </View>
            )}

            {result.rawAnalysis ? (
              <View style={styles.resultCard}>
                <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                  {t("Analysis Report", "تقرير التحليل")}
                </Text>
                <Text style={[styles.rawAnalysisText, isRTL && { textAlign: "right" }]}>
                  {result.rawAnalysis}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.severityRow}>
                  <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(result.severityLevel) + "18" }]}>
                    <View style={[styles.severityDot, { backgroundColor: getSeverityColor(result.severityLevel) }]} />
                    <Text style={[styles.severityText, { color: getSeverityColor(result.severityLevel) }]}>
                      {getSeverityLabel(result.severityLevel)}
                    </Text>
                  </View>
                </View>

                {result.modality && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultCardHeader}>
                      <Ionicons name="scan" size={18} color={Colors.light.primary} />
                      <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                        {t("Modality", "نوع التصوير")}
                      </Text>
                    </View>
                    <Text style={[styles.resultCardContent, isRTL && { textAlign: "right" }]}>
                      {result.modality}
                    </Text>
                  </View>
                )}

                {result.anatomicalRegion && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultCardHeader}>
                      <Ionicons name="body" size={18} color={Colors.light.primary} />
                      <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                        {t("Anatomical Region", "المنطقة التشريحية")}
                      </Text>
                    </View>
                    <Text style={[styles.resultCardContent, isRTL && { textAlign: "right" }]}>
                      {result.anatomicalRegion}
                    </Text>
                  </View>
                )}

                {result.findings && result.findings.length > 0 && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultCardHeader}>
                      <Ionicons name="list" size={18} color={Colors.light.primary} />
                      <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                        {t("Findings", "النتائج")}
                      </Text>
                    </View>
                    {result.findings.map((finding, index) => (
                      <View key={index} style={styles.findingRow}>
                        <View style={styles.findingBullet} />
                        <Text style={[styles.findingText, isRTL && { textAlign: "right" }]}>{finding}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {result.clinicalSignificance && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultCardHeader}>
                      <Ionicons name="medkit" size={18} color={Colors.light.primary} />
                      <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                        {t("Clinical Significance", "الأهمية السريرية")}
                      </Text>
                    </View>
                    <Text style={[styles.resultCardContent, isRTL && { textAlign: "right" }]}>
                      {result.clinicalSignificance}
                    </Text>
                  </View>
                )}

                {result.recommendations && result.recommendations.length > 0 && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultCardHeader}>
                      <Ionicons name="checkmark-circle" size={18} color={Colors.light.primary} />
                      <Text style={[styles.resultCardTitle, isRTL && { textAlign: "right" }]}>
                        {t("Recommendations", "التوصيات")}
                      </Text>
                    </View>
                    {result.recommendations.map((rec, index) => (
                      <View key={index} style={styles.findingRow}>
                        <View style={[styles.findingBullet, { backgroundColor: Colors.light.primary }]} />
                        <Text style={[styles.findingText, isRTL && { textAlign: "right" }]}>{rec}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <View style={styles.disclaimer}>
              <Ionicons name="information-circle" size={16} color="#6B7280" />
              <Text style={[styles.disclaimerText, isRTL && { textAlign: "right", flex: 1 }]}>
                {t(
                  "This AI analysis is for informational purposes only and does not replace professional medical diagnosis.",
                  "هذا التحليل بالذكاء الاصطناعي لأغراض إعلامية فقط ولا يحل محل التشخيص الطبي المهني."
                )}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.newAnalysisButton, pressed && { opacity: 0.9 }]}
              onPress={resetAnalysis}
              testID="imaging-new-analysis"
            >
              <Ionicons name="refresh" size={20} color={Colors.light.primary} />
              <Text style={styles.newAnalysisText}>{t("New Analysis", "تحليل جديد")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.light.text,
    flex: 1,
    textAlign: "center",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  uploadSection: {
    alignItems: "center",
    paddingVertical: 60,
  },
  uploadIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  uploadTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
    marginBottom: 12,
    textAlign: "center",
  },
  uploadSubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  previewSection: {
    alignItems: "center",
  },
  previewImage: {
    width: "100%",
    height: 300,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  previewActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
    backgroundColor: "#fff",
  },
  secondaryButtonText: {
    color: Colors.light.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  analyzeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.light.primary,
  },
  analyzeButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.7,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    marginTop: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    flex: 1,
  },
  resultSection: {
    gap: 12,
  },
  resultImage: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
    marginBottom: 4,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  warningText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  severityRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 14,
    fontWeight: "600",
  },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  resultCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  resultCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
  },
  resultCardContent: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  rawAnalysisText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 24,
    marginTop: 8,
  },
  findingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
  },
  findingBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6B7280",
    marginTop: 7,
  },
  findingText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    flex: 1,
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 14,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    marginTop: 4,
  },
  disclaimerText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  newAnalysisButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
    backgroundColor: "#fff",
    marginTop: 4,
  },
  newAnalysisText: {
    color: Colors.light.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
