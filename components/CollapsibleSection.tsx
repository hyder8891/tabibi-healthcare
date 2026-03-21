import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  summary?: string;
  children: React.ReactNode;
  isRTL?: boolean;
  titleColor?: string;
  testID?: string;
}

export default function CollapsibleSection({
  title,
  icon,
  summary,
  children,
  isRTL = false,
  titleColor,
  testID,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, "easeInEaseOut", "opacity")
    );
    const toValue = expanded ? 0 : 1;
    Animated.timing(rotateAnim, {
      toValue,
      duration: 250,
      useNativeDriver: Platform.OS !== "web",
    }).start();
    setExpanded(!expanded);
  }, [expanded, rotateAnim]);

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          styles.header,
          isRTL && { flexDirection: "row-reverse" },
          pressed && styles.headerPressed,
        ]}
        testID={testID}
      >
        <View
          style={[styles.headerLeft, isRTL && { flexDirection: "row-reverse" }]}
        >
          {icon}
          <Text
            style={[
              styles.headerTitle,
              isRTL && { textAlign: "right" },
              titleColor ? { color: titleColor } : undefined,
            ]}
          >
            {title}
          </Text>
        </View>
        <View
          style={[
            styles.headerRight,
            isRTL && { flexDirection: "row-reverse" },
          ]}
        >
          {!expanded && summary ? (
            <Text
              style={[styles.summaryText, isRTL && { textAlign: "right" }]}
              numberOfLines={1}
            >
              {summary}
            </Text>
          ) : null}
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons
              name="chevron-down"
              size={16}
              color={Colors.light.textTertiary}
            />
          </Animated.View>
        </View>
      </Pressable>
      {expanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  headerPressed: {
    opacity: 0.7,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "50%",
  },
  summaryText: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    flexShrink: 1,
  },
  content: {
    marginTop: 8,
  },
});
