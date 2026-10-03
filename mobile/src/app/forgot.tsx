import { useState } from "react";
import { SITE } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { Button, Field, Notice, Screen, T } from "~/ui/kit";

// Sends the same reset email as the website; the link opens the website's reset page.
export default function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${SITE}/auth/callback?next=/reset` }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }
  return (
    <Screen keyboard>
      <T v="d3">Reset your password.</T>
      <T v="muted">We'll email you a link to choose a new password.</T>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {sent ? <Notice kind="ok">If there's an account for that email, the link is on its way. Check your inbox.</Notice> : null}
      <Button title="Send reset link" busy={busy} onPress={submit} />
    </Screen>
  );
}
