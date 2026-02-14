import React from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { NearbyFacility } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

interface FacilityCardProps {
  facility: NearbyFacility;
}

const facilityIcons: Record<string, string> = {
  pharmacy: "medical",
  lab: "flask",
  clinic: "medkit",
  hospital: "business",
};

const facilityColors: Record<string, string> = {
  pharmacy: Colors.light.primary,
  lab: "#7C3AED",
  clinic: Colors.light.accent,
  hospital: Colors.light.emergency,
};

export function FacilityCard({ facility }: FacilityCardProps) {
  const { t } = useSettings();
  const iconName = facilityIcons[facility.type] || "location";
  const color = facilityColors[facility.type] || Colors.light.primary;

  const phoneNumber = facility.internationalPhone || facility.phone;

  const openNavigation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = Platform.select({
      ios: `maps://app?daddr=${facility.latitude},${facility.longitude}`,
      android: `google.navigation:q=${facility.latitude},${facility.longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`,
    });
    if (url) Linking.openURL(url);
  };

  const callFacility = () => {
    if (phoneNumber) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

  const openWhatsApp = () => {
    if (phoneNumber) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const cleaned = phoneNumber.replace(/[\s\-()]/g, "").replace(/^\+/, "");
      Linking.openURL(`https://wa.me/${cleaned}`);
    }
  };

  const openSMS = () => {
    if (phoneNumber) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(`sms:${phoneNumber}`);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.iconContainer, { backgroundColor: color + "15" }]}>
          <Ionicons name={iconName as any} size={22} color={color} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {facility.name}
          </Text>
          <Text style={styles.address} numberOfLines={2}>
            {facility.address}
          </Text>
        </View>
        <View style={styles.distanceBadge}>
          <Text style={styles.distance}>
            {facility.distance < 1
              ? `${Math.round(facility.distance * 1000)}m`
              : `${facility.distance.toFixed(1)}km`}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.rating}>{facility.rating.toFixed(1)}</Text>
          {facility.totalRatings ? (
            <Text style={styles.totalRatings}>({facility.totalRatings})</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: facility.isOpen
                ? Colors.light.successLight
                : Colors.light.emergencyLight,
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: facility.isOpen
                  ? Colors.light.success
                  : Colors.light.emergency,
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              {
                color: facility.isOpen
                  ? Colors.light.success
                  : Colors.light.emergency,
              },
            ]}
          >
            {facility.isOpen ? t("Open Now", "\u0645\u0641\u062a\u0648\u062d \u0627\u0644\u0622\u0646") : t("Closed", "\u0645\u063a\u0644\u0642")}
          </Text>
        </View>
      </View>

      {phoneNumber ? (
        <View style={styles.phoneRow}>
          <Ionicons name="call-outline" size={15} color={Colors.light.textSecondary} />
          <Text style={styles.phoneText}>{phoneNumber}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.navButton,
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
          ]}
          onPress={openNavigation}
        >
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.navButtonText}>{t("Navigate", "\u0627\u0646\u062a\u0642\u0644")}</Text>
        </Pressable>

        {phoneNumber ? (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.callButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={callFacility}
            >
              <Ionicons name="call" size={18} color={Colors.light.primary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.whatsappButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={openWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.smsButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={openSMS}
            >
              <Ionicons name="chatbubble-outline" size={18} color={Colors.light.accent} />
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  address: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  distanceBadge: {
    backgroundColor: Colors.light.primarySurface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  distance: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.light.primary,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  rating: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: Colors.light.text,
  },
  totalRatings: {
    fontSize: 11,
    color: Colors.light.textTertiary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.light.background,
    borderRadius: 10,
  },
  phoneText: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: Colors.light.text,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.light.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#fff",
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  callButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
  },
  whatsappButton: {
    borderWidth: 1.5,
    borderColor: "#25D366",
  },
  smsButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.accent,
  },
});
