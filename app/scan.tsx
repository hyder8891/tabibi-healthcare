import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { getMedications, saveMedications, getProfile, saveProfile } from "@/lib/storage";
import type { ScannedMedication } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

async function uriToBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") {
    return FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  }
  const response = await fetch(uri);
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

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [medications, setMedications] = useState<ScannedMedication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const pickImage = async (useCamera: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);

    let result;
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError(t(
          "Camera permission is needed to scan medications.",
          "\u064a\u062c\u0628 \u0627\u0644\u0633\u0645\u0627\u062d \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627.",
        ));
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);

      let base64Data = asset.base64 || "";
      if (!base64Data && asset.uri) {
        try {
          base64Data = await uriToBase64(asset.uri);
        } catch (e) {
          console.error("Failed to convert image to base64:", e);
          setError(t("Failed to process image. Please try again.", "\u0641\u0634\u0644 \u0641\u064a \u0645\u0639\u0627\u0644\u062c\u0629 \u0627\u0644\u0635\u0648\u0631\u0629. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
          return;
        }
      }

      if (!base64Data) {
        setError(t("Could not read image data. Please try again.", "\u0644\u0645 \u0623\u062a\u0645\u0643\u0646 \u0645\u0646 \u0642\u0631\u0627\u0621\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0635\u0648\u0631\u0629. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649."));
        return;
      }

      analyzeImage(base64Data, asset.mimeType || "image/jpeg");
    }
  };

  const analyzeImage = async (base64: string, mimeType: string) => {
    setIsAnalyzing(true);
    setMedications([]);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const url = new URL("/api/analyze-medication", apiUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await response.json();

      if (data.medications && !data.medications[0]?.error) {
        setMedications(data.medications);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const existing = await getMedications();
        const combined = [...data.medications, ...existing].slice(0, 20);
        await saveMedications(combined);

        const profile = await getProfile();
        const newMedNames = data.medications.map((m: ScannedMedication) => m.name);
        const allMeds = [...new Set([...profile.medications, ...newMedNames])];
        await saveProfile({ ...profile, medications: allMeds });
      } else {
        setError(
          data.medications?.[0]?.error ||
            data.medications?.[0]?.suggestion ||
            t("Could not identify medication. Try a clearer photo.", "\u0644\u0645 \u0623\u062a\u0645\u0643\u0646 \u0645\u0646 \u062a\u062d\u062f\u064a\u062f \u0627\u0644\u062f\u0648\u0627\u0621. \u062d\u0627\u0648\u0644 \u0635\u0648\u0631\u0629 \u0623\u0648\u0636\u062d."),
        );
      }
    } catch (err) {
      setError(t(
        "Failed to analyze medication. Please try again.",
        "\u0641\u0634\u0644 \u0641\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u062f\u0648\u0627\u0621. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
      ));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Medication Scanner", "\u0645\u0627\u0633\u062d \u0627\u0644\u0623\u062f\u0648\u064a\u0629")}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!imageUri && !isAnalyzing && medications.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <MaterialCommunityIcons
                name="pill"
                size={40}
                color={Colors.light.primary}
              />
            </View>
            <Text style={[styles.emptyTitle, isRTL && { textAlign: "right" }]}>
              {t("Scan Your Medications", "\u0627\u0645\u0633\u062d \u0623\u062f\u0648\u064a\u062a\u0643")}
            </Text>
            <Text style={styles.emptyDesc}>
              {t(
                "Take a photo of your medication box, blister pack, or prescription to check for drug interactions.",
                "\u0627\u0644\u062a\u0642\u0637 \u0635\u0648\u0631\u0629 \u0644\u0639\u0644\u0628\u0629 \u0627\u0644\u062f\u0648\u0627\u0621 \u0623\u0648 \u0627\u0644\u0648\u0635\u0641\u0629 \u0627\u0644\u0637\u0628\u064a\u0629 \u0644\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062a\u062f\u0627\u062e\u0644\u0627\u062a \u0627\u0644\u062f\u0648\u0627\u0626\u064a\u0629.",
              )}
            </Text>
          </View>
        )}

        {imageUri && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
              contentFit="cover"
            />
            {isAnalyzing && (
              <View style={styles.analyzingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.analyzingText}>
                  {t("Analyzing medication...", "\u062c\u0627\u0631\u064a \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u062f\u0648\u0627\u0621...")}
                </Text>
              </View>
            )}
          </View>
        )}

        {error && (
          <View style={[styles.errorCard, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="alert-circle" size={20} color={Colors.light.accent} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {medications.map((med, i) => (
          <View key={i} style={styles.medCard}>
            <View style={[styles.medHeader, isRTL && { flexDirection: "row-reverse" }]}>
              <MaterialCommunityIcons
                name="pill"
                size={22}
                color={Colors.light.primary}
              />
              <View style={styles.medHeaderText}>
                <Text style={[styles.medName, isRTL && { textAlign: "right" }]}>{med.name}</Text>
                {med.genericName && (
                  <Text style={[styles.medGeneric, isRTL && { textAlign: "right" }]}>{med.genericName}</Text>
                )}
              </View>
            </View>

            {med.dosage && (
              <View style={[styles.medRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[styles.medLabel, isRTL && { textAlign: "right" }]}>
                  {t("Dosage", "\u0627\u0644\u062c\u0631\u0639\u0629")}
                </Text>
                <Text style={[styles.medValue, isRTL && { textAlign: "right" }]}>
                  {med.dosage} {med.form ? `(${med.form})` : ""}
                </Text>
              </View>
            )}

            {med.drugClass && (
              <View style={[styles.medRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[styles.medLabel, isRTL && { textAlign: "right" }]}>
                  {t("Class", "\u0627\u0644\u0641\u0626\u0629")}
                </Text>
                <Text style={[styles.medValue, isRTL && { textAlign: "right" }]}>{med.drugClass}</Text>
              </View>
            )}

            {med.commonUses && med.commonUses.length > 0 && (
              <View style={styles.medSection}>
                <Text style={[styles.medSectionTitle, isRTL && { textAlign: "right" }]}>
                  {t("Common Uses", "\u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645\u0627\u062a")}
                </Text>
                {med.commonUses.map((use, j) => (
                  <View key={j} style={[styles.bulletRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View style={styles.bullet} />
                    <Text style={[styles.bulletText, isRTL && { textAlign: "right" }]}>{use}</Text>
                  </View>
                ))}
              </View>
            )}

            {med.commonSideEffects && med.commonSideEffects.length > 0 && (
              <View style={styles.medSection}>
                <Text style={[styles.medSectionTitle, isRTL && { textAlign: "right" }]}>
                  {t("Side Effects", "\u0627\u0644\u0622\u062b\u0627\u0631 \u0627\u0644\u062c\u0627\u0646\u0628\u064a\u0629")}
                </Text>
                {med.commonSideEffects.map((effect, j) => (
                  <View key={j} style={[styles.bulletRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <View
                      style={[
                        styles.bullet,
                        { backgroundColor: Colors.light.warning },
                      ]}
                    />
                    <Text style={[styles.bulletText, isRTL && { textAlign: "right" }]}>{effect}</Text>
                  </View>
                ))}
              </View>
            )}

            {med.warnings && med.warnings.length > 0 && (
              <View style={styles.warningSection}>
                {med.warnings.map((w, j) => (
                  <View key={j} style={[styles.warningRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Ionicons
                      name="warning"
                      size={14}
                      color={Colors.light.accent}
                    />
                    <Text style={[styles.warningText, isRTL && { textAlign: "right" }]}>{w}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.captureButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => pickImage(true)}
          >
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={styles.captureButtonText}>
              {t("Take Photo", "\u0627\u0644\u062a\u0642\u0637 \u0635\u0648\u0631\u0629")}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.galleryButton,
              pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => pickImage(false)}
          >
            <Ionicons name="images" size={22} color={Colors.light.primary} />
            <Text style={styles.galleryButtonText}>
              {t("From Gallery", "\u0645\u0646 \u0627\u0644\u0645\u0639\u0631\u0636")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
    paddingVertical: 12,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  imageContainer: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 16,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 16,
  },
  analyzingText: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: "#fff",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.accentLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
    lineHeight: 20,
  },
  medCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  medHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  medHeaderText: {
    flex: 1,
  },
  medName: {
    fontSize: 18,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  medGeneric: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  medRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  medLabel: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  medValue: {
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  medSection: {
    marginTop: 12,
  },
  medSectionTitle: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.primary,
  },
  bulletText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    flex: 1,
  },
  warningSection: {
    backgroundColor: Colors.light.accentLight,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    gap: 6,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  captureButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  captureButtonText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  galleryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.primarySurface,
    paddingVertical: 16,
    borderRadius: 14,
  },
  galleryButtonText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
  },
});
