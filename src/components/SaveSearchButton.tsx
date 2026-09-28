"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/components/Viewer";

export function SaveSearchButton({ query, label }: { query: { [k: string]: string | undefined }; label: string }) {
  const signedIn = !!useViewer().user;
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const router = useRouter();
  async function save() {
    if (!signedIn) { router.push("/signin?next=/auctions"); return; }
    setState("saving");
    const res = await fetch("/api/saved-searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, query }) });
    setState(res.ok ? "saved" : "idle");
  }
  return (
    <button className="pill" onClick={save} disabled={state !== "idle"} style={{ background: "var(--blue)", color: "#FFFFFF" }}>
      {state === "saved" ? "Saved. We’ll alert you to new matches" : state === "saving" ? "Saving…" : "Save this search"}
    </button>
  );
}
