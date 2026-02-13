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

export default function RoutingScreen() {
  const insets = useSafeAreaInsets();
  const { type = "pharmacy", capabilities } = useLocalSearchParams<{
    type: string;
    capabilities?: string;
  }>();
  const { t, isRTL } = useSettings();
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(type);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

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
      t("Al Manara Pharmacy", "صيدلية المنارة"),
      t("Health First Pharmacy", "صيدلية هيلث فيرست"),
      t("Aster Pharmacy", "صيدلية أستر"),
      t("Life Pharmacy", "صيدلية لايف"),
      t("Bin Sina Pharmacy", "صيدلية ابن سينا"),
      t("MedPlus Pharmacy", "صيدلية ميدبلس"),
    ];

    const labNames = [
      t("Al Borg Diagnostics", "مختبرات البرج"),
      t("MedLab Middle East", "مختبرات ميدلاب"),
      t("PathCare Diagnostics", "مختبرات باثكير"),
      t("BioLab Medical Center", "مركز بايولاب الطبي"),
      t("Premier Diagnostics", "مختبرات بريمير"),
    ];

    const clinicNames = [
      t("Dubai Medical Center", "مركز دبي الطبي"),
      t("Al Noor Clinic", "عيادة النور"),
      t("Medcare Medical Centre", "مركز ميدكير الطبي"),
      t("Saudi German Hospital Clinic", "عيادة المستشفى السعودي الألماني"),
      t("Mediclinic City Hospital", "مستشفى ميديكلينك"),
    ];

    const hospitalNames = [
      t("Rashid Hospital", "مستشفى راشد"),
      t("Dubai Hospital", "مستشفى دبي"),
      t("King Faisal Hospital", "مستشفى الملك فيصل"),
      t("Cleveland Clinic Abu Dhabi", "كليفلاند كلينك أبوظبي"),
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
        [t("OTC", "أدوية بدون وصفة"), t("Prescription", "أدوية بوصفة"), t("24/7", "٢٤/٧")],
        [t("OTC", "أدوية بدون وصفة"), t("Prescription", "أدوية بوصفة"), t("Cosmetics", "مستحضرات تجميل")],
        [t("OTC", "أدوية بدون وصفة"), t("Prescription", "أدوية بوصفة"), t("Delivery", "توصيل")],
        [t("OTC", "أدوية بدون وصفة"), t("Pediatric", "أطفال"), t("Diabetes", "سكري")],
        [t("OTC", "أدوية بدون وصفة"), t("Prescription", "أدوية بوصفة"), t("Herbal", "أعشاب")],
        [t("OTC", "أدوية بدون وصفة"), t("Prescription", "أدوية بوصفة"), t("24/7", "٢٤/٧"), t("Delivery", "توصيل")],
      ],
      lab: [
        [t("Blood Tests", "تحاليل دم"), t("Urinalysis", "تحليل بول"), t("Microbiology", "أحياء دقيقة")],
        [t("Blood Tests", "تحاليل دم"), t("X-Ray", "أشعة سينية"), t("Ultrasound", "موجات فوق صوتية")],
        [t("MRI", "رنين مغناطيسي"), t("CT Scan", "أشعة مقطعية"), t("X-Ray", "أشعة سينية"), t("Ultrasound", "موجات فوق صوتية")],
        [t("Blood Tests", "تحاليل دم"), t("Urinalysis", "تحليل بول"), t("Hormones", "هرمونات")],
        [t("MRI", "رنين مغناطيسي"), t("Blood Tests", "تحاليل دم"), t("ECG", "تخطيط قلب"), t("Ultrasound", "موجات فوق صوتية")],
      ],
      clinic: [
        [t("General Practice", "طب عام"), t("Pediatrics", "طب أطفال")],
        [t("Orthopedics", "عظام"), t("X-Ray", "أشعة سينية"), t("Physiotherapy", "علاج طبيعي")],
        [t("Dermatology", "جلدية"), t("General Practice", "طب عام")],
        [t("Cardiology", "قلب"), t("ECG", "تخطيط قلب"), t("Echo", "إيكو")],
        [t("ENT", "أنف وأذن وحنجرة"), t("General Practice", "طب عام"), t("Pediatrics", "طب أطفال")],
      ],
      hospital: [
        [t("ER 24/7", "طوارئ ٢٤/٧"), t("ICU", "عناية مركزة"), t("Surgery", "جراحة"), t("MRI", "رنين مغناطيسي"), t("CT Scan", "أشعة مقطعية")],
        [t("ER 24/7", "طوارئ ٢٤/٧"), t("ICU", "عناية مركزة"), t("Trauma", "إصابات"), t("X-Ray", "أشعة سينية"), t("Lab", "مختبر")],
        [t("ER 24/7", "طوارئ ٢٤/٧"), t("Pediatrics", "طب أطفال"), t("NICU", "حضانة"), t("Surgery", "جراحة")],
        [t("ER 24/7", "طوارئ ٢٤/٧"), t("Cardiology", "قلب"), t("Neurology", "أعصاب"), t("ICU", "عناية مركزة")],
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

      const isOpen24 = caps.includes(t("24/7", "٢٤/٧")) || caps.includes(t("ER 24/7", "طوارئ ٢٤/٧"));
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
        address: t(`Street ${Math.floor(Math.random() * 50) + 1}, District ${Math.floor(Math.random() * 10) + 1}`, `شارع ${Math.floor(Math.random() * 50) + 1}، حي ${Math.floor(Math.random() * 10) + 1}`),
        latitude: lat,
        longitude: lng,
        capabilities: caps,
        phone: `+971${Math.floor(Math.random() * 900000000 + 100000000)}`,
        openHours: isOpen24 ? t("24/7", "٢٤/٧") : `${opensAt}:00 - ${closesAt}:00`,
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
        <View style={[styles.errorBanner, isRTL && { flexDirection: "row-reverse" }]}>
          <Ionicons name="location-outline" size={16} color={Colors.light.accent} />
          <Text style={[styles.errorText, isRTL && { textAlign: "right" as const }]}>{locationError}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
          <Text style={[styles.loadingText, isRTL && { textAlign: "right" as const }]}>
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
            <Text style={[styles.resultCount, isRTL && { textAlign: "right" as const }]}>
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
