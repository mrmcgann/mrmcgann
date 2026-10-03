import { appPath } from "~/lib/links";

// Universal links (https://tyrebiter.com.au/lot/10432) and tyrebiter:// links open
// the matching screen. Website-only pages open the home screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/stripe-redirect/.test(path)) return "/"; // returning from a card check
    return appPath(path);
  } catch {
    return "/";
  }
}
