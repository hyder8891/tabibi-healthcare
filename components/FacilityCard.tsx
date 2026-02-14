import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Linking, Platform, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { NearbyFacility } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";
import { getApiUrl } from "@/lib/query-client";

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

interface PlaceDetails {
  phone: string;
  internationalPhone: string;
  website: string;
  googleMapsUrl: string;
  openingHours: string[];
  isOpen: boolean | null;
}

export function FacilityCard({ facility }: FacilityCardProps) {
  const { t, isRTL } = useSettings();
  const iconName = facilityIcons[facility.type] || "location";
  const color = facilityColors[facility.type] || Colors.light.primary;
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const phoneNumber = details?.internationalPhone || details?.phone || facility.phone;

  useEffect(() => {
    if (expanded && !details && facility.placeId) {
      fetchDetails();
    }
  }, [expanded]);

  const fetchDetails = async () => {
    if (!facility.placeId || loadingDetails) return;
    setLoadingDetails(true);
    try {
      const apiUrl = getApiUrl();
      const url = new URL(`/api/place-details/${facility.placeId}`, apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setDetails(data);
      }
    } catch {} finally {
      setLoadingDetails(false);
    }
  };

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
      const url = `https://wa.me/${cleaned}`;
      Linking.openURL(url);
    }
  };

  const openSMS = () => {
    if (phoneNumber) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(`sms:${phoneNumber}`);
    }
  };

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
  };

  return (
    <Pressable onPress={toggleExpand} style={styles.card}>
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
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={Colors.light.textTertiary}
          style={{ marginLeft: "auto" }}
        />
      </View>

      {expanded && (
        <View style={styles.expandedSection}>
          {loadingDetails && (
            <View style={styles.detailsLoading}>
              <ActivityIndicator size="small" color={Colors.light.primary} />
              <Text style={styles.loadingText}>{t("Loading details...", "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...")}</Text>
            </View>
          )}

          {phoneNumber ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.phoneText}>{phoneNumber}</Text>
            </View>
          ) : details && !loadingDetails ? (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={16} color={Colors.light.textTertiary} />
              <Text style={[styles.phoneText, { color: Colors.light.textTertiary }]}>
                {t("No phone available", "\u0644\u0627 \u064a\u0648\u062c\u062f \u0631\u0642\u0645 \u0647\u0627\u062a\u0641")}
              </Text>
            </View>
          ) : null}

          {details?.openingHours && details.openingHours.length > 0 && (
            <View style={styles.hoursSection}>
              <View style={styles.hoursTitleRow}>
                <Ionicons name="time-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.hoursTitle}>{t("Hours", "\u0627\u0644\u0633\u0627\u0639\u0627\u062a")}</Text>
              </View>
              {details.openingHours.map((line, i) => (
                <Text key={i} style={styles.hoursLine}>{line}</Text>
              ))}
            </View>
          )}

          {facility.capabilities.length > 0 && (
            <View style={styles.capsRow}>
              {facility.capabilities.slice(0, 4).map((cap, i) => (
                <View key={i} style={styles.capBadge}>
                  <Text style={styles.capText}>{cap}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

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
        ) : !expanded ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.infoButton,
              pressed && { opacity: 0.8 },
            ]}
            onPress={toggleExpand}
          >
            <Ionicons name="information-circle-outline" size={20} color={Colors.light.primary} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
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
    marginBottom: 12,
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
  expandedSection: {
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 12,
  },
  detailsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.light.textTertiary,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  phoneText: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: Colors.light.text,
  },
  hoursSection: {
    marginBottom: 10,
  },
  hoursTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  hoursTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.light.textSecondary,
  },
  hoursLine: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    paddingLeft: 22,
  },
  capsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  capBadge: {
    backgroundColor: Colors.light.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  capText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontWeight: "500" as const,
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
  infoButton: {
    borderWidth: 1.5,
    borderColor: Colors.light.borderLight,
  },
});
