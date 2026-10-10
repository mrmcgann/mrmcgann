"use client";
import { useEffect } from "react";
import { sendErrorReport } from "@/components/ErrorReporter";

// The last-resort page when the site's frame itself breaks (it replaces the whole layout, so it's self-contained).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) sendErrorReport({ name: error.name, message: error.message, stack: error.stack, kind: "layout" });
  }, [error]);
  return (
    <html lang="en-AU">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#FFFFFF", color: "#1D1D1F" }}>
        <div style={{ maxWidth: 560, margin: "15vh auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 34, margin: 0 }}>Something went wrong on our side.</h1>
          <p style={{ fontSize: 18, color: "#6E6E73", margin: 0 }}>We&apos;ve been told about it. Please try again in a moment.</p>
          {error.digest && <p style={{ fontSize: 13, color: "#6E6E73", margin: 0 }}>Reference: {error.digest}</p>}
          <div><button onClick={() => reset()} style={{ font: "inherit", fontWeight: 700, padding: "12px 22px", borderRadius: 999, border: 0, background: "#2F5BFF", color: "#FFFFFF", cursor: "pointer" }}>Try again</button></div>
        </div>
      </body>
    </html>
  );
}
