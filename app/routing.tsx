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
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Colors from "@/constants/colors";
import { FacilityCard } from "@/components/FacilityCard";
import { useSettings } from "@/contexts/SettingsContext";
import { getApiUrl } from "@/lib/query-client";
import type { NearbyFacility } from "@/lib/types";

export default function RoutingScreen() {
  const insets = useSafeAreaInsets();
  const { type = "clinic", capabilities } = useLocalSearchParams<{
    type: string;
    capabilities?: string;
  }>();
  const { t, isRTL } = useSettings();
  const [facilities, setFacilities] = useState<NearbyFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(type);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [filterOpenNow, setFilterOpenNow] = useState(false);
  const [filterHighRated, setFilterHighRated] = useState(false);
  const [sortBy, setSortBy] = useState<"distance" | "rating">("distance");
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const filteredFacilities = facilities
    .filter((f) => (!filterOpenNow || f.isOpen))
    .filter((f) => (!filterHighRated || f.rating >= 4.0))
    .sort((a, b) => sortBy === "rating" ? b.rating - a.rating : a.distance - b.distance);

  useEffect(() => {
    loadFacilities();
  }, [selectedType]);

  const getLocation = async (): Promise<{ lat: number; lng: number }> => {
    if (userLocation) return userLocation;

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
      const { status } = await Location.requestForegroundPermissionsAsync();
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

    const loc = { lat: latitude, lng: longitude };
    setUserLocation(loc);
    return loc;
  };

  const enrichWithPhoneNumbers = async (facilityList: NearbyFacility[], apiUrl: string) => {
    const details = await Promise.allSettled(
      facilityList
        .filter((f) => f.placeId)
        .map(async (f) => {
          try {
            const detailUrl = new URL(`/api/place-details/${f.placeId}`, apiUrl);
            const resp = await fetch(detailUrl.toString());
            if (!resp.ok) return null;
            const d = await resp.json();
            return { placeId: f.placeId, phone: d.phone || "", internationalPhone: d.internationalPhone || "" };
          } catch {
            return null;
          }
        })
    );

    const phoneMap = new Map<string, { phone: string; internationalPhone: string }>();
    for (const result of details) {
      if (result.status === "fulfilled" && result.value) {
        phoneMap.set(result.value.placeId!, result.value);
      }
    }

    if (phoneMap.size > 0) {
      setFacilities((prev) =>
        prev.map((f) => {
          const pd = f.placeId ? phoneMap.get(f.placeId) : undefined;
          if (pd) {
            return { ...f, phone: pd.phone, internationalPhone: pd.internationalPhone };
          }
          return f;
        })
      );
    }
  };

  const loadFacilities = async () => {
    setLoading(true);
    setLocationError(null);
    setNextPageToken(null);

    try {
      const loc = await getLocation();
      const apiUrl = getApiUrl();
      const url = new URL("/api/nearby-facilities", apiUrl);
      url.searchParams.set("latitude", loc.lat.toString());
      url.searchParams.set("longitude", loc.lng.toString());
      url.searchParams.set("type", selectedType);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error) {
        setLocationError(data.error);
        setFacilities([]);
      } else {
        const loadedFacilities = data.facilities || [];
        setFacilities(loadedFacilities);
        setNextPageToken(data.nextPageToken || null);
        enrichWithPhoneNumbers(loadedFacilities, apiUrl);
      }
    } catch (err) {
      setLocationError(
        t(
          "Could not fetch facilities. Please try again.",
          "\u062a\u0639\u0630\u0631 \u062c\u0644\u0628 \u0627\u0644\u0645\u0631\u0627\u0641\u0642. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
        ),
      );
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);

    try {
      const apiUrl = getApiUrl();
      const loc = userLocation || { lat: 25.2048, lng: 55.2708 };
      const url = new URL("/api/nearby-facilities", apiUrl);
      url.searchParams.set("latitude", loc.lat.toString());
      url.searchParams.set("longitude", loc.lng.toString());
      url.searchParams.set("type", selectedType);
      url.searchParams.set("pagetoken", nextPageToken);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!data.error) {
        const newFacilities = data.facilities || [];
        setFacilities((prev) => [...prev, ...newFacilities]);
        setNextPageToken(data.nextPageToken || null);
        const apiUrl = getApiUrl();
        enrichWithPhoneNumbers(newFacilities, apiUrl);
      }
    } catch {} finally {
      setLoadingMore(false);
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

      <View style={styles.filterRow}>
        <Pressable
          style={[
            styles.filterChip,
            filterOpenNow && styles.filterChipActive,
          ]}
          onPress={() => setFilterOpenNow(!filterOpenNow)}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={filterOpenNow ? "#fff" : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, filterOpenNow && styles.filterChipTextActive]}>
            {t("Open Now", "مفتوح الآن")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterChip,
            filterHighRated && styles.filterChipActive,
          ]}
          onPress={() => setFilterHighRated(!filterHighRated)}
        >
          <Ionicons
            name="star"
            size={14}
            color={filterHighRated ? "#fff" : "#F59E0B"}
          />
          <Text style={[styles.filterChipText, filterHighRated && styles.filterChipTextActive]}>
            {t("4+ Stars", "٤+ نجوم")}
          </Text>
        </Pressable>
        <View style={styles.sortDivider} />
        <Pressable
          style={[
            styles.filterChip,
            sortBy === "distance" && styles.filterChipActive,
          ]}
          onPress={() => setSortBy("distance")}
        >
          <Ionicons
            name="navigate-outline"
            size={14}
            color={sortBy === "distance" ? "#fff" : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, sortBy === "distance" && styles.filterChipTextActive]}>
            {t("Nearest", "الأقرب")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterChip,
            sortBy === "rating" && styles.filterChipActive,
          ]}
          onPress={() => setSortBy("rating")}
        >
          <Ionicons
            name="trophy-outline"
            size={14}
            color={sortBy === "rating" ? "#fff" : Colors.light.textSecondary}
          />
          <Text style={[styles.filterChipText, sortBy === "rating" && styles.filterChipTextActive]}>
            {t("Top Rated", "الأعلى تقييماً")}
          </Text>
        </Pressable>
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
          data={filteredFacilities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FacilityCard facility={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, isRTL && { textAlign: "right" as const }]}>
              {filteredFacilities.length}{" "}
              {t("facilities found", "\u0645\u0631\u0627\u0641\u0642 \u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u064a\u0647\u0627")}
            </Text>
          }
          ListFooterComponent={
            nextPageToken ? (
              <Pressable
                style={({ pressed }) => [
                  styles.loadMoreButton,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={Colors.light.primary} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={18} color={Colors.light.primary} />
                    <Text style={styles.loadMoreText}>
                      {t("Load More", "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0645\u0632\u064a\u062f")}
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name="location-outline"
                  size={48}
                  color={Colors.light.primary}
                />
              </View>
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
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
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
  headerTitle: {
    fontSize: 17,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  filterRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  filterChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    backgroundColor: Colors.light.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  sortDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 2,
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
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
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
    borderRadius: 14,
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
    fontSize: 14,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    marginBottom: 12,
  },
  loadMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: Colors.light.primarySurface,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.primary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
    textAlign: "center",
  },
});
