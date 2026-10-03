import { useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import { Button, Field, LinkText, Notice, Screen, T } from "~/ui/kit";
import { C, F } from "~/ui/theme";

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setErr("");
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr(error.message.includes("Invalid") ? "That email and password don't match." : error.message.includes("confirm") ? "Confirm your email first: check your inbox for the code." : error.message); return; }
    await refresh();
    if (next) router.replace(next as never); else if (router.canGoBack()) router.back(); else router.replace("/");
  }
  return (
    <Screen keyboard testID="signin">
      <T v="d3">Welcome back.</T>
      <T v="muted">New here? <Text style={{ color: C.blue, fontFamily: F.bold }} onPress={() => router.replace(`/join${next ? `?next=${encodeURIComponent(next)}` : ""}`)}>Join free ›</Text></T>
      <Field testID="signin-email" label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="username" />
      <Field testID="signin-password" label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
      {err ? <Notice kind="bad">{err}</Notice> : null}
      <Button testID="signin-submit" title="Sign in" busy={busy} onPress={submit} />
      <LinkText title="Forgot your password?" style={{ alignSelf: "center" }} onPress={() => router.push("/forgot")} />
    </Screen>
  );
}
