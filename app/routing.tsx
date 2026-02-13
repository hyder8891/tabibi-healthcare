import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { FacilityCard } from "@/components/FacilityCard";
import { useSettings } from "@/contexts/SettingsContext";
import type { NearbyFacility } from "@/lib/types";

function generateNearbyFacilities(
  latitude: number,
  longitude: number,
  type: string,
  capabilities?: string,
): NearbyFacility[] {
  const facilities: NearbyFacility[] = [];
  const now = new Date();
  const currentHour = now.getHours();

  const pharmacyNames = [
    "Al Manara Pharmacy",
    "Health First Pharmacy",
    "Aster Pharmacy",
    "Life Pharmacy",
    "Bin Sina Pharmacy",
    "MedPlus Pharmacy",
  ];

  const labNames = [
    "Al Borg Diagnostics",
    "MedLab Middle East",
    "PathCare Diagnostics",
    "BioLab Medical Center",
    "Premier Diagnostics",
  ];

  const clinicNames = [
    "Dubai Medical Center",
    "Al Noor Clinic",
    "Medcare Medical Centre",
    "Saudi German Hospital Clinic",
    "Mediclinic City Hospital",
  ];

  const hospitalNames = [
    "Rashid Hospital",
    "Dubai Hospital",
    "King Faisal Hospital",
    "Cleveland Clinic Abu Dhabi",
  ];

  const names =
    type === "pharmacy"
      ? pharmacyNames
      : type === "lab"
        ? labNames
        : type === "hospital"
          ? hospitalNames
          : clinicNames;

  const capSets: Record<string, string[][]> = {
    pharmacy: [
      ["OTC", "Prescription", "24/7"],
      ["OTC", "Prescription", "Cosmetics"],
      ["OTC", "Prescription", "Delivery"],
      ["OTC", "Pediatric", "Diabetes"],
      ["OTC", "Prescription", "Herbal"],
      ["OTC", "Prescription", "24/7", "Delivery"],
    ],
    lab: [
      ["Blood Tests", "Urinalysis", "Microbiology"],
      ["Blood Tests", "X-Ray", "Ultrasound"],
      ["MRI", "CT Scan", "X-Ray", "Ultrasound"],
      ["Blood Tests", "Urinalysis", "Hormones"],
      ["MRI", "Blood Tests", "ECG", "Ultrasound"],
    ],
    clinic: [
      ["General Practice", "Pediatrics"],
      ["Orthopedics", "X-Ray", "Physiotherapy"],
      ["Dermatology", "General Practice"],
      ["Cardiology", "ECG", "Echo"],
      ["ENT", "General Practice", "Pediatrics"],
    ],
    hospital: [
      ["ER 24/7", "ICU", "Surgery", "MRI", "CT Scan"],
      ["ER 24/7", "ICU", "Trauma", "X-Ray", "Lab"],
      ["ER 24/7", "Pediatrics", "NICU", "Surgery"],
      ["ER 24/7", "Cardiology", "Neurology", "ICU"],
    ],
  };

  for (let i = 0; i < names.length; i++) {
    const angle = (i / names.length) * 2 * Math.PI + Math.random() * 0.5;
    const dist = 0.3 + Math.random() * 2.7;
    const lat = latitude + (dist / 111) * Math.cos(angle);
    const lng =
      longitude +
      (dist / (111 * Math.cos((latitude * Math.PI) / 180))) * Math.sin(angle);

    const caps = capSets[type]?.[i % (capSets[type]?.length || 1)] || [];

    const isOpen24 = caps.includes("24/7") || caps.includes("ER 24/7");
    const opensAt = 8;
    const closesAt = type === "pharmacy" ? 22 : 18;
    const isOpen = isOpen24 || (currentHour >= opensAt && currentHour < closesAt);

    const facility: NearbyFacility = {
      id: `${type}-${i}`,
      name: names[i],
      type: type as NearbyFacility["type"],
      distance: parseFloat(dist.toFixed(1)),
      rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
      isOpen,
      address: `Street ${Math.floor(Math.random() * 50) + 1}, District ${Math.floor(Math.random() * 10) + 1}`,
      latitude: lat,
      longitude: lng,
      capabilities: caps,
      phone: `+971${Math.floor(Math.random() * 900000000 + 100000000)}`,
      openHours: isOpen24 ? "24/7" : `${opensAt}:00 - ${closesAt}:00`,
    };

    facilities.push(facility);
  }

  if (capabilities) {
    const required = capabilities
      .split("|")
      .flatMap((c) => c.split(","))
      .filter(Boolean)
      .map((c) => c.toLowerCase().trim());

    if (required.length > 0) {
      const filtered = facilities.filter((f) =>
        required.some((req) =>
          f.capabilities.some((cap) => cap.toLowerCase().includes(req)),
        ),
      );
      if (filtered.length > 0) {
        return filtered.sort((a, b) => a.distance - b.distance);
      }
    }
  }

  return facilities.sort((a, b) => a.distance - b.distance);
}

export default function RoutingScreen() {
  const insets = useSafeAreaInsets();
  const { type = "pharmacy", capabilities } = useLocalSearchParams<{
    type: string;
    capabilities?: string;
  }>();
  const { t } = useSettings();
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(type);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    loadFacilities();
  }, [selectedType]);

  const loadFacilities = async () => {
    setLoading(true);
    setLocationError(null);

    try {
      let latitude = 25.2048;
      let longitude = 55.2708;

      if (Platform.OS === "web") {
        try {
          const position = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 5000,
              });
            },
          );
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
        } catch {}
      } else {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          try {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            latitude = location.coords.latitude;
            longitude = location.coords.longitude;
          } catch {}
        }
      }

      const nearbyFacilities = generateNearbyFacilities(
        latitude,
        longitude,
        selectedType,
        capabilities,
      );
      setFacilities(nearbyFacilities);
    } catch (err) {
      setLocationError(
        t(
          "Could not get location. Showing default results.",
          "\u062a\u0639\u0630\u0631 \u0627\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639. \u064a\u062a\u0645 \u0639\u0631\u0636 \u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629.",
        ),
      );
      const defaultFacilities = generateNearbyFacilities(
        25.2048,
        55.2708,
        selectedType,
        capabilities,
      );
      setFacilities(defaultFacilities);
    } finally {
      setLoading(false);
    }
  };

  const typeOptions = [
    {
      key: "pharmacy",
      label: t("Pharmacies", "\u0635\u064a\u062f\u0644\u064a\u0627\u062a"),
      icon: "medical",
      color: Colors.light.primary,
    },
    {
      key: "lab",
      label: t("Labs", "\u0645\u062e\u062a\u0628\u0631\u0627\u062a"),
      icon: "flask",
      color: "#7C3AED",
    },
    {
      key: "clinic",
      label: t("Clinics", "\u0639\u064a\u0627\u062f\u0627\u062a"),
      icon: "medkit",
      color: Colors.light.accent,
    },
    {
      key: "hospital",
      label: t("Hospitals", "\u0645\u0633\u062a\u0634\u0641\u064a\u0627\u062a"),
      icon: "business",
      color: Colors.light.emergency,
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {t("Find Nearby Care", "\u0627\u0628\u062d\u062b \u0639\u0646 \u0631\u0639\u0627\u064a\u0629 \u0642\u0631\u064a\u0628\u0629")}
        </Text>
        <Pressable
          onPress={loadFacilities}
          hitSlop={12}
          style={styles.headerButton}
        >
          <Ionicons name="refresh" size={22} color={Colors.light.primary} />
        </Pressable>
      </View>

      <View style={styles.typeSelector}>
        {typeOptions.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.typeButton,
              selectedType === opt.key && {
                backgroundColor: opt.color + "15",
                borderColor: opt.color,
              },
            ]}
            onPress={() => setSelectedType(opt.key)}
          >
            <Ionicons
              name={opt.icon as any}
              size={16}
              color={selectedType === opt.key ? opt.color : Colors.light.textTertiary}
            />
            <Text
              style={[
                styles.typeButtonText,
                selectedType === opt.key && { color: opt.color },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {locationError && (
        <View style={styles.errorBanner}>
          <Ionicons name="location-outline" size={16} color={Colors.light.accent} />
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={styles.loadingText}>
            {t("Finding nearby facilities...", "\u062c\u0627\u0631\u064a \u0627\u0644\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u0645\u0631\u0627\u0641\u0642 \u0627\u0644\u0642\u0631\u064a\u0628\u0629...")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={facilities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FacilityCard facility={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {facilities.length}{" "}
              {t("facilities found", "\u0645\u0631\u0627\u0641\u0642 \u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u064a\u0647\u0627")}
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="location-outline"
                size={48}
                color={Colors.light.textTertiary}
              />
              <Text style={styles.emptyText}>
                {t(
                  "No facilities found in your area.",
                  "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0645\u0631\u0627\u0641\u0642 \u0641\u064a \u0645\u0646\u0637\u0642\u062a\u0643.",
                )}
              </Text>
            </View>
          }
        />
      )}
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
  typeSelector: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.surface,
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.borderLight,
    backgroundColor: Colors.light.surface,
  },
  typeButtonText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.light.accentLight,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.accent,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  resultCount: {
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    textAlign: "center",
  },
});
