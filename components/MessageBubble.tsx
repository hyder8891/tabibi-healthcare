import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import type { ChatMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { isRTL } = useSettings();

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
          <Ionicons name="medical" size={16} color="#fff" />
        </View>
      )}
      <View
        style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble,
          isRTL && isUser && { borderBottomRightRadius: 20, borderBottomLeftRadius: 6 },
          isRTL && !isUser && { borderBottomLeftRadius: 20, borderBottomRightRadius: 6 },
        ]}
      >
        <Text
          style={[styles.text, isUser ? styles.userText : styles.aiText, isRTL && { textAlign: "right" }]}
          selectable
        >
          {message.content}
          {isStreaming && <Text style={styles.cursor}>|</Text>}
        </Text>
      </View>
    </View>
  );
}

export function TypingIndicator() {
  return (
    <View style={[styles.container, styles.aiContainer]}>
      <View style={styles.avatar}>
        <Ionicons name="medical" size={16} color="#fff" />
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
    marginBottom: 12,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: Colors.light.primary,
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: Colors.light.surface,
    borderBottomLeftRadius: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    color: Colors.light.text,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.textTertiary,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
});
