import { View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect, G } from "react-native-svg";
import { C } from "./theme";

const BODY = "#1D1D1F";
const GLASS = "rgba(255,255,255,0.24)";

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={BODY} />
      <Circle cx={x} cy={y} r={r * 0.64} fill="none" stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={x} cy={y} r={r * 0.24} fill="#FFFFFF" />
    </G>
  );
}
const Shadow = ({ rx = 136 }: { rx?: number }) => <Ellipse cx={150} cy={100} rx={rx} ry={6} fill="rgba(0,0,0,0.18)" />;

/** The website's vehicle silhouettes (src/components/CarArt.tsx), used until photos are up. */
export function CarArt({ type = "car", width = 240, flip }: { type?: string | null; width?: number; flip?: boolean }) {
  let body: React.ReactNode;
  switch (type) {
    case "truck":
      body = (<>
        <Ellipse cx={150} cy={101} rx={140} ry={6} fill="rgba(0,0,0,0.18)" />
        <Path d="M20 34C20 30 24 26 30 26L80 26C88 26 94 32 94 40L94 88L20 88Z" fill={BODY} />
        <Path d="M30 34L80 34L85 56L30 56Z" fill={GLASS} />
        <Path d="M100 40L288 40L288 80L100 80Z" fill={BODY} />
        <Path d="M96 86L292 86" stroke={BODY} strokeWidth={5} />
        <Wheel x={58} y={88} r={15} /><Wheel x={224} y={88} r={15} /><Wheel x={260} y={88} r={15} />
      </>); break;
    case "ute":
      body = (<>
        <Ellipse cx={152} cy={99} rx={136} ry={6} fill="rgba(0,0,0,0.18)" />
        <Path d="M18 78C18 66 24 60 40 57L80 52C96 36 112 26 134 24L162 24C174 24 180 30 182 40L184 50L286 50L286 82L18 82Z" fill={BODY} />
        <Path d="M98 50C110 38 122 32 136 31L166 31L170 50Z" fill={GLASS} />
        <Path d="M190 50L190 44L286 44L286 50" fill="none" stroke={BODY} strokeWidth={3} />
        <Wheel x={72} y={82} r={17} /><Wheel x={236} y={82} r={17} />
      </>); break;
    case "van":
      body = (<>
        <Shadow />
        <Path d="M18 82L18 66C18 60 22 56 28 54L58 46L80 22C84 18 88 16 96 16L272 16C280 16 286 22 286 30L286 82Z" fill={BODY} />
        <Path d="M66 46L86 24L110 24L110 46Z" fill={GLASS} /><Path d="M118 24L160 24L160 46L118 46Z" fill={GLASS} />
        <Path d="M168 20L168 80" stroke={GLASS} strokeWidth={2} />
        <Wheel x={70} y={82} r={17} /><Wheel x={238} y={82} r={17} />
      </>); break;
    case "bus":
      body = (<>
        <Shadow rx={142} />
        <Path d="M12 84L12 26C12 18 18 14 26 14L276 14C284 14 290 20 290 28L290 84Z" fill={BODY} />
        {[30, 74, 118, 162, 206].map((x) => <Rect key={x} x={x} y={24} width={36} height={24} rx={4} fill={GLASS} />)}
        <Path d="M250 24L276 24C280 24 282 27 282 31L282 48L250 48Z" fill={GLASS} />
        <Rect x={250} y={54} width={20} height={28} rx={3} fill={GLASS} />
        <Wheel x={66} y={86} r={15} /><Wheel x={232} y={86} r={15} />
      </>); break;
    case "bike":
      body = (<>
        <Ellipse cx={150} cy={101} rx={118} ry={5} fill="rgba(0,0,0,0.18)" />
        <Path d="M72 76L128 70" stroke={BODY} strokeWidth={9} strokeLinecap="round" />
        <Path d="M214 30L232 76" stroke={BODY} strokeWidth={8} strokeLinecap="round" />
        <Path d="M204 26L224 20" stroke={BODY} strokeWidth={6} strokeLinecap="round" />
        <Path d="M118 46C126 32 164 28 184 36L196 46L170 56L124 58Z" fill={BODY} />
        <Path d="M84 44L128 40L124 54L90 56Z" fill={BODY} />
        <Path d="M126 58L176 56L170 80L134 80Z" fill={BODY} />
        <Path d="M136 30C150 26 168 26 180 32" fill="none" stroke={GLASS} strokeWidth={4} strokeLinecap="round" />
        <Wheel x={72} y={76} r={24} /><Wheel x={232} y={76} r={24} />
      </>); break;
    case "caravan":
      body = (<>
        <Shadow rx={128} />
        <Path d="M8 82L46 76" stroke={BODY} strokeWidth={5} strokeLinecap="round" />
        <Circle cx={16} cy={90} r={5} fill={BODY} />
        <Path d="M46 80L46 30C46 20 54 14 64 14L246 14C266 14 280 30 280 50L280 80Z" fill={BODY} />
        <Rect x={66} y={28} width={56} height={26} rx={6} fill={GLASS} /><Rect x={196} y={28} width={56} height={26} rx={6} fill={GLASS} />
        <Rect x={140} y={28} width={30} height={50} rx={4} fill={GLASS} />
        <Wheel x={170} y={84} r={15} /><Wheel x={204} y={84} r={15} />
      </>); break;
    case "boat":
      body = (<>
        <Ellipse cx={150} cy={102} rx={138} ry={5} fill="rgba(0,0,0,0.14)" />
        <Path d="M14 54L288 48L266 84C262 90 256 92 248 92L62 92C46 92 32 80 14 54Z" fill={BODY} />
        <Path d="M118 50L142 24L206 24L214 48Z" fill={BODY} />
        <Path d="M146 30L184 30L184 44L134 46Z" fill={GLASS} />
        <Path d="M6 44L22 44L24 82L14 86Z" fill={BODY} />
        <Path d="M40 66L270 62" stroke={GLASS} strokeWidth={3} />
      </>); break;
    case "trailer":
      body = (<>
        <Shadow rx={124} />
        <Path d="M14 82L60 70" stroke={BODY} strokeWidth={6} strokeLinecap="round" />
        <Circle cx={16} cy={84} r={5} fill={BODY} />
        <Path d="M58 42L278 42L278 76L58 76Z" fill={BODY} />
        <Path d="M66 50L270 50" stroke={GLASS} strokeWidth={3} />
        <Path d="M150 74C150 60 164 52 178 52C192 52 206 60 206 74" fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={3} />
        <Wheel x={178} y={82} r={17} />
      </>); break;
    case "tractor":
      body = (<>
        <Shadow rx={128} />
        <Path d="M60 50L170 50L170 76L60 76Z" fill={BODY} />
        <Path d="M104 50L104 22" stroke={BODY} strokeWidth={6} strokeLinecap="round" />
        <Path d="M166 14L236 14L244 64L166 64Z" fill={BODY} />
        <Path d="M176 22L228 22L234 50L176 50Z" fill={GLASS} />
        <Path d="M40 72L64 64" stroke={BODY} strokeWidth={5} strokeLinecap="round" />
        <Wheel x={84} y={80} r={18} /><Wheel x={222} y={72} r={28} />
      </>); break;
    default:
      body = (<>
        <Ellipse cx={152} cy={99} rx={136} ry={6} fill="rgba(0,0,0,0.18)" />
        <Path d="M18 78C18 66 24 60 40 57L86 50C104 34 124 24 150 22L186 22C208 23 226 34 242 48L270 54C282 57 286 64 286 74L286 82L18 82Z" fill={BODY} />
        <Path d="M100 50C114 38 128 31 150 30L168 30L168 50Z M176 30L186 30C204 31 218 40 230 50L176 50Z" fill={GLASS} />
        <Wheel x={80} y={82} r={17} /><Wheel x={228} y={82} r={17} />
      </>);
  }
  return (
    <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={(width * 110) / 300} viewBox="0 0 300 110">{body}</Svg>
    </View>
  );
}

/** The six-colour ring logo. */
export function LogoMark({ size = 26 }: { size?: number }) {
  const c = ["#FF7A2F", "#FFC93C", "#B8E62E", "#33C4F2", "#7A42E0", "#FF4F79"];
  return (
    <Svg width={size} height={size} viewBox="0 0 26 26">
      {c.map((x, i) => <Circle key={x} cx={13} cy={13} r={10} fill="none" stroke={x} strokeWidth={5} strokeDasharray="9.47 53.36" strokeDashoffset={-10.47 * i} />)}
    </Svg>
  );
}

// ---------- icons (24 × 24, stroke) ----------
type IconName = "home" | "search" | "heart" | "heartOn" | "tag" | "user" | "bell" | "filter" | "close" | "back" | "share" | "pin" | "clock" | "check" | "doc" | "camera";
const ICON: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  heartOn: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  filter: "M4 6h16M7 12h10M10 18h4",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 18l-6-6 6-6",
  share: "M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  check: "M5 12l5 5 9-10",
  doc: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M8 13h8M8 17h6",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
};
export function Icon({ name, size = 22, color = C.ink, strokeWidth = 2, style }: { name: IconName; size?: number; color?: ColorValue; strokeWidth?: number; style?: StyleProp<ViewStyle> }) {
  const on = name === "heartOn";
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={ICON[name]} stroke={on ? "#E0305C" : color} fill={on ? "#FF4F79" : "none"} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
