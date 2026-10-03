import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { C, F } from "./theme";

/**
 * A bidder's name, blurred (the website's BlurName). The text is a made-up, name-shaped
 * placeholder from the server, never the real name. React Native can't blur text, so the
 * letters are transparent and only their soft shadow shows: it reads as a blurred name on
 * iOS, Android and the web. Screen readers hear "Bidder (name hidden)".
 */
export function BlurName({ mask, style }: { mask: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessible accessibilityLabel="Bidder (name hidden)" numberOfLines={1} style={[s.blur, style]}>
      {mask}
    </Text>
  );
}

/** "· auto" after a blurred name, for bids placed by the bidder's maximum. */
export function AutoTag() {
  return <Text style={s.auto} numberOfLines={1}> · auto</Text>;
}

const s = StyleSheet.create({
  blur: {
    fontFamily: F.semibold, fontSize: 16, lineHeight: 23, paddingHorizontal: 4, // room for the blur, so it isn't clipped
    color: "transparent", textShadowColor: "rgba(29,29,31,0.55)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
  auto: { fontFamily: F.medium, fontSize: 13, color: C.muted, flexShrink: 0 },
});
