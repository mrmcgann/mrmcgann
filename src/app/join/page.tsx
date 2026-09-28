import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinWizard } from "./JoinWizard";

export const metadata: Metadata = { title: "Join free" };

export default function JoinPage() {
  return <Suspense><JoinWizard /></Suspense>;
}
