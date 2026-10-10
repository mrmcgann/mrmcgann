import { getSession } from "@/lib/auth";
import { fail } from "@/lib/api";
import { ask } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// "Ask Claude" in Admin → Site health. Answers as a stream of lines (one JSON event each) so the panel can show
// what Claude is looking at while it works.
export async function POST(req: Request) {
  const { user, profile } = await getSession();
  if (!user || profile?.role !== "admin") return fail("Admins only.", 403);
  const b = await req.json().catch(() => ({}));
  const history = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m: { role?: string; text?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .map((m: { role: "user" | "assistant"; text: string }) => ({ role: m.role, text: m.text }));
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of ask(history, { errorId: Number(b.errorId) || null, checkKey: typeof b.checkKey === "string" ? b.checkKey : null })) {
          controller.enqueue(enc.encode(`${JSON.stringify(ev)}\n`));
        }
      } catch (e) {
        controller.enqueue(enc.encode(`${JSON.stringify({ type: "error", text: (e as Error).message || "Something went wrong." })}\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
