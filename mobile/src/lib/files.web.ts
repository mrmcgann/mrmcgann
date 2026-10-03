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
