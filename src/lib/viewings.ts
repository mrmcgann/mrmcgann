// Viewings are no longer offered: buyers never go to the seller's place, by appointment or otherwise, and there are no
// video calls. How buyers check a vehicle instead (our condition report, the walkaround video, a mechanical inspection
// through our partner, questions) is in transport.ts. The database refuses any request (request_viewing raises
// viewing_not_offered). This file keeps the words for that refusal. Pure: website, server and phone app.

export const NO_VIEWING_TEXT = "We don't offer viewings or video calls. The listing has our condition report, photos and the walkaround video; you can also order a mechanical inspection or ask us anything.";

/** Plain words for the database's viewing refusals (null when it isn't one of them). */
export function viewingError(m: string): string | null {
  if (m.includes("viewing_not_found")) return "We couldn't find that booking.";
  if (/\bviewing_[a-z_]+/.test(m)) return NO_VIEWING_TEXT;
  return null;
}
