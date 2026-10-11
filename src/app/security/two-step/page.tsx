import type { Metadata } from "next";
import { Suspense } from "react";
import { TwoStep } from "./TwoStep";
export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";
export default function Page() { return <Suspense><TwoStep /></Suspense>; }
