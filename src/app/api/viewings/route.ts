import { json } from "@/lib/api";
import { NO_VIEWING_TEXT } from "@/lib/viewings";

// Viewings are no longer offered (buyers never go to the seller's place). Older versions of the app still ask:
// GET says there's nothing to book, POST gives the reason.
export async function GET() {
  return json({ offered: false, viewings: [], message: NO_VIEWING_TEXT });
}

export async function POST() {
  return json({ error: NO_VIEWING_TEXT }, 410);
}
