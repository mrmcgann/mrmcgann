import type { Instrumentation } from "next";

// Every error thrown while the server renders a page, runs an API route or a server action is recorded for
// Admin → Site health (cleaned of personal details). Redirects and "not found" aren't errors and are skipped.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { reportError } = await import("@/lib/errors");
    const e = err as { digest?: string };
    await reportError({
      source: "server",
      error: err,
      path: request.path,
      route: context.routePath,
      context: { method: request.method, type: context.routeType, render: context.renderSource, digest: e?.digest },
    });
  } catch { /* never make an error worse */ }
};
