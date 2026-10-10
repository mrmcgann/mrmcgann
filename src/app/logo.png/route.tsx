import { ImageResponse } from "next/og";
import { RING } from "@/components/Logo";

// The logo as a square PNG, for search engines (Organization logo) and link previews.
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF" }}>
        <svg width="400" height="400" viewBox="0 0 26 26">
          {RING.map((c, i) => <circle key={i} cx="13" cy="13" r="10" fill="none" stroke={c} strokeWidth="5" strokeDasharray="9.47 53.36" strokeDashoffset={-10.47 * i} />)}
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
