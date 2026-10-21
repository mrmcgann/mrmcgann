// Listing photos are redrawn in the browser before they're uploaded: the long side at most 2400 pixels, as a JPEG.
// Redrawing keeps only the picture, so the place it was taken (the GPS a phone records), the time and the camera's
// details never reach the public listing. A photo the browser can't read is refused, never uploaded as it is.
// Browser only (the listing editor).

export async function cleanPhoto(file: File, max = 2400): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new Error(`${file.name} can't be read here. Save it as a JPEG or PNG and add it again.`);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bmp.close(); throw new Error("This browser can't prepare photos. Try another browser."); }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!out || out.size === 0) throw new Error(`${file.name} couldn't be prepared. Try again.`);
  return out;
}
