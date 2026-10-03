import { useState } from "react";
import { api, errText } from "~/lib/api";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import { Button, Field, Notice, Screen, Soft, T } from "~/ui/kit";

/** Business details for tax invoices, password and email (the website's AccountExtras). */
export default function Settings() {
  const { me, refresh } = useSession();
  const p = me?.profile;
  const [company, setCompany] = useState(p?.company_name || "");
  const [abn, setAbn] = useState(p?.abn || "");
  const [pw, setPw] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function saveBusiness() {
    try { await api("/api/account/business", { body: { company, abn } }); await refresh(); setMsg({ ok: true, text: "Business details saved. They'll appear on your tax invoices." }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }
  async function changePassword() {
    if (pw.length < 10) { setMsg({ ok: false, text: "Use at least 10 characters." }); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password changed." });
    if (!error) setPw("");
  }
  async function changeEmail() {
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Check ${email.trim()} (and ${me?.user?.email}) for a confirmation link.` });
  }
  return (
    <Screen keyboard>
      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
      <Soft>
        <T v="strong">Buying for a business?</T>
        <Field label="Company name" value={company} onChangeText={setCompany} inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Field label="ABN" value={abn} onChangeText={setAbn} keyboardType="number-pad" inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Button small kind="dark" title="Save business details" onPress={saveBusiness} style={{ alignSelf: "flex-start" }} />
      </Soft>
      <Soft>
        <T v="strong">Change password</T>
        <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="At least 10 characters." inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Button small kind="dark" title="Change password" onPress={changePassword} style={{ alignSelf: "flex-start" }} />
      </Soft>
      <Soft>
        <T v="strong">Change email</T>
        <Field label="New email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Button small kind="dark" title="Change email" onPress={changeEmail} style={{ alignSelf: "flex-start" }} />
      </Soft>
    </Screen>
  );
}
