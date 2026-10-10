// The SEO checks, pure (no server imports): the audit runs them, and the unit tests check them.
import { createSign } from "node:crypto";
import { CAT } from "./vehicles.ts";

export type Issue = { key: string; kind: string; target: string; lot_id?: number | null; severity: "act" | "watch" | "info"; message: string; fix?: string };

export type AuditLot = { id: number; title: string; category: string; year: number | null; make: string | null; model: string | null; odometer: number | null; hours: number | null;
  take_len: number; subtitle: string | null; cover_path: string | null; photos: number; videos: number; suburb: string | null; state: string | null };

export function lotIssues(l: AuditLot): Issue[] {
  const out: Issue[] = [];
  const t = `lot:${l.id}`;
  const add = (kind: string, severity: Issue["severity"], message: string, fix: string) => out.push({ key: `${kind}:${t}`, kind, target: t, lot_id: l.id, severity, message, fix });
  if (!l.cover_path) add("lot_no_photo", "act", "No main photo. It shows as a blank card in search results and Google Images.", "Add photos in the vehicle editor.");
  else if (l.photos < 8) add("lot_few_photos", "watch", `Only ${l.photos} photo${l.photos === 1 ? "" : "s"}. Listings with 8 or more get more clicks and more bids.`, "Add photos of every side, the interior, the dash and any damage.");
  if (!l.year || !l.make || !l.model) add("lot_missing_facts", "watch", `Missing ${[!l.year && "year", !l.make && "make", !l.model && "model"].filter(Boolean).join(", ")}. Search engines can't match it to searches like "${l.make || "Toyota"} ${l.model || "HiLux"}".`, "Fill in year, make and model.");
  if (l.take_len < 200) add("lot_short_description", "watch", `Description is ${l.take_len ? `only ${l.take_len} characters` : "empty"}. Pages with a real description rank better and convert better.`, "Write 2 to 4 sentences: history, condition, what it's good for.");
  const usage = l.category ? CAT[l.category]?.usage : null;
  if (usage === "km" && l.odometer == null) add("lot_no_odometer", "info", "No odometer reading, so it can't appear in kilometre searches or in Google's vehicle details.", "Add the odometer reading.");
  if (l.make && !l.title.toLowerCase().includes(l.make.toLowerCase())) add("lot_title_no_make", "info", `The title doesn't mention ${l.make}. People search by make and model.`, `Start the title with the year, make and model.`);
  if (!l.videos) add("lot_no_video", "info", "No walkaround video. Videos keep buyers on the page longer.", "Add a short walkaround video.");
  return out;
}

export function pageIssues(path: string, res: { status: number; ms: number; html: string; bytes: number }, expect: { indexable: boolean; structured: boolean }): Issue[] {
  const out: Issue[] = [];
  const add = (kind: string, severity: Issue["severity"], message: string, fix: string) => out.push({ key: `${kind}:${path}`, kind, target: path, severity, message, fix });
  if (res.status !== 200) { add("page_status", "act", `Returned ${res.status || "no response"}.`, "Open the page and check it works; check the deploy and the logs."); return out; }
  const h = res.html;
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(h)?.[1]?.trim() || "";
  const desc = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(h)?.[1] || /<meta[^>]+content="([^"]*)"[^>]+name="description"/i.exec(h)?.[1] || "";
  const canonical = /<link[^>]+rel="canonical"/i.test(h);
  const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(h);
  const ld = (h.match(/application\/ld\+json/gi) || []).length;
  const h1 = (h.match(/<h1[\s>]/gi) || []).length;
  if (res.ms > 2500) add("page_slow", "watch", `Took ${(res.ms / 1000).toFixed(1)} s to load. Google ranks slow pages lower, and people leave.`, "Check the hosting region and the database; look for slow queries on this page.");
  if (!title) add("page_no_title", "act", "No page title.", "Set a title in the page's metadata.");
  else if (title.length > 75 || title.length < 15) add("page_title_length", "info", `Title is ${title.length} characters ("${title.slice(0, 80)}"). Google shows about 60.`, "Keep titles between 30 and 65 characters, most important words first.");
  if (!desc) add("page_no_description", "watch", "No meta description, so Google picks any text from the page.", "Add a description.");
  else if (desc.length > 170 || desc.length < 60) add("page_description_length", "info", `Description is ${desc.length} characters. Google shows about 155.`, "Keep descriptions between 70 and 160 characters.");
  if (expect.indexable && !canonical) add("page_no_canonical", "watch", "No canonical link, so copies with tracking codes can split the page's ranking.", "Add alternates.canonical to the page's metadata.");
  if (expect.indexable && noindex) add("page_noindex", "act", "Tells search engines not to index it.", "Remove the noindex unless the page is meant to be hidden.");
  if (expect.structured && ld === 0) add("page_no_structured_data", "watch", "No structured data, so it can't show rich results.", "Add the JSON-LD for this page type.");
  if (h1 !== 1) add("page_h1", "info", `Has ${h1} main headings (h1). One is best.`, "Use one h1 per page.");
  if (res.bytes > 600_000) add("page_heavy", "info", `The HTML is ${Math.round(res.bytes / 1024)} KB.`, "Load less on the first render (lazy-load lists and images).");
  return out;
}


const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** A signed JWT for Google's service-account token exchange. */
export function googleJwt(sa: { client_email: string; private_key: string }, scope: string, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.private_key);
  return `${head}.${body}.${b64url(sig)}`;
}


/** Search Console rows ([date, query, page]) into our table's shape. */
export function gscRows(rows: { keys: string[]; clicks: number; impressions: number; position: number }[]) {
  return rows.filter((r) => r.keys?.length === 3).map((r) => ({
    day: r.keys[0], query: r.keys[1].slice(0, 300), page: r.keys[2].replace(/^https?:\/\/[^/]+/, "").slice(0, 300) || "/",
    clicks: Math.round(r.clicks || 0), impressions: Math.round(r.impressions || 0), position: Math.round((r.position || 0) * 100) / 100,
  }));
}

