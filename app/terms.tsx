import React, { useEffect, useState } from "react";
import { View, ScrollView, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

export default function TermsScreen() {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = new URL("/terms", getApiUrl()).toString();
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        setHtml(text);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <div
          style={{ width: "100%", height: "100%", overflow: "auto" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Terms of Service" }} />
      <ScrollView style={styles.container}>
        <View style={{ padding: 16 }}>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.background,
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
