import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { Stack, router, usePathname, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_500Medium } from "@expo-google-fonts/plus-jakarta-sans/500Medium";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { Fraunces_600SemiBold_Italic } from "@expo-google-fonts/fraunces/600SemiBold_Italic";
import { SessionProvider, useSession } from "~/lib/session";
import { PayProvider } from "~/lib/pay";
import { onAlertTapped, setBadge } from "~/lib/push";
import { appPath } from "~/lib/links";
import { APP_VERSION } from "~/lib/env";
import { reportAppError, setTrackedMember, trackView, watchAppErrors } from "~/lib/track";
import { Button, T } from "~/ui/kit";
import { LogoMark } from "~/ui/art";
import { C, F } from "~/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
watchAppErrors();

// A screen that breaks shows this instead of a blank screen, and the error goes to Admin → Site health.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportAppError(error, "screen"); }, [error]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 18, backgroundColor: C.bg }}>
      <LogoMark size={48} />
      <T v="d3" style={{ textAlign: "center" }}>Something went wrong.</T>
      <T v="muted" style={{ textAlign: "center" }}>We&apos;ve been told about it. Try again, and if it keeps happening, update the app or call us.</T>
      <Button title="Try again" onPress={() => { void retry(); }} />
    </View>
  );
}

// Opening a lot or invoice straight from a link or alert still puts the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

const older = (a: string, b: string) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
  return false;
};

function Shell() {
  const { ready, config, me } = useSession();
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, Fraunces_600SemiBold_Italic,
  });
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 4000); return () => clearTimeout(t); }, []);
  const show = fontsLoaded && (ready || timedOut);
  useEffect(() => { if (show) SplashScreen.hideAsync().catch(() => undefined); }, [show]);
  // Tapping an alert opens the matching screen.
  useEffect(() => onAlertTapped((link) => router.push(appPath(link) as never)), []);
  // Screen views for the Insights dashboard.
  const pathname = usePathname();
  useEffect(() => { setTrackedMember(!!me?.profile); }, [me?.profile]);
  useEffect(() => { if (pathname) trackView(pathname); }, [pathname]);
  // App icon badge = unread alerts.
  useEffect(() => { if (me?.profile) void setBadge(me.profile.unread || 0); }, [me?.profile]);

  if (!show) return null;
  const min = config?.minVersion?.[Platform.OS === "ios" ? "ios" : "android"];
  if (Platform.OS !== "web" && min && older(APP_VERSION, min)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 18, backgroundColor: C.bg }}>
        <LogoMark size={48} />
        <T v="d3" style={{ textAlign: "center" }}>Time for an update.</T>
        <T v="muted" style={{ textAlign: "center" }}>This version of Tyrebiter is too old to bid safely. Update to the latest version to keep going.</T>
        <Button title="Update Tyrebiter" onPress={() => Linking.openURL(Platform.OS === "ios"
          ? config?.stores?.ios || "https://apps.apple.com/au/search?term=tyrebiter"
          : config?.stores?.android || "market://details?id=au.com.tyrebiter.app")} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{
        headerShadowVisible: false, headerTintColor: C.ink, headerBackButtonDisplayMode: "minimal",
        headerTitleStyle: { fontFamily: F.heavy, fontSize: 17 }, contentStyle: { backgroundColor: C.bg }, headerStyle: { backgroundColor: C.bg },
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
        <Stack.Screen name="lot/[id]" options={{ title: "", headerTransparent: false }} />
        <Stack.Screen name="invoice/[id]" options={{ title: "Invoice" }} />
        <Stack.Screen name="handover/[token]" options={{ title: "Handover" }} />
        <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="alerts" options={{ title: "Alerts" }} />
        <Stack.Screen name="settings" options={{ title: "Account settings" }} />
        <Stack.Screen name="delete-account" options={{ title: "Delete account" }} />
        <Stack.Screen name="join" options={{ title: "Join Tyrebiter" }} />
        <Stack.Screen name="signin" options={{ title: "Sign in" }} />
        <Stack.Screen name="forgot" options={{ title: "Reset password" }} />
        <Stack.Screen name="appraisal" options={{ title: "Sell your vehicle" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PayProvider>
          <Shell />
        </PayProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
