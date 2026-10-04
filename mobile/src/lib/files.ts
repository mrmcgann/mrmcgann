import { File, Paths, UploadType } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
import { SUPABASE_ANON_KEY } from "./env";
import { supabase } from "./supabase";

/** Downloads a signed-in PDF (tax invoice, settlement statement) and opens the share sheet. */
export async function downloadAndShare(url: string, filename: string) {
  const { data } = await supabase.auth.getSession();
  const dest = new File(Paths.cache, filename.replace(/[^A-Za-z0-9._-]/g, "_"));
  const file = await File.downloadFileAsync(url, dest, { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}, idempotent: true });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: filename });
  return file.uri;
}

export type Picked = { uri: string; name: string; type: string };

/** Up to `max` photos from the library (or the camera when `camera` is true). */
export async function pickPhotos(max: number, camera = false): Promise<Picked[]> {
  // The photo library opens the system picker, which needs no permission. The camera does.
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return [];
  const r = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: max, quality: 0.7 });
  if (r.canceled) return [];
  return r.assets.slice(0, max).map((a, i) => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}-${i}.jpg`, type: a.mimeType || "image/jpeg" }));
}

/** Uploads picked photos to a storage bucket (same buckets and paths the website uses). */
export async function uploadPhotos(bucket: "appraisal-photos" | "claim-photos", folder: string, photos: Picked[]) {
  const paths: string[] = [];
  for (const p of photos) {
    const path = `${folder}/${Date.now()}-${p.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const body = await (await fetch(p.uri)).arrayBuffer();
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: p.type });
    if (!error) paths.push(path);
  }
  return paths;
}

export type PickedVideo = Picked & { size: number };
/** A picked file with its size (videos, proof of transfer). */
export type PickedFile = Picked & { size: number };
const VIDEO_EXT: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm" };
const DOC_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };
const ext = (name: string) => name.split(".").pop()?.toLowerCase() || "";
const sizeOf = (uri: string, known?: number | null) => { if (known) return known; try { return new File(uri).size || 0; } catch { return 0; } };

/** One video from the library. The system picker needs no permission (and no microphone). */
export async function pickVideo(): Promise<PickedVideo | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: false, allowsEditing: false });
  if (r.canceled || !r.assets.length) return null;
  const a = r.assets[0];
  const name = a.fileName || `video-${Date.now()}.mp4`;
  const type = a.mimeType || VIDEO_EXT[ext(name)] || "video/mp4";
  return { uri: a.uri, name, type, size: sizeOf(a.uri, a.fileSize) };
}

/**
 * Photos or PDFs of a document (the transfer receipt, a permit): from the photo library, the camera,
 * or the Files app (photos and PDFs). Up to `max`, each with its size and type.
 */
export async function pickDocuments(max: number, from: "photos" | "camera" | "files"): Promise<PickedFile[]> {
  if (from === "files") {
    const r = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ["image/*", "application/pdf"] }).catch(() => null);
    if (!r || r.canceled || !r.result) return [];
    return r.result.slice(0, max).map((f, i) => {
      const name = f.name || `document-${Date.now()}-${i}`;
      return { uri: f.uri, name, type: f.type || DOC_EXT[ext(name)] || "", size: sizeOf(f.uri, f.size) };
    });
  }
  if (from === "camera" && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return [];
  const r = from === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: max, quality: 0.8 });
  if (r.canceled) return [];
  return r.assets.slice(0, max).map((a, i) => {
    const name = a.fileName || `photo-${Date.now()}-${i}.jpg`;
    return { uri: a.uri, name, type: a.mimeType || DOC_EXT[ext(name)] || "image/jpeg", size: sizeOf(a.uri, a.fileSize) };
  });
}

const UPLOAD_FAILED = "The upload didn't finish. Check your connection and try again.";

/**
 * Sends a picked file to a one-off signed upload link (Supabase Storage), with progress from
 * 0 to 100. The file streams from disk, so large files don't have to fit in memory.
 */
export async function uploadSigned(signedUrl: string, f: Picked, onProgress?: (pct: number) => void, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": f.type, "x-upsert": "false", ...extraHeaders };
  if (SUPABASE_ANON_KEY) headers.apikey = SUPABASE_ANON_KEY;
  let status: number;
  try {
    const r = await new File(f.uri).upload(signedUrl, {
      httpMethod: "PUT", uploadType: UploadType.BINARY_CONTENT, headers, mimeType: f.type,
      onProgress: ({ bytesSent, totalBytes }) => { if (totalBytes > 0) onProgress?.(Math.min(100, Math.round((bytesSent / totalBytes) * 100))); },
    });
    status = r.status;
  } catch { throw new Error(UPLOAD_FAILED); }
  if (status < 200 || status >= 300) throw new Error(UPLOAD_FAILED);
  onProgress?.(100);
}

/** A listing video, through its signed upload link. */
export const uploadVideo = (signedUrl: string, v: PickedVideo, onProgress?: (pct: number) => void) =>
  uploadSigned(signedUrl, v, onProgress, { "cache-control": "max-age=3600" });
