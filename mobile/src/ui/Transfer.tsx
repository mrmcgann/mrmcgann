import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { PROOF_MAX, PROOF_TYPES, rulesFor, TRANSPORT, transportLabel } from "@/lib/transfer";
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
 */
export function TransferStep({ invoiceId, invoiceRef, t, title, consultantPhone, certificateUrl, onDone }: {
  invoiceId: string; invoiceRef: string; t: TransferRow; title: string; consultantPhone: string; certificateUrl: string | null | undefined; onDone: () => void;
}) {
  const rules = rulesFor(t.rego_state);
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
  const showFiles = transferring || transport === "permit";
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
    if (transferring && !files.length && !reference.trim()) return setErr("Upload the transfer confirmation, or enter the receipt number.");
    setBusy(true);
    try {
      const paths: string[] = [];
      if (showFiles) for (const f of files.slice(0, MAX_FILES)) paths.push(await uploadProof(invoiceId, f));
      await api("/api/transfers", { body: { invoiceId, choice: registered ? choice : "unregistered", transport: takeUnreg ? transport : null, reference: transferring ? reference : "", paths } });
      setFiles([]);
      onDone();
    } catch (e) {
      setErr(errText(e));
    }
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
  if (t.status === "submitted") {
    return (
      <Soft testID="transfer">
        <T v="h">Transfer of ownership.</T>
        <Notice>{`We're checking it${t.buyer_choice === "unregistered" ? " and arranging with the seller to cancel the registration" : ""}. We'll text you when it's done, usually within one business day. Then you can book your collection.`}</Notice>
        {cert}
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Soft>
    );
  }

  return (
    <Soft testID="transfer" style={{ gap: 14 }}>
      <T v="h">Transfer of ownership.</T>
      <T v="muted">Before you collect, the {title} goes into your name. The pickup address is sent once this is done and your collection time is confirmed.</T>
      {t.review_note ? <Notice kind="bad"><T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>We need one more thing: </Text>{t.review_note}</T></Notice> : null}

      {registered ? (
        <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Registration">
          <Choice testID="transfer-choice-transfer" on={choice === "transfer"} onPress={() => setChoice("transfer")} title="Transfer the registration into my name"
            hint={`Registered in ${t.rego_state}. You'll need to do this through ${rules.authority}.`} />
          <Choice testID="transfer-choice-unregistered" on={choice === "unregistered"} onPress={() => setChoice("unregistered")} title="Take it unregistered"
            hint={`The seller cancels the registration and keeps the plates. Choose this if you can't register it in ${t.rego_state}.`} />
        </View>
      ) : null}

      {transferring ? (
        <View style={{ gap: 12 }}>
          <Step n={1}>
            <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>The seller's part. </Text>The seller lodges their part with {rules.authority}.</T>
            {t.seller_done_at ? <Tag label="Done" color={C.mint} /> : <T v="small">We're arranging this with the seller.</T>}
          </Step>
          <Step n={2}>
            <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>Your part. </Text>{rules.buyer}</T>
            <LinkText testID="transfer-buyer-link" title={`Transfer it with ${rules.authority} ›`} onPress={() => openUrl(rules.buyerUrl)} />
            {rules.cert ? <T v="small">{rules.cert}</T> : null}
          </Step>
          <Step n={3}>
            <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>Show us. </Text>Upload the confirmation (the receipt, or the new registration certificate in your name), or enter the receipt number. Need the seller's details or help? Call {consultantPhone}.</T>
          </Step>
        </View>
      ) : null}

      {!registered ? (
        <>
          <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>This vehicle is sold <Text style={{ fontFamily: F.bold }}>unregistered, without plates</Text>. Your certificate of sale, in your name, is your record of ownership.</T>
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
          <T v="strong">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} added` : transferring ? "Upload the transfer confirmation" : "Upload the permit (optional)"}</T>
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
      {transferring ? <Field testID="transfer-reference" label="Or the receipt number" value={reference} onChangeText={setReference} maxLength={60} autoCapitalize="characters" inputStyle={{ backgroundColor: "#FFFFFF" }} /> : null}

      {err ? <Notice kind="bad">{err}</Notice> : null}
      <Button testID="transfer-submit" title={registered ? (choice === "transfer" ? "Send for checking" : "Ask for it unregistered") : "Confirm"} busy={busy} onPress={submit} />
    </Soft>
  );
}

/**
 * The seller's part once the buyer has paid in full (the website's dashboard block): lodge their part
 * with the state's transport authority, then tap "I've done this" (with an optional receipt number).
 */
export function SellerTransfer({ lotId, transfer, state, onDone }: { lotId: number; transfer: SellerTransferRow; state: string | null | undefined; onDone: () => void }) {
  const rules = rulesFor(transfer.rego_state || state);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function done() {
    setBusy(true); setErr("");
    try { await api("/api/transfers/seller", { body: { lotId, reference: ref } }); onDone(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  const body = { fontSize: 15, lineHeight: 21 };
  return (
    <Soft testID="seller-transfer" bg={C.sun} style={{ padding: 16, gap: 8 }}>
      <T v="strong">Paid in full. Next: transfer of ownership.</T>
      {transfer.registration === "registered" && transfer.buyer_choice === "unregistered" ? (
        <T v="body" style={body}>The buyer is taking it unregistered. Your consultant will call you about cancelling the registration with {rules.authority} (you may get a refund for the unused registration). Keep the plates.</T>
      ) : transfer.registration === "registered" ? (
        <>
          <T v="body" style={body}><Text style={{ fontFamily: F.bold }}>Your part: </Text>{rules.seller}</T>
          <LinkText testID="seller-transfer-link" title={`${rules.authority} ›`} onPress={() => openUrl(rules.sellerUrl)} color={C.blueInk} />
          {rules.cert ? <T v="small" style={{ color: C.ink2 }}>{rules.cert}</T> : null}
          {transfer.seller_done_at ? <Tag label={`Done${transfer.seller_reference ? ` · ${transfer.seller_reference}` : ""}`} color={C.mint} /> : (
            <View style={{ gap: 8 }}>
              <Field testID="seller-transfer-reference" label="Receipt or reference number (optional)" value={ref} onChangeText={setRef} maxLength={60} autoCapitalize="characters" inputStyle={{ backgroundColor: "#FFFFFF" }} />
              <Button testID="seller-transfer-done" small kind="dark" title="I've done this" busy={busy} onPress={done} style={{ alignSelf: "flex-start" }} />
              {err ? <Notice kind="bad">{err}</Notice> : null}
            </View>
          )}
          <T v="body" style={[body, { color: C.ink2 }]}>{transfer.status === "submitted" ? "The buyer has sent their transfer. We're checking it." : "Then the buyer transfers it into their name. We'll text you when it's done."}</T>
        </>
      ) : (
        <T v="body" style={body}>It's sold unregistered, so there's nothing for you to lodge. The buyer confirms their certificate of sale and how they'll move it.</T>
      )}
      <T v="small" style={{ color: C.ink2 }}>The buyer only gets your address once ownership is done and the collection time is confirmed.</T>
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
