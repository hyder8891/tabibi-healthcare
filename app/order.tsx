import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getProfile } from "@/lib/storage";
import { apiRequest, getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { fetch } from "expo/fetch";
import type { NearbyFacility, PatientProfile } from "@/lib/types";
import * as Location from "expo-location";

type OrderStep = "pharmacy" | "details" | "confirm" | "success";

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL } = useSettings();
  const { user } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const {
    medicineName = "",
    medicineDosage = "",
    medicineFrequency = "",
  } = useLocalSearchParams<{
    medicineName?: string;
    medicineDosage?: string;
    medicineFrequency?: string;
  }>();

  const [step, setStep] = useState<OrderStep>("pharmacy");
  const [profile, setProfile] = useState<PatientProfile | null>(null);

  const [pharmacies, setPharmacies] = useState<NearbyFacility[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);
  const [selectedPharmacy, setSelectedPharmacy] = useState<NearbyFacility | null>(null);

  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPharmacies();
    getProfile().then((p) => {
      setProfile(p);
      if (p.name) setPatientName(p.name);
    });
    if (user?.phone) setPatientPhone(user.phone);
  }, []);

  const loadPharmacies = async () => {
    try {
      setLoadingPharmacies(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoadingPharmacies(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const baseUrl = getApiUrl();
      const authHeaders = await getAuthHeaders();
      const url = new URL(
        `/api/nearby-facilities?latitude=${location.coords.latitude}&longitude=${location.coords.longitude}&type=pharmacy`,
        baseUrl,
      );
      const res = await fetch(url.toString(), {
        headers: authHeaders,
      });
      const data = await res.json();
      const facilities: NearbyFacility[] = data.facilities || [];
      setPharmacies(facilities);

      const enriched = await Promise.all(
        facilities.map(async (f) => {
          if (!f.placeId) return f;
          try {
            const detailUrl = new URL(`/api/place-details/${f.placeId}`, baseUrl);
            const detailRes = await fetch(detailUrl.toString(), {
              headers: authHeaders,
            });
            if (detailRes.ok) {
              const details = await detailRes.json();
              return {
                ...f,
                phone: details.phone || f.phone,
                internationalPhone: details.internationalPhone || f.internationalPhone,
              };
            }
          } catch {}
          return f;
        }),
      );
      setPharmacies(enriched);
      setSelectedPharmacy((prev) => {
        if (!prev) return prev;
        const updated = enriched.find((p) => p.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error("Failed to load pharmacies:", err);
    } finally {
      setLoadingPharmacies(false);
    }
  };

  const getPharmacyWithPhone = (pharmacy: NearbyFacility): NearbyFacility => {
    const latest = pharmacies.find((p) => p.id === pharmacy.id);
    return latest || pharmacy;
  };

  const openWhatsApp = (pharmacy: NearbyFacility) => {
    const p = getPharmacyWithPhone(pharmacy);
    const phone = (p.internationalPhone || p.phone || "").replace(/[\s\-\(\)]/g, "");
    if (!phone) {
      Alert.alert(t("No Phone", "لا يوجد رقم"), t("This pharmacy has no phone number listed.", "لا يوجد رقم هاتف لهذه الصيدلية."));
      return;
    }
    const cleanPhone = phone.startsWith("+") ? phone.substring(1) : phone;
    const message = encodeURIComponent(
      isRTL
        ? `مرحباً، أود طلب الدواء التالي:\n${medicineName}${medicineDosage ? ` - ${medicineDosage}` : ""}${medicineFrequency ? ` - ${medicineFrequency}` : ""}\nالكمية: ${quantity}\n\nهل هو متوفر لديكم؟`
        : `Hello, I'd like to order the following medicine:\n${medicineName}${medicineDosage ? ` - ${medicineDosage}` : ""}${medicineFrequency ? ` - ${medicineFrequency}` : ""}\nQuantity: ${quantity}\n\nIs it available?`,
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${message}`).catch(() => {
      Alert.alert(t("Error", "خطأ"), t("Could not open WhatsApp. Make sure it is installed.", "تعذر فتح واتساب. تأكد من تثبيته."));
    });
  };

  const callPharmacy = (pharmacy: NearbyFacility) => {
    const p = getPharmacyWithPhone(pharmacy);
    const phone = p.internationalPhone || p.phone || "";
    if (!phone) {
      Alert.alert(t("No Phone", "لا يوجد رقم"), t("This pharmacy has no phone number listed.", "لا يوجد رقم هاتف لهذه الصيدلية."));
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert(t("Error", "خطأ"), t("Could not make the call.", "تعذر إجراء المكالمة."));
    });
  };

  const [orderError, setOrderError] = useState<string | null>(null);

  const submitOrder = async () => {
    if (!selectedPharmacy || !patientName.trim() || !patientPhone.trim() || !deliveryAddress.trim()) {
      Alert.alert(
        t("Missing Information", "معلومات ناقصة"),
        t("Please fill in all required fields.", "يرجى ملء جميع الحقول المطلوبة."),
      );
      return;
    }

    setSubmitting(true);
    setOrderError(null);
    try {
      const pharmacy = getPharmacyWithPhone(selectedPharmacy);
      await apiRequest("POST", "/api/orders", {
        pharmacyName: pharmacy.name,
        pharmacyPhone: pharmacy.internationalPhone || pharmacy.phone || "",
        pharmacyAddress: pharmacy.address,
        pharmacyPlaceId: pharmacy.placeId || "",
        medicineName: medicineName || "Unnamed Medicine",
        medicineDosage: medicineDosage || "",
        medicineFrequency: medicineFrequency || "",
        quantity,
        deliveryAddress: deliveryAddress.trim(),
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        notes: notes.trim() || "",
      });

      setSubmitting(false);
      setStep("success");
    } catch (err: any) {
      console.error("Order error:", err);
      const errorMsg = t("Failed to place order. Please try again.", "فشل في تقديم الطلب. يرجى المحاولة مرة أخرى.");
      setOrderError(errorMsg);
      Alert.alert(t("Error", "خطأ"), errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderPharmacyStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.medicineInfoCard}>
        <MaterialCommunityIcons name="pill" size={24} color={Colors.light.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.medicineTitle, isRTL && { textAlign: "right" }]}>{medicineName}</Text>
          {medicineDosage ? (
            <Text style={[styles.medicineDetail, isRTL && { textAlign: "right" }]}>
              {medicineDosage}{medicineFrequency ? ` | ${medicineFrequency}` : ""}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
        {t("Select Pharmacy", "اختر الصيدلية")}
      </Text>

      {loadingPharmacies ? (
        <ActivityIndicator size="large" color={Colors.light.primary} style={{ marginTop: 40 }} />
      ) : pharmacies.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={48} color={Colors.light.textTertiary} />
          <Text style={styles.emptyText}>
            {t("No pharmacies found nearby.", "لم يتم العثور على صيدليات قريبة.")}
          </Text>
        </View>
      ) : (
        pharmacies.slice(0, 10).map((pharmacy) => (
          <Pressable
            key={pharmacy.id}
            style={({ pressed }) => [
              styles.pharmacyCard,
              selectedPharmacy?.id === pharmacy.id && styles.pharmacyCardSelected,
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setSelectedPharmacy(pharmacy)}
          >
            <View style={[styles.pharmacyRow, isRTL && { flexDirection: "row-reverse" }]}>
              <View style={[
                styles.radioOuter,
                selectedPharmacy?.id === pharmacy.id && styles.radioOuterSelected,
              ]}>
                {selectedPharmacy?.id === pharmacy.id && <View style={styles.radioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pharmacyName, isRTL && { textAlign: "right" }]}>{pharmacy.name}</Text>
                <Text style={[styles.pharmacyAddress, isRTL && { textAlign: "right" }]}>{pharmacy.address}</Text>
                <View style={[styles.pharmacyMeta, isRTL && { flexDirection: "row-reverse" }]}>
                  <Text style={styles.pharmacyDistance}>{pharmacy.distance} km</Text>
                  {pharmacy.rating > 0 && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color="#F59E0B" />
                      <Text style={styles.ratingText}>{pharmacy.rating.toFixed(1)}</Text>
                    </View>
                  )}
                  <View style={[styles.statusDot, { backgroundColor: pharmacy.isOpen ? Colors.light.success : Colors.light.emergency }]} />
                  <Text style={styles.statusText}>
                    {pharmacy.isOpen ? t("Open", "مفتوح") : t("Closed", "مغلق")}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );

  const renderDetailsStep = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sectionLabel, isRTL && { textAlign: "right" }]}>
          {t("Delivery Details", "تفاصيل التوصيل")}
        </Text>

        <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
          {t("Patient Name", "اسم المريض")} *
        </Text>
        <TextInput
          style={[styles.input, isRTL && { textAlign: "right" }]}
          value={patientName}
          onChangeText={setPatientName}
          placeholder={t("Full name", "الاسم الكامل")}
          placeholderTextColor={Colors.light.textTertiary}
        />

        <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
          {t("Phone Number", "رقم الهاتف")} *
        </Text>
        <TextInput
          style={[styles.input, isRTL && { textAlign: "right" }]}
          value={patientPhone}
          onChangeText={setPatientPhone}
          placeholder={t("+964 xxx xxx xxxx", "+964 xxx xxx xxxx")}
          placeholderTextColor={Colors.light.textTertiary}
          keyboardType="phone-pad"
        />

        <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
          {t("Delivery Address", "عنوان التوصيل")} *
        </Text>
        <TextInput
          style={[styles.input, styles.inputMultiline, isRTL && { textAlign: "right" }]}
          value={deliveryAddress}
          onChangeText={setDeliveryAddress}
          placeholder={t("Full address for delivery", "العنوان الكامل للتوصيل")}
          placeholderTextColor={Colors.light.textTertiary}
          multiline
          numberOfLines={3}
        />

        <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
          {t("Quantity", "الكمية")}
        </Text>
        <View style={[styles.quantityRow, isRTL && { flexDirection: "row-reverse" }]}>
          <Pressable
            style={styles.quantityBtn}
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
          >
            <Ionicons name="remove" size={20} color={Colors.light.primary} />
          </Pressable>
          <Text style={styles.quantityText}>{quantity}</Text>
          <Pressable
            style={styles.quantityBtn}
            onPress={() => setQuantity(Math.min(10, quantity + 1))}
          >
            <Ionicons name="add" size={20} color={Colors.light.primary} />
          </Pressable>
        </View>

        <Text style={[styles.inputLabel, isRTL && { textAlign: "right" }]}>
          {t("Notes (optional)", "ملاحظات (اختياري)")}
        </Text>
        <TextInput
          style={[styles.input, styles.inputMultiline, isRTL && { textAlign: "right" }]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("Any special instructions", "أي تعليمات خاصة")}
          placeholderTextColor={Colors.light.textTertiary}
          multiline
          numberOfLines={2}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderConfirmStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.confirmCard}>
        <View style={[styles.confirmRow, isRTL && { flexDirection: "row-reverse" }]}>
          <MaterialCommunityIcons name="pill" size={20} color={Colors.light.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.confirmLabel, isRTL && { textAlign: "right" }]}>{t("Medicine", "الدواء")}</Text>
            <Text style={[styles.confirmValue, isRTL && { textAlign: "right" }]}>
              {medicineName}{medicineDosage ? ` - ${medicineDosage}` : ""}
            </Text>
            <Text style={[styles.confirmSub, isRTL && { textAlign: "right" }]}>
              {t("Qty:", "الكمية:")} {quantity}
            </Text>
          </View>
        </View>

        <View style={styles.confirmDivider} />

        <View style={[styles.confirmRow, isRTL && { flexDirection: "row-reverse" }]}>
          <Ionicons name="storefront-outline" size={20} color={Colors.light.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.confirmLabel, isRTL && { textAlign: "right" }]}>{t("Pharmacy", "الصيدلية")}</Text>
            <Text style={[styles.confirmValue, isRTL && { textAlign: "right" }]}>{selectedPharmacy?.name}</Text>
            <Text style={[styles.confirmSub, isRTL && { textAlign: "right" }]}>{selectedPharmacy?.address}</Text>
          </View>
        </View>

        <View style={styles.confirmDivider} />

        <View style={[styles.confirmRow, isRTL && { flexDirection: "row-reverse" }]}>
          <Ionicons name="location-outline" size={20} color={Colors.light.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.confirmLabel, isRTL && { textAlign: "right" }]}>{t("Delivery To", "التوصيل إلى")}</Text>
            <Text style={[styles.confirmValue, isRTL && { textAlign: "right" }]}>{patientName}</Text>
            <Text style={[styles.confirmSub, isRTL && { textAlign: "right" }]}>{deliveryAddress}</Text>
            <Text style={[styles.confirmSub, isRTL && { textAlign: "right" }]}>{patientPhone}</Text>
          </View>
        </View>

        {notes.trim() ? (
          <>
            <View style={styles.confirmDivider} />
            <View style={[styles.confirmRow, isRTL && { flexDirection: "row-reverse" }]}>
              <Ionicons name="document-text-outline" size={20} color={Colors.light.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.confirmLabel, isRTL && { textAlign: "right" }]}>{t("Notes", "ملاحظات")}</Text>
                <Text style={[styles.confirmSub, isRTL && { textAlign: "right" }]}>{notes}</Text>
              </View>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.codBanner}>
        <Ionicons name="cash-outline" size={20} color={Colors.light.primary} />
        <Text style={[styles.codText, isRTL && { textAlign: "right" }]}>
          {t("Cash on Delivery - Pay when you receive your medicine", "الدفع عند الاستلام - ادفع عند استلام الدواء")}
        </Text>
      </View>

      <View style={styles.contactRow}>
        <Pressable
          style={({ pressed }) => [styles.contactBtn, styles.whatsappBtn, pressed && { opacity: 0.8 }]}
          onPress={() => selectedPharmacy && openWhatsApp(selectedPharmacy)}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.contactBtnText}>
            {t("Confirm via WhatsApp", "تأكيد عبر واتساب")}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.contactBtn, styles.callBtn, pressed && { opacity: 0.8 }]}
          onPress={() => selectedPharmacy && callPharmacy(selectedPharmacy)}
        >
          <Ionicons name="call" size={20} color={Colors.light.primary} />
          <Text style={[styles.contactBtnText, { color: Colors.light.primary }]}>
            {t("Call Pharmacy", "اتصل بالصيدلية")}
          </Text>
        </Pressable>
      </View>

      {orderError ? (
        <View style={{ backgroundColor: "#FEF2F2", padding: 12, borderRadius: 10, marginTop: 12 }}>
          <Text style={{ color: Colors.light.emergency, fontSize: 13, fontFamily: "DMSans_500Medium", textAlign: isRTL ? "right" : "left" }}>
            {orderError}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderSuccessStep = () => (
    <View style={styles.stepContent}>
      <View style={{ alignItems: "center", paddingTop: 40, paddingBottom: 24 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.light.primarySurface, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.light.primary} />
        </View>
        <Text style={{ fontSize: 22, fontFamily: "DMSans_700Bold", color: Colors.light.text, textAlign: "center", marginBottom: 8 }}>
          {t("Order Placed!", "تم تقديم الطلب!")}
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "DMSans_400Regular", color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 }}>
          {t(
            "Contact the pharmacy via WhatsApp or call to confirm availability and delivery.",
            "تواصل مع الصيدلية عبر واتساب أو اتصل لتأكيد التوفر والتوصيل.",
          )}
        </Text>
      </View>

      <View style={styles.contactRow}>
        <Pressable
          style={({ pressed }) => [styles.contactBtn, styles.whatsappBtn, pressed && { opacity: 0.8 }]}
          onPress={() => selectedPharmacy && openWhatsApp(selectedPharmacy)}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.contactBtnText}>
            {t("WhatsApp", "واتساب")}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.contactBtn, styles.callBtn, pressed && { opacity: 0.8 }]}
          onPress={() => selectedPharmacy && callPharmacy(selectedPharmacy)}
        >
          <Ionicons name="call" size={20} color={Colors.light.primary} />
          <Text style={[styles.contactBtnText, { color: Colors.light.primary }]}>
            {t("Call", "اتصال")}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.nextBtn, { marginTop: 24 }, pressed && { opacity: 0.85 }]}
        onPress={() => router.replace("/(tabs)/orders")}
      >
        <MaterialCommunityIcons name="clipboard-list-outline" size={20} color="#fff" />
        <Text style={[styles.nextBtnText, { marginLeft: 8 }]}>
          {t("View My Orders", "عرض طلباتي")}
        </Text>
      </Pressable>
    </View>
  );

  const canProceed = () => {
    if (step === "pharmacy") return !!selectedPharmacy;
    if (step === "details") return !!patientName.trim() && !!patientPhone.trim() && !!deliveryAddress.trim();
    return true;
  };

  const handleNext = () => {
    if (step === "pharmacy") setStep("details");
    else if (step === "details") setStep("confirm");
    else submitOrder();
  };

  const handleBack = () => {
    if (step === "details") setStep("pharmacy");
    else if (step === "confirm") setStep("details");
    else router.back();
  };

  const stepIndex = step === "pharmacy" ? 0 : step === "details" ? 1 : step === "confirm" ? 2 : 3;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={[styles.header, isRTL && { flexDirection: "row-reverse" }]}>
        {step !== "success" ? (
          <Pressable style={styles.headerBtn} onPress={handleBack}>
            <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={24} color={Colors.light.text} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.headerTitle}>
          {step === "success" ? t("Order Confirmed", "تم تأكيد الطلب") : t("Order Medicine", "طلب دواء")}
        </Text>
        {step === "success" ? (
          <Pressable style={styles.headerBtn} onPress={() => router.replace("/(tabs)")}>
            <Ionicons name="close" size={24} color={Colors.light.text} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      {step !== "success" && <View style={styles.stepper}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.stepDot, i <= stepIndex && styles.stepDotActive]} />
        ))}
      </View>}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 + bottomInset }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "pharmacy" && renderPharmacyStep()}
        {step === "details" && renderDetailsStep()}
        {step === "confirm" && renderConfirmStep()}
        {step === "success" && renderSuccessStep()}
      </ScrollView>

      {step !== "success" && <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, 16) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.nextBtn,
            !canProceed() && styles.nextBtnDisabled,
            pressed && canProceed() && { opacity: 0.85 },
          ]}
          onPress={handleNext}
          disabled={!canProceed() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {step === "confirm"
                  ? t("Place Order", "تقديم الطلب")
                  : t("Continue", "متابعة")}
              </Text>
              {step !== "confirm" && (
                <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={20} color="#fff" />
              )}
            </>
          )}
        </Pressable>
      </View>}
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
  headerBtn: {
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
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: Colors.light.surface,
  },
  stepDot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.light.borderLight,
  },
  stepDotActive: {
    backgroundColor: Colors.light.primary,
  },
  stepContent: {
    padding: 16,
  },
  medicineInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.primarySurface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  medicineTitle: {
    fontSize: 16,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
  },
  medicineDetail: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textTertiary,
  },
  pharmacyCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.borderLight,
  },
  pharmacyCardSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primarySurface,
  },
  pharmacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.light.textTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  radioOuterSelected: {
    borderColor: Colors.light.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.light.primary,
  },
  pharmacyName: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginBottom: 2,
  },
  pharmacyAddress: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
  pharmacyMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pharmacyDistance: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primary,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.textSecondary,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 4,
  },
  quantityBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.light.primarySurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  quantityText: {
    fontSize: 20,
    fontFamily: "DMSans_700Bold",
    color: Colors.light.text,
    minWidth: 30,
    textAlign: "center",
  },
  confirmCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 8,
  },
  confirmLabel: {
    fontSize: 12,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.textTertiary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  confirmValue: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: Colors.light.text,
    marginTop: 2,
  },
  confirmSub: {
    fontSize: 13,
    fontFamily: "DMSans_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginVertical: 4,
  },
  codBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.light.primarySurface,
    padding: 14,
    borderRadius: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.light.primaryLight,
  },
  codText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "DMSans_500Medium",
    color: Colors.light.primaryDark,
    lineHeight: 18,
  },
  contactRow: {
    gap: 10,
    marginTop: 16,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  whatsappBtn: {
    backgroundColor: "#25D366",
  },
  callBtn: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.primary,
  },
  contactBtnText: {
    fontSize: 15,
    fontFamily: "DMSans_600SemiBold",
    color: "#fff",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.light.primary,
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextBtnDisabled: {
    backgroundColor: Colors.light.textTertiary,
  },
  nextBtnText: {
    fontSize: 16,
    fontFamily: "DMSans_700Bold",
    color: "#fff",
  },
});
