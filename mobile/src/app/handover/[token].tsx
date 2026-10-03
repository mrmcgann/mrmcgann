import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { api, errText, pub } from "~/lib/api";
import { useSession } from "~/lib/session";
import { Button, Check, Empty, Field, Loading, Notice, Screen, Soft, T } from "~/ui/kit";

type H = { status: string; confirmed_for: string | null; who: string; title: string; keys: number | null };

/** The seller's handover: check ID, take the 6-digit release code, record odometer and keys. */
export default function Handover() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { config } = useSession();
  const [h, setH] = useState<H | null>(null);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [odo, setOdo] = useState("");
  const [keys, setKeys] = useState("");
  const [notes, setNotes] = useState("");
  const [idOk, setIdOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const load = useCallback(async () => {
    try { const r = await pub<H>(`/api/handover?token=${encodeURIComponent(token)}`); setH(r); setKeys(r.keys != null ? String(r.keys) : ""); }
    catch (e) { setErr(errText(e)); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  async function submit() {
    setBusy(true); setMsg("");
    try { await api("/api/handover", { body: { token, code, odometer: odo, keys, notes }, auth: false }); setDone(true); }
    catch (e) { setMsg(errText(e)); }
    setBusy(false);
  }
  const call = config?.phone ? <Button kind="soft" title={`Call ${config.phone}`} onPress={() => Linking.openURL(`tel:${config.phone.replace(/[^0-9+]/g, "")}`)} /> : null;
  if (err) return <Screen><Empty title="This handover link isn't valid." sub={err}>{call}</Empty></Screen>;
  if (!h) return <Loading />;
  return (
    <Screen keyboard testID="handover">
      <T v="eyebrow">Handover · {h.title}</T>
      <T v="d3">Handing over the keys.</T>
      {done || h.status === "collected" ? <Notice kind="ok">Handover confirmed. Thank you. We'll pay you once the buyer's claim window closes, and send your settlement statement.</Notice>
        : h.status !== "confirmed" ? <Notice>This collection isn't confirmed yet. We'll text you when it is.</Notice> : (
        <>
          <Soft>
            <T v="body">Collection time: <T v="strong">{h.confirmed_for}</T></T>
            <T v="body">Collected by: <T v="strong">{h.who}</T></T>
            {[`Check their photo ID matches ${h.who}.`, "Ask them for the 6-digit release code. Don't hand over the keys without it, and never accept cash or a transfer from them. The buyer has already paid Tyrebiter.", "Enter the code, the odometer and the keys handed over below.", "Then remove your plates if your state requires it, and lodge your notice of disposal."].map((t, i) => <T key={i} v="body">{i + 1}. {t}</T>)}
          </Soft>
          <Field label={`Release code from ${h.who}`} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" inputStyle={{ fontSize: 28, letterSpacing: 6 }} />
          <Field label="Odometer now (km)" value={odo} onChangeText={setOdo} keyboardType="number-pad" />
          <Field label="Keys handed over" value={keys} onChangeText={setKeys} keyboardType="number-pad" />
          <Field label="Anything to note? (optional)" value={notes} onChangeText={setNotes} multiline placeholder="e.g. service books and spare key handed over" />
          <Check checked={idOk} onChange={setIdOk}>{`I've checked their photo ID matches ${h.who}.`}</Check>
          {msg ? <Notice kind="bad">{msg}</Notice> : null}
          <Button title="Confirm handover" busy={busy} disabled={!idOk || code.length !== 6} onPress={submit} />
        </>
      )}
      <T v="small">Something wrong? Don't hand over the vehicle. Call us.</T>
      {call}
    </Screen>
  );
}
