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
import { RecommendationCard } from "@/components/RecommendationCard";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { saveAssessment, getProfile, getAssessment, updateAssessment } from "@/lib/storage";
import { useSettings } from "@/contexts/SettingsContext";
import type { ChatMessage, EmergencyAlert, AssessmentResult, Assessment } from "@/lib/types";

function AnimatedTypingIndicator() {
  return <TypingIndicator />;
}

export default function AssessmentScreen() {
  const insets = useSafeAreaInsets();
  const { settings, t, isRTL } = useSettings();
  const { assessmentId } = useLocalSearchParams<{ assessmentId?: string }>();
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
  const flatListRef = useRef<FlatList>(null);
  const chiefComplaintRef = useRef<string>("");
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    if (assessmentId) {
      loadExistingAssessment(assessmentId);
    } else {
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
          const mimeType = asset.uri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
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
    if ((!text && !imageAttachment) || isLoading) return;

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
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          messages: apiMessages,
          patientProfile: {
            ...profile,
            isPediatric: settings.pediatricMode,
          },
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";
      let parsedResult: AssessmentResult | null = null;
      let parsedEmergency: EmergencyAlert | null = null;

      const stripJson = (text: string) => {
        return text
          .replace(/```json[\s\S]*?```/g, "")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/\{"emergency"\s*:\s*true[^}]*\}/g, "")
          .replace(/\{[\s\S]*?"assessment"[\s\S]*?"recommendations"[\s\S]*?\}[\s\S]*?\}[\s\S]*?\}/g, "")
          .replace(/\{"quickReplies"\s*:\s*\[.*?\]\}/g, "")
          .trim();
      };

      const extractQuickReplies = (text: string): string[] => {
        const match = text.match(/\{"quickReplies"\s*:\s*(\[.*?\])\}/);
        if (match) {
          try {
            return JSON.parse(match[1]);
          } catch {}
        }
        return [];
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullText += data.content;
                const cleanStreaming = stripJson(fullText);
                setStreamingMessage(cleanStreaming);
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

                const jsonMatch = fullText.match(
                  /```json\s*([\s\S]*?)```/,
                );
                if (jsonMatch) {
                  try {
                    const result = JSON.parse(jsonMatch[1]);
                    parsedResult = result;
                    setAssessmentResult(result);
                  } catch {}
                }

                if (!parsedResult) {
                  const rawJsonMatch = fullText.match(
                    /\{[\s\S]*?"assessment"[\s\S]*?"recommendations"[\s\S]*\}/,
                  );
                  if (rawJsonMatch) {
                    try {
                      const result = JSON.parse(rawJsonMatch[0]);
                      parsedResult = result;
                      setAssessmentResult(result);
                    } catch {}
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
      };

      setMessages((prev) => [...prev, aiMessage]);
      setStreamingMessage("");

      const profile2 = await getProfile();
      const allMsgs = [...updatedMessages, aiMessage];
      
      if (existingAssessmentId) {
        const existingAssessment = await getAssessment(existingAssessmentId);
        if (existingAssessment) {
          existingAssessment.messages = allMsgs;
          existingAssessment.result = parsedResult || existingAssessment.result;
          existingAssessment.emergency = parsedEmergency || existingAssessment.emergency;
          await updateAssessment(existingAssessment);
        }
      } else if (parsedResult || parsedEmergency) {
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
            ...profile2,
            isPediatric: settings.pediatricMode,
          },
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
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingMessage("");
    } finally {
      setIsLoading(false);
    }
  }, [inputText, messages, isLoading, settings, pendingImage, existingAssessmentId]);

  const finishAssessment = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const profile = await getProfile();
    
    if (existingAssessmentId) {
      const existing = await getAssessment(existingAssessmentId);
      if (existing) {
        existing.messages = messages;
        existing.result = assessmentResult || existing.result;
        existing.emergency = emergency || existing.emergency;
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    quickReplyRef.current = reply;
    setInputText(reply);
    setQuickReplies([]);
  }, []);

  useEffect(() => {
    if (quickReplyRef.current && inputText === quickReplyRef.current && !isLoading) {
      quickReplyRef.current = null;
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
      {emergency && (
        <EmergencyOverlay
          alert={emergency}
          onDismiss={() => setEmergency(null)}
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

      <View style={styles.header}>
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
          ListHeaderComponent={
            isLoading && !streamingMessage ? (
              <AnimatedTypingIndicator />
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
                  onOrderMedicine={(med) =>
                    router.push({
                      pathname: "/order",
                      params: {
                        medicineName: med.name,
                        medicineDosage: `${med.dosage} - ${med.frequency}`,
                      },
                    })
                  }
                />
              </View>
            ) : null
          }
        />

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
                ]}
                onPress={() => handleQuickReply(reply)}
              >
                <Text style={styles.quickReplyText}>{reply}</Text>
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
    marginBottom: 8,
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
  quickReplyText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
    lineHeight: 18,
  },
});
