/// <reference lib="webworker" />
import type { CompressRequest, CompressResponse } from "./compress";

declare const self: DedicatedWorkerGlobalScope;

async function compressImage(file: File, maxEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // EXIF не переносим: рисование на canvas отбрасывает метаданные, гео берём своё.
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.convertToBlob({ type: "image/webp", quality });
}

self.addEventListener("message", async (ev: MessageEvent<CompressRequest>) => {
  const { id, file, maxEdge, quality } = ev.data;
  try {
    const blob = await compressImage(file, maxEdge, quality);
    self.postMessage({ id, ok: true, blob } satisfies CompressResponse);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : "compress failed",
    } satisfies CompressResponse);
  }
});
