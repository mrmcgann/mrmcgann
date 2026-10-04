import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CATEGORIES, CAT, makesFor, modelsFor } from "@/lib/vehicles";
import { expiryDate, normalizePlate, normalizeVin, REGO_STATES, vehicleLine, type RegoVehicle } from "@/lib/rego";
import { api, ApiError, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { pickPhotos, uploadPhotos, type Picked } from "~/lib/files";
import { useSession } from "~/lib/session";
import { Button, Field, LinkText, Notice, Pill, Screen, Segmented, Select, Soft, T } from "~/ui/kit";
import { Icon } from "~/ui/art";
import { C, F } from "~/ui/theme";

type Registration = "registered" | "unregistered";
type Found = { id: string | null; vehicle: RegoVehicle };
const UNAVAILABLE = "We can't look vehicles up right now. Enter the details yourself.";
const STATE_OPTIONS = REGO_STATES.map((s) => [s, s] as [string, string]);
const isRegoState = (s?: string | null) => !!s && (REGO_STATES as readonly string[]).includes(s);

/** Up to five names that start with what's been typed (the website's datalist). */
function Suggest({ value, options, onPick, testID }: { value: string; options: string[]; onPick: (v: string) => void; testID: string }) {
  const q = value.trim().toLowerCase();
  if (!q) return null;
  const hits = options.filter((o) => o.toLowerCase().startsWith(q) && o.toLowerCase() !== q).slice(0, 5);
  if (!hits.length) return null;
  return <View style={s.suggest}>{hits.map((h) => <Pill key={h} testID={`${testID}-${h}`} label={h} onPress={() => onPick(h)} style={{ height: 34 }} />)}</View>;
}

/**
 * Sell your vehicle (the website's AppraisalForm): type the plate (any state) and we fill in the
 * vehicle; the seller adds what only they know (kilometres, condition) and how to reach them.
 * Unregistered vehicles use the VIN instead, or the seller enters the details themselves. No account needed.
 */
export default function Appraisal() {
  const { me } = useSession();
  const p = me?.profile;
  const [registration, setRegistration] = useState<Registration>("registered");
  const [plate, setPlate] = useState("");
  const [state, setState] = useState<string>(isRegoState(p?.state) ? p!.state! : "QLD");
  const [vin, setVin] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [manual, setManual] = useState(false);
  const [kind, setKind] = useState("cars");
  const [m, setM] = useState({ year: "", make: "", model: "", variant: "" });
  const [v, setV] = useState({ odometer: "", postcode: p?.postcode || "", description: "", name: [p?.first_name, p?.last_name].filter(Boolean).join(" "), mobile: p?.mobile || "", email: me?.user?.email || "" });
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; name: string } | null>(null);
  const set = (k: keyof typeof v) => (t: string) => setV((x) => ({ ...x, [k]: t }));
  const setMan = (k: keyof typeof m) => (t: string) => setM((x) => ({ ...x, [k]: t }));

  // The profile can arrive after the screen opens: fill in anything still empty.
  useEffect(() => { if (isRegoState(p?.state)) setState(p!.state!); }, [p?.state]);
  const email = me?.user?.email;
  useEffect(() => {
    setV((x) => ({
      ...x,
      postcode: x.postcode || p?.postcode || "", mobile: x.mobile || p?.mobile || "", email: x.email || email || "",
      name: x.name || [p?.first_name, p?.last_name].filter(Boolean).join(" "),
    }));
  }, [email, p?.postcode, p?.mobile, p?.first_name, p?.last_name]);

  const reset = () => { setFound(null); setConfirmed(false); setLookErr(""); };

  async function lookup() {
    setLookErr(""); setFound(null); setConfirmed(false);
    const body = registration === "registered" ? { plate: normalizePlate(plate), state } : { vin: normalizeVin(vin) };
    if (registration === "registered" && !body.plate) return setLookErr("Enter the plate.");
    if (registration === "unregistered" && (body.vin || "").length !== 17) return setLookErr("A VIN is 17 letters and numbers. For an older chassis number, enter the details yourself.");
    setLooking(true);
    try {
      const d = await api<{ found: boolean; id: string | null; vehicle: RegoVehicle | null }>("/api/rego-lookup", { body });
      if (!d.found || !d.vehicle) {
        setLookErr(registration === "registered" ? `We couldn't find ${body.plate} in ${state}. Check the plate and state, or enter the details yourself.` : "We couldn't find that VIN. Check it, or enter the details yourself.");
      } else {
        setFound({ id: d.id, vehicle: d.vehicle });
        if (d.vehicle.category && CAT[d.vehicle.category]) setKind(d.vehicle.category);
        setManual(false);
      }
    } catch (e) {
      // Not available (503), too many lookups (429), or offline: carry on by hand.
      setLookErr(e instanceof ApiError && typeof e.data.error === "string" ? e.data.error : UNAVAILABLE);
      setManual(true);
    }
    setLooking(false);
  }

  async function submit() {
    setBusy(true); setErrors({});
    try {
      const paths = photos.length ? await uploadPhotos("appraisal-photos", `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, photos.slice(0, 12)) : [];
      const d = await api<{ ref: string }>("/api/appraisals", { body: {
        odometer: CAT[kind]?.usage === "none" ? "" : v.odometer, postcode: v.postcode, description: v.description, name: v.name, mobile: v.mobile, email: v.email,
        kind, registration, rego: normalizePlate(plate), state, vin: normalizeVin(vin), lookupId: confirmed ? found?.id ?? null : null,
        ...(confirmed ? {} : m), photos: paths,
      } });
      setDone({ ref: d.ref, name: v.name.trim().split(" ")[0] });
    } catch (e) {
      if (e instanceof ApiError && e.data.errors) setErrors(e.data.errors as Record<string, string>);
      else setErrors({ form: errText(e) });
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Screen testID="appraisal-done">
        <Soft bg={C.lime}>
          <T v="eyebrow" style={{ color: C.ink }}>Request {done.ref}</T>
          <T v="d3">Thanks{done.name ? `, ${done.name}` : ""}.</T>
          <T v="body" style={{ fontSize: 18, lineHeight: 26 }}>Your consultant will call you within 1 business day with a price guide and a suggested reserve.</T>
        </Soft>
        <Button kind="dark" title="Browse auctions" onPress={() => router.replace("/search")} />
        <Button kind="soft" title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  const usage = CAT[kind]?.usage;
  const ready = confirmed || manual;
  const fv = found?.vehicle;
  const facts = fv ? [fv.vinEnding ? `VIN ending ${fv.vinEnding}` : null, fv.regoExpiry ? `Rego expires ${expiryDate(fv.regoExpiry)}` : null, fv.engine].filter(Boolean).join(" · ") : "";
  const fieldErrors = Object.keys(errors).filter((k) => k !== "make" && k !== "form");

  return (
    <Screen keyboard testID="appraisal">
      <View style={{ gap: 4 }}>
        <T v="d3">Sell your vehicle.</T>
        <T v="muted">Start with the plate. We fill in the rest.</T>
      </View>

      <Segmented testID="registration" options={[["registered", "Registered"], ["unregistered", "Unregistered"]]} value={registration}
        onChange={(r) => { setRegistration(r); reset(); setManual(false); }} />

      {registration === "registered" ? (
        <View style={s.plateRow}>
          <Field testID="rego-plate" label="Rego plate" value={plate} onChangeText={(t) => { setPlate(t.toUpperCase()); reset(); }} placeholder="ABC123" autoCapitalize="characters" autoCorrect={false} autoComplete="off" spellCheck={false} maxLength={10}
            returnKeyType="search" onSubmitEditing={() => { void lookup(); }} error={errors.rego} inputStyle={s.plate} style={{ flex: 1 }} />
          <View style={{ width: 104 }}><Select testID="rego-state" label="State" value={state} options={STATE_OPTIONS} placeholder="State" onChange={(x) => { if (x) { setState(x); reset(); } }} /></View>
        </View>
      ) : (
        <View style={s.plateRow}>
          <Field testID="rego-vin" label="VIN or chassis number" value={vin} onChangeText={(t) => { setVin(t.toUpperCase()); reset(); }} placeholder="17 characters" autoCapitalize="characters" autoCorrect={false} autoComplete="off" spellCheck={false} maxLength={20}
            returnKeyType="search" onSubmitEditing={() => { void lookup(); }} error={errors.vin} inputStyle={[s.plate, { fontSize: 18, letterSpacing: 0.8 }]} style={{ flex: 1 }} />
          <View style={{ width: 104 }}><Select testID="rego-state" label="State it's in" value={state} options={STATE_OPTIONS} placeholder="State" onChange={(x) => { if (x) setState(x); }} /></View>
        </View>
      )}
      {errors.state ? <T v="small" style={{ color: C.badInk, fontFamily: F.semibold, marginTop: -12 }}>{errors.state}</T> : null}

      {!found && !manual ? (
        <View style={{ gap: 14, alignItems: "flex-start" }}>
          <Button testID="rego-lookup" kind="dark" title={looking ? "Looking it up…" : "Find my vehicle"} disabled={looking} onPress={lookup} />
          <LinkText testID="rego-manual" title="Enter the details yourself" onPress={() => { setManual(true); setLookErr(""); }} />
        </View>
      ) : null}
      {lookErr ? <Notice>{lookErr}</Notice> : null}

      {found && fv ? (
        <View testID="rego-found" style={[s.found, confirmed && { backgroundColor: C.mint }]}>
          <T v="eyebrow" style={{ color: C.ink2 }}>{confirmed ? "Your vehicle" : "Is this your vehicle?"}{fv.test ? " · test data" : ""}</T>
          <Text style={s.foundTitle}>{fv.description}</Text>
          {vehicleLine(fv) ? <T v="body">{vehicleLine(fv)}</T> : null}
          {facts ? <T v="small" style={{ color: confirmed ? C.ink2 : C.muted }}>{facts}</T> : null}
          {!confirmed ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              <Button testID="rego-confirm" small title="Yes, that's it" onPress={() => setConfirmed(true)} />
              <Button testID="rego-reject" small kind="white" title="No, enter it myself" onPress={() => { setFound(null); setManual(true); }} />
            </View>
          ) : null}
        </View>
      ) : null}

      {ready ? <Select testID="appraisal-kind" label="What is it?" value={kind} options={CATEGORIES.map((c) => [c.key, c.label] as [string, string])} placeholder="Cars" onChange={(k) => setKind(k || "cars")} /> : null}
      {manual && !confirmed ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field testID="appraisal-year" label="Year" value={m.year} onChangeText={(t) => setMan("year")(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="2017" error={errors.year} style={{ width: 96 }} />
            <Field testID="appraisal-make" label="Make" value={m.make} onChangeText={setMan("make")} autoCapitalize="words" autoCorrect={false} autoComplete="off" style={{ flex: 1 }} />
          </View>
          <Suggest testID="make" value={m.make} options={makesFor(kind)} onPick={(x) => setM((y) => ({ ...y, make: x }))} />
          <Field testID="appraisal-model" label="Model" value={m.model} onChangeText={setMan("model")} autoCapitalize="words" autoCorrect={false} autoComplete="off" error={errors.model} />
          <Suggest testID="model" value={m.model} options={modelsFor(m.make, kind)} onPick={(x) => setM((y) => ({ ...y, model: x }))} />
          <Field testID="appraisal-variant" label="Variant (optional)" value={m.variant} onChangeText={setMan("variant")} placeholder="e.g. XLT 3.2 (4x4)" autoCorrect={false} error={errors.variant} />
        </>
      ) : null}

      {ready ? (
        <>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {usage !== "none" ? (
              <Field testID="appraisal-odometer" label={usage === "hours" ? "Engine hours" : "Kilometres"} value={v.odometer} onChangeText={set("odometer")} keyboardType="number-pad" placeholder={usage === "hours" ? "450" : "185,000"} error={errors.odometer} style={{ flex: 1 }} />
            ) : null}
            <Field testID="appraisal-postcode" label="Postcode where it's kept" value={v.postcode} onChangeText={(t) => set("postcode")(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="4009" autoComplete="postal-code" error={errors.postcode} style={{ flex: 1 }} />
          </View>
          <Field testID="appraisal-description" label="Anything we should know? (optional)" value={v.description} onChangeText={set("description")} multiline maxLength={2000} placeholder="Condition, damage, service history, money owing on it, extras" error={errors.description} />
          <View style={s.drop}>
            <View style={s.camera}><Icon name="camera" size={22} /></View>
            <View style={{ flex: 1, gap: 8 }}>
              <View>
                <T v="strong">{photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} added` : "Add a few phone photos"}</T>
                <T v="small">Optional. Helps us give a sharper price guide.</T>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button testID="appraisal-photos" small kind="soft" title="Choose photos" disabled={photos.length >= 12} onPress={async () => setPhotos(photos.concat(await pickPhotos(12 - photos.length)).slice(0, 12))} />
                <Button testID="appraisal-camera" small kind="soft" title="Take a photo" disabled={photos.length >= 12} onPress={async () => setPhotos([...photos, ...(await pickPhotos(1, true))].slice(0, 12))} />
              </View>
              {photos.length ? <Pressable accessibilityRole="button" onPress={() => setPhotos([])}><Text style={s.remove}>Remove the photos</Text></Pressable> : null}
            </View>
          </View>
          <Field testID="appraisal-name" label="Your name" value={v.name} onChangeText={set("name")} autoComplete="name" textContentType="name" error={errors.name} />
          <Field testID="appraisal-mobile" label="Mobile" value={v.mobile} onChangeText={set("mobile")} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="04" error={errors.mobile} />
          <Field testID="appraisal-email" label="Email" value={v.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={errors.email} />
          {errors.make ? <Notice kind="bad">{errors.make}</Notice> : null}
          {fieldErrors.length ? <Notice kind="bad">Check the details above.</Notice> : null}
          {errors.form ? <Notice kind="bad">{errors.form}</Notice> : null}
          <Button testID="appraisal-submit" title="Get started" busy={busy} onPress={submit} />
          <T v="small"><Text style={{ fontFamily: F.bold, color: C.ink }}>Privacy: </Text>by sending this, you agree to us contacting you about selling this vehicle. Our <Text accessibilityRole="link" style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy`)}>Privacy Policy</Text> explains how we handle your information and how to access or correct it.</T>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  plateRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  plate: { height: 64, fontFamily: F.heavy, fontSize: 24, letterSpacing: 2 },
  found: { gap: 6, paddingVertical: 18, paddingHorizontal: 20, borderRadius: 24, backgroundColor: C.panel },
  foundTitle: { fontFamily: F.heavy, fontSize: 22, lineHeight: 27, letterSpacing: -0.4, color: C.ink },
  suggest: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -10 },
  drop: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 16, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: "#CFCFD6" },
  camera: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.sun, alignItems: "center", justifyContent: "center" },
  remove: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
  link: { fontFamily: F.bold, color: C.blue },
});
