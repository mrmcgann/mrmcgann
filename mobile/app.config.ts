import type { ExpoConfig } from "expo/config";

// Tyrebiter for iOS and Android.
// Set these on expo.dev (your project > Environment variables), or in a local .env.local for testing:
//   EXPO_PUBLIC_SITE_URL                https://tyrebiter.com.au (the website; its /api is the app's API)
//   EXPO_PUBLIC_SUPABASE_URL            same as NEXT_PUBLIC_SUPABASE_URL on the website
//   EXPO_PUBLIC_SUPABASE_ANON_KEY       same as NEXT_PUBLIC_SUPABASE_ANON_KEY
//   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY  same as NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
//   GOOGLE_SERVICES_JSON                file variable: google-services.json from Firebase (Android push)
const SITE_HOST = (process.env.EXPO_PUBLIC_SITE_URL || "https://tyrebiter.com.au").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
// Paste these in after running `eas init` (see README, step 3). They aren't secret.
const EAS_PROJECT_ID = "";
const EAS_OWNER = "";
const projectId = process.env.EAS_PROJECT_ID || EAS_PROJECT_ID || undefined;
const version = "1.0.0";

// Website paths the app opens instead of the browser (universal links / app links).
const APP_PATHS = ["/lot", "/auctions", "/watchlist", "/account", "/sell/dashboard", "/handover", "/join", "/signin"];

const config: ExpoConfig = {
  name: "Tyrebiter",
  slug: "tyrebiter",
  scheme: "tyrebiter",
  version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  backgroundColor: "#FFFFFF",
  primaryColor: "#2F5BFF",
  description: "Live vehicle auctions across Australia: cars, utes, trucks, motorbikes, caravans, boats and machinery.",
  runtimeVersion: { policy: "appVersion" },
  ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}`, checkAutomatically: "ON_LOAD", fallbackToCacheTimeout: 0 } } : {}),
  ios: {
    bundleIdentifier: "au.com.tyrebiter.app",
    buildNumber: "1",
    // Phone layout only; iPads run it in iPhone mode, so no iPad screenshots are needed for review.
    supportsTablet: false,
    associatedDomains: [`applinks:${SITE_HOST}`, `webcredentials:${SITE_HOST}`],
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: "Take photos of a vehicle for an appraisal, or of a problem for a claim.",
      NSPhotoLibraryUsageDescription: "Choose photos of a vehicle for an appraisal, or of a problem for a claim.",
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
      ],
    },
  },
  android: {
    package: "au.com.tyrebiter.app",
    versionCode: 1,
    // Firebase config for Android push notifications (an EAS "file" variable, see README).
    ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
    adaptiveIcon: {
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: ["android.permission.POST_NOTIFICATIONS", "android.permission.CAMERA"],
    blockedPermissions: ["android.permission.RECORD_AUDIO", "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION", "android.permission.WRITE_EXTERNAL_STORAGE", "android.permission.READ_MEDIA_VIDEO", "android.permission.READ_MEDIA_AUDIO", "android.permission.SYSTEM_ALERT_WINDOW"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: APP_PATHS.map((p) => ({ scheme: "https", host: SITE_HOST, pathPrefix: p })),
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: { favicon: "./assets/favicon.png", bundler: "metro", output: "single" },
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-font",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 180, backgroundColor: "#FFFFFF" }],
    "expo-secure-store",
    "expo-web-browser",
    "expo-image",
    "expo-sharing",
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: "#2F5BFF", defaultChannel: "updates" }],
    ["expo-image-picker", {
      photosPermission: "Choose photos of a vehicle for an appraisal, or of a problem for a claim.",
      cameraPermission: "Take photos of a vehicle for an appraisal, or of a problem for a claim.",
      microphonePermission: false,
    }],
    // No Apple Pay or Google Pay yet (cards only), so no merchant ID is needed in the Apple account.
    ["@stripe/stripe-react-native", { merchantIdentifier: "", enableGooglePay: false }],
  ],
  experiments: { typedRoutes: false, tsconfigPaths: true },
  extra: { eas: projectId ? { projectId } : {} },
  owner: process.env.EAS_OWNER || EAS_OWNER || undefined,
};

export default config;
