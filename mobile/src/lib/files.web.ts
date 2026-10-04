import { SUPABASE_ANON_KEY } from "./env";
import { supabase } from "./supabase";

// Web build (testing): open PDFs in a new tab; photo picking uses a file input.
export async function downloadAndShare(url: string, _filename: string) {
  if (typeof window !== "undefined") window.open(url, "_blank");
  return url;
}
export type Picked = { uri: string; name: string; type: string };
export async function pickPhotos(max: number, _camera = false): Promise<Picked[]> {
  if (typeof document === "undefined") return [];
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = max > 1;
    input.onchange = () => resolve(Array.from(input.files || []).slice(0, max).map((f) => ({ uri: URL.createObjectURL(f), name: f.name, type: f.type || "image/jpeg" })));
    input.click();
  });
}
export async function uploadPhotos(bucket: "appraisal-photos" | "claim-photos", folder: string, photos: Picked[]) {
  const paths: string[] = [];
  for (const p of photos) {
    const path = `${folder}/${Date.now()}-${p.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const blob = await (await fetch(p.uri)).blob();
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: p.type });
    if (!error) paths.push(path);
  }
  return paths;
}

export type PickedVideo = Picked & { size: number };
export type PickedFile = Picked & { size: number };
const choose = (accept: string, multiple: boolean, capture = false) => new Promise<PickedFile[]>((resolve) => {
  if (typeof document === "undefined") return resolve([]);
  const input = document.createElement("input");
  input.type = "file"; input.accept = accept; input.multiple = multiple;
  if (capture) input.setAttribute("capture", "environment");
  input.onchange = () => resolve(Array.from(input.files || []).map((f) => ({ uri: URL.createObjectURL(f), name: f.name, type: f.type, size: f.size })));
  input.click();
});
export async function pickVideo(): Promise<PickedVideo | null> {
  const f = (await choose("video/mp4,video/quicktime,video/webm,video/x-m4v", false))[0];
  return f ? { ...f, type: f.type || "video/mp4" } : null;
}
export async function pickDocuments(max: number, from: "photos" | "camera" | "files"): Promise<PickedFile[]> {
  return (await choose(from === "files" ? "image/*,application/pdf" : "image/*", from !== "camera", from === "camera")).slice(0, max);
}
export async function uploadSigned(signedUrl: string, f: Picked, onProgress?: (pct: number) => void, extraHeaders: Record<string, string> = {}) {
  const blob = await (await fetch(f.uri)).blob();
  await new Promise<void>((resolve, reject) => {
    const failed = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
    const x = new XMLHttpRequest();
    x.open("PUT", signedUrl);
    x.setRequestHeader("content-type", f.type);
    x.setRequestHeader("x-upsert", "false");
    for (const [k, v] of Object.entries(extraHeaders)) x.setRequestHeader(k, v);
    if (SUPABASE_ANON_KEY) x.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : failed());
    x.onerror = failed;
    x.send(blob);
  });
  onProgress?.(100);
}
export const uploadVideo = (signedUrl: string, v: PickedVideo, onProgress?: (pct: number) => void) =>
  uploadSigned(signedUrl, v, onProgress, { "cache-control": "max-age=3600" });
