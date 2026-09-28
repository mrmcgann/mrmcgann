function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="#1D1D1F" />
      <circle cx={x} cy={y} r={r * 0.64} fill="none" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx={x} cy={y} r={r * 0.24} fill="#FFFFFF" />
    </>
  );
}

// Brand silhouette used when a lot has no photos yet.
export function CarArt({ type = "car", flip = false, style }: { type?: string; flip?: boolean; style?: React.CSSProperties }) {
  return (
    <svg className={"car" + (flip ? " flip" : "")} viewBox="0 0 300 110" aria-hidden="true" style={style}>
      {type === "truck" ? (
        <>
          <ellipse cx="150" cy="101" rx="140" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M20 34C20 30 24 26 30 26L80 26C88 26 94 32 94 40L94 88L20 88Z" fill="#1D1D1F" />
          <path d="M30 34L80 34L85 56L30 56Z" fill="rgba(255,255,255,0.24)" />
          <path d="M100 40L288 40L288 80L100 80Z" fill="#1D1D1F" />
          <path d="M96 86L292 86" stroke="#1D1D1F" strokeWidth="5" />
          <Wheel x={58} y={88} r={15} /><Wheel x={224} y={88} r={15} /><Wheel x={260} y={88} r={15} />
        </>
      ) : type === "ute" ? (
        <>
          <ellipse cx="152" cy="99" rx="136" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M18 78C18 66 24 60 40 57L80 52C96 36 112 26 134 24L162 24C174 24 180 30 182 40L184 50L286 50L286 82L18 82Z" fill="#1D1D1F" />
          <path d="M98 50C110 38 122 32 136 31L166 31L170 50Z" fill="rgba(255,255,255,0.24)" />
          <path d="M190 50L190 44L286 44L286 50" fill="none" stroke="#1D1D1F" strokeWidth="3" />
          <Wheel x={72} y={82} r={17} /><Wheel x={236} y={82} r={17} />
        </>
      ) : (
        <>
          <ellipse cx="152" cy="99" rx="136" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M18 78C18 66 24 60 40 57L86 50C104 34 124 24 150 22L186 22C208 23 226 34 242 48L270 54C282 57 286 64 286 74L286 82L18 82Z" fill="#1D1D1F" />
          <path d="M100 50C114 38 128 31 150 30L168 30L168 50Z M176 30L186 30C204 31 218 40 230 50L176 50Z" fill="rgba(255,255,255,0.24)" />
          <Wheel x={80} y={82} r={17} /><Wheel x={228} y={82} r={17} />
        </>
      )}
    </svg>
  );
}

export function HeartIcon({ on, size = 20 }: { on?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "#FF4F79" : "none"} stroke={on ? "#E0305C" : "#1D1D1F"} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}

export function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
