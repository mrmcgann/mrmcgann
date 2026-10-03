import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { api, errText } from "~/lib/api";
import { askForPush, pushPermission, type PushState } from "~/lib/push";
import { useSession } from "~/lib/session";
import { Button, Notice, Screen, Soft, T } from "~/ui/kit";
import { C, F } from "~/ui/theme";

type Ch = "push" | "sms" | "email";
type Prefs = Record<string, { sms: boolean; email: boolean; push?: boolean }>;
const KINDS: [string, string, string][] = [
  ["outbid", "Outbid", "The moment someone outbids your maximum."],
  ["ending", "Ending soon", "Watched vehicles about to close, and offers opening."],
  ["searches", "Saved search matches", "A new vehicle matches one of your searches."],
  ["won", "Wins, payments and collection", "Always sent: they're about money you owe or are owed."],
  ["marketing", "News and offers", "Occasional. Off unless you turn it on."],
];
const pushDefault = (k: string) => k !== "marketing";

/** Which alerts go by push, SMS and email (push is the app's; SMS and email match the website). */
export default function Alerts() {
  const { me, refresh } = useSession();
  const [prefs, setPrefs] = useState<Prefs>({});
  const [perm, setPerm] = useState<PushState>("undetermined");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPrefs((me?.profile?.notify || {}) as Prefs); }, [me?.profile?.notify]);
  useEffect(() => { pushPermission().then(setPerm); }, []);

  const value = (k: string, ch: Ch) => (k === "won" ? true : ch === "push" ? prefs[k]?.push ?? pushDefault(k) : !!prefs[k]?.[ch]);
  const flip = (k: string, ch: Ch) => { if (k === "won") return; setPrefs((p) => ({ ...p, [k]: { sms: !!p[k]?.sms, email: !!p[k]?.email, push: p[k]?.push ?? pushDefault(k), [ch]: !value(k, ch) } })); setMsg(null); };
  async function save() {
    setBusy(true);
    try {
      const notify = Object.fromEntries(KINDS.map(([k]) => [k, { sms: value(k, "sms"), email: value(k, "email"), push: value(k, "push") }]));
      await api("/api/notify-settings", { body: { notify } });
      await refresh();
      setMsg({ ok: true, text: "Saved." });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }
  return (
    <Screen testID="alerts">
      <T v="d3">Alerts.</T>
      {Platform.OS !== "web" ? (
        perm === "granted" ? <Notice kind="ok">Push notifications are on for this phone.</Notice> : (
          <Soft>
            <T v="strong">Get alerts on this phone</T>
            <T v="muted">Outbid alerts arrive in seconds by push, so you can raise your bid before the auction ends.</T>
            {perm === "denied"
              ? <Button small kind="dark" title="Open Settings to allow notifications" onPress={() => Linking.openSettings()} style={{ alignSelf: "flex-start" }} />
              : <Button small kind="dark" title="Turn on notifications" onPress={async () => { await askForPush(); setPerm(await pushPermission()); }} style={{ alignSelf: "flex-start" }} />}
          </Soft>
        )
      ) : null}
      <View style={s.head}>
        <View style={{ flex: 1 }} />
        {(["push", "sms", "email"] as Ch[]).map((c) => <Text key={c} style={s.col}>{c === "sms" ? "SMS" : c === "push" ? "Push" : "Email"}</Text>)}
      </View>
      {KINDS.map(([k, label, sub]) => (
        <View key={k} style={s.row}>
          <View style={{ flex: 1, gap: 2 }}><T v="strong">{label}</T><T v="small">{sub}</T></View>
          {(["push", "sms", "email"] as Ch[]).map((ch) => {
            const on = value(k, ch);
            return (
              <Pressable key={ch} accessibilityRole="switch" accessibilityState={{ checked: on, disabled: k === "won" }} accessibilityLabel={`${label} by ${ch}`} onPress={() => flip(k, ch)} style={[s.cell, on && { backgroundColor: k === "won" ? C.panel2 : C.blue }]}>
                <Text style={{ color: on ? (k === "won" ? C.ink : "#FFFFFF") : C.muted, fontFamily: F.heavy, fontSize: 13 }}>{on ? "✓" : ""}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
      <Button title="Save" busy={busy} onPress={save} />
      <T v="small">Optional SMS and emails always include a link to change these or unsubscribe.</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  col: { width: 48, textAlign: "center", fontFamily: F.bold, fontSize: 12, color: C.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  cell: { width: 48, height: 36, borderRadius: 12, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
});
