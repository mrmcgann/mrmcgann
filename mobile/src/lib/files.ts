import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as ImagePicker from "expo-image-picker";
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
