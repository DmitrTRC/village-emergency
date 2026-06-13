import { describe, expect, test } from "vitest";
import {
  buildNotification,
  parsePushPayload,
  resolveTargetUrl,
} from "../../src/sw/notification";

describe("parsePushPayload", () => {
  test("разбирает корректный JSON", () => {
    const p = parsePushPayload(JSON.stringify({ title: "Пожар", body: "уч. 42", url: "/i/x" }));
    expect(p).toEqual({ title: "Пожар", body: "уч. 42", url: "/i/x" });
  });

  test("битый/пустой payload → дефолты", () => {
    expect(parsePushPayload("не json")).toEqual({ title: "village-emrg", body: "", url: "/" });
    expect(parsePushPayload(undefined)).toEqual({ title: "village-emrg", body: "", url: "/" });
  });

  test("пустой title подменяется дефолтом", () => {
    const p = parsePushPayload(JSON.stringify({ title: "  ", body: "b", url: "/i/y" }));
    expect(p.title).toBe("village-emrg");
    expect(p.url).toBe("/i/y");
  });
});

describe("buildNotification", () => {
  test("кладёт url в data и tag для дедупликации", () => {
    const { title, options } = buildNotification({ title: "Пожар", body: "уч. 42", url: "/i/x" });
    expect(title).toBe("Пожар");
    expect(options.body).toBe("уч. 42");
    expect((options.data as { url: string }).url).toBe("/i/x");
    expect(options.tag).toBe("/i/x");
  });
});

describe("resolveTargetUrl", () => {
  test("относительный путь резолвится к origin", () => {
    expect(resolveTargetUrl("/i/x", "https://village.example")).toBe("https://village.example/i/x");
  });

  test("абсолютный url сохраняется", () => {
    expect(resolveTargetUrl("https://other.example/y", "https://village.example")).toBe(
      "https://other.example/y",
    );
  });

  test("мусор → origin", () => {
    expect(resolveTargetUrl("http://", "https://village.example")).toBe("https://village.example");
  });
});
