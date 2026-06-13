import { describe, expect, test } from "vitest";
import { isPublicRoute, matchRoute } from "../../src/router/match";

describe("matchRoute", () => {
  test("статические пути", () => {
    expect(matchRoute("/")).toEqual({ name: "feed" });
    expect(matchRoute("/new")).toEqual({ name: "create" });
    expect(matchRoute("/register")).toEqual({ name: "register" });
    expect(matchRoute("/auth/callback")).toEqual({ name: "callback" });
  });

  test("detail с id и декодированием", () => {
    expect(matchRoute("/i/abc")).toEqual({ name: "detail", id: "abc" });
    expect(matchRoute("/i/a%2Fb")).toEqual({ name: "detail", id: "a/b" });
  });

  test("неизвестный путь → notFound", () => {
    expect(matchRoute("/i/")).toEqual({ name: "notFound" });
    expect(matchRoute("/i/a/b")).toEqual({ name: "notFound" });
    expect(matchRoute("/wat")).toEqual({ name: "notFound" });
  });

  test("публичные роуты — register и callback", () => {
    expect(isPublicRoute({ name: "register" })).toBe(true);
    expect(isPublicRoute({ name: "callback" })).toBe(true);
    expect(isPublicRoute({ name: "feed" })).toBe(false);
    expect(isPublicRoute({ name: "detail", id: "x" })).toBe(false);
  });

  test("новые статические вкладки", () => {
    expect(matchRoute("/map")).toEqual({ name: "map" });
    expect(matchRoute("/mine")).toEqual({ name: "mine" });
    expect(matchRoute("/more")).toEqual({ name: "more" });
  });

  test("новые вкладки приватные", () => {
    expect(isPublicRoute({ name: "map" })).toBe(false);
    expect(isPublicRoute({ name: "mine" })).toBe(false);
    expect(isPublicRoute({ name: "more" })).toBe(false);
  });
});
