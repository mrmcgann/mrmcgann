import Link from "next/link";

const RING = ["#FF7A2F", "#FFC93C", "#B8E62E", "#33C4F2", "#7A42E0", "#FF4F79"];

export function LogoMark({ size = 26, ringOverride }: { size?: number; ringOverride?: string[] }) {
  const colours = ringOverride || RING;
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      {colours.map((c, i) => (
        <circle key={i} cx="13" cy="13" r="10" fill="none" stroke={c} strokeWidth="5" strokeDasharray="9.47 53.36" strokeDashoffset={-10.47 * i} />
      ))}
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link className="logo" href="/" aria-label="Tyrebiter home" style={light ? { color: "#FFFFFF" } : undefined}>
      <LogoMark />
      tyrebiter
    </Link>
  );
}
