import { ImageResponse } from "next/og";
import { RING } from "@/components/Logo";

// The picture shown when the site is shared (vehicle pages use the vehicle's own photo).
export const alt = "Tyrebiter: car and truck auctions Australia-wide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 26 26">
            {RING.map((c, i) => <circle key={i} cx="13" cy="13" r="10" fill="none" stroke={c} strokeWidth="5" strokeDasharray="9.47 53.36" strokeDashoffset={-10.47 * i} />)}
          </svg>
          <span style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.04em", color: "#111111" }}>tyrebiter</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.02, color: "#111111" }}>Car, ute and truck auctions, Australia-wide.</span>
          <span style={{ fontSize: 34, color: "#555555" }}>Checked against the vehicle. PPSR searched. All-in prices shown.</span>
        </div>
      </div>
    ),
    size,
  );
}
