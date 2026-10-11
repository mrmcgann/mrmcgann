import { CarArt, Tick } from "@/components/CarArt";

// [step number, title, detail] in the order they're done: the ID check comes before the bidding deposit (when deposits are on).
export const JSTEPS: [number, string, string][] = [
  [1, "Account", "Email and password"], [2, "Your details", "Name, date of birth, address"], [3, "Verify mobile", "6-digit SMS code"],
  [5, "Verify ID", "Driver licence or passport, and a selfie"], [4, "Bidding deposit", "Refundable, by PayID or bank transfer"],
];

const PERKS = ["Watchlist with ending-soon and outbid alerts", "Saved searches that ping you on a match", "Auto-bid up to your max, even while you sleep", "Track your own car's sale, bid by bid"];

export function AuthSide({ heading, step, done, steps, perks = PERKS, note = "Joining is free. Registering, watching and bidding cost nothing. Fees only apply to a vehicle you win." }: { heading: React.ReactNode; step?: number; done?: number[]; steps?: number[]; perks?: string[]; note?: string }) {
  return (
    <div className="side stage">
      <h2 className="d2" style={{ color: "#FFFFFF", fontSize: "clamp(40px,4.6vw,64px)", position: "relative" }}>{heading}</h2>
      {step ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          {JSTEPS.filter(([n]) => !steps || steps.includes(n)).map(([n, t, d], i) => {
            const cur = n === step, ok = done?.includes(n);
            return (
              <li key={t} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px", borderRadius: 18, background: cur ? "#FFFFFF" : "rgba(255,255,255,.12)", color: cur ? "#1D1D1F" : "#FFFFFF" }}>
                <span style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, background: ok ? "var(--mint)" : cur ? "var(--sun)" : "rgba(255,255,255,.2)", color: "#1D1D1F" }}>{ok ? <Tick /> : i + 1}</span>
                <span style={{ display: "flex", flexDirection: "column" }}><b>{t}</b><span style={{ fontSize: 13, opacity: 0.85 }}>{d}</span></span>
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          <CarArt />
          <div className="perks">{perks.map((p) => <div key={p}>{p}</div>)}</div>
        </>
      )}
      <p style={{ position: "relative", fontSize: 14, opacity: 0.9 }}>{note}</p>
    </div>
  );
}
