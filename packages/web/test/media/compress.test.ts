import { describe, expect, test } from "vitest";
import {
  createCompressor,
  type CompressRequest,
  type CompressResponse,
} from "../../src/media/compress";

type Listener = (ev: MessageEvent<CompressResponse>) => void;

class FakeWorker {
  readonly received: CompressRequest[] = [];
  readonly blobs = new Map<string, Blob>();
  private readonly listeners = new Set<Listener>();
  respond: (req: CompressRequest) => CompressResponse = (req) => {
    const blob = new Blob([req.id], { type: "image/webp" });
    this.blobs.set(req.id, blob);
    return { id: req.id, ok: true, blob };
  };

  postMessage(msg: CompressRequest): void {
    this.received.push(msg);
    const res = this.respond(msg);
    queueMicrotask(() => {
      for (const l of [...this.listeners]) l({ data: res } as MessageEvent<CompressResponse>);
    });
  }

  addEventListener(_type: "message", cb: Listener): void {
    this.listeners.add(cb);
  }

  removeEventListener(_type: "message", cb: Listener): void {
    this.listeners.delete(cb);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

const file = (name: string) => new File(["raw"], name, { type: "image/jpeg" });

describe("createCompressor", () => {
  test("резолвит blob и шлёт файл с параметрами 1920/0.7", async () => {
    const worker = new FakeWorker();
    const compress = createCompressor(worker);

    const blob = await compress(file("a.jpg"));

    expect(blob).toBe(worker.blobs.get(worker.received[0]!.id));
    expect(worker.received[0]!.maxEdge).toBe(1920);
    expect(worker.received[0]!.quality).toBe(0.7);
    expect(worker.received[0]!.file.name).toBe("a.jpg");
  });

  test("ошибка воркера → reject", async () => {
    const worker = new FakeWorker();
    worker.respond = (req) => ({ id: req.id, ok: false, error: "decode failed" });
    const compress = createCompressor(worker);

    await expect(compress(file("b.jpg"))).rejects.toThrow("decode failed");
  });

  test("параллельные вызовы не путают ответы по id", async () => {
    const worker = new FakeWorker();
    const compress = createCompressor(worker);

    const [a, b] = await Promise.all([compress(file("a.jpg")), compress(file("b.jpg"))]);

    expect(a).toBe(worker.blobs.get(worker.received[0]!.id));
    expect(b).toBe(worker.blobs.get(worker.received[1]!.id));
    expect(worker.received[0]!.id).not.toBe(worker.received[1]!.id);
  });

  test("слушатель снимается после ответа (нет утечки)", async () => {
    const worker = new FakeWorker();
    const compress = createCompressor(worker);

    await compress(file("a.jpg"));

    expect(worker.listenerCount).toBe(0);
  });
});
