import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { router } from "expo-router";
import { api, ApiError, errText } from "~/lib/api";
import { useSession } from "~/lib/session";
import { Button, Field, Loading, Notice, Screen, Soft, T } from "~/ui/kit";

/** Delete my account, in the app (required by the App Store and Google Play). */
export default function DeleteAccount() {
  const { signOut, config } = useSession();
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ blockers: string[] }>("/api/account/delete").then((r) => setBlockers(r.blockers)).catch((e) => { setErr(errText(e)); setBlockers([]); }); }, []);
  async function del() {
    setBusy(true); setErr("");
    try {
      await api("/api/account/delete", { body: { confirm: "DELETE" } });
      await signOut();
      router.replace("/");
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data.blockers)) setBlockers(e.data.blockers as string[]);
      else setErr(errText(e));
    }
    setBusy(false);
  }
  if (!blockers) return <Loading />;
  return (
    <Screen keyboard testID="delete-account">
      <T v="d3">Delete your account.</T>
      <T v="muted">This deletes your account and personal details and signs you out on every device. It can't be undone. We keep records of purchases and sales only as long as tax law requires.</T>
      {blockers.length ? (
        <Soft>
          <T v="strong">Before you can delete your account:</T>
          {blockers.map((b) => <T key={b} v="body">• {b}</T>)}
          <T v="muted">Once those are finished you can delete your account here. Need help sooner? Call us.</T>
          {config?.phone ? <Button small kind="dark" title={`Call ${config.phone}`} onPress={() => Linking.openURL(`tel:${config.phone.replace(/[^0-9+]/g, "")}`)} style={{ alignSelf: "flex-start" }} /> : null}
        </Soft>
      ) : (
        <>
          <Field testID="delete-confirm" label="Type DELETE to confirm" value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          {err ? <Notice kind="bad">{err}</Notice> : null}
          <Button testID="delete-submit" kind="danger" title="Delete my account" busy={busy} disabled={typed.trim().toUpperCase() !== "DELETE"} onPress={del} />
        </>
      )}
    </Screen>
  );
}
