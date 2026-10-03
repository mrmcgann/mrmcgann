import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { CATEGORIES, CAT } from "@/lib/vehicles";
import { STATES } from "@/lib/grades";
import { api, ApiError, errText } from "~/lib/api";
import { pickPhotos, uploadPhotos, type Picked } from "~/lib/files";
import { useSession } from "~/lib/session";
import { Button, Field, Notice, Screen, Select, Soft, T } from "~/ui/kit";
import { C, F } from "~/ui/theme";

/** Free appraisal request (the website's AppraisalForm). No account needed. */
export default function Appraisal() {
  const { me } = useSession();
  const p = me?.profile;
  const [kind, setKind] = useState("cars");
  const [v, setV] = useState({ rego: "", state: p?.state || "QLD", odometer: "", postcode: p?.postcode || "", name: [p?.first_name, p?.last_name].filter(Boolean).join(" "), mobile: p?.mobile || "", email: me?.user?.email || "" });
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const usage = CAT[kind]?.usage || "km";
  const set = (k: keyof typeof v) => (t: string) => setV((x) => ({ ...x, [k]: t }));

  async function submit() {
    setBusy(true); setErrors({});
    try {
      const paths = photos.length ? await uploadPhotos("appraisal-photos", `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, photos) : [];
      const d = await api<{ ref: string }>("/api/appraisals", { body: { ...v, kind, photos: paths } });
      setDone(d.ref);
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string>);
      else setErrors({ rego: errText(e) });
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Screen>
        <Soft bg={C.lime}>
          <T v="eyebrow" style={{ color: C.ink }}>Request {done}</T>
          <T v="d3">Thanks{v.name ? `, ${v.name.split(" ")[0]}` : ""}.</T>
          <T v="body">We'll call you within 1 business day with a price range and a suggested reserve, then book a time to photograph your {CAT[kind]?.one || "vehicle"} at your place.</T>
        </Soft>
        <Button kind="soft" title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }
  return (
    <Screen keyboard>
      <T v="d3">Free appraisal.</T>
      <T v="muted">Two minutes. No obligation.</T>
      <Select label="What are you selling?" value={kind} options={CATEGORIES.map((c) => [c.key, c.label] as [string, string])} placeholder="Cars" onChange={(k) => setKind(k || "cars")} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label={kind === "boats" || kind === "machinery" ? "Rego or serial" : "Rego"} value={v.rego} onChangeText={(t) => set("rego")(t.toUpperCase())} autoCapitalize="characters" error={errors.rego} style={{ flex: 1 }} />
        <View style={{ width: 120 }}><Select label="State" value={v.state} options={STATES.map((s) => [s, s] as [string, string])} placeholder="State" onChange={(s) => set("state")(s || "QLD")} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label={usage === "hours" ? "Engine hours" : usage === "none" ? "Length or size" : "Kilometres"} value={v.odometer} onChangeText={set("odometer")} keyboardType={usage === "none" ? "default" : "number-pad"} placeholder={usage === "hours" ? "850" : usage === "none" ? "e.g. 5.6 m" : "185,000"} error={errors.odometer} style={{ flex: 1 }} />
        <Field label="Postcode" value={v.postcode} onChangeText={(t) => set("postcode")(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" error={errors.postcode} style={{ width: 120 }} />
      </View>
      <Field label="Your name" value={v.name} onChangeText={set("name")} autoComplete="name" error={errors.name} />
      <Field label="Mobile" value={v.mobile} onChangeText={set("mobile")} keyboardType="phone-pad" autoComplete="tel" error={errors.mobile} />
      <Field label="Email" value={v.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.email} />
      <View style={{ gap: 8 }}>
        <T v="label">Photos (optional, up to 12)</T>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button small kind="soft" title="Choose photos" onPress={async () => setPhotos((await pickPhotos(12 - photos.length)).concat(photos).slice(0, 12))} />
          <Button small kind="soft" title="Take a photo" onPress={async () => setPhotos([...photos, ...(await pickPhotos(1, true))].slice(0, 12))} />
        </View>
        {photos.length ? (
          <Pressable onPress={() => setPhotos([])}><Text style={{ fontFamily: F.semibold, color: C.muted }}>{photos.length} photo{photos.length === 1 ? "" : "s"} added · Remove</Text></Pressable>
        ) : null}
      </View>
      {Object.keys(errors).length ? <Notice kind="bad">Check the details above.</Notice> : null}
      <Button title="Get my free appraisal" busy={busy} onPress={submit} />
      <T v="small" style={{ textAlign: "center" }}>We'll call you within 1 business day.</T>
    </Screen>
  );
}
