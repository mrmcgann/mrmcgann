"use client";
import { useEffect } from "react";
import Link from "next/link";
import { sendErrorReport } from "@/components/ErrorReporter";

// Shown when a page breaks. The error is reported to Admin → Site health (server errors are already recorded on
// the server, so only ones that happened in the browser are sent from here).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error.digest) sendErrorReport({ name: error.name, message: error.message, stack: error.stack, kind: "page" });
  }, [error]);
  return (
    <div className="wrap">
      <div className="center hero" style={{ gap: 18 }}>
        <h1 className="d2">Something went wrong on our side.</h1>
        <p className="lede" style={{ margin: 0 }}>We&apos;ve been told about it. Try again, and if it keeps happening, call us or come back shortly.</p>
        {error.digest && <p className="hint" style={{ margin: 0 }}>Reference: {error.digest}</p>}
        <div className="pill-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-blue" onClick={() => reset()}>Try again</button>
          <Link className="btn btn-soft" href="/">Go to the home page</Link>
        </div>
      </div>
    </div>
  );
}
