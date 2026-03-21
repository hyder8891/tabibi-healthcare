import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { fetch } from "expo/fetch";

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
import Colors from "@/constants/colors";
import { MessageBubble, TypingIndicator } from "@/components/MessageBubble";
import { EmergencyOverlay } from "@/components/EmergencyOverlay";
import { MentalHealthCrisisOverlay } from "@/components/MentalHealthCrisisOverlay";
import { MentalHealthResultsCard } from "@/components/MentalHealthResultsCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { saveAssessment, getProfile, getAssessment, updateAssessment, getFamilyMembers, saveFamilyMember } from "@/lib/storage";
import { useSettings } from "@/contexts/SettingsContext";
import type { ChatMessage, EmergencyAlert, AssessmentResult, Assessment, ForWhom, FamilyMember, MentalHealthResults } from "@/lib/types";

function AnimatedTypingIndicator() {
  return <TypingIndicator />;
}

export default function AssessmentScreen() {
  const insets = useSafeAreaInsets();
  const { settings, t, isRTL } = useSettings();
  const { assessmentId, mode } = useLocalSearchParams<{ assessmentId?: string; mode?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const [pendingImage, setPendingImage] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isGeneratingRecommendation, setIsGeneratingRecommendation] = useState(false);
  const [mentalHealthMode, setMentalHealthMode] = useState<'phq9' | 'gad7' | null>(null);
  const [mentalHealthCrisis, setMentalHealthCrisis] = useState(false);
  const [mentalHealthResults, setMentalHealthResults] = useState<MentalHealthResults | null>(null);
  const [forWhom, setForWhom] = useState<ForWhom | null>(null);
  const [showForWhomModal, setShowForWhomModal] = useState(false);
  const [forWhomName, setForWhomName] = useState("");
  const [forWhomAge, setForWhomAge] = useState("");
  const [forWhomRelationship, setForWhomRelationship] = useState("");
  const [forWhomStep, setForWhomStep] = useState<"choose" | "details">("choose");
  const [savedFamilyMembers, setSavedFamilyMembers] = useState<FamilyMember[]>([]);
  const [saveProfileChecked, setSaveProfileChecked] = useState(false);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const chiefComplaintRef = useRef<string>("");
  const lockedTotalRef = useRef<number | null>(null);
  const isSubmittingRef = useRef(false);
  const pendingMentalHealthStartRef = useRef<'phq9' | 'gad7' | null>(null);
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const initializedRef = useRef(false);

  const headerHeightRef = useRef(0);
  const progressHeightRef = useRef(0);
  const contentSizeRef = useRef(0);
  const viewportHeightRef = useRef(0);

  useEffect(() => {
    if (assessmentResult && flatListRef.current) {
      const scrollDelay = Platform.OS === "web" ? 600 : 400;
      const doScroll = () => {
        const contentH = contentSizeRef.current;
        const viewportH = viewportHeightRef.current;
        if (contentH > 0 && viewportH > 0) {
          const cardTopPadding = 40;
          const maxOffset = Math.max(0, contentH - viewportH);
          const targetOffset = Math.max(0, maxOffset - cardTopPadding);
          flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
        } else {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      };
      setTimeout(doScroll, scrollDelay);
      setTimeout(doScroll, scrollDelay + 500);
    }
  }, [assessmentResult]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    if (assessmentId) {
      loadExistingAssessment(assessmentId);
    } else if (mode === "mentalHealth") {
      setMentalHealthMode('phq9');
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: settings.language === "ar"
            ? "مرحباً! سنبدأ فحص الصحة النفسية. سأطرح عليك بعض الأسئلة البسيطة."
            : "Hello! We'll begin a mental health screening. I'll ask you some simple questions.",
          timestamp: Date.now(),
        },
      ]);
      chiefComplaintRef.current = "فحص الصحة النفسية";
      pendingMentalHealthStartRef.current = 'phq9';
    } else {
      getFamilyMembers().then(setSavedFamilyMembers);
      setSaveProfileChecked(false);
      setSelectedFamilyMemberId(null);
      setShowForWhomModal(true);
      setForWhomStep("choose");
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: settings.language === "ar"
            ? "\u0645\u0631\u062d\u0628\u0627\u064b! \u0635\u0641 \u0644\u064a \u0623\u0639\u0631\u0627\u0636\u0643 \u0648\u0633\u0623\u0633\u0627\u0639\u062f\u0643 \u0641\u064a \u062a\u0642\u064a\u064a\u0645 \u062d\u0627\u0644\u062a\u0643."
            : "Hello! Please describe your symptoms and I'll help guide you through a health assessment.",
          timestamp: Date.now(),
        },
      ]);
    }
  }, []);

  const loadExistingAssessment = async (id: string) => {
    const assessment = await getAssessment(id);
    if (assessment) {
      setExistingAssessmentId(id);
      chiefComplaintRef.current = assessment.chiefComplaint;
      if (assessment.result) setAssessmentResult(assessment.result);
      if (assessment.emergency) setEmergency(assessment.emergency);
      if (assessment.forWhom) setForWhom(assessment.forWhom);
      
      const continueMsg: ChatMessage = {
        id: Crypto.randomUUID(),
        role: "assistant",
        content: t(
          "Welcome back! You can continue describing your symptoms or share any updates.",
          "\u0645\u0631\u062d\u0628\u0627\u064b \u0645\u062c\u062f\u062f\u0627\u064b! \u064a\u0645\u0643\u0646\u0643 \u0645\u062a\u0627\u0628\u0639\u0629 \u0648\u0635\u0641 \u0623\u0639\u0631\u0627\u0636\u0643 \u0623\u0648 \u0645\u0634\u0627\u0631\u0643\u0629 \u0623\u064a \u062a\u062d\u062f\u064a\u062b\u0627\u062a.",
        ),
        timestamp: Date.now(),
      };
      setMessages([...assessment.messages, continueMsg]);
    }
  };

  const pickImage = async (source: "camera" | "gallery") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      
      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          if (Platform.OS === "web") {
            window.alert(t("Camera access is required", "\u064a\u0644\u0632\u0645 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0643\u0627\u0645\u064a\u0631\u0627"));
          }
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          base64: true,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          if (Platform.OS === "web") {
            window.alert(t("Photo access is required", "\u064a\u0644\u0632\u0645 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0635\u0648\u0631"));
          }
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          base64: true,
        });
      }

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        let base64Data = asset.base64 || "";
        
        if (!base64Data && asset.uri) {
          try {
            base64Data = await uriToBase64(asset.uri);
          } catch (e) {
            console.error("Failed to convert image to base64:", e);
          }
        }

        if (base64Data) {
          const mimeType = (asset as any).type === "image" && asset.uri.toLowerCase().includes(".png")
            ? "image/png"
            : (asset as any).mimeType || (asset.uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg");
          setPendingImage({ uri: asset.uri, base64: base64Data, mimeType });
        }
      }
    } catch (err) {
      console.error("Image pick error:", err);
    }
  };

  const showAttachMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t("Cancel", "\u0625\u0644\u063a\u0627\u0621"),
            t("Take Photo", "\u0627\u0644\u062a\u0642\u0627\u0637 \u0635\u0648\u0631\u0629"),
            t("Choose from Gallery", "\u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0646 \u0627\u0644\u0645\u0639\u0631\u0636"),
          ],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickImage("camera");
          if (buttonIndex === 2) pickImage("gallery");
        },
      );
    } else {
      setShowAttachModal(true);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    const imageAttachment = pendingImage;
    if ((!text && !imageAttachment) || isLoading || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!chiefComplaintRef.current && text) {
      chiefComplaintRef.current = text;
    }

    const userMessage: ChatMessage = {
      id: Crypto.randomUUID(),
      role: "user",
      content: text || t("Attached an image for analysis", "\u062a\u0645 \u0625\u0631\u0641\u0627\u0642 \u0635\u0648\u0631\u0629 \u0644\u0644\u062a\u062d\u0644\u064a\u0644"),
      timestamp: Date.now(),
      imageUri: imageAttachment?.uri,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText("");
    setPendingImage(null);
    setIsLoading(true);
    setStreamingMessage("");
    setQuickReplies([]);

    try {
      const profile = await getProfile();
      const cachedProfile = profile;
      const apiUrl = getApiUrl();
      const url = new URL("/api/assess", apiUrl);

      const apiMessages = updatedMessages
        .filter((m) => m.id !== "welcome" && !m.content.includes(t("Welcome back!", "\u0645\u0631\u062d\u0628\u0627\u064b \u0645\u062c\u062f\u062f\u0627\u064b!")))
        .map((m) => {
          const msg: any = { role: m.role, content: m.content };
          if (m === userMessage && imageAttachment) {
            msg.imageData = imageAttachment.base64;
            msg.mimeType = imageAttachment.mimeType;
          }
          return msg;
        });

      const authHeaders = await getAuthHeaders();
      const requestBody = JSON.stringify({
        messages: apiMessages,
        patientProfile: {
          ...profile,
          isPediatric: settings.pediatricMode,
        },
        ...(forWhom ? { forWhom } : {}),
        ...(mentalHealthMode ? { mentalHealthMode } : {}),
      });

      let response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: requestBody,
      });

      if (response.status === 401) {
        const freshHeaders = await getAuthHeaders();
        if (freshHeaders.Authorization) {
          response = await fetch(url.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...freshHeaders },
            body: requestBody,
          });
        }
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let parsedResult: AssessmentResult | null = null;
      let parsedEmergency: EmergencyAlert | null = null;
      let hasError = false;

      const normalizeArabicValues = (result: AssessmentResult): AssessmentResult => {
        if (settings.language !== "ar") return result;

        const confidenceMap: Record<string, string> = {
          "low": "منخفض",
          "medium": "متوسط",
          "moderate": "متوسط",
          "high": "مرتفع",
        };
        const likelihoodMap: Record<string, string> = {
          "low": "منخفض",
          "moderate": "متوسط",
          "high": "مرتفع",
          "very high": "مرتفع جداً",
        };
        const timeframeMap: Record<string, string> = {
          "immediately": "فوراً",
          "within hours": "خلال ساعات",
          "within 24 hours": "خلال 24 ساعة",
          "within a week": "خلال أسبوع",
          "1-2 days": "1-2 أيام",
          "2-3 days": "2-3 أيام",
          "3-5 days": "3-5 أيام",
          "1 week": "أسبوع واحد",
          "2 weeks": "أسبوعين",
          "1 month": "شهر واحد",
        };
        const costMap: Record<string, string> = {
          "free-MOH": "مجاني-وزارة الصحة",
          "low": "منخفض",
          "moderate": "متوسط",
          "high": "مرتفع",
        };

        const mapValue = (val: string | undefined, map: Record<string, string>): string | undefined => {
          if (!val) return val;
          const lower = val.toLowerCase().trim();
          return map[lower] || val;
        };

        if (result.assessment) {
          result.assessment.confidence = mapValue(result.assessment.confidence, confidenceMap) || result.assessment.confidence;
        }

        if (result.recommendations?.pathwayB?.tests) {
          result.recommendations.pathwayB.tests = result.recommendations.pathwayB.tests.map((test) => ({
            ...test,
            estimatedCost: test.estimatedCost ? (mapValue(test.estimatedCost, costMap) || test.estimatedCost) as any : undefined,
          }));
        }

        if (result.differentials) {
          result.differentials = result.differentials.map((d) => ({
            ...d,
            likelihood: mapValue(d.likelihood, likelihoodMap) || d.likelihood,
          }));
        }

        if (result.followUp && typeof result.followUp === "object" && result.followUp.returnIn) {
          result.followUp.returnIn = mapValue(result.followUp.returnIn, timeframeMap) || result.followUp.returnIn;
        } else if (typeof result.followUp === "string") {
          result.followUp = mapValue(result.followUp, timeframeMap) || result.followUp;
        }

        return result;
      };

      const normalizeResult = (raw: any): AssessmentResult => {
        const result: AssessmentResult = {
          assessment: {
            condition: raw.assessment?.condition || "",
            confidence: raw.assessment?.confidence || "",
            severity: raw.assessment?.severity || "moderate",
            description: raw.assessment?.description || "",
          },
          pathway: raw.pathway || "A",
          recommendations: {
            pathwayA: raw.recommendations?.pathwayA || { active: false, medicines: [] },
            pathwayB: raw.recommendations?.pathwayB || { active: false, tests: [] },
          },
          warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
          followUp: "",
        };
        if (raw.followUp && typeof raw.followUp === "object" && raw.followUp.returnIn) {
          result.followUp = {
            returnIn: raw.followUp.returnIn,
            redFlags: Array.isArray(raw.followUp.redFlags) ? raw.followUp.redFlags : [],
          };
        } else if (typeof raw.followUp === "string") {
          result.followUp = raw.followUp;
        }
        if (Array.isArray(raw.differentials)) {
          result.differentials = raw.differentials.map((d: any) => ({
            condition: d.condition || "",
            likelihood: d.likelihood || "",
            distinguishingFeature: d.distinguishingFeature || "",
          }));
        }
        if (raw.triageLevel) {
          result.triageLevel = raw.triageLevel;
        }
        if (result.recommendations?.pathwayB?.tests) {
          result.recommendations.pathwayB.tests = result.recommendations.pathwayB.tests.map((t: any) => ({
            ...t,
            estimatedCost: t.estimatedCost || undefined,
            availableAt: t.availableAt || undefined,
          }));
        }
        return normalizeArabicValues(result);
      };

      const stripJson = (text: string, isStreaming = false) => {
        let cleaned = text
          .replace(/```json[\s\S]*?```/g, "")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/\{"emergency"\s*:\s*true[^}]*\}/g, "")
          .replace(/\{"quickReplies"\s*:\s*\[.*?\]\}/gs, "")
          .replace(/\[ASSESSMENT_READY\]/g, "")
          .replace(/\{"phq9_q9_crisis"\s*:\s*true\}/g, "")
          .replace(/\{"phq9_complete"\s*:\s*true[^}]*\}/g, "")
          .replace(/\{"gad7_complete"\s*:\s*true[^}]*\}/g, "");

        const removeBalancedJson = (str: string): string => {
          let result = "";
          let i = 0;
          while (i < str.length) {
            if (str[i] === "{") {
              const inner = str.substring(i);
              if (/"(assessment|recommendations|pathwayA|pathwayB|followUp|triageLevel|differentials|condition|severity)"/.test(inner.substring(0, 200))) {
                let depth = 0;
                let j = 0;
                for (; j < inner.length; j++) {
                  if (inner[j] === "{") depth++;
                  else if (inner[j] === "}") {
                    depth--;
                    if (depth === 0) { j++; break; }
                  }
                }
                if (depth === 0) {
                  i += j;
                  continue;
                }
              }
            }
            result += str[i];
            i++;
          }
          return result;
        };

        cleaned = removeBalancedJson(cleaned);

        if (isStreaming) {
          const jsonStart = cleaned.search(/\{["\s]*(emergency|assessment|quickReplies|recommendations|pathwayA|condition|differentials)/);
          if (jsonStart !== -1) {
            cleaned = cleaned.substring(0, jsonStart);
          }
          const codeBlockStart = cleaned.indexOf("```");
          if (codeBlockStart !== -1) {
            cleaned = cleaned.substring(0, codeBlockStart);
          }
          const trailingJsonStart = cleaned.search(/\{["\s]*$/);
          if (trailingJsonStart !== -1) {
            cleaned = cleaned.substring(0, trailingJsonStart);
          }
          const lastOpenBrace = cleaned.lastIndexOf("{");
          if (lastOpenBrace !== -1) {
            const afterBrace = cleaned.substring(lastOpenBrace);
            const opens = (afterBrace.match(/\{/g) || []).length;
            const closes = (afterBrace.match(/\}/g) || []).length;
            if (opens > closes) {
              cleaned = cleaned.substring(0, lastOpenBrace);
            }
          }
        }

        cleaned = cleaned.replace(/["\s]*:\s*[\[{][\s\S]{0,50}$/g, "").trim();

        const jsonLikeLines = cleaned.split("\n").filter(l => /^\s*"[^"]+"\s*:/.test(l)).length;
        const totalLines = cleaned.split("\n").length;
        if (totalLines > 3 && jsonLikeLines / totalLines > 0.5) {
          cleaned = cleaned.split("\n").filter(l => !/^\s*"[^"]+"\s*:/.test(l) && !/^\s*[{}\[\],]\s*$/.test(l)).join("\n").trim();
        }

        return cleaned.trim();
      };

      const extractQuickReplies = (text: string): string[] => {
        const match = text.match(/\{"quickReplies"\s*:\s*(\[.*?\])\}/s);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch {}
        }
        return [];
      };

      let sseBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;
          try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullText += data.content;
                const cleanStreaming = stripJson(fullText, true);
                setStreamingMessage(cleanStreaming);

                if (mentalHealthMode && !mentalHealthCrisis) {
                  const crisisInStream = fullText.match(/\{"phq9_q9_crisis"\s*:\s*true\}/);
                  if (crisisInStream) {
                    setMentalHealthCrisis(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }
                }
              }
              if (data.validatedAssessment) {
                try {
                  parsedResult = normalizeResult(data.validatedAssessment);
                  setAssessmentResult(parsedResult);
                  setIsGeneratingRecommendation(false);
                  console.log("[ProRecommendation] Using Pro-generated assessment — severity:", parsedResult.assessment?.severity);
                } catch (e) {
                  console.warn("Failed to apply validated assessment:", e);
                }
              }
              if (data.generatingRecommendation) {
                setIsGeneratingRecommendation(true);
              }
              if (data.error && !data.done) {
                console.error("[Assessment] Server error:", data.error);
                setIsGeneratingRecommendation(false);
                hasError = true;
                const errorText = t(
                  "I was unable to generate your assessment. Please try sending your last message again.",
                  "لم أتمكن من إعداد التقييم الخاص بك. يرجى إعادة إرسال رسالتك الأخيرة.",
                );
                fullText += "\n\n" + errorText;
                setStreamingMessage(stripJson(fullText, true));
              }
              if (data.done) {
                const emergencyMatch = fullText.match(
                  /\{"emergency"\s*:\s*true[^}]*\}/,
                );
                if (emergencyMatch) {
                  try {
                    const emergencyData = JSON.parse(emergencyMatch[0]);
                    parsedEmergency = emergencyData;
                    setEmergency(emergencyData);
                    Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Error,
                    );
                  } catch {}
                }

                if (parsedEmergency && !parsedResult) {
                  const isAr = settings.language === "ar";
                  parsedResult = {
                    assessment: {
                      condition: parsedEmergency.condition || (isAr ? "حالة طوارئ" : "Emergency"),
                      confidence: "high",
                      severity: "severe",
                      description: parsedEmergency.action || (isAr ? "توجه لأقرب طوارئ فوراً" : "Seek immediate medical attention"),
                    },
                    triageLevel: "immediate",
                    pathway: "B",
                    recommendations: {
                      pathwayA: { active: false, medicines: [] },
                      pathwayB: {
                        active: true,
                        tests: [{
                          name: isAr ? "تقييم طوارئ" : "Emergency evaluation",
                          type: "lab" as const,
                          urgency: "emergency" as const,
                          reason: parsedEmergency.condition || (isAr ? "حالة طارئة تتطلب تقييم فوري" : "Emergency condition requiring immediate evaluation"),
                          facilityType: "hospital",
                          capabilities: ["emergency"],
                        }],
                      },
                    },
                    warnings: [parsedEmergency.action || (isAr ? "توجه لأقرب طوارئ فوراً" : "Seek immediate emergency care")],
                    followUp: {
                      returnIn: isAr ? "فوراً" : "Immediately",
                      redFlags: [parsedEmergency.action || (isAr ? "توجه لأقرب طوارئ فوراً" : "Seek immediate emergency care")],
                    },
                  };
                  setAssessmentResult(parsedResult);
                }

                if (mentalHealthMode) {
                  const crisisMatch = fullText.match(/\{"phq9_q9_crisis"\s*:\s*true\}/);
                  if (crisisMatch) {
                    setMentalHealthCrisis(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }

                  const phq9CompleteMatch = fullText.match(/\{"phq9_complete"\s*:\s*true\s*,\s*"totalScore"\s*:\s*(\d+).*?\}/s);
                  const gad7CompleteMatch = fullText.match(/\{"gad7_complete"\s*:\s*true\s*,\s*"totalScore"\s*:\s*(\d+).*?\}/s);

                  if (phq9CompleteMatch) {
                    const score = parseInt(phq9CompleteMatch[1], 10);
                    let severityLevel: string;
                    let severityColor: string;
                    if (score <= 4) { severityLevel = "الحد الأدنى"; severityColor = "#22C55E"; }
                    else if (score <= 9) { severityLevel = "خفيف"; severityColor = "#EAB308"; }
                    else if (score <= 14) { severityLevel = "متوسط"; severityColor = "#F97316"; }
                    else if (score <= 19) { severityLevel = "متوسط الشدة"; severityColor = "#EF4444"; }
                    else { severityLevel = "شديد"; severityColor = "#DC2626"; }

                    setMentalHealthResults({
                      type: 'phq9',
                      totalScore: score,
                      severityLevel,
                      severityColor,
                      evidenceSummary: stripJson(fullText),
                      recommendation: score >= 10
                        ? "ننصح بمراجعة متخصص في الصحة النفسية"
                        : "استمر في مراقبة حالتك النفسية",
                    });
                  }

                  if (gad7CompleteMatch) {
                    const score = parseInt(gad7CompleteMatch[1], 10);
                    let severityLevel: string;
                    let severityColor: string;
                    if (score <= 4) { severityLevel = "الحد الأدنى"; severityColor = "#22C55E"; }
                    else if (score <= 9) { severityLevel = "خفيف"; severityColor = "#EAB308"; }
                    else if (score <= 14) { severityLevel = "متوسط"; severityColor = "#F97316"; }
                    else { severityLevel = "شديد"; severityColor = "#DC2626"; }

                    setMentalHealthResults({
                      type: 'gad7',
                      totalScore: score,
                      severityLevel,
                      severityColor,
                      evidenceSummary: stripJson(fullText),
                      recommendation: score >= 10
                        ? "ننصح بمراجعة متخصص في الصحة النفسية"
                        : "استمر في مراقبة حالتك النفسية",
                    });
                  }
                }

                const replies = extractQuickReplies(fullText);
                if (replies.length > 0) {
                  setQuickReplies(replies);
                }
              }
            } catch {}
        }
      }

      const displayText = stripJson(fullText);

      let finalContent = displayText;
      if (!finalContent && parsedEmergency) {
        finalContent = t(
          `Emergency detected: ${parsedEmergency.condition}. ${parsedEmergency.action}.`,
          `تم اكتشاف حالة طارئة: ${parsedEmergency.condition}. ${parsedEmergency.action}.`,
        );
      } else if (!finalContent) {
        finalContent = t(
          "I've analyzed the information you provided. Please describe your symptoms for a more detailed assessment.",
          "لقد حللت المعلومات التي قدمتها. يرجى وصف أعراضك للحصول على تقييم أكثر تفصيلاً.",
        );
      }

      const aiMessage: ChatMessage = {
        id: Crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        timestamp: Date.now(),
        ...(hasError ? { isError: true } : {}),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setStreamingMessage("");
      setIsGeneratingRecommendation(false);

      const allMsgs = [...updatedMessages, aiMessage];
      
      if (existingAssessmentId) {
        const existingAssessment = await getAssessment(existingAssessmentId);
        if (existingAssessment) {
          existingAssessment.messages = allMsgs;
          existingAssessment.result = parsedResult || existingAssessment.result;
          existingAssessment.emergency = parsedEmergency || existingAssessment.emergency;
          existingAssessment.forWhom = forWhom || undefined;
          await updateAssessment(existingAssessment);
        }
      } else {
        const newId = Crypto.randomUUID();
        const assessment: Assessment = {
          id: newId,
          date: Date.now(),
          chiefComplaint: chiefComplaintRef.current,
          messages: allMsgs,
          result: parsedResult || undefined,
          emergency: parsedEmergency || undefined,
          medications: [],
          patientProfile: {
            ...cachedProfile,
            isPediatric: settings.pediatricMode,
          },
          ...(forWhom ? { forWhom } : {}),
        };
        await saveAssessment(assessment);
        setExistingAssessmentId(newId);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Crypto.randomUUID(),
        role: "assistant",
        content: t(
          "I'm having trouble connecting. Please check your connection and try again.",
          "\u0623\u0648\u0627\u062c\u0647 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u0627\u0644\u0627\u062a\u0635\u0627\u0644. \u064a\u0631\u062c\u0649 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u062a\u0635\u0627\u0644\u0643 \u0648\u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
        ),
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingMessage("");
      setIsGeneratingRecommendation(false);
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [inputText, messages, isLoading, settings, pendingImage, existingAssessmentId, forWhom, mentalHealthMode, mentalHealthCrisis]);

  useEffect(() => {
    if (pendingMentalHealthStartRef.current && !isLoading && messages.length > 0) {
      const mhMode = pendingMentalHealthStartRef.current;
      pendingMentalHealthStartRef.current = null;
      const startText = mhMode === 'gad7' ? "ابدأ فحص GAD-7" : "ابدأ فحص PHQ-9";
      quickReplyRef.current = startText;
      setInputText(startText);
      setQuickReplies([]);
    }
  }, [messages, isLoading]);

  const finishAssessment = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const profile = await getProfile();
    
    if (existingAssessmentId) {
      const existing = await getAssessment(existingAssessmentId);
      if (existing) {
        existing.messages = messages;
        existing.result = assessmentResult || existing.result;
        existing.emergency = emergency || existing.emergency;
        existing.forWhom = forWhom || undefined;
        await updateAssessment(existing);
        if (assessmentResult) {
          router.replace({
            pathname: "/results",
            params: { assessmentId: existingAssessmentId },
          });
        } else {
          router.back();
        }
        return;
      }
    }
    
    const assessment: Assessment = {
      id: Crypto.randomUUID(),
      date: Date.now(),
      chiefComplaint: chiefComplaintRef.current,
      messages,
      result: assessmentResult || undefined,
      emergency: emergency || undefined,
      medications: [],
      patientProfile: {
        ...profile,
        isPediatric: settings.pediatricMode,
      },
      ...(forWhom ? { forWhom } : {}),
    };
    await saveAssessment(assessment);

    if (assessmentResult) {
      router.replace({
        pathname: "/results",
        params: { assessmentId: assessment.id },
      });
    } else {
      router.back();
    }
  };

  const quickReplyRef = useRef<string | null>(null);

  const handleQuickReply = useCallback((reply: string) => {
    if (isSubmittingRef.current || isLoading) return;
    isSubmittingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    quickReplyRef.current = reply;
    setInputText(reply);
    setQuickReplies([]);
  }, [isLoading]);

  useEffect(() => {
    if (quickReplyRef.current && inputText === quickReplyRef.current && !isLoading) {
      quickReplyRef.current = null;
      isSubmittingRef.current = false;
      sendMessage();
    }
  }, [inputText]);

  const allMessages = [...messages];
  if (streamingMessage) {
    allMessages.push({
      id: "streaming",
      role: "assistant",
      content: streamingMessage,
      timestamp: Date.now(),
    });
  }

  const reversedMessages = [...allMessages].reverse();

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {emergency && !mentalHealthMode && (
        <EmergencyOverlay
          alert={emergency}
          onDismiss={() => setEmergency(null)}
        />
      )}

      {mentalHealthCrisis && (
        <MentalHealthCrisisOverlay
          onDismiss={() => setMentalHealthCrisis(false)}
        />
      )}

      <Modal
        visible={showAttachModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAttachModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {t("Attach Image", "\u0625\u0631\u0641\u0627\u0642 \u0635\u0648\u0631\u0629")}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: Colors.light.borderLight }]}
              onPress={() => { setShowAttachModal(false); pickImage("camera"); }}
            >
              <Ionicons name="camera-outline" size={22} color={Colors.light.primary} />
              <Text style={styles.modalOptionText}>{t("Take Photo", "\u0627\u0644\u062a\u0642\u0627\u0637 \u0635\u0648\u0631\u0629")}</Text>
            </Pressable>
            <View style={styles.modalDivider} />
            <Pressable
              style={({ pressed }) => [styles.modalOption, pressed && { backgroundColor: Colors.light.borderLight }]}
              onPress={() => { setShowAttachModal(false); pickImage("gallery"); }}
            >
              <Ionicons name="images-outline" size={22} color={Colors.light.primary} />
              <Text style={styles.modalOptionText}>{t("Choose from Gallery", "\u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0646 \u0627\u0644\u0645\u0639\u0631\u0636")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalCancelButton, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAttachModal(false)}
            >
              <Text style={styles.modalCancelText}>{t("Cancel", "\u0625\u0644\u063a\u0627\u0621")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showForWhomModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForWhomModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setShowForWhomModal(false); }}>
          <Pressable style={styles.forWhomModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            {forWhomStep === "choose" ? (
              <>
                <Text style={styles.modalTitle}>
                  {t("Who is this assessment for?", "\u0644\u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u062a\u0642\u064a\u064a\u0645\u061f")}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.forWhomOption, pressed && { backgroundColor: Colors.light.primarySurface }]}
                  onPress={() => {
                    setForWhom(null);
                    setShowForWhomModal(false);
                  }}
                >
                  <View style={styles.forWhomIconCircle}>
                    <Ionicons name="person" size={22} color={Colors.light.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.forWhomOptionTitle}>{t("Myself", "\u0644\u0646\u0641\u0633\u064a")}</Text>
                    <Text style={styles.forWhomOptionDesc}>{t("I'm the patient", "\u0623\u0646\u0627 \u0627\u0644\u0645\u0631\u064a\u0636")}</Text>
                  </View>
                  <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={Colors.light.textTertiary} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.forWhomOption, pressed && { backgroundColor: Colors.light.primarySurface }]}
                  onPress={() => setForWhomStep("details")}
                >
                  <View style={styles.forWhomIconCircle}>
                    <Ionicons name="people" size={22} color={Colors.light.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.forWhomOptionTitle}>{t("Someone else", "\u0634\u062e\u0635 \u0622\u062e\u0631")}</Text>
                    <Text style={styles.forWhomOptionDesc}>{t("Family member or dependent", "\u0641\u0631\u062f \u0645\u0646 \u0627\u0644\u0639\u0627\u0626\u0644\u0629")}</Text>
                  </View>
                  <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color={Colors.light.textTertiary} />
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.forWhomDetailsHeader}>
                  <Pressable onPress={() => setForWhomStep("choose")} hitSlop={12}>
                    <Ionicons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color={Colors.light.text} />
                  </Pressable>
                  <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>
                    {t("Patient Details", "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0631\u064a\u0636")}
                  </Text>
                  <View style={{ width: 22 }} />
                </View>
                <View style={styles.forWhomForm}>
                  {savedFamilyMembers.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                      <View style={styles.forWhomChips}>
                        {savedFamilyMembers.map((member) => (
                          <Pressable
                            key={member.id}
                            style={[
                              styles.forWhomChip,
                              selectedFamilyMemberId === member.id && styles.forWhomChipActive,
                            ]}
                            onPress={() => {
                              setSelectedFamilyMemberId(member.id);
                              setForWhomName(member.name);
                              setForWhomRelationship(member.relationship);
                              setForWhomAge(member.age ? String(member.age) : "");
                              setSaveProfileChecked(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.forWhomChipText,
                                selectedFamilyMemberId === member.id && styles.forWhomChipTextActive,
                              ]}
                            >
                              {member.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                  <Text style={styles.forWhomLabel}>{t("Name", "\u0627\u0644\u0627\u0633\u0645")}</Text>
                  <TextInput
                    style={[styles.forWhomInput, isRTL && { textAlign: "right" }]}
                    value={forWhomName}
                    onChangeText={(text) => { setForWhomName(text); setSelectedFamilyMemberId(null); }}
                    placeholder={t("Patient's name", "\u0627\u0633\u0645 \u0627\u0644\u0645\u0631\u064a\u0636")}
                    placeholderTextColor={Colors.light.textTertiary}
                  />
                  <Text style={styles.forWhomLabel}>{t("Relationship", "\u0635\u0644\u0629 \u0627\u0644\u0642\u0631\u0627\u0628\u0629")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.forWhomChipsScroll}>
                    <View style={styles.forWhomChips}>
                      {[
                        { en: "Parent", ar: "\u0623\u062d\u062f \u0627\u0644\u0648\u0627\u0644\u062f\u064a\u0646" },
                        { en: "Child", ar: "\u0637\u0641\u0644" },
                        { en: "Spouse", ar: "\u0632\u0648\u062c/\u0629" },
                        { en: "Sibling", ar: "\u0623\u062e/\u0623\u062e\u062a" },
                        { en: "Grandparent", ar: "\u062c\u062f/\u062c\u062f\u0629" },
                        { en: "Other", ar: "\u0622\u062e\u0631" },
                      ].map((rel) => (
                        <Pressable
                          key={rel.en}
                          style={[
                            styles.forWhomChip,
                            forWhomRelationship === rel.en && styles.forWhomChipActive,
                          ]}
                          onPress={() => { setForWhomRelationship(rel.en); setSelectedFamilyMemberId(null); }}
                        >
                          <Text
                            style={[
                              styles.forWhomChipText,
                              forWhomRelationship === rel.en && styles.forWhomChipTextActive,
                            ]}
                          >
                            {t(rel.en, rel.ar)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <Text style={styles.forWhomLabel}>{t("Age (optional)", "\u0627\u0644\u0639\u0645\u0631 (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)")}</Text>
                  <TextInput
                    style={[styles.forWhomInput, isRTL && { textAlign: "right" }, { width: 100 }]}
                    value={forWhomAge}
                    onChangeText={(text) => { setForWhomAge(text); setSelectedFamilyMemberId(null); }}
                    placeholder="—"
                    placeholderTextColor={Colors.light.textTertiary}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  {!selectedFamilyMemberId && (
                    <Pressable
                      style={styles.saveProfileRow}
                      onPress={() => setSaveProfileChecked(!saveProfileChecked)}
                    >
                      <View style={[styles.saveProfileCheckbox, saveProfileChecked && styles.saveProfileCheckboxActive]}>
                        {saveProfileChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                      <Text style={styles.saveProfileText}>
                        {t("Save this profile for next time", "\u0627\u062d\u0641\u0638 \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641 \u0644\u0644\u0645\u0631\u0629 \u0627\u0644\u0642\u0627\u062f\u0645\u0629")}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  style={[
                    styles.forWhomSubmitBtn,
                    (!forWhomName.trim() || !forWhomRelationship) && styles.forWhomSubmitBtnDisabled,
                  ]}
                  disabled={!forWhomName.trim() || !forWhomRelationship}
                  onPress={() => {
                    const ageNum = parseInt(forWhomAge, 10);
                    const trimmedName = forWhomName.trim();
                    setForWhom({
                      name: trimmedName,
                      relationship: forWhomRelationship,
                      ...(ageNum > 0 ? { age: ageNum } : {}),
                    });
                    if (saveProfileChecked && !selectedFamilyMemberId) {
                      const memberId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                      saveFamilyMember({
                        id: memberId,
                        name: trimmedName,
                        relationship: forWhomRelationship,
                        ...(ageNum > 0 ? { age: ageNum } : {}),
                      });
                    }
                    setShowForWhomModal(false);
                  }}
                >
                  <Text style={styles.forWhomSubmitText}>{t("Continue", "\u0645\u062a\u0627\u0628\u0639\u0629")}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <View
        style={styles.header}
        onLayout={(e) => {
          headerHeightRef.current = e.nativeEvent.layout.height;
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerButton}
        >
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerDotRing}>
            <View style={styles.headerDot} />
          </View>
          <Text style={styles.headerTitle}>
            {t("Health Assessment", "\u0627\u0644\u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0635\u062d\u064a")}
          </Text>
        </View>
        {messages.length > 2 ? (
          <Pressable onPress={finishAssessment} hitSlop={12} style={styles.headerButton}>
            <Ionicons name="checkmark" size={24} color={Colors.light.primary} />
          </Pressable>
        ) : (
          <View style={styles.headerButton} />
        )}
      </View>

      {forWhom && (
        <Pressable
          style={styles.forWhomBanner}
          onPress={() => { getFamilyMembers().then(setSavedFamilyMembers); setSaveProfileChecked(false); setSelectedFamilyMemberId(null); setShowForWhomModal(true); setForWhomStep("choose"); }}
        >
          <Ionicons name="people" size={16} color={Colors.light.primary} />
          <Text style={styles.forWhomBannerText} numberOfLines={1}>
            {t("For", "\u0644\u0640")} {forWhom.name}
            {forWhom.age ? ` (${forWhom.age})` : ""}
            {" · "}
            {t(forWhom.relationship, forWhom.relationship)}
          </Text>
          <Ionicons name="pencil" size={14} color={Colors.light.textTertiary} />
        </Pressable>
      )}

      {(() => {
        const isComplete = !!assessmentResult;
        const questionCount = messages.filter(
          (m) => m.role === "assistant" && m.id !== "welcome" && m.id !== "streaming" && !m.isError
        ).length;
        const rawEstimate = questionCount <= 3 ? 10 : questionCount <= 8 ? 12 : 16;
        if (questionCount > 0 && lockedTotalRef.current === null) {
          lockedTotalRef.current = Math.min(rawEstimate, 20);
        }
        const cappedTotal = lockedTotalRef.current || Math.min(rawEstimate, 20);
        const generating = isGeneratingRecommendation;
        const progress = isComplete ? 1 : generating ? 0.98 : Math.min(questionCount / cappedTotal, 0.95);
        if (isComplete && assessmentId) return null;
        return (
          <View
            style={styles.progressContainer}
            onLayout={(e) => { progressHeightRef.current = e.nativeEvent.layout.height; }}
          >
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.round(progress * 100)}%` as any },
                  isComplete && styles.progressBarComplete,
                  generating && { opacity: 0.7 },
                ]}
              />
            </View>
            <Text style={styles.progressLabel}>
              {isComplete
                ? t("Complete", "\u0645\u0643\u062a\u0645\u0644")
                : generating
                ? t("Generating your recommendation...", "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0627\u0644\u062a\u0648\u0635\u064a\u0629...")
                : questionCount > 0
                ? t(
                    `Step ${questionCount} of ~${cappedTotal}`,
                    `\u0633\u0624\u0627\u0644 ${questionCount} \u0645\u0646 ~${cappedTotal}`,
                  )
                : t("Starting assessment...", "\u0628\u062f\u0621 \u0627\u0644\u062a\u0642\u064a\u064a\u0645...")}
            </Text>
          </View>
        );
      })()}

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isStreaming={item.id === "streaming"}
            />
          )}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_w, h) => { contentSizeRef.current = h; }}
          onLayout={(e) => { viewportHeightRef.current = e.nativeEvent.layout.height; }}
          ListHeaderComponent={
            isLoading && !streamingMessage ? (
              <AnimatedTypingIndicator />
            ) : mentalHealthResults ? (
              <MentalHealthResultsCard
                results={mentalHealthResults}
                onStartNew={() => {
                  setMessages([]);
                  setMentalHealthResults(null);
                  setMentalHealthCrisis(false);
                  setMentalHealthMode('phq9');
                  setExistingAssessmentId(null);
                  initializedRef.current = false;
                  router.replace("/assessment?mode=mentalHealth");
                }}
                onStartGAD7={() => {
                  setMessages([{
                    id: "welcome-gad7",
                    role: "assistant",
                    content: settings.language === "ar"
                      ? "سنبدأ الآن فحص القلق GAD-7."
                      : "Now we'll begin the GAD-7 anxiety screening.",
                    timestamp: Date.now(),
                  }]);
                  setMentalHealthResults(null);
                  setMentalHealthCrisis(false);
                  setMentalHealthMode('gad7');
                  setExistingAssessmentId(null);
                  chiefComplaintRef.current = "فحص القلق GAD-7";
                  pendingMentalHealthStartRef.current = 'gad7';
                }}
              />
            ) : assessmentResult ? (
              <View style={styles.inlineResultCard}>
                <RecommendationCard
                  result={assessmentResult}
                  onFindPharmacy={() =>
                    router.push({
                      pathname: "/routing",
                      params: { type: "pharmacy" },
                    })
                  }
                  onFindLab={() =>
                    router.push({
                      pathname: "/routing",
                      params: {
                        type: "lab",
                        capabilities: assessmentResult?.recommendations?.pathwayB?.tests
                          ?.map((test) => test.capabilities?.join(","))
                          .join("|") || "",
                      },
                    })
                  }
                  onOrderMedicines={(meds) => {
                    const first = meds[0];
                    if (first) {
                      router.push({
                        pathname: "/order",
                        params: {
                          medicineName: first.name,
                          medicineDosage: `${first.dosage} - ${first.frequency}`,
                        },
                      });
                    }
                  }}
                />
              </View>
            ) : null
          }
        />

        <View style={styles.bottomBar}>
          {pendingImage && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} />
              <Pressable
                style={styles.removeImageButton}
                onPress={() => setPendingImage(null)}
              >
                <Ionicons name="close-circle" size={22} color={Colors.light.emergency} />
              </Pressable>
            </View>
          )}

          {quickReplies.length > 0 && !isLoading && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesContainer}
              keyboardShouldPersistTaps="handled"
            >
              {quickReplies.map((reply, i) => (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    styles.quickReplyPill,
                    pressed && styles.quickReplyPillPressed,
                    (isSubmittingRef.current || isLoading) && styles.quickReplyPillDisabled,
                  ]}
                  onPress={() => handleQuickReply(reply)}
                  disabled={isSubmittingRef.current || isLoading}
                >
                  <Text style={[styles.quickReplyText, (isSubmittingRef.current || isLoading) && styles.quickReplyTextDisabled]}>{reply}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View
            style={[styles.inputContainer, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 12) }]}
          >
          <View style={styles.inputWrapper}>
            <Pressable
              style={styles.attachButton}
              onPress={showAttachMenu}
              hitSlop={8}
              testID="attach-button"
              accessibilityLabel="Attach image"
            >
              <Ionicons name="add" size={20} color={Colors.light.primary} />
            </Pressable>
            <TextInput
              style={[styles.input, isRTL && { textAlign: "right" }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t(
                "Describe your symptoms...",
                "\u0635\u0641 \u0623\u0639\u0631\u0627\u0636\u0643...",
              )}
              placeholderTextColor={Colors.light.textTertiary}
              multiline
              maxLength={1000}
              editable={!isLoading}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <Pressable
              style={[
                styles.sendButton,
                ((!inputText.trim() && !pendingImage) || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={(!inputText.trim() && !pendingImage) || isLoading}
              testID="send-button"
              accessibilityLabel="Send message"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.light.borderLight,
    borderRadius: 2,
    overflow: "hidden" as const,
  },
  progressBarFill: {
    height: 4,
    backgroundColor: Colors.light.primary,
    borderRadius: 2,
  },
  progressBarComplete: {
    backgroundColor: Colors.light.success,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    minWidth: 80,
    textAlign: "right" as const,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerDotRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.success,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  chatArea: {
    flex: 1,
  },
  messagesList: {
    paddingVertical: 16,
  },
  imagePreviewContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  imagePreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  removeImageButton: {
    marginLeft: -10,
    marginTop: -26,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: Colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    backgroundColor: Colors.light.inputBg,
    borderRadius: 28,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  attachButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.light.primarySurface,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight + "40",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: Colors.light.textTertiary,
    opacity: 0.4,
  },
  inlineResultCard: {
    marginBottom: 12,
    paddingTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.light.overlay,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.textLight,
    alignSelf: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  modalOptionText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.text,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.light.divider,
    marginHorizontal: 12,
  },
  modalCancelButton: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: Colors.light.background,
  },
  modalCancelText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  bottomBar: {
    backgroundColor: Colors.light.background,
  },
  quickRepliesContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  quickReplyPill: {
    paddingHorizontal: 14,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 19,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.primary + "30",
  },
  quickReplyPillPressed: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  quickReplyPillDisabled: {
    opacity: 0.4,
  },
  quickReplyText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
    lineHeight: 18,
  },
  quickReplyTextDisabled: {
    color: Colors.light.textTertiary,
  },
  forWhomModalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 34,
    paddingHorizontal: 20,
  },
  forWhomOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: Colors.light.background,
  },
  forWhomIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  forWhomOptionTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  forWhomOptionDesc: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  forWhomDetailsHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    marginBottom: 16,
  },
  forWhomForm: {
    gap: 8,
  },
  forWhomLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  forWhomInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  forWhomChipsScroll: {
    flexGrow: 0,
  },
  forWhomChips: {
    flexDirection: "row" as const,
    gap: 8,
    paddingVertical: 4,
  },
  forWhomChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.background,
    borderWidth: 1.5,
    borderColor: Colors.light.borderLight,
  },
  forWhomChipActive: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primary,
  },
  forWhomChipText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  forWhomChipTextActive: {
    color: Colors.light.primary,
  },
  forWhomSubmitBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center" as const,
    marginTop: 20,
  },
  forWhomSubmitBtnDisabled: {
    opacity: 0.4,
  },
  forWhomSubmitText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  forWhomBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.primarySurface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.primary + "20",
  },
  forWhomBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
  saveProfileRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginTop: 16,
  },
  saveProfileCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.light.textTertiary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  saveProfileCheckboxActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  saveProfileText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    flex: 1,
  },
});
