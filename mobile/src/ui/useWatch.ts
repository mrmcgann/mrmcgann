import { useCallback } from "react";
import { router, usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSession } from "~/lib/session";
import { askForPush } from "~/lib/push";
import { getPref, setPref } from "~/lib/storage";

/** The watch heart: signs people up first if needed, and offers alerts the first time. */
export function useWatch() {
  const { signedIn, watched, toggleWatch } = useSession();
  const path = usePathname();
  const toggle = useCallback(async (lotId: number) => {
    if (!signedIn) { router.push(`/join?next=${encodeURIComponent(path || "/")}`); return; }
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => undefined);
    const on = await toggleWatch(lotId);
    if (on && !(await getPref("watchAsked", false))) {
      await setPref("watchAsked", true);
      void askForPush(); // "Tyrebiter would like to send you notifications" – in context: they just started watching
    }
  }, [signedIn, toggleWatch, path]);
  return { watched, toggle };
}
