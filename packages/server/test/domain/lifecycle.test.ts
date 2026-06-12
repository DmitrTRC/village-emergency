import { describe, it, expect } from "vitest";
import { transition, type IncidentState } from "../../src/domain/lifecycle.js";

const base: IncidentState = {
  level: "offence", status: "delivered", visibility: "private", closeReason: null,
};

describe("transition", () => {
  it("emergency при создании сразу public", () => {
    const r = transition({ ...base, level: "emergency", status: "draft" }, { type: "deliver" });
    expect(r.status).toBe("delivered");
    expect(r.visibility).toBe("public");
  });
  it("offence при доставке остаётся private", () => {
    const r = transition({ ...base, status: "draft" }, { type: "deliver" });
    expect(r.status).toBe("delivered");
    expect(r.visibility).toBe("private");
  });
  it("accept делает любой уровень public", () => {
    const r = transition(base, { type: "accept" });
    expect(r.status).toBe("accepted");
    expect(r.visibility).toBe("public");
  });
  it("close с reason=false оставляет visibility private", () => {
    const r = transition(base, { type: "close", reason: "false" });
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("private");
    expect(r.closeReason).toBe("false");
  });
  it("close из accepted сохраняет visibility public", () => {
    const accepted = transition(base, { type: "accept" });
    const r = transition(accepted, { type: "close", reason: "resolved" });
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("public");
  });
  it("нельзя accept уже closed", () => {
    const closed = transition(base, { type: "close", reason: "duplicate" });
    expect(() => transition(closed, { type: "accept" })).toThrow();
  });
  it("нельзя accept из accepted", () => {
    const accepted = transition(base, { type: "accept" });
    expect(() => transition(accepted, { type: "accept" })).toThrow();
  });
});
