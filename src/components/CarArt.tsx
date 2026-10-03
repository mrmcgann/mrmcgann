function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="#1D1D1F" />
      <circle cx={x} cy={y} r={r * 0.64} fill="none" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx={x} cy={y} r={r * 0.24} fill="#FFFFFF" />
    </>
  );
}

const BODY = "#1D1D1F";
const GLASS = "rgba(255,255,255,0.24)";
const Shadow = ({ rx = 136 }: { rx?: number }) => <ellipse cx="150" cy="100" rx={rx} ry="6" fill="rgba(0,0,0,0.18)" />;

// Brand silhouettes used when a lot has no photos yet: one for every kind of vehicle.
export function CarArt({ type = "car", flip = false, style }: { type?: string; flip?: boolean; style?: React.CSSProperties }) {
  return (
    <svg className={"car" + (flip ? " flip" : "")} viewBox="0 0 300 110" aria-hidden="true" style={style}>
      {type === "truck" ? (
        <>
          <ellipse cx="150" cy="101" rx="140" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M20 34C20 30 24 26 30 26L80 26C88 26 94 32 94 40L94 88L20 88Z" fill={BODY} />
          <path d="M30 34L80 34L85 56L30 56Z" fill={GLASS} />
          <path d="M100 40L288 40L288 80L100 80Z" fill={BODY} />
          <path d="M96 86L292 86" stroke={BODY} strokeWidth="5" />
          <Wheel x={58} y={88} r={15} /><Wheel x={224} y={88} r={15} /><Wheel x={260} y={88} r={15} />
        </>
      ) : type === "ute" ? (
        <>
          <ellipse cx="152" cy="99" rx="136" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M18 78C18 66 24 60 40 57L80 52C96 36 112 26 134 24L162 24C174 24 180 30 182 40L184 50L286 50L286 82L18 82Z" fill={BODY} />
          <path d="M98 50C110 38 122 32 136 31L166 31L170 50Z" fill={GLASS} />
          <path d="M190 50L190 44L286 44L286 50" fill="none" stroke={BODY} strokeWidth="3" />
          <Wheel x={72} y={82} r={17} /><Wheel x={236} y={82} r={17} />
        </>
      ) : type === "van" ? (
        <>
          <Shadow />
          <path d="M18 82L18 66C18 60 22 56 28 54L58 46L80 22C84 18 88 16 96 16L272 16C280 16 286 22 286 30L286 82Z" fill={BODY} />
          <path d="M66 46L86 24L110 24L110 46Z" fill={GLASS} /><path d="M118 24L160 24L160 46L118 46Z" fill={GLASS} />
          <path d="M168 20L168 80" stroke={GLASS} strokeWidth="2" />
          <Wheel x={70} y={82} r={17} /><Wheel x={238} y={82} r={17} />
        </>
      ) : type === "bus" ? (
        <>
          <Shadow rx={142} />
          <path d="M12 84L12 26C12 18 18 14 26 14L276 14C284 14 290 20 290 28L290 84Z" fill={BODY} />
          {[30, 74, 118, 162, 206].map((x) => <rect key={x} x={x} y="24" width="36" height="24" rx="4" fill={GLASS} />)}
          <path d="M250 24L276 24C280 24 282 27 282 31L282 48L250 48Z" fill={GLASS} />
          <rect x="250" y="54" width="20" height="28" rx="3" fill={GLASS} />
          <Wheel x={66} y={86} r={15} /><Wheel x={232} y={86} r={15} />
        </>
      ) : type === "bike" ? (
        <>
          <ellipse cx="150" cy="101" rx="118" ry="5" fill="rgba(0,0,0,0.18)" />
          <path d="M72 76L128 70" stroke={BODY} strokeWidth="9" strokeLinecap="round" />
          <path d="M214 30L232 76" stroke={BODY} strokeWidth="8" strokeLinecap="round" />
          <path d="M204 26L224 20" stroke={BODY} strokeWidth="6" strokeLinecap="round" />
          <path d="M118 46C126 32 164 28 184 36L196 46L170 56L124 58Z" fill={BODY} />
          <path d="M84 44L128 40L124 54L90 56Z" fill={BODY} />
          <path d="M126 58L176 56L170 80L134 80Z" fill={BODY} />
          <path d="M136 30C150 26 168 26 180 32" fill="none" stroke={GLASS} strokeWidth="4" strokeLinecap="round" />
          <Wheel x={72} y={76} r={24} /><Wheel x={232} y={76} r={24} />
        </>
      ) : type === "caravan" ? (
        <>
          <Shadow rx={128} />
          <path d="M8 82L46 76" stroke={BODY} strokeWidth="5" strokeLinecap="round" />
          <circle cx="16" cy="90" r="5" fill={BODY} />
          <path d="M46 80L46 30C46 20 54 14 64 14L246 14C266 14 280 30 280 50L280 80Z" fill={BODY} />
          <rect x="66" y="28" width="56" height="26" rx="6" fill={GLASS} /><rect x="196" y="28" width="56" height="26" rx="6" fill={GLASS} />
          <rect x="140" y="28" width="30" height="50" rx="4" fill={GLASS} />
          <Wheel x={170} y={84} r={15} /><Wheel x={204} y={84} r={15} />
        </>
      ) : type === "boat" ? (
        <>
          <ellipse cx="150" cy="102" rx="138" ry="5" fill="rgba(0,0,0,0.14)" />
          <path d="M14 54L288 48L266 84C262 90 256 92 248 92L62 92C46 92 32 80 14 54Z" fill={BODY} />
          <path d="M118 50L142 24L206 24L214 48Z" fill={BODY} />
          <path d="M146 30L184 30L184 44L134 46Z" fill={GLASS} />
          <path d="M6 44L22 44L24 82L14 86Z" fill={BODY} />
          <path d="M40 66L270 62" stroke={GLASS} strokeWidth="3" />
        </>
      ) : type === "trailer" ? (
        <>
          <Shadow rx={124} />
          <path d="M14 82L60 70" stroke={BODY} strokeWidth="6" strokeLinecap="round" />
          <circle cx="16" cy="84" r="5" fill={BODY} />
          <path d="M58 42L278 42L278 76L58 76Z" fill={BODY} />
          <path d="M66 50L270 50" stroke={GLASS} strokeWidth="3" />
          <path d="M150 74C150 60 164 52 178 52C192 52 206 60 206 74" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="3" />
          <Wheel x={178} y={82} r={17} />
        </>
      ) : type === "tractor" ? (
        <>
          <Shadow rx={128} />
          <path d="M60 50L170 50L170 76L60 76Z" fill={BODY} />
          <path d="M104 50L104 22" stroke={BODY} strokeWidth="6" strokeLinecap="round" />
          <path d="M166 14L236 14L244 64L166 64Z" fill={BODY} />
          <path d="M176 22L228 22L234 50L176 50Z" fill={GLASS} />
          <path d="M40 72L64 64" stroke={BODY} strokeWidth="5" strokeLinecap="round" />
          <Wheel x={84} y={80} r={18} /><Wheel x={222} y={72} r={28} />
        </>
      ) : (
        <>
          <ellipse cx="152" cy="99" rx="136" ry="6" fill="rgba(0,0,0,0.18)" />
          <path d="M18 78C18 66 24 60 40 57L86 50C104 34 124 24 150 22L186 22C208 23 226 34 242 48L270 54C282 57 286 64 286 74L286 82L18 82Z" fill={BODY} />
          <path d="M100 50C114 38 128 31 150 30L168 30L168 50Z M176 30L186 30C204 31 218 40 230 50L176 50Z" fill={GLASS} />
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
