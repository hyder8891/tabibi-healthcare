import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AvicennaProvider } from "@/contexts/AvicennaContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getProfile } from "@/lib/storage";
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Feather from "@expo/vector-icons/Feather";

SplashScreen.preventAutoHideAsync();

const PUBLIC_ROUTES = ["privacy", "terms", "consent"];

function RootLayoutNav() {
  const { user, isLoading, needsEmailVerification } = useAuth();
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    AsyncStorage.getItem("consent_accepted").then((val) => {
      setConsentAccepted(val === "true");
      setConsentChecked(true);
    });
  }, [segments]);

  useEffect(() => {
    if (isLoading || !consentChecked) return;
    const firstSegment = segments[0] as string | undefined;
    if (firstSegment && PUBLIC_ROUTES.includes(firstSegment)) {
      return;
    }
    if (!consentAccepted) {
      router.replace("/consent");
      return;
    }
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (needsEmailVerification) {
      if (pathname !== "/auth") {
        router.replace("/auth");
      }
      return;
    }
    getProfile().then((profile) => {
      if (!profile.onboardingComplete) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)");
      }
      setCheckedOnboarding(true);
    });
  }, [user, isLoading, needsEmailVerification, consentChecked, consentAccepted, segments, pathname]);

  if (isLoading || !consentChecked) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background }}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="auth"
        options={{
          headerShown: false,
          animation: "fade",
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          animation: "fade",
        }}
      />
      <Stack.Screen
        name="assessment"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="scan"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="results"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="routing"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="heart-rate"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="imaging"
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="order"
        options={{
          headerShown: false,
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="consent"
        options={{
          headerShown: false,
          animation: "fade",
        }}
      />
      <Stack.Screen
        name="privacy"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="terms"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AuthProvider>
            <AvicennaProvider>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <StatusBar style="dark" />
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </AvicennaProvider>
          </AuthProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
