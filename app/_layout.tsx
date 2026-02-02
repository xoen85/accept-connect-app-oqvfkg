
import { Stack } from "expo-router";
import { useEffect, useCallback } from "react";
import { useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { useColorScheme } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function RootLayoutNav() {
  const { user, authLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const handleAuthRedirect = useCallback(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === "auth" || segments[0] === "auth-callback" || segments[0] === "auth-popup";

    if (!user && !inAuthGroup) {
      console.log("User not authenticated, redirecting to auth");
      router.replace("/auth");
    } else if (user && inAuthGroup) {
      console.log("User authenticated, redirecting to home");
      router.replace("/(tabs)/(home)");
    }
  }, [user, authLoading, segments, router]);

  useEffect(() => {
    handleAuthRedirect();
  }, [handleAuthRedirect]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen name="auth-popup" options={{ headerShown: false }} />
        <Stack.Screen name="message/[token]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </ErrorBoundary>
  );
}
