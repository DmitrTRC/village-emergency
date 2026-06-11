import { describe, it, expect } from "vitest";
import { canView, canAccept, canClose, canComment } from "../../src/domain/policy.js";

const commander = { id: "c1", role: "commander" as const };
const author = { id: "a1", role: "resident" as const };
const other = { id: "o1", role: "resident" as const };

function inc(over: Partial<Parameters<typeof canView>[1]> = {}) {
  return {
    authorId: "a1", level: "offence" as const, status: "delivered" as const,
    visibility: "private" as const, ...over,
  };
}

describe("canView", () => {
  it("public виден всем", () => {
    const i = inc({ visibility: "public" });
    expect(canView(other, i)).toBe(true);
  });
  it("private offence виден автору", () => {
    expect(canView(author, inc())).toBe(true);
  });
  it("private offence виден командиру", () => {
    expect(canView(commander, inc())).toBe(true);
  });
  it("private offence НЕ виден другому жителю", () => {
    expect(canView(other, inc())).toBe(false);
  });
});

describe("canAccept", () => {
  it("только командир и только из delivered", () => {
    expect(canAccept(commander, inc())).toBe(true);
    expect(canAccept(author, inc())).toBe(false);
    expect(canAccept(commander, inc({ status: "accepted" }))).toBe(false);
  });
});

describe("canClose", () => {
  it("командир закрывает из delivered или accepted", () => {
    expect(canClose(commander, inc())).toBe(true);
    expect(canClose(commander, inc({ status: "accepted" }))).toBe(true);
    expect(canClose(commander, inc({ status: "closed" }))).toBe(false);
    expect(canClose(author, inc())).toBe(false);
  });
});

describe("canComment", () => {
  it("любой, кто видит accepted-инцидент", () => {
    const i = inc({ status: "accepted", visibility: "public" });
    expect(canComment(other, i)).toBe(true);
  });
  it("нельзя комментировать closed", () => {
    const i = inc({ status: "closed", visibility: "public" });
    expect(canComment(other, i)).toBe(false);
  });
  it("нельзя комментировать ещё не accepted", () => {
    const i = inc({ status: "delivered", visibility: "private" });
    expect(canComment(author, i)).toBe(false);
  });
});
