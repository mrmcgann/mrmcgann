import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { dateTime } from "@/lib/format";
import { api } from "~/lib/api";
import { appPath } from "~/lib/links";
import { setBadge } from "~/lib/push";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import { Empty, LinkText, Loading, Screen, T } from "~/ui/kit";
import { C } from "~/ui/theme";

type N = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; channels: string[] };

export default function Notifications() {
  const { me, setUnread } = useSession();
  const [list, setList] = useState<N[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const uid = me?.user?.id;
  const load = useCallback(async () => {
    if (!uid) { setList([]); return; }
    const { data } = await supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at, channels").eq("user_id", uid).order("created_at", { ascending: false }).limit(60);
    setList((data || []) as N[]);
    await api("/api/notifications/read", { method: "POST" }).catch(() => undefined);
    setUnread(0); void setBadge(0);
  }, [uid, setUnread]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} testID="notifications">
      <T v="muted">Everything we've sent you, in one place.</T>
      <LinkText title="Change what we send ›" onPress={() => router.push("/alerts")} />
      {!list ? <Loading /> : list.length === 0 ? <Empty title="Nothing yet." sub="Outbid alerts, wins, payments and collection updates will appear here." /> : list.map((n) => (
        <Pressable key={n.id} accessibilityRole={n.link ? "button" : undefined} onPress={n.link ? () => router.push(appPath(n.link) as never) : undefined}
          style={{ borderRadius: 22, padding: 16, gap: 6, backgroundColor: n.read_at ? C.panel : "#FFFFFF", borderWidth: n.read_at ? 0 : 1, borderColor: C.line }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <T v="strong" style={{ flex: 1 }}>{n.title}</T>
            <T v="small">{dateTime(n.created_at)}</T>
          </View>
          {n.body ? <T v="muted">{n.body}</T> : null}
          {n.link ? <T v="strong" style={{ color: C.blue, fontSize: 15 }}>Open ›</T> : null}
        </Pressable>
      ))}
    </Screen>
  );
}
