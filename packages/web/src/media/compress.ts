export interface CompressRequest {
  id: string;
  file: File;
  maxEdge: number;
  quality: number;
}

export type CompressResponse =
  | { id: string; ok: true; blob: Blob }
  | { id: string; ok: false; error: string };

export interface CompressWorkerLike {
  postMessage(msg: CompressRequest): void;
  addEventListener(type: "message", cb: (ev: MessageEvent<CompressResponse>) => void): void;
  removeEventListener(type: "message", cb: (ev: MessageEvent<CompressResponse>) => void): void;
}

const MAX_EDGE = 1920;
const QUALITY = 0.7;

export function createCompressor(worker: CompressWorkerLike): (file: File) => Promise<Blob> {
  let seq = 0;
  return (file) => {
    const id = `c${seq++}`;
    return new Promise<Blob>((resolve, reject) => {
      const onMessage = (ev: MessageEvent<CompressResponse>) => {
        const msg = ev.data;
        if (msg.id !== id) return;
        worker.removeEventListener("message", onMessage);
        if (msg.ok) resolve(msg.blob);
        else reject(new Error(msg.error));
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ id, file, maxEdge: MAX_EDGE, quality: QUALITY });
    });
  };
}

let compressor: ((file: File) => Promise<Blob>) | null = null;

export function compress(file: File): Promise<Blob> {
  if (!compressor) {
    const worker = new Worker(new URL("./compress.worker.ts", import.meta.url), {
      type: "module",
    });
    compressor = createCompressor(worker as unknown as CompressWorkerLike);
  }
  return compressor(file);
}
