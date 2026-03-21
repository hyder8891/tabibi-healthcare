import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export function MessageBubble({ message, isStreaming, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { isRTL, t } = useSettings();

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
        isRTL && { flexDirection: "row-reverse" },
      ]}
    >
      {!isUser && (
        <View style={[styles.avatar, isRTL && { marginRight: 0, marginLeft: 8 }]}>
          <Image source={require("@/assets/images/logo.png")} style={styles.avatarImage} />
        </View>
      )}
      <View style={{ flexShrink: 1 }}>
        <View
          style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble,
            isRTL && isUser && { borderBottomRightRadius: 22, borderBottomLeftRadius: 8 },
            isRTL && !isUser && { borderBottomLeftRadius: 22, borderBottomRightRadius: 8 },
            message.isNetworkError && styles.networkErrorBubble,
          ]}
        >
          {message.imageUri && (
            <Image
              source={{ uri: message.imageUri }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          )}
          {message.isNetworkError && (
            <Ionicons name="cloud-offline-outline" size={20} color="#DC2626" style={{ marginBottom: 4 }} />
          )}
          <Text
            style={[styles.text, isUser ? styles.userText : styles.aiText, isRTL && { textAlign: "right" }, message.isNetworkError && styles.networkErrorText]}
            selectable
          >
            {message.content}
            {isStreaming && <Text style={styles.cursor}>|</Text>}
          </Text>
        </View>
        {message.isNetworkError && onRetry && (
          <TouchableOpacity
            style={[styles.retryButton, isRTL && { alignSelf: "flex-end" }]}
            onPress={onRetry}
            activeOpacity={0.7}
            testID="retry-button"
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>{t("Try Again", "\u062d\u0627\u0648\u0644 \u0645\u062c\u062f\u062f\u0627\u064b")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export function TypingIndicator() {
  const { isRTL } = useSettings();
  return (
    <View style={[styles.container, styles.aiContainer, isRTL && { flexDirection: "row-reverse" }]}>
      <View style={[styles.avatar, isRTL && { marginRight: 0, marginLeft: 8 }]}>
        <Image source={require("@/assets/images/logo.png")} style={styles.avatarImage} />
      </View>
      <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.dot1]} />
          <View style={[styles.dot, styles.dot2]} />
          <View style={[styles.dot, styles.dot3]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  userContainer: {
    justifyContent: "flex-end",
  },
  aiContainer: {
    justifyContent: "flex-start",
    alignItems: "flex-end",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 4,
    overflow: "hidden" as const,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImage: {
    width: 28,
    height: 28,
    resizeMode: "contain" as const,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.light.primary,
    borderBottomRightRadius: 8,
  },
  aiBubble: {
    backgroundColor: Colors.light.surface,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  text: {
    fontSize: 15,
    lineHeight: 24,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    color: Colors.light.text,
  },
  messageImage: {
    width: 200,
    height: 160,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: Colors.light.borderLight,
  },
  cursor: {
    color: Colors.light.primary,
    fontWeight: "300" as const,
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.light.primaryLight,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  networkErrorBubble: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  networkErrorText: {
    color: "#DC2626",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 8,
    gap: 6,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
});
