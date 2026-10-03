import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "~/lib/session";
import { Icon } from "~/ui/art";
import { C, F } from "~/ui/theme";

export default function TabsLayout() {
  const { me } = useSession();
  const insets = useSafeAreaInsets();
  const unread = me?.profile?.unread || 0;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: C.ink, tabBarInactiveTintColor: C.muted,
      // Plus Jakarta Sans sits taller than the system font, so the bar is a little taller than the default or labels get clipped.
      tabBarLabelStyle: { fontFamily: F.bold, fontSize: 11, lineHeight: 15 },
      tabBarStyle: { height: 58 + insets.bottom, borderTopColor: C.line, backgroundColor: "rgba(255,255,255,0.97)" },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color }) => <Icon name="search" color={color} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: "Watchlist", tabBarIcon: ({ color }) => <Icon name="heart" color={color} /> }} />
      <Tabs.Screen name="sell" options={{ title: "Sell", tabBarIcon: ({ color }) => <Icon name="tag" color={color} /> }} />
      <Tabs.Screen name="account" options={{
        title: "Account", tabBarIcon: ({ color }) => <Icon name="user" color={color} />,
        tabBarBadge: unread ? (unread > 99 ? "99+" : unread) : undefined, tabBarBadgeStyle: { backgroundColor: C.berry, fontFamily: F.heavy, fontSize: 11 },
      }} />
    </Tabs>
  );
}
