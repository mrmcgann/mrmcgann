import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinWizard } from "./JoinWizard";

export const metadata: Metadata = { title: "Join free", description: "Join Super Trucker free to view and bid on trucks at live online auction. Verify once, then view by appointment and bid on any truck.", alternates: { canonical: "/join" } };

export default function JoinPage() {
  return <Suspense><JoinWizard /></Suspense>;
}
