import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import type { MedicineOrder } from "@/lib/types";

const STATUS_CONFIG: Record<string, { color: string; bg: string; labelEn: string; labelAr: string; icon: string }> = {
  pending: { color: "#F59E0B", bg: "#FFFBEB", labelEn: "Pending", labelAr: "قيد الانتظار", icon: "time-outline" },
  confirmed: { color: Colors.light.primary, bg: Colors.light.primarySurface, labelEn: "Confirmed", labelAr: "مؤكد", icon: "checkmark-circle-outline" },
  preparing: { color: "#8B5CF6", bg: "#F5F3FF", labelEn: "Preparing", labelAr: "قيد التحضير", icon: "flask-outline" },
  delivering: { color: "#3B82F6", bg: "#EFF6FF", labelEn: "Delivering", labelAr: "جاري التوصيل", icon: "bicycle-outline" },
  delivered: { color: Colors.light.success, bg: Colors.light.successLight, labelEn: "Delivered", labelAr: "تم التوصيل", icon: "checkmark-done" },
  cancelled: { color: Colors.light.emergency, bg: Colors.light.emergencyLight, labelEn: "Cancelled", labelAr: "ملغي", icon: "close-circle-outline" },
};

export default function OrdersTabScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [orders, setOrders] = useState<MedicineOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, []),
  );

  const loadOrders = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiUrl();
      const url = new URL("/api/orders", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    Alert.alert(
      t("Cancel Order", "إلغاء الطلب"),
      t("Are you sure you want to cancel this order?", "هل أنت متأكد من إلغاء هذا الطلب؟"),
      [
        { text: t("No", "لا"), style: "cancel" },
        {
          text: t("Yes, Cancel", "نعم، إلغاء"),
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("PATCH", `/api/orders/${orderId}/cancel`);
              loadOrders();
            } catch (err) {
              Alert.alert(t("Error", "خطأ"), t("Failed to cancel order.", "فشل في إلغاء الطلب."));
            }
          },
        },
      ],
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(isRTL ? "ar-IQ" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderOrder = ({ item }: { item: MedicineOrder }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    return (
      <View style={styles.orderCard}>
        <View style={[styles.orderHeader, isRTL && { flexDirection: "row-reverse" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.orderMedicine, isRTL && { textAlign: "right" }]}>{item.medicineName}</Text>
            {item.medicineDosage ? (
              <Text style={[styles.orderDetail, isRTL && { textAlign: "right" }]}>
                {item.medicineDosage}{item.medicineFrequency ? ` | ${item.medicineFrequency}` : ""}
              </Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Ionicons name={statusCfg.icon as any} size={14} color={statusCfg.color} />
            <Text style={[styles.statusText, { color: statusCfg.color }]}>
              {isRTL ? statusCfg.labelAr : statusCfg.labelEn}
            </Text>
          </View>
        </View>

        <View style={styles.orderInfoRows}>
          <View style={[styles.infoRow, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="storefront-outline" size={14} color={Colors.light.textTertiary} />
            <Text style={[styles.infoText, isRTL && { textAlign: "right" }]}>{item.pharmacyName}</Text>
          </View>
          <View style={[styles.infoRow, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="location-outline" size={14} color={Colors.light.textTertiary} />
            <Text style={[styles.infoText, isRTL && { textAlign: "right" }]} numberOfLines={1}>{item.deliveryAddress}</Text>
          </View>
          <View style={[styles.infoRow, isRTL && { flexDirection: "row-reverse" }]}>
            <Ionicons name="time-outline" size={14} color={Colors.light.textTertiary} />
            <Text style={[styles.infoText, isRTL && { textAlign: "right" }]}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={[styles.infoRow, isRTL && { flexDirection: "row-reverse" }]}>
            <MaterialCommunityIcons name="pill" size={14} color={Colors.light.textTertiary} />
            <Text style={[styles.infoText, isRTL && { textAlign: "right" }]}>
              {t("Qty:", "الكمية:")} {item.quantity}
            </Text>
          </View>
        </View>

        {item.status === "pending" && (
          <View style={styles.orderActions}>
            {item.pharmacyPhone ? (
              <Pressable
                style={[styles.actionSmallBtn, styles.whatsappSmallBtn]}
                onPress={() => {
                  const phone = (item.pharmacyPhone || "").replace(/[\s\-\(\)]/g, "");
                  const cleanPhone = phone.startsWith("+") ? phone.substring(1) : phone;
                  Linking.openURL(`https://wa.me/${cleanPhone}`);
                }}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
              </Pressable>
            ) : null}
            {item.pharmacyPhone ? (
              <Pressable
                style={[styles.actionSmallBtn, styles.callSmallBtn]}
                onPress={() => Linking.openURL(`tel:${item.pharmacyPhone}`)}
              >
                <Ionicons name="call" size={16} color={Colors.light.primary} />
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.actionSmallBtn, styles.cancelSmallBtn]}
              onPress={() => cancelOrder(item.id)}
            >
              <Ionicons name="close" size={16} color={Colors.light.emergency} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={[styles.header, isRTL && { flexDirection: "row-reverse" }]}>
        <Text style={styles.headerTitle}>{t("My Orders", "طلباتي")}</Text>
        <Pressable style={styles.headerBtn} onPress={loadOrders}>
          <Ionicons name="refresh" size={22} color={Colors.light.textSecondary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="package-variant" size={56} color={Colors.light.textTertiary} />
          <Text style={styles.emptyTitle}>{t("No orders yet", "لا توجد طلبات بعد")}</Text>
          <Text style={styles.emptySubtitle}>
            {t(
              "Your medicine orders will appear here",
              "ستظهر طلبات الأدوية الخاصة بك هنا",
            )}
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 100 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={orders.length > 0}
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  orderCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },
  orderMedicine: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  orderDetail: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "DMSans_600SemiBold",
  },
  orderInfoRows: {
    gap: 6,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  orderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  actionSmallBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  whatsappSmallBtn: {
    backgroundColor: "#F0FFF4",
    borderColor: "#C6F6D5",
  },
  callSmallBtn: {
    backgroundColor: Colors.light.primarySurface,
    borderColor: Colors.light.primaryLight,
  },
  cancelSmallBtn: {
    backgroundColor: Colors.light.emergencyLight,
    borderColor: "#FECACA",
  },
});
