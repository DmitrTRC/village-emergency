import { describe, it, expect } from "vitest";
import { createMediaService } from "../../src/services/media.js";

const cfg = {
  endpoint: "https://s3.example.com",
  region: "ru-1",
  bucket: "village-emrg-media",
  accessKey: "ak",
  secretKey: "sk",
};

describe("media service", () => {
  it("presignPut возвращает URL с ключом и хостом бакета", async () => {
    const svc = createMediaService(cfg);
    const url = await svc.presignPut("incidents/2026/06/x/y.webp", "image/webp");
    expect(url).toContain("village-emrg-media");
    expect(url).toContain("X-Amz-Signature");
  });

  it("presignGet возвращает URL на чтение", async () => {
    const svc = createMediaService(cfg);
    const url = await svc.presignGet("incidents/2026/06/x/y.webp");
    expect(url).toContain("X-Amz-Signature");
  });

  it("отвергает слишком большой размер при validatePhotoSize", () => {
    const svc = createMediaService(cfg);
    expect(svc.validatePhotoSize(2_000_000)).toBe(false);
    expect(svc.validatePhotoSize(500_000)).toBe(true);
  });
});
