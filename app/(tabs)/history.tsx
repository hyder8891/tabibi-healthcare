import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Platform,
  Alert,
  Image,
  TouchableOpacity,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { AssessmentCard } from "@/components/AssessmentCard";
import { getAssessments, deleteAssessment } from "@/lib/storage";
import type { Assessment } from "@/lib/types";
import { useSettings } from "@/contexts/SettingsContext";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const loadAssessments = async () => {
    const data = await getAssessments();
    setAssessments(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadAssessments();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAssessments();
    setRefreshing(false);
  };

  const handleDelete = (id: string) => {
    if (Platform.OS === "web") {
      deleteAssessment(id).then(loadAssessments);
      return;
    }
    Alert.alert(
      t("Delete Assessment", "حذف التقييم"),
      t("Are you sure you want to delete this assessment?", "هل أنت متأكد من حذف هذا التقييم؟"),
      [
        { text: t("Cancel", "إلغاء"), style: "cancel" },
        {
          text: t("Delete", "حذف"),
          style: "destructive",
          onPress: () => deleteAssessment(id).then(loadAssessments),
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <Text style={[styles.title, { textAlign: isRTL ? "right" : "left" }]}>
          {t("Assessment History", "سجل التقييمات")}
        </Text>
        <Text style={[styles.subtitle, { textAlign: isRTL ? "right" : "left" }]}>
          {assessments.length} {t("assessment", "تقييم")}{assessments.length !== 1 ? (isRTL ? "" : "s") : ""}
        </Text>
      </View>
      <FlatList
        data={assessments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AssessmentCard
            assessment={item}
            onPress={() =>
              router.push({
                pathname: "/results",
                params: { assessmentId: item.id },
              })
            }
            onContinue={() =>
              router.push({
                pathname: "/assessment",
                params: { assessmentId: item.id },
              })
            }
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={[
          styles.list,
          assessments.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.light.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Image
                source={require("@/assets/images/logo-nobg.png")}
                style={styles.emptyLogo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.emptyText}>
              {t(
                "No assessments yet. Start your first health check",
                "لا توجد تقييمات بعد. ابدأ فحصك الصحي الأول"
              )}
            </Text>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push("/assessment")}
              testID="start-assessment-button"
            >
              <Text style={styles.ctaButtonText}>
                {t("Start Assessment", "ابدأ التقييم")}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  title: {
    fontSize: 32,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textTertiary,
    marginTop: 2,
  },
  list: {
    padding: 20,
    paddingBottom: 130,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  emptyLogo: {
    width: 64,
    height: 64,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 280,
    marginBottom: 24,
  },
  ctaButton: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaButtonText: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: "#FFFFFF",
  },
});
