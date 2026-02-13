import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { MessageBubble, TypingIndicator } from "@/components/MessageBubble";
import { EmergencyOverlay } from "@/components/EmergencyOverlay";
import { getApiUrl } from "@/lib/query-client";
import { saveAssessment, getProfile } from "@/lib/storage";
import { useSettings } from "@/contexts/SettingsContext";
import type { ChatMessage, EmergencyAlert, AssessmentResult, Assessment } from "@/lib/types";

function AnimatedTypingIndicator() {
  return <TypingIndicator />;
}

export default function AssessmentScreen() {
  const insets = useSafeAreaInsets();
  const { settings, t, isRTL } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: settings.language === "ar"
        ? "\u0645\u0631\u062d\u0628\u0627\u064b! \u0623\u0646\u0627 \u0637\u0628\u064a\u0628\u064a\u060c \u0645\u0633\u0627\u0639\u062f\u0643 \u0627\u0644\u0635\u062d\u064a. \u0635\u0641 \u0644\u064a \u0623\u0639\u0631\u0627\u0636\u0643 \u0648\u0633\u0623\u0633\u0627\u0639\u062f\u0643 \u0641\u064a \u062a\u0642\u064a\u064a\u0645 \u062d\u0627\u0644\u062a\u0643."
        : "Hello! I'm Tabibi, your healthcare assistant. Please describe your symptoms and I'll help guide you through a health assessment.",
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const chiefComplaintRef = useRef<string>("");
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!chiefComplaintRef.current) {
      chiefComplaintRef.current = text;
    }

    const userMessage: ChatMessage = {
      id: Crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText("");
    setIsLoading(true);
    setStreamingMessage("");

    try {
      const profile = await getProfile();
      const apiUrl = getApiUrl();
      const url = new URL("/api/assess", apiUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
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
                setStreamingMessage(fullText);
              }
              if (data.done) {
                const emergencyMatch = fullText.match(
                  /\{"emergency"\s*:\s*true[^}]*\}/,
                );
                if (emergencyMatch) {
                  try {
                    const emergencyData = JSON.parse(emergencyMatch[0]);
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
                    setAssessmentResult(result);
                  } catch {}
                }
              }
            } catch {}
          }
        }
      }

      const displayText = fullText
        .replace(/```json[\s\S]*?```/g, "")
        .replace(/\{"emergency"\s*:\s*true[^}]*\}/g, "")
        .trim();

      const aiMessage: ChatMessage = {
        id: Crypto.randomUUID(),
        role: "assistant",
        content: displayText || fullText,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setStreamingMessage("");

      if (assessmentResult || emergency) {
        const assessment: Assessment = {
          id: Crypto.randomUUID(),
          date: Date.now(),
          chiefComplaint: chiefComplaintRef.current,
          messages: [...updatedMessages, aiMessage],
          result: assessmentResult || undefined,
          emergency: emergency || undefined,
          medications: [],
          patientProfile: {
            ...profile,
            isPediatric: settings.pediatricMode,
          },
        };
        await saveAssessment(assessment);
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
  }, [inputText, messages, isLoading, settings]);

  const finishAssessment = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const profile = await getProfile();
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

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerButton}
        >
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.headerDot} />
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
            ) : null
          }
        />

        <View style={styles.scanBanner}>
          <Pressable
            style={({ pressed }) => [
              styles.scanButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/scan");
            }}
          >
            <Ionicons name="camera" size={16} color={Colors.light.primary} />
            <Text style={styles.scanButtonText}>
              {t("Scan Medication", "\u0645\u0633\u062d \u0627\u0644\u062f\u0648\u0627\u0621")}
            </Text>
          </Pressable>
        </View>

        <View
          style={[styles.inputContainer, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.inputWrapper}>
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
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isLoading}
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
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  scanBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.light.primarySurface,
    alignSelf: "center",
  },
  scanButtonText: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
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
    gap: 8,
    backgroundColor: Colors.light.background,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: Colors.light.textTertiary,
    opacity: 0.5,
  },
});
