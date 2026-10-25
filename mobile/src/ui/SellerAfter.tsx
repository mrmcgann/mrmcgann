import { useState } from "react";
import { View } from "react-native";
import { dateTime, money } from "@/lib/format";
import { sellerAfterIntro, type SellerAfterView } from "@/lib/afterAuction";
import { api, errText } from "~/lib/api";
import { Button, MoneyField, Notice, Sheet, T, digits } from "./kit";

/** Selling it now, before the next auction (migration 26), as the website's seller dashboard shows it: accept the
 *  highest bid or name the lowest price you'd take (the seller's written agreement), and change your mind until a
 *  buyer signs. Buyers are never named. */
export function SellerAfter({ lotId, view, onChange }: { lotId: number; view: SellerAfterView; onChange: () => void }) {
  const [amount, setAmount] = useState("");
  const [ask, setAsk] = useState<{ action: "accept" | "withdraw"; value?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const o = view.offer;
  const signed = o?.status === "cooling_off";
  const waiting = o?.status === "pending" && new Date(o.expires_at).getTime() > Date.now();
  const nobody = view.interested === 0 && view.price == null;

  async function send() {
    if (!ask) return;
    setBusy(true); setErr("");
    try {
      await api("/api/seller/after", { body: { lotId, action: ask.action, amount: ask.value } });
      setAsk(null); setAmount(""); onChange();
    } catch (e) { setErr(errText(e)); setAsk(null); }
    setBusy(false);
  }

  return (
    <Notice testID="seller-after" style={{ gap: 8 }}>
      <T v="strong">Sell it now, before the next auction.</T>
      {signed && o ? <T v="body" testID="seller-after-signed">A buyer has signed to buy it for {money(o.amount)}. The law gives them until {dateTime(o.cooling_off_until)} (Brisbane time) to change their mind, so it isn't final yet. We'll text you as soon as it is.</T> : null}
      {!signed && waiting && o ? <T v="body" testID="seller-after-offered">We've offered it to a buyer for {money(o.amount)}, open until {dateTime(o.expires_at)} (Brisbane time).</T> : null}
      {!signed && view.price != null ? (
        <T v="body" testID="seller-after-price">You'll sell it for {money(view.price)} or more ({view.price_via === "admin" ? "you told your consultant" : "from your dashboard"}, {dateTime(view.price_at)}). Your consultant offers it to a buyer at that price; if nobody takes it, it goes into the next auction.</T>
      ) : null}
      {!signed && view.open ? (
        <>
          {view.price == null ? <T v="body" testID="seller-after-intro">{sellerAfterIntro(view)}</T> : null}
          {!nobody ? (
            <View style={{ gap: 8 }}>
              {view.highest != null && view.price == null ? (
                <Button small testID="seller-after-accept" title={`Accept the highest ${view.not_offered ? "early " : ""}bid: ${money(view.highest)}`} onPress={() => setAsk({ action: "accept", value: Number(view.highest) })} />
              ) : null}
              <MoneyField testID="seller-after-amount" label={view.price != null ? "A different price" : view.highest != null ? "Or the lowest price you'd take" : "The lowest price you'd take"} value={amount} onChange={setAmount} />
              <Button small kind="white" testID="seller-after-name" title="Tell my consultant" disabled={!digits(amount)} onPress={() => setAsk({ action: "accept", value: digits(amount) })} />
            </View>
          ) : null}
        </>
      ) : null}
      {!signed && view.price != null ? <Button small kind="white" testID="seller-after-withdraw" title="I've changed my mind" onPress={() => setAsk({ action: "withdraw" })} style={{ alignSelf: "flex-start" }} /> : null}
      {err ? <Notice kind="bad">{err}</Notice> : null}
      <Sheet visible={!!ask} onClose={() => setAsk(null)} title={ask?.action === "withdraw" ? "Change your mind?" : `Sell it for ${money(ask?.value ?? 0)} or more?`}
        footer={<><Button testID="seller-after-confirm" title={ask?.action === "withdraw" ? "Yes, change my mind" : "Yes, tell my consultant"} busy={busy} onPress={send} /><Button kind="soft" title="Cancel" onPress={() => setAsk(null)} /></>}>
        <T v="muted">{ask?.action === "withdraw" ? "Any offer still waiting for an answer is withdrawn." : "This is your written agreement to sell at that price or more. We'll offer it to a buyer at that price, and nothing is sold until they sign."}</T>
      </Sheet>
    </Notice>
  );
}
