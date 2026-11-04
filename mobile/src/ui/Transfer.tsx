import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { PROOF_MAX, PROOF_TYPES, rulesFor, isVessel, vesselFor, trailerNote, TRANSPORT, transportLabel } from "@/lib/transfer";
import { api, errText } from "~/lib/api";
import { downloadAndShare, pickDocuments, uploadSigned, type PickedFile } from "~/lib/files";
import type { SellerTransferRow, TransferRow } from "~/lib/types";
import { Button, Check, Choice, Field, LinkText, Notice, Soft, T, Tag } from "./kit";
import { C, F } from "./theme";

const MAX_FILES = 5;
const openUrl = (url: string) => WebBrowser.openBrowserAsync(url);

/** Upload one file through a one-off signed link (private bucket), and return its path. */
async function uploadProof(invoiceId: string, f: PickedFile) {
  const s = await api<{ path: string; signedUrl: string }>("/api/transfers/upload-url", { body: { invoiceId, size: f.size, mime: f.type } });
  await uploadSigned(s.signedUrl, f);
  return s.path;
}

/** The certificate of sale (PDF). It needs the session, so it downloads with the bearer token like the invoice PDF. */
function CertLink({ url, filename, onError }: { url: string | null | undefined; filename: string; onError: (text: string) => void }) {
  if (!url) return null;
  return <LinkText testID="transfer-certificate" title="Certificate of sale (PDF) ›" onPress={() => { downloadAndShare(url, filename).catch((e) => onError(errText(e))); }} />;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.num}><Text style={s.numText}>{n}</Text></View>
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
    </View>
  );
}

/**
 * Between payment and collection (the website's TransferStep): put the vehicle in the buyer's name.
 * Registered: the seller lodges their part, the buyer transfers the registration and uploads the
 * confirmation, we check it. Unregistered: the certificate of sale is the ownership record, and the
 * buyer says how the vehicle will be moved.
 *
 * A boat's registration belongs to the state's marine authority, not its transport authority, so a vessel
 * gets its own steps and a word about the trailer. Where a state's vessel process isn't settled we send them
 * to their consultant instead of to a form we haven't read.
 */
export function TransferStep({ invoiceId, invoiceRef, t, title, category, consultantPhone, certificateUrl, onDone }: {
  invoiceId: string; invoiceRef: string; t: TransferRow; title: string; category?: string | null; consultantPhone: string; certificateUrl: string | null | undefined; onDone: () => void;
}) {
  const rules = rulesFor(t.rego_state);
  const onWater = isVessel(category);
  const vessel = onWater ? vesselFor(t.rego_state) : null;
  // The transfer itself; the movement permit below stays with the road authority, which is what tows it away.
  const authority = vessel ? vessel.authority : rules.authority;
  const [choice, setChoice] = useState<"transfer" | "unregistered">(t.buyer_choice === "unregistered" ? "unregistered" : "transfer");
  const [transport, setTransport] = useState(t.transport && t.transport !== "drive" ? t.transport : "");
  const [reference, setReference] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const registered = t.registration === "registered";
  const takeUnreg = !registered || choice === "unregistered";
  const transferring = registered && choice === "transfer";
  // Only the permit is ever uploaded now: the transfer itself needs no proof, because nothing waits on it.
  const showFiles = transport === "permit";
  const cert = <CertLink url={certificateUrl} filename={`certificate-of-sale-${invoiceRef}.pdf`} onError={setErr} />;

  async function add(from: "photos" | "camera" | "files") {
    setErr("");
    const picked = await pickDocuments(MAX_FILES - files.length, from).catch(() => []);
    if (!picked.length) return;
    if (picked.some((f) => !PROOF_TYPES[f.type])) return setErr("Upload a photo (JPG, PNG, HEIC) or a PDF.");
    if (picked.some((f) => !f.size)) return setErr("Couldn't read that file. Try another one.");
    if (picked.some((f) => f.size > PROOF_MAX)) return setErr("Files can be up to 10 MB.");
    setFiles([...files, ...picked].slice(0, MAX_FILES));
  }

  async function submit() {
    setErr("");
    if (takeUnreg && !transport) return setErr("Choose how the vehicle will be moved.");
    if (!registered && !agree) return setErr("Check the certificate of sale and tick the box.");
    setBusy(true);
    try {
      const paths: string[] = [];
      if (showFiles) for (const f of files.slice(0, MAX_FILES)) paths.push(await uploadProof(invoiceId, f));
      await api("/api/transfers", { body: { invoiceId, choice: "unregistered", transport, reference: "", paths } });
      setFiles([]);
      onDone();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  // Their word that they've done their half. No proof asked for: it only stops the reminders.
  async function saidDone() {
    setErr("");
    setBusy(true);
    try { await api("/api/transfers/done", { body: { invoiceId } }); onDone(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  if (t.status === "complete") {
    return (
      <Soft testID="transfer">
        <T v="h">Transfer of ownership.</T>
        <Notice kind="ok">{`Done. ${registered && t.buyer_choice !== "unregistered" ? "The registration is in your name." : `The ${title} is recorded as yours (sold unregistered).`}${t.transport ? ` ${transportLabel(t.transport)}.` : ""}`}</Notice>
        {cert}
        <T v="small">Keep it with the vehicle's papers.</T>
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Soft>
    );
  }
  // They've told us they did their half. We took their word for it, so this says so rather than claiming we
  // checked anything, and nothing further is asked of them.
  if (t.buyer_said_done_at) {
    return (
      <Soft testID="transfer">
        <T v="h">Transfer of ownership.</T>
        <Notice kind="ok">Thanks — you&apos;ve told us it&apos;s in your name, so we&apos;ll stop reminding you. Keep your receipt from {authority} with the vehicle&apos;s papers.</Notice>
        {cert}
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Soft>
    );
  }
  if (t.status === "submitted") {
    return (
      <Soft testID="transfer">
        <T v="h">Transfer of ownership.</T>
        <Notice>{`We're checking it${t.buyer_choice === "unregistered" ? " and arranging to cancel the registration" : ""}. We'll text you when it's done, usually within one business day. It doesn't hold up your collection.`}</Notice>
        {cert}
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Soft>
    );
  }

  return (
    <Soft testID="transfer" style={{ gap: 14 }}>
      <T v="h">Transfer of ownership.</T>
      {t.review_note ? <Notice kind="bad"><T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>We need one more thing: </Text>{t.review_note}</T></Notice> : null}

      {/* One button. We've lodged the seller's side, their half gates nothing, so nothing here asks for proof. */}
      {transferring ? (
        <>
          <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>
            {t.seller_done_at
              ? `We've lodged the seller's side with ${authority}, so that part is finished. The last step is yours, and the form is already filled in from your account.`
              : `We're lodging the seller's side with ${authority} now. You can do your part straight away — you don't have to wait for us.`}
          </T>
          {onWater && !vessel ? (
            <Notice><T v="body" style={{ fontSize: 15, lineHeight: 21 }}>A boat&apos;s registration goes through {t.rego_state || "the state"}&apos;s marine authority, not its road one. Call us on {consultantPhone} and we&apos;ll do that part with you.</T></Notice>
          ) : (
            <Button testID="transfer-go" title="Transfer it into my name ›" kind="blue" onPress={() => openUrl(vessel ? vessel.buyerUrl : rules.buyerUrl)} />
          )}
          <T v="small">You&apos;ll pay your state&apos;s transfer fee and duty, which is a tax in your own name, so it&apos;s the one part nobody can pay for you. Most states give you 14 days from the sale.{vessel ? ` ${trailerNote(t.rego_state)}` : rules.cert ? ` ${rules.cert}` : ""}</T>
          <T v="small">Does the form ask for the seller&apos;s details? Call us on {consultantPhone} and we&apos;ll complete that part — the seller&apos;s details stay private.</T>
          <Button testID="transfer-done" small kind="dark" title="I've done it" busy={busy} onPress={saidDone} style={{ alignSelf: "flex-start" }} />
          <T v="small">Telling us stops the reminders. It never holds up your collection: you can book and collect whether or not this is finished.</T>
          <Text testID="transfer-take-unreg" accessibilityRole="button" onPress={() => setChoice("unregistered")} style={s.remove}>
            I can&apos;t register it in {t.rego_state} — take it unregistered instead
          </Text>
        </>
      ) : null}

      {takeUnreg ? (
        <>
          <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>
            {registered
              ? <>The seller cancels the registration{onWater ? "" : " and keeps the plates"}, and your certificate of sale, in your name, is your record of ownership.</>
              : <>This {title} is sold <Text style={{ fontFamily: F.bold }}>unregistered, without plates</Text>. Your certificate of sale, in your name, is your record of ownership.</>}
          </T>
          {cert}
          <Check testID="transfer-agree" checked={agree} onChange={setAgree}>The details on the certificate of sale are correct.</Check>
        </>
      ) : null}

      {takeUnreg ? (
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="How will it be moved?">
          <T v="label">How will it be moved?</T>
          {TRANSPORT.map(([k, label]) => (
            <Choice key={k} testID={`transport-${k}`} on={transport === k} onPress={() => setTransport(k)} title={k === "permit" ? `${label} (${rules.permit})` : label}
              hint={k === "permit" ? (
                <T v="small">Apply to {rules.authority} before collection day: <Text accessibilityRole="link" style={s.link} onPress={() => openUrl(rules.permitUrl)}>{rules.permit} ›</Text>. Bring it with you, or upload it here.</T>
              ) : undefined} />
          ))}
        </View>
      ) : null}

      {showFiles ? (
        <View style={s.drop}>
          <T v="strong">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} added` : "Upload the permit (optional)"}</T>
          <T v="small">A photo or PDF, up to 10 MB each.</T>
          {files.length < MAX_FILES ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <Button testID="transfer-photos" small kind="white" title="Photos" onPress={() => add("photos")} />
              <Button testID="transfer-camera" small kind="white" title="Take a photo" onPress={() => add("camera")} />
              <Button testID="transfer-files" small kind="white" title="PDF or file" onPress={() => add("files")} />
            </View>
          ) : null}
          {files.length ? <Text testID="transfer-files-clear" accessibilityRole="button" onPress={() => setFiles([])} style={s.remove}>Remove {files.length === 1 ? "it" : "them"}</Text> : null}
        </View>
      ) : null}
      {err ? <Notice kind="bad">{err}</Notice> : null}
      {takeUnreg ? (
        <>
          <Button testID="transfer-submit" title="Confirm" busy={busy} onPress={submit} />
          {registered ? (
            <Text testID="transfer-back" accessibilityRole="button" onPress={() => setChoice("transfer")} style={s.remove}>
              Back — I&apos;ll transfer the registration after all
            </Text>
          ) : null}
        </>
      ) : null}
    </Soft>
  );
}

/**
 * The seller's part once the buyer has paid in full (the website's dashboard block): lodge their part
 * with the state's transport authority, then tap "I've done this" (with an optional receipt number).
 */
export function SellerTransfer({ lotId, transfer, state, category, onDone }: { lotId: number; transfer: SellerTransferRow; state: string | null | undefined; category?: string | null; onDone: () => void }) {
  const rules = rulesFor(transfer.rego_state || state);
  // A boat's registration is the marine authority's, so the seller's part is lodged there too.
  const vessel = isVessel(category) ? vesselFor(transfer.rego_state || state) : null;
  const authority = vessel ? vessel.authority : rules.authority;
  const body = { fontSize: 15, lineHeight: 21 };
  return (
    <Soft testID="seller-transfer" bg={C.sun} style={{ padding: 16, gap: 8 }}>
      <T v="strong">Paid in full. Transfer of ownership: nothing for you to do.</T>
      {/* Since migration 32 we lodge the seller's side ourselves as their agent, so this screen reports a
          result and never asks for one. */}
      {transfer.registration === "registered" && transfer.buyer_choice === "unregistered" ? (
        <T v="body" style={body}>The buyer is taking it unregistered, so we&apos;re cancelling the registration with {authority} for you (you may get a refund for the unused registration).{vessel ? "" : " Keep the plates."}</T>
      ) : transfer.registration === "registered" ? (
        <>
          {transfer.seller_done_at ? (
            <>
              <T v="body" style={body}><Text style={{ fontFamily: F.bold }}>Done. </Text>We&apos;ve lodged the notice of disposal for you with {authority}, so it&apos;s no longer your responsibility for tolls, fines or renewals.</T>
              {transfer.seller_reference ? <Tag label={transfer.seller_reference} color={C.mint} /> : null}
              <T v="body" style={[body, { color: C.ink2 }]}>The buyer puts it into their own name from here. That part is between them and {authority}, and nothing about it comes back to you.</T>
            </>
          ) : (
            <T v="body" style={body}>We&apos;re lodging the notice of disposal with {authority} for you now, using the details on your agreement. We&apos;ll text you the moment it&apos;s done.</T>
          )}
        </>
      ) : (
        <T v="body" style={body}>It&apos;s sold unregistered, so there&apos;s nothing to lodge at all. The buyer&apos;s certificate of sale is the record of ownership.</T>
      )}
      <T v="small" style={{ color: C.ink2 }}>The buyer never gets your name or address: they collect it from our depot.</T>
    </Soft>
  );
}

const s = StyleSheet.create({
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", marginTop: 1 },
  numText: { fontFamily: F.heavy, fontSize: 13, color: "#FFFFFF" },
  link: { fontFamily: F.bold, color: C.blue },
  drop: { gap: 4, padding: 16, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: "#CFCFD6", backgroundColor: "#FFFFFF" },
  remove: { fontFamily: F.semibold, fontSize: 14, color: C.muted, paddingTop: 6 },
});
