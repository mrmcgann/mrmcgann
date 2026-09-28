import { CarArt, Tick } from "@/components/CarArt";

export const JSTEPS: [string, string][] = [
  ["Account", "Email and password"], ["Your details", "Name, date of birth, address"], ["Verify mobile", "6-digit SMS code"],
  ["Payment card", "Charged automatically if you win"], ["Verify ID", "Driver licence or passport"],
];

export function AuthSide({ heading, step, done }: { heading: React.ReactNode; step?: number; done?: number[] }) {
  return (
    <div className="side stage">
      <h2 className="d2" style={{ color: "#FFFFFF", fontSize: "clamp(40px,4.6vw,64px)", position: "relative" }}>{heading}</h2>
      {step ? (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          {JSTEPS.map(([t, d], i) => {
            const n = i + 1, cur = n === step, ok = done?.includes(n);
            return (
              <li key={t} style={{ display: "flex", gap: 14, alignItems: "center", padding: "12px 16px", borderRadius: 18, background: cur ? "#FFFFFF" : "rgba(255,255,255,.12)", color: cur ? "#1D1D1F" : "#FFFFFF" }}>
                <span style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, background: ok ? "var(--mint)" : cur ? "var(--sun)" : "rgba(255,255,255,.2)", color: "#1D1D1F" }}>{ok ? <Tick /> : n}</span>
                <span style={{ display: "flex", flexDirection: "column" }}><b>{t}</b><span style={{ fontSize: 13, opacity: 0.85 }}>{d}</span></span>
              </li>
            );
          })}
        </ol>
      ) : (
        <>
          <CarArt />
          <div className="perks"><div>Watchlist with ending-soon and outbid alerts</div><div>Saved searches that ping you on a match</div><div>Auto-bid up to your max, even while you sleep</div><div>Track your own car&apos;s sale, bid by bid</div></div>
        </>
      )}
      <p style={{ position: "relative", fontSize: 14, opacity: 0.9 }}>Joining is free. Registering, watching and bidding cost nothing. Fees only apply to a vehicle you win.</p>
    </div>
  );
}
