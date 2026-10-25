import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { dateTime, money } from "@/lib/format";
import { lotFees, priceBreakdown } from "@/lib/fees";
import { consumerRights } from "@/lib/listing";
import { winPayLine } from "@/lib/deposits";
import { afterWarrantyLine, coolingLine, stateTime, type AfterOffer, type AfterRule } from "@/lib/afterAuction";
import { api, ApiError, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { downloadAndShare } from "~/lib/files";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import { Button, Check, Empty, Field, LineItem, LinkText, Loading, Notice, Screen, Sheet, Soft, T } from "~/ui/kit";
import { C } from "~/ui/theme";

type OfferLot = { id: number; title: string; suburb: string | null; state: string | null; seller_type: "private" | "business" | null; fees: Record<string, number | string> | null };

/** An offer to buy a vehicle after the auction (migration 26), as the website's /offers/[id] shows it: the price and
 *  its all-in amount, the state's cooling-off (and that no statutory warranty applies), the contract and the state's forms. Signing is
 *  typing the name on the account; in a cooling-off period the buyer can cancel here, free. Never the seller's name. */
export default function OfferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, config, signedIn, ready, refresh } = useSession();
  const [o, setO] = useState<AfterOffer | null>(null);
  const [lot, setLot] = useState<OfferLot | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sheet, setSheet] = useState<"decline" | "cancel" | "terms" | null>(null);

  const load = useCallback(async () => {
    // row level security: a member reads only the offers made to them
    const { data, error } = await supabase.from("second_chance_offers").select("*").eq("id", id).maybeSingle();
    if (error || !data) { setErr("It may have been made to another account. Check you're signed in as the person it was sent to."); return; }
    const offer = data as AfterOffer;
    const { data: l } = await supabase.from("lots").select("id, title, suburb, state, seller_type, fees").eq("id", offer.lot_id).maybeSingle();
    setO(offer); setLot((l || null) as OfferLot | null); setErr("");
  }, [id]);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  const full = `${me?.profile?.first_name || ""} ${me?.profile?.last_name || ""}`.trim();

  async function send(action: "accept" | "decline" | "cancel") {
    if (action === "accept" && !ack) return setMsg("Tick the box to confirm you've read the contract.");
    if (action === "accept" && name.trim().length < 3) return setMsg(`Type your name to sign${full ? `: ${full}` : ""}.`);
    setBusy(true); setMsg("");
    try {
      const r = await api<{ status?: string; invoice_id?: string | null }>("/api/after-offer", { body: { id, action, name: action === "accept" ? name : "" } });
      setSheet(null);
      if (r.invoice_id) { setBusy(false); router.replace(`/invoice/${r.invoice_id}`); return; }
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setSheet("terms");
      else { setSheet(null); setMsg(errText(e)); }
    }
    setBusy(false);
  }

  async function acceptTerms() {
    setBusy(true);
    try { await api("/api/terms/accept", { method: "POST" }); await refresh(); setSheet(null); setMsg("Thanks. You can sign now."); }
    catch (e) { setMsg(errText(e)); }
    setBusy(false);
  }

  async function openDoc(i: number) {
    try { const d = await api<{ url: string }>(`/api/offers/${id}/doc?i=${i}&json=1`); await WebBrowser.openBrowserAsync(d.url); }
    catch (e) { setMsg(errText(e)); }
  }

  if (!ready) return <Loading />;
  if (!signedIn) return <Screen><Empty title="Sign in to see your offer." sub="An offer is made to one member's account."><Button title="Sign in" onPress={() => router.push(`/signin?next=${encodeURIComponent(`/offers/${id}`)}`)} /></Empty></Screen>;
  if (err) return <Screen><Empty title="We couldn't find this offer." sub={err} /></Screen>;
  if (!o || !config) return <Loading />;
  if (o.kind !== "after_auction") {
    return <Screen><Empty title="Open this offer on our website."><Button kind="soft" title="Open it" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/offers/${id}`)} /></Empty></Screen>;
  }

  const rule = (o.rule || null) as AfterRule | null;
  const b = priceBreakdown(Number(o.amount), lotFees(config.fees, lot));
  const open = o.status === "pending" && new Date(o.expires_at).getTime() > Date.now();
  const cooling = o.status === "cooling_off";
  const head = open ? "It can be yours." : cooling ? "Agreed." : o.status === "accepted" ? "It's yours." : o.status === "cancelled" && o.cancel_reason === "cooling_off" ? "Cancelled." : "This offer has closed.";
  const docs = (o.docs || []) as { name: string }[];
  const until = cooling && o.cooling_off_until && rule ? stateTime(o.cooling_off_until, rule.tz, rule.state) : null;
  const pay = winPayLine(b)?.replace(/^If you win, /, "") ?? "pay by PayID or bank transfer.";
  const closed = o.status === "declined" ? "You declined this offer." : o.status === "withdrawn" ? "This offer was withdrawn, so nothing is payable."
    : o.status === "cancelled" ? (o.cancel_reason === "cooling_off" ? "You cancelled in your cooling-off period. Nothing is payable." : "This sale didn't go ahead, so nothing is payable.") : "This offer has expired.";

  return (
    <Screen keyboard testID="offer">
      <T v="eyebrow" style={{ color: C.grape }}>After the auction</T>
      <T v="d2" testID="after-head">{head}</T>
      <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>
        The seller has agreed to sell you the {lot?.title || "vehicle"}{lot?.suburb && lot?.state ? ` (collect from our depot in ${lot.suburb}, ${lot.state})` : ""} for this price. It's a sale by agreement after the auction, not at auction, so it comes with what your state's law gives a buyer from a dealer, set out below. There's no obligation.
      </T>
      <Soft style={{ gap: 6 }}>
        <LineItem k="Agreed price" v={money(b.price)} />
        <LineItem k="Buyer's premium, GST and admin fee" v={money(b.subtotal - b.price, true)} />
        <LineItem k="All-in" v={money(b.total, true)} bold />
      </Soft>
      <Notice testID="after-terms" style={{ gap: 8 }}>
        <T v="body"><T v="strong">Cooling-off. </T><T v="body" testID="after-cooling">{coolingLine(rule, cooling ? o.cooling_off_until : null) || "No cooling-off period applies."}</T></T>
        <T v="body"><T v="strong">Statutory warranty. </T><T v="body" testID="after-warranty">{afterWarrantyLine(o)}</T></T>
        <T v="body"><T v="strong">Your rights. </T>{consumerRights("after", lot?.seller_type ?? null)}</T>
      </Notice>
      <View style={{ gap: 8 }} testID="after-docs">
        <T v="title">Read before you sign</T>
        <LinkText testID="after-contract" title="The contract of sale (PDF)" onPress={() => downloadAndShare(`${SITE}/api/offers/${o.id}/contract`, `Tyrebiter-contract-${String(o.id).slice(0, 8)}.pdf`).catch((e) => setMsg(errText(e)))} />
        {docs.map((d, i) => <LinkText key={i} testID={`after-doc-${i}`} title={d.name} onPress={() => openDoc(i)} />)}
        {docs.length === 0 ? <T v="small">In {rule?.state || lot?.state || "this state"}, the contract is all the paperwork there is.</T> : null}
      </View>
      {open ? (
        <View style={{ gap: 12 }} testID="after-sign">
          <T v="muted">Open until {dateTime(o.expires_at)} (Brisbane time). If you sign, it's binding{rule && rule.cooling_days > 0 ? ", after your cooling-off period," : ""} and it's paid for like a win: {pay}</T>
          <Field testID="after-name" label={full ? `Type your full name to sign (as it is on your account: ${full})` : "Type your full name to sign"} value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" />
          <Check testID="after-ack" checked={ack} onChange={setAck}>I've read the contract and the documents above, and I agree to buy the vehicle at this price under them and the Terms of Sale.</Check>
          {msg ? <Notice kind="bad">{msg}</Notice> : null}
          <Button testID="after-accept" title="Sign and buy" busy={busy} onPress={() => send("accept")} />
          <Button testID="after-decline" kind="soft" title="No thanks" disabled={busy} onPress={() => setSheet("decline")} />
        </View>
      ) : null}
      {cooling ? (
        <Soft bg={C.sun} testID="after-cooling-box" style={{ gap: 10 }}>
          <T v="title">You've signed. You can change your mind until {until}.</T>
          <T v="body">Cancelling is free. If you don't, the sale is final then and your invoice is ready to pay. We don't take any money before then.</T>
          {msg ? <Notice kind="bad">{msg}</Notice> : null}
          <Button testID="after-cancel" kind="white" title="Cancel this purchase" disabled={busy} onPress={() => setSheet("cancel")} />
        </Soft>
      ) : null}
      {o.status === "accepted" ? (
        <Notice kind="ok" style={{ gap: 6 }}>
          <T v="body">You signed this offer, and the sale is final.</T>
          {o.invoice_id ? <LinkText title="Your invoice and next steps ›" onPress={() => router.push(`/invoice/${o.invoice_id}`)} /> : null}
        </Notice>
      ) : null}
      {!open && !cooling && o.status !== "accepted" ? <Notice testID="after-closed">{closed}</Notice> : null}
      <Sheet visible={!!sheet} onClose={() => setSheet(null)}
        title={sheet === "decline" ? "Decline this offer?" : sheet === "cancel" ? "Cancel this purchase?" : "Our terms have changed"}
        footer={sheet === "terms"
          ? <><Button testID="after-terms-accept" title="I accept the updated Terms of Sale" busy={busy} onPress={acceptTerms} /><Button kind="soft" title="Not now" onPress={() => setSheet(null)} /></>
          : <><Button testID="after-sheet-yes" title={sheet === "decline" ? "Decline it" : "Cancel it, free"} kind="dark" busy={busy} onPress={() => send(sheet === "decline" ? "decline" : "cancel")} /><Button kind="soft" title="Keep it" onPress={() => setSheet(null)} /></>}>
        <T v="muted">{sheet === "decline" ? "It may go to someone else." : sheet === "cancel" ? "It's free, and nothing is payable." : "Please read and accept the current Terms of Sale before you sign."}</T>
        {sheet === "terms" ? <LinkText title="Read the Terms of Sale ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms`)} /> : null}
      </Sheet>
    </Screen>
  );
}
