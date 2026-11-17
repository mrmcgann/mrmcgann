import type { Metadata } from "next";
import { ValueTool } from "./ValueTool";

export const metadata: Metadata = {
  title: "What's my truck worth? Free valuation from real sale prices",
  description: "See what trucks like yours actually sold for on Super Trucker: real auction results, not asking prices. Free, no sign-up.",
  alternates: { canonical: "/value" },
};

// A free "what's it worth" check from our own sale results (the same numbers the sell form uses).
export default function Value() {
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 className="d2">What&apos;s it worth?</h1>
      <p className="lede" style={{ margin: 0 }}>What trucks like yours actually sold for on Super Trucker: real auction results from the last 18 months, not asking prices. Free, and you don&apos;t need to sign up.</p>
      <ValueTool />
    </div>
  );
}
