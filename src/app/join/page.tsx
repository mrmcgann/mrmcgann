import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinWizard } from "./JoinWizard";

export const metadata: Metadata = { title: "Join free", description: "Join Tyrebiter free to bid on cars, utes, trucks and more at online auction across Australia. Verify once, then bid on any vehicle.", alternates: { canonical: "/join" } };

export default function JoinPage() {
  return <Suspense><JoinWizard /></Suspense>;
}
