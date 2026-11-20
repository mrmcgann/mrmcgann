import { useState } from "react";
import { View } from "react-native";
import { dateLong } from "@/lib/format";
import { NOTICE_DAYS } from "@/lib/appointment";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { downloadAndShare } from "~/lib/files";
import { Button, Check, LinkText, Notice, T } from "./kit";

export type SellerAppointmentView = {
  id: string; signed_at: string; countersigned_at: string | null; countersigned_name: string | null; copy_sent_at: string | null;
  ends_at: string | null; notice_at: string | null; notice_by: "seller" | "us" | null; has_form: boolean;
};

/** The seller's appointment of us (Queensland's Form 9), as the website's seller dashboard shows it: where it stands,
 *  their signed copy, and their right to end it with 30 days' written notice. */
export function SellerAppointment({ lotId, view, canEnd, onChange }: { lotId: number; view: SellerAppointmentView; canEnd: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ended = !!view.ends_at && new Date(view.ends_at).getTime() <= Date.now();
  const noticeEnd = dateLong(new Date(Date.now() + NOTICE_DAYS * 86400000).toISOString());

  async function give() {
    setBusy(true); setErr("");
    try {
      await api("/api/seller/appointment", { body: { lotId, confirm: sure } });
      setOpen(false); setSure(false); onChange();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  if (!view.has_form) return <T v="muted" testID="seller-appointment">You signed your agreement before appointments were on Queensland's form (Form 9). We'll send you a link to sign it again before anything is listed.</T>;
  return (
    <View style={{ gap: 6 }} testID="seller-appointment">
      <T v="body">
        <T v="strong">Your appointment of Super Trucker. </T>
        {!view.countersigned_at ? `You signed it on ${dateLong(view.signed_at)}. We'll countersign it and email you a signed copy.` : `Signed by you on ${dateLong(view.signed_at)} and by us on ${dateLong(view.countersigned_at)}.`}{" "}
        {ended ? `It ended on ${dateLong(view.ends_at)}.` : view.notice_at ? `It ends on ${dateLong(view.ends_at)}: ${view.notice_by === "us" ? "we" : "you"} gave notice on ${dateLong(view.notice_at)}.` : view.ends_at ? `It runs until ${dateLong(view.ends_at)}.` : ""}
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {view.countersigned_at ? <LinkText testID="seller-appointment-pdf" title="Your signed copy (PDF)" onPress={() => { downloadAndShare(`${SITE}/api/seller/appointment/${view.id}`, `appointment-${lotId}.pdf`).catch((e) => setErr(errText(e))); }} /> : null}
        {canEnd && !ended && !view.notice_at && !open ? <LinkText testID="seller-appointment-end" title={`End it with ${NOTICE_DAYS} days' notice`} onPress={() => setOpen(true)} /> : null}
      </View>
      {open ? (
        <Notice style={{ gap: 10 }}>
          <Check checked={sure} onChange={setSure} testID="seller-appointment-sure">
            <T v="body">I give Super Trucker written notice to end my appointment. It ends {NOTICE_DAYS} days from today, on {noticeEnd}, and carries on as agreed until then: if it's in an auction before that, it can still sell. To end it sooner, call us (section 8 of your agreement).</T>
          </Check>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button small kind="dark" title="Give notice" busy={busy} disabled={!sure} onPress={give} />
            <Button small kind="white" title="Cancel" onPress={() => { setOpen(false); setSure(false); }} />
          </View>
        </Notice>
      ) : null}
      {err ? <Notice kind="bad">{err}</Notice> : null}
    </View>
  );
}
