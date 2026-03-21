import React, { useEffect } from "react";
import { View, StyleSheet, type DimensionValue } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Colors from "@/constants/colors";

function SkeletonBlock({ width, height, borderRadius = 6 }: { width: DimensionValue; height: number; borderRadius?: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: Colors.light.borderLight,
        },
        animatedStyle,
      ]}
    />
  );
}

export function SkeletonFacilityCard() {
  return (
    <View style={styles.card} accessible={true} accessibilityLabel="جارٍ التحميل">
      <View style={styles.topRow}>
        <SkeletonBlock width={44} height={44} borderRadius={12} />
        <View style={styles.info}>
          <SkeletonBlock width="70%" height={16} />
          <SkeletonBlock width="90%" height={12} />
        </View>
        <SkeletonBlock width={48} height={24} borderRadius={12} />
      </View>
      <View style={styles.metaRow}>
        <SkeletonBlock width={80} height={14} />
        <SkeletonBlock width={60} height={20} borderRadius={10} />
      </View>
      <View style={styles.actionsRow}>
        <SkeletonBlock width={120} height={40} borderRadius={12} />
        <SkeletonBlock width={40} height={40} borderRadius={12} />
        <SkeletonBlock width={40} height={40} borderRadius={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
